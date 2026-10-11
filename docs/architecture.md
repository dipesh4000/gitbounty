# Architecture

Implementation status is tracked in [plan.md](../plan.md). This page explains the current boundaries.

## Current system

Website / extension → FastAPI → Postgres.
FastAPI calls GitHub with a signed-in user's OAuth token or a selected repository's installation token.

| Component | Current implementation | Selected next change |
|---|---|---|
| Python project | uv, Python 3.12, backend pyproject and committed lockfile | Maintain locked local/CI environments |
| API | FastAPI, async HTTP calls through httpx | Keep FastAPI and public response contracts |
| Database access | Async SQLAlchemy models/sessions for issue-board reads and authentication; asyncpg for remaining queries | Migrate remaining queries; retain asyncpg as the driver |
| Schema | Numbered SQL files and local migration runner | Keep this workflow; no ORM startup schema creation |
| Authentication | GitHub OAuth, signed session cookies, GitHub App JWT and short-lived installation tokens | Verify production credentials |
| Repository events | Signed webhooks in a durable inbox plus contributor reconciliation sync | Verify live deliveries and recovery |
| Frontend | React/TypeScript, Next.js-style app routes using vinext | Continue existing website |
| Extension | Manifest V3 content scripts, service worker and popup | Registered-only badges and reliable refresh |

OAuth currently uses the code in `backend/app/github_oauth.py`, not Authlib.
Pydantic models in `backend/app/models.py` describe API responses, not database entities.
Mapped classes live in `backend/app/orm.py`. Each migrated operation opens and closes its own async session.
During migration, the original pool allows 10 connections and the ORM pool allows 5, per process.
The ORM connection factory uses the existing asyncpg DSN options; SQLAlchemy URLs contain no credentials,
query parameters are hidden in errors, and no schema is created at startup.
The public issue board runs its one SELECT in connection-scoped autocommit mode to avoid
BEGIN/ROLLBACK network round trips. Closing the session restores the pooled connection's isolation;
authentication, publishing and points writes retain their existing transactions.

## Code and data

| Path | Responsibility |
|---|---|
| `backend/app/auth.py`, `crypto.py` | Identity, session lifecycle, encrypted GitHub tokens |
| `backend/app/routes/` | Issue browsing, maintainer publishing and moderation |
| `backend/app/features/merged_prs/` | GitHub reads, closing references, lifecycle and eligibility |
| `backend/app/features/points/` | Sync orchestration, ledger writes and leaderboard queries |
| `backend/app/github_app.py`, `services/webhooks.py` | Installation authentication and durable delivery processing |
| `backend/app/db.py` | Database connection lifecycle |
| `frontend/web/app/components/` | Landing page and signed-in workspace |
| `frontend/extension/src/` | GitHub page decoration and API access |
| `frontend/extension/popup/` | Signed-in points, activity and issue context |

[SQL migrations](../migrations/) define the current schema:

- `users`: stable GitHub ID, mutable login/profile, encrypted OAuth token.
- `repositories`, `issues`: cached GitHub data.
- `issue_points`, `issue_points_history`: published reward and its change history.
- `merged_prs`, `pull_requests`: observed merges and mutable PR lifecycle state.
- `points_ledger`: awards and corrections; totals are sums, not separately stored balances.
- `sync_runs`: progress, cursor and failures.
- `moderation_flags`: reports and resolutions.
- `reward_allocations`: claimed and unclaimed awards keyed by numeric GitHub identity.
- `connected_repositories`, `webhook_deliveries`: selected installations and durable delivery state.
- `schema_migrations`: applied migration files and checksums.

Partial unique indexes prevent duplicate baseline and bounty awards. Preserve them through ORM migration.
Maintainer publishing writes the bounty and its history in one transaction.
Ledger corrections append entries; they do not rewrite awards.

## API reference

Use [FastAPI's generated reference](http://localhost:8001/docs) or `/openapi.json` while the server is running.
Route handlers and Pydantic schemas are the source of truth for request/response details.

Public reads are `/api/issues` and `/api/leaderboard`.
Signed-in routes include `/api/me`, points/history/PR/claim reads, `POST /api/me/sync`,
`POST /api/me/claims`, maintainer publishing and GitHub App repository connection.
The extension reads public bounties plus identity, points and claims; the website maps the remaining user-facing routes.
Moderation review/resolution requires a configured administrator and intentionally has no UI yet.

Browser calls include credentials. Cookie-authenticated writes use `X-GitBounty-CSRF` obtained from
`GET /api/csrf`; OAuth and logout have explicit exemptions.
Rate limits return 429; unavailable dependencies return 503. `/health` is liveness and `/ready` is readiness.

## GitHub App and claims

A maintainer installs the GitBounty App on selected public repositories.
Use the minimum read permissions needed for issues, PRs/reviews and repository metadata;
derive the final permission set from the actual API calls before registering the app.
Keep existing maintainer authorisation checks: knowing an installation ID is not proof that a user administers it.

Processing path:

GitHub event → signature verification → durable delivery record → worker → verified GitHub data → points transaction.

The receiver accepts `pull_request`, `installation`, `installation_repositories` and `ping` events.
Persist a delivery before acknowledging acceptance; track success/failure and retry safely.
Do not award for a closed issue or an unmerged PR. Verify scope and PR author, and reuse the same award rules
for webhook processing and reconciliation. Duplicate delivery must not mint another award.

The identity model allocates a reward to its author's GitHub numeric ID without creating a user.
Registration authenticates ownership; claiming associates pending allocations with that account exactly once.
Unclaimed points stay off public leaderboards. No expiry policy is implemented.

The app private key path and webhook secret are server-only sensitive inputs. Installation tokens are requested
when processing and are not stored. Errors and logs omit keys, tokens, webhook bodies and GitHub response bodies.
GitHub does not automatically redeliver failed webhooks; retain recovery/reconciliation.
See [GitHub's delivery guidance](https://docs.github.com/en/webhooks/using-webhooks/handling-failed-webhook-deliveries)
and [signature guidance](https://docs.github.com/en/webhooks/using-webhooks/validating-webhook-deliveries).

## Extension updates

Content scripts decorate GitHub's DOM; the service worker fetches API data and caches repository
bounties for 30 seconds. The popup reads identity, points and activity.
DOM observation is not a live backend subscription. Cache expiry does not itself trigger a refresh.

The extension shows registered rewards only. Visible pages refresh every 30 seconds and on navigation/visibility
changes; stale issue badges and PR banners are removed. Cached responses can delay a change until a later refresh.
Webhooks alone do not refresh browser UI. Popup points are fetched when opened or manually refreshed.
