# Deployment readiness

GitBounty is **not deployed**, and this document does not deploy it. It is the list of what would have to be
true first, so the decision can be made with open eyes.

## Blocking — do not deploy without these

| | Why | Where |
|---|---|---|
| **Rotate all four secrets** | They were shared during development and must be treated as compromised | [`security.md`](security.md) |
| **`SECURE_COOKIES=true`** | Otherwise the session cookie can travel over plain HTTP | [`setup.md`](setup.md) |
| **`ALLOWED_ORIGINS` set to the real origin only** | The local defaults must not survive | `backend/app/config.py` |
| **A separate production OAuth app** | A local app's callback points at localhost; sharing one mixes environments | [`setup.md`](setup.md) |
| **A production database, with backups verified by restoring one** | A backup nobody has restored is not a backup | [`database-runbook.md`](database-runbook.md) |
| **`DEV_LOGIN_STUB_ENABLED` absent** | It authenticates nobody. It warns at startup; make sure nothing silences that | `backend/app/auth_stub.py` |
| **API rate limiting** | There is none. A public endpoint without one is a free denial-of-service target | not built |
| **A decision on the licence** | No `LICENSE` means no rights granted, which is an odd thing to deploy | [`handoff.md`](handoff.md) |
| **Legally reviewed privacy and terms** | The current pages are engineer-written summaries and say so | [`known-limitations.md`](known-limitations.md) |

## Strongly recommended

| | |
|---|---|
| Structured logs with a request/correlation id | Today: `logging.basicConfig(level=INFO)` |
| Error reporting behind configuration | Never a hard-coded vendor. Nothing is wired today |
| Metrics for the signals below | None are emitted today |
| A real synchronisation worker | Background tasks die with the process. A restart mid-sync leaves a `running` row, released after 30 minutes |
| Frontend component tests | There is no test runner for `frontend/web` |
| Upgrade the build toolchain | 11 dev-only audit findings. Production dependencies are clean. The upgrade breaks `vinext start`; the path is in [`known-limitations.md`](known-limitations.md) |
| An end-to-end test | Sign in → publish → merge → award → leaderboard |

### Metrics worth having

OAuth failures · sync successes and failures, split by cause · GitHub rate-limit failures · bounties
published · eligible merges counted · ledger insert failures · extension API failures. Each maps to a code
path that already exists; none is emitted.

**No telemetry may be sent to a third party without disclosure and the owner's approval.**

## Shape, if it is deployed

Backend: a container running `uvicorn`, with `/health` as the liveness probe and `/ready` as the readiness
probe — `/ready` already returns 503 until its dependencies are satisfied.

Website: a static/edge deployment. `NEXT_PUBLIC_GITBOUNTY_API` is **baked in at build time**, so a build is
tied to one API URL.

Database: managed Postgres with point-in-time recovery.

Migrations: `python dev/migrate.py up --database-url ... --i-have-approval`, deliberately manual, with a
backup first. Never from CI without the owner asking.

Extension: `src/config.js` holds the two URLs and is the only file that changes. Publishing to a store is a
separate decision with its own review process.

## What must not happen

- No deployment step in CI without the owner asking for one
- No migration run against a shared database from a developer machine
- No real secret in any repository, CI log or issue
- No page claiming GitBounty is live while it is not
