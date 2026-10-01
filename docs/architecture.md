# Architecture

How the pieces fit together, and the reasoning behind the choices that are not obvious.

```
         ┌──────────────┐        ┌───────────────────┐
         │   browser    │        │  github.com       │
         │              │        │                   │
   ┌─────┤  Next.js     │◄──────►│  OAuth · REST API │
   │     │  :3000       │        └─────────┬─────────┘
   │     └──────┬───────┘                  │
   │            │ fetch, credentials:      │ as the signed-in user,
   │            │ include + CSRF header    │ with their own token
   │            ▼                          │
   │     ┌──────────────────────────────┐  │
   │     │       FastAPI  :8001         │◄─┘
   │     │                              │
   │     │  auth · issues · maintainer  │
   │     │  points · sync · leaderboard │
   │     └──────────────┬───────────────┘
   │                    │ asyncpg, plain SQL
   │                    ▼
   │     ┌──────────────────────────────┐
   │     │        Postgres              │
   │     │  users · repositories ·      │
   │     │  issues · issue_points ·     │
   │     │  merged_prs · points_ledger  │
   │     └──────────────────────────────┘
   │
   │     ┌──────────────────────────────┐
   └────►│  Chrome extension (optional) │
         │  content script ──message──► │
         │  service worker ──fetch────► FastAPI
         └──────────────────────────────┘
```

## Decisions worth explaining

### No webhooks

GitBounty does not own the repositories whose issues it lists, so it cannot ask their maintainers to
install a webhook. Instead, each user's merged pull requests are read **as that user, with that user's own
token** — exactly the data GitHub would show them anyway. This is also why a token is stored at all.

The trade-off: nothing happens until a sync runs. That is why signing in starts one, and why there is a
visible Sync control with a recorded status.

### Plain SQL, no ORM

`migrations/` is the only description of the schema (`rules.md` section 4), applied deliberately by a
person. An ORM that generates or reflects a schema would compete with that. Every query is written out in
full, so what runs against the database is what can be read in the file.

### An append-only ledger, not a stored total

`points_ledger` is the record; a total is always `sum(points)` over a user's entries. A stored total can
drift from the rows behind it and cannot explain itself. The cost is a `group by` on every leaderboard
read, which is covered by indexes and is not close to mattering at this size.

### Idempotency in the database, not the application

Two partial unique indexes do the anti-double-award work:

```sql
create unique index points_ledger_baseline_once
  on points_ledger (user_id, github_pr_id) where kind = 'baseline_award';

create unique index points_ledger_bounty_once
  on points_ledger (lower(bounty_repo_full_name), bounty_issue_number) where kind = 'bounty_award';
```

Inserts use `on conflict do nothing` and ask whether a row came back. Two syncs running at the same moment
therefore cannot both decide an award is missing — which a prior `SELECT` would allow.

### Authorization asked of GitHub, per request

`github.can_publish_bounties` is the single definition of who may publish on a repository, and it reads
GitHub's own `permissions` object. The same function decides what is listed *and* what may be written, so
a repository missing from the list cannot be published to by a hand-made request either. The client never
asserts ownership.

`push` permission is deliberately not enough: somebody who can both set a bounty's value and merge the
pull request claiming it is the collusion case with one person in it.

### Synchronisation as a background task

A first import makes one GitHub request per pull request. `POST /api/me/sync` returns `202` immediately and
the work happens in the background, with progress in `sync_runs`. A partial unique index allows one running
sync per user, which is also what makes a double-clicked button harmless.

Subsequent syncs resume from the last successful cursor. GitHub's search API caps at 1000 results however
many pages are requested, so for anyone with a long history, narrowing is not an optimisation — it is the
only way the newest work is reachable.

### The extension's three parts

A content script runs on github.com's origin and cannot call `localhost:8001`. It asks the service worker,
which has the extension's own permissions, by message passing. The worker owns pagination and the cache;
the cache is keyed by repository **and** signed-in account, so one person's view is never served to the
next person to sign in on the same browser.

## Request paths

**Sign-in.** `/auth/github` → GitHub → `/auth/github/callback` → verify `state` with a constant-time
compare → exchange the code → read the profile → upsert the user keyed on the numeric GitHub id → encrypt
and store the token → clear and re-create the session (fixation) → mint a CSRF token → start a background
sync → redirect to `/explore`.

**Publishing.** `POST /api/maintainer/bounties` → re-fetch each repository from GitHub and check
permissions → confirm each issue is still open → one transaction writing `repositories`, `issues`,
`issue_points` and an `issue_points_history` row per issue.

**Awarding.** `POST /api/me/sync` → background task → read published bounties → GitHub search for this
user's merged pull requests → drop self-merges → match each against a published bounty → one transaction
inserting `merged_prs` and the ledger entries the database will accept.

## Where the boundaries are

| Boundary | Crossed by | Failure shows as |
|---|---|---|
| Browser → API | `fetch`, cookie session, CSRF header on writes | `ApiError` with the real status |
| API → GitHub | `httpx`, the user's own token | 401 (reconnect), 429 (rate limit, with Retry-After), 502 |
| API → Postgres | `asyncpg` pool | 503 naming no host |
| Extension content script → worker | `chrome.runtime.sendMessage` | badges simply do not appear |

## Not in this architecture

No queue, no cache server, no object storage, no third-party analytics, no payment provider, no chain, no
wallet. Adding any of them is a decision to be argued for, not a default.
