# Logging, metrics and rate limiting

## Logging

One JSON object per line, with a correlation id on every one. Before this it was
`logging.basicConfig(level=INFO)`: readable by a person watching a terminal, useless to anything else, and
impossible to follow one request through.

```json
{"time":"2026-10-02T05:47:30.704Z","level":"INFO","logger":"gitbounty.request",
 "message":"request","request_id":"ebf429a53f9149fa","event":"request",
 "method":"GET","path":"/api/leaderboard","status":200,"duration_ms":38.8}
```

`LOG_LEVEL` sets the level (default `INFO`) and `JSON_LOGS=false` switches to a plain format when a human
is reading the terminal.

### The correlation id

Every request gets one, every log line it produces carries it, and it comes back in the `X-Request-ID`
response header — so a bug report can quote it and the whole request can be found.

An inbound `X-Request-ID` is honoured, so a request can be followed across a proxy, **but only if it looks
like an id** (`[A-Za-z0-9._-]{1,64}`). An arbitrary header value would otherwise end up in every log line
for that request, which is a log-injection hole.

### Events worth alerting on

Each is a structured record with an `event` field, so a query is a field match rather than a regular
expression.

| `event` | Logged when | Useful for |
|---|---|---|
| `request` | every request completes | latency, error rate, traffic |
| `request.error` | an unhandled exception | the 500 rate |
| `sync.succeeded` | a synchronisation finishes | how much work is being counted; carries `prs_seen`, `newly_counted`, `awards_written`, `points_awarded`, `bounties_already_claimed`, `self_merges_skipped` |
| `sync.github_rate_limited` | GitHub refuses mid-sync | the signal that syncing is too aggressive |
| `sync.token_rejected` | GitHub rejects a stored token | people who need to sign in again |
| `sync.github_failed` | GitHub answers with something unusable | GitHub trouble, or ours |
| `bounty.published` | bounties are published | adoption |
| `bounty.changed` | a bounty is edited, unpublished or archived | maintainer activity |
| `points.bounty_already_claimed` | a merge closes a bounty somebody else was awarded | how often contributors race |
| `points.adjusted` | a correction is written | **should be rare; investigate every one** |
| `authz.refused` | somebody is refused a repository | misconfiguration, or probing |
| `ratelimit.rejected` | a caller is refused | abuse, or a limit set too tight |

OAuth failures are covered by `request.error` and by the 502 status on `/auth/github/callback`.

### What is never logged

Cookies, the `Authorization` header, OAuth codes, GitHub tokens, session contents, `SESSION_SECRET`,
`TOKEN_ENCRYPTION_KEY`, database URLs, and **no request or response body at all**. Query strings are
dropped from the request log, because one of them carries the OAuth code.

There is a redaction pass over every record — by field name (`token`, `cookie`, `client_secret`, …) and by
shape (`gho_…`, `postgresql://user:pass@…`, `Bearer …`) — but that is a backstop. The primary defence is
that nothing calls `logger.info(body)`.

An exception is recorded as its type and message, not as a traceback: a traceback in a log line is
unreadable and can carry local variables.

### Not done

No metrics are **emitted**. The events above are the right signals and a log-based query can derive each
one, but there is no counter, no histogram and no `/metrics` endpoint. Adding one means choosing a vendor,
which is the owner's decision — and no telemetry goes to a third party without disclosure and approval
([`deployment-readiness.md`](deployment-readiness.md)).

No error-reporting integration either. If one is added it goes behind configuration, never a hard-coded
vendor.

## Rate limiting

| Endpoint | Limit | Why |
|---|---|---|
| `POST /api/me/sync` | 6/min | Each run makes one GitHub request per pull request, against the user's **own** GitHub budget. More than a few a minute achieves nothing: nothing has changed |
| `POST /api/issues/sync` | 6/min | Same |
| `/api/maintainer/bounties` | 30/min | A write with a GitHub round trip behind it |
| `/api/maintainer/repositories` | 60/min | Reads, but each one calls GitHub |
| `/auth/github*` | 20/min | Blunts a flood of state-generating requests |
| `/api/leaderboard` | 120/min | A read with an aggregate behind it |
| `/api/issues` | 120/min | Public, and a page makes several |
| `/api/me*` | 240/min | Cheap reads the workspace makes on every view |
| `/health`, `/ready`, `/docs` | **never limited** | An operator's probe must not be the thing that trips |

A refusal is a `429` carrying `Retry-After`, `X-RateLimit-Limit`, `X-RateLimit-Window`, and a body that
names the actual limit and the wait:

```json
{"detail":"Too many requests to this endpoint. The limit is 120 per 60 seconds. Try again in 44 seconds.",
 "retry_after_seconds":44}
```

### Who is limited

**Identity first, address second.** A signed-in request is limited by its user id, so one person cannot get
more by changing networks and a shared office address is not one bucket for everybody. Only an
unauthenticated request falls back to the client address.

That fallback reads the socket's peer, **not `X-Forwarded-For`** — that header is attacker-controlled
unless a proxy is known to rewrite it, and trusting it would let anybody reset their own counter at will.
**A deployment behind a proxy must configure trusted proxy headers explicitly**, or every request will
appear to come from the proxy and share one bucket. This is in
[`deployment-readiness.md`](deployment-readiness.md).

### The limitation that matters

The counter is a fixed window **held in this process**. That is honest for what GitBounty is today — one
instance, not deployed. **More than one instance multiplies every limit by the number of instances.** A
shared store (Redis) is needed before horizontal scaling; the interface in `app/ratelimit.py` does not
change when that happens.

A fixed window also allows a burst across a boundary: up to twice the limit in a moment spanning two
windows. A sliding window or a token bucket would not. At these limits it does not matter; it is written
down so nobody is surprised.

## Health and readiness

| | |
|---|---|
| `GET /health` | Liveness. `{"status":"ok"}` and nothing else. Never rate limited |
| `GET /ready` | Readiness: each dependency as `ok`/`configured`/`not configured`/`unreachable`, and `503` when not ready. Names no host, port, driver, credential or exception — a test asserts that |

## Running it

```bash
LOG_LEVEL=DEBUG JSON_LOGS=false uvicorn app.main:app --port 8001   # human-readable, locally
```
