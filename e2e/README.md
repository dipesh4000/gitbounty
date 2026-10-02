# End-to-end test

One journey, against the **real** stack: the real FastAPI backend, a real Postgres, and the production
build of the website. The only thing substituted is github.com.

```bash
cd e2e
npm ci
npx playwright install chromium     # once
npm test
```

The local Postgres container must be running (see [`../backend/dev/README.md`](../backend/dev/README.md));
everything else is started and stopped by the harness.

## What it covers

| Step | Checked |
|---|---|
| Sign in | A session is created through the test-only path, and `/api/me` returns that account |
| Choose a repository | Only repositories GitHub reports admin/maintain on are listed |
| Choose an issue | The repository's open issues load; one is selected and given a value and category |
| Preview | The review panel shows the selection, and **nothing has been sent yet** |
| Publish | `POST /api/maintainer/bounties`, with the CSRF header |
| The explorer | The bounty appears in `GET /api/issues` **to an anonymous visitor**, and on the public landing page |
| Lifecycle | The pull request moves draft → in review → changes requested → approved → merged, each state asserted, each earning nothing |
| The merge | Exactly two ledger entries: the bounty's value and the baseline, with the bounty, its value at the time, the category, its source and the rule version |
| Idempotency | Three further full re-syncs change nothing: still 45 points, still two entries |
| The website | "My PRs" shows Merged and `awarded`; the header's points figure updates |
| The ledger view | Both entries are explained, naming the bounty and what it was worth |
| Leaderboards | Overall and the `frontend` category both show the contributor; `docs` does not |
| One award per bounty | A second contributor whose merge also closes the bounty gets the baseline only |
| The front door | The test sign-in path answers 404 without the secret, and signs nothing in |

## How GitHub is substituted

`fake-github/server.py` is a real HTTP server the backend talks to over a socket, serving the handful of
endpoints GitBounty calls. It is not a mock library: the httpx client, the headers, the pagination loop,
the status handling and the JSON parsing are all the real code paths. Only the far side of the socket is
substituted.

The backend reaches it because the harness sets `GITBOUNTY_ENVIRONMENT=test`, which is the only thing that
lets `GITHUB_API_URL` be honoured. In any other environment that setting is ignored and the real host is
used — a configurable API host would otherwise be a way to send every user's token somewhere else.

The test drives it over a control endpoint, so one pull request can be moved through its whole lifecycle:

```ts
await setGithubState({ pulls: [...], reviews: { "77": [review("reviewer", "APPROVED")] } });
```

## How signing in works

Completing a real GitHub authorization needs a human at github.com, so the harness uses
`POST /test-auth/session` ([`../backend/app/test_auth.py`](../backend/app/test_auth.py)). It needs
`GITBOUNTY_ENVIRONMENT=test` **and** a 16+ character `GITBOUNTY_TEST_AUTH_SECRET` **and** that secret in a
header; without all three the route is not even mounted. It issues exactly the session OAuth issues, so
everything after it — CSRF, authorization, the ledger — is the ordinary code path.

**A real github.com authorization is a separate, human verification.** See
[`../docs/oauth-verification.md`](../docs/oauth-verification.md).

## The database

The harness drops and recreates `gitbounty_e2e` and applies the migrations from scratch, so each run is
also a clean-bootstrap check. It refuses any database whose name does not end in `_e2e`, and it refuses to
start if anything is already listening on its ports — otherwise it would quietly test whatever was there.

Ports are 3100 (website), 8101 (API) and 8099 (fake GitHub), deliberately not the development ones.
