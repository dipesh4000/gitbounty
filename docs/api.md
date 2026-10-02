# API

The HTTP contract. Version `v0`: unversioned paths, and **not yet stable** — GitBounty is not deployed and
has no external consumers besides its own website and extension. The first deployment is the point at which
these paths move under `/v1` and stop changing without notice.

Interactive, generated from the code: `http://localhost:8001/docs`.

## Conventions

- JSON in, JSON out. All times are ISO-8601 UTC.
- Errors are `{"detail": "a sentence a person can read"}`. No stack trace, no internal identifier, no host.
- **Authentication** is a session cookie (`gitbounty_session`, HttpOnly, SameSite=Lax, Secure when
  configured). Browsers must send `credentials: "include"`.
- **Every state-changing request** needs the `X-GitBounty-CSRF` header, from `GET /api/csrf`. Without it:
  `403`. Exempt: the OAuth routes (a top-level navigation cannot carry a header; `state` protects them) and
  `POST /auth/logout`.
- **Paging** is `page` (from 1) and `per_page` (max 100). Responses carry `page`, `per_page`, `total` and
  `has_more` — except `/api/issues`, which uses `has_more` alone.
- `category` is one of `frontend`, `backend`, `fullstack`, `docs`, `testing`, `devops`, `design`, `mobile`,
  `other`. Anything else is `422`.

## Status codes

| | |
|---|---|
| `401` | not signed in, or the stored GitHub token was rejected |
| `403` | signed in, but not allowed — including a missing or wrong CSRF token |
| `404` | no such bounty, or a repository GitHub will not show this account |
| `422` | the request body or query failed validation |
| `429` | GitHub's rate limit. Carries `Retry-After` |
| `502` | GitHub answered with something unusable |
| `503` | the database or the OAuth configuration is missing or unreachable |

## Health

| | |
|---|---|
| `GET /health` | Liveness. `{"status":"ok"}`. Checks nothing else |
| `GET /ready` | Readiness. Each dependency as `configured`/`ok`/`not configured`/`unreachable`. `503` when not ready. Names no host, driver or credential |

## Authentication

| | |
|---|---|
| `GET /auth/github` | Redirects to GitHub with a 32-byte one-time `state`. Scope `read:user` |
| `GET /auth/github/callback` | Verifies `state` with a constant-time compare, exchanges the code, stores the user, rotates the session, mints a CSRF token, starts a background sync, redirects to `FRONTEND_URL/explore` |
| `POST /auth/logout` | Clears the session **and** the stored GitHub token |
| `GET /api/me` | The signed-in account. Never includes a token |
| `GET /api/csrf` | `{"csrf_token": "..."}` for the `X-GitBounty-CSRF` header |

## The public explorer

| | |
|---|---|
| `GET /api/issues` | Published bounties. `category`, `language`, `q` (title), `repository`, `sort` (`updated`\|`stars`), `page`, `per_page`. **Public** |
| `GET /api/issues/categories` | Count of published bounties per category. **Public** |
| `POST /api/issues/sync` | Refresh the cached issue board from GitHub. Signed in |

Only bounties with `status = 'published'` are ever returned.

## Points

| | |
|---|---|
| `POST /api/me/sync` | Start a synchronisation. `202` immediately; the work runs in the background. `?full=true` re-walks the whole history; `?inspect_files=false` skips per-pull-request file lookups. Calling it while one is running is harmless |
| `GET /api/me/points` | Totals, this week, per category, recent merges with what each actually earned, and the sync status (`never`/`running`/`succeeded`/`failed`, with the reason and any `retry_after_seconds`) |
| `GET /api/me/points/history` | Every ledger entry, newest first, paged. Each names its kind, signed points, category and its source, rule version, reason, pull request, bounty and the bounty's value at the time. Also returns the current `rules` |
| `GET /api/points/rules` | The rule version, baseline, and bounty bounds. **Public** |
| `GET /api/me/pull-requests` | Every pull request this user has authored, in whatever state. `state` (repeatable), `page`, `per_page`. Each item carries the state, the related bounty, the category and its source, timestamps, `expected_points` (a forecast) and `awarded_points` (what the ledger holds), plus `ineligible_reason` where it applies. `counts` gives the per-state totals, unfiltered |
| `GET /api/me/merged-prs` | Live from GitHub; stores nothing. Reports what each merge is *eligible* to earn. **What it earned is in the ledger** |

## Leaderboards

`GET /api/leaderboard` — **public.** `period` (`all`\|`week`\|`month`), `category`, `page`, `per_page`.

Returns ranked entries, `total`, and `me`: the signed-in user's own position, even when it falls outside the
requested page. Ties break on merges, then login, so the order is stable. Users whose entries net to zero
or less are not listed.

## The maintainer workspace

All signed in; all re-verify permission with GitHub on every call.

| | |
|---|---|
| `GET /api/maintainer/repositories` | Repositories GitHub says this person administers or maintains. `q`, `page`, `per_page`. One that cannot carry a bounty is listed with `publishable: false` and `blocked_reason` |
| `GET /api/maintainer/repositories/{owner}/{name}/issues` | That repository's open issues, with `suggested_points` from a `gitbounty:N` label (a suggestion, clamped) and any `existing` bounty |
| `GET /api/maintainer/issues` | Open issues across every authorised repository. Kept for the older screen |
| `POST /api/maintainer/bounties` | Publish. Body `{issues: [{repository, number, points, category}]}`, 1–50 at a time. Points 1–1000. One transaction |
| `GET /api/maintainer/bounties` | Bounties this person published. `status`, `page`, `per_page`. `awarded` says whether one has already been claimed |
| `PATCH /api/maintainer/bounties/{owner}/{name}/{number}` | Change `points`, `category` and/or `status`, with a `reason`. Nothing is deleted |
| `GET /api/maintainer/bounties/{owner}/{name}/{number}/history` | Every change ever made to one bounty |

Editing a bounty that has already been awarded is allowed and does **not** change the award: the ledger
keeps `bounty_points_at_award`.

## Rate limiting

GitBounty does not rate-limit its own API. It is not deployed, and a limiter tuned against no traffic is a
guess. This is listed in [`deployment-readiness.md`](deployment-readiness.md) as a prerequisite for
deploying. GitHub's limits are respected and surfaced as `429` with `Retry-After`.
