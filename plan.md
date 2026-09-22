# Build plan

This is the working plan for building GitBounty as a **points and leaderboard** platform, for two people to build
from. Read [`overview.md`](overview.md) first if you haven't — this plan assumes the product direction it flagged as
unresolved has now been decided (see below).

## Context

GitBounty started (`readme.md`, the pitch deck, and the `frontend/web/` demo) as a **real-money bounty escrow**
product: a maintainer puts a dollar amount on a GitHub issue, funds sit in a Solidity contract, and a merge webhook
pays a contributor's crypto wallet. In conversation, the project's owner described a genuinely different product:
GitHub login only, no wallet or blockchain, browse categorized open-source issues, earn **points** for merged PRs,
and compete on **leaderboards** (weekly, and per category like frontend/backend). `overview.md` flagged this as an
unresolved conflict between two versions of the product.

**That conflict is now resolved on this side: the points/leaderboard version is the hackathon build.** A minimal,
read-only Chrome extension (badge overlay on GitHub issue pages, no sign-in) is in scope. There's no fixed deadline,
so this plan sequences work by dependency rather than by calendar day. Chunks below are sized to be assignable
individually, but deliberately not pre-assigned to a name — see [Suggested sequencing](#suggested-sequencing-two-natural-tracks) below.

This plan drops `contracts/`, wallets, escrow, and per-repo webhook installation — those belonged to the money
version.

### This isn't settled with the teammate yet

The teammate who owns `origin` (`dipesh4000`) built the money-version pitch deck, README, and demo site, and pushed
a commit tweaking that demo's colour theme — work aimed at a product this plan replaces. **Chunk 0 starts with
telling them about the pivot** before more work happens on either side.

## How merged-PR detection actually works (key technical decision)

The original design assumed webhooks installed on repos GitBounty controls. That doesn't fit this product: GitBounty
doesn't own the repos whose issues it lists, so it can't ask every maintainer to install a webhook.

**Instead:** each logged-in user's own GitHub OAuth token is used to query GitHub's GraphQL search API
(`is:pr is:merged author:<login>`), on login and on dashboard visits (server-side rate-limited), plus an optional
periodic sweep later. This also fetches changed files in the same call, which feeds categorization. Points are
computed and frozen at ingestion time, keyed on the PR's GraphQL node ID (dedupe-safe). PRs merged into a repo the
same user owns, or self-merged, are excluded, to block the most obvious point-farming.

## Data model (bundle into one migration)

- **`users`** — `id`, `github_id` (unique), `github_login`, `avatar_url`, `access_token_encrypted`, `token_scope`, `created_at`, `last_synced_at`
- **`contributions`** (the points ledger, one row per merged PR) — `id`, `user_id` FK, `pr_node_id` (unique), `repo_full_name`, `repo_owner_login`, `pr_number`, `pr_url`, `category`, `points_awarded`, `merged_at`, `additions`, `deletions`, `changed_files_count`, `is_excluded`, `created_at`
- **`issue_cache`** — a short-TTL cache (15–60 min) over GitHub's search results for the browse and badge endpoints, not a source of truth: `repo_full_name`, `issue_number`, `category`, `labels_snapshot`, `repo_language`, `computed_at`, `expires_at`

No `issues` table — issue browsing stays live against GitHub's API, cached only. Follows [`migrations/README.md`](migrations/README.md)'s
rule: one numbered SQL file, sent to the teammate to hand-apply. Bundle all three tables into `0001_init.sql` rather
than trickling out several files, since every migration costs a round-trip to the teammate.

## API surface

| Method & path | Purpose |
|---|---|
| `GET /api/auth/github/login` | Redirect to GitHub OAuth |
| `GET /api/auth/github/callback` | Exchange code, upsert user, set session cookie |
| `POST /api/auth/logout` | Clear session |
| `GET /api/issues?category=&language=&page=` | Browse open, taggable GitHub issues, categorized (public) |
| `GET /api/me` | Profile, total points, rank (session required) |
| `GET /api/me/contributions` | The user's merged PRs with points/category (session required) |
| `POST /api/me/sync` | On-demand resync against GitHub (session required, rate-limited) |
| `GET /api/leaderboard?period=weekly\|alltime&category=` | One flexible leaderboard endpoint |
| `GET /api/public/badges?issues=owner/repo/number,...` | Batch category lookup for the extension |
| `GET /api/health` | Hosting platform health check |

## The chunks

Sizes are relative (S/M/L), not time estimates, since there's no fixed deadline.

**0. Team sync & doc alignment (S, do first)**
Tell the teammate about the points-model decision before more money-model work happens on their side. Reconcile
this local branch with `origin` (1 commit behind — a demo colour-theme tweak on content that's about to be rebuilt
anyway, so low-stakes to merge). Once agreed, update `readme.md`, `agent.md`, and `overview.md` to describe the
points model as the current plan instead of an open conflict.
*Depends on: nothing. Blocks: nothing technical, but do it first so effort isn't crossed.*

**1. Backend foundation & hosting (S)**
FastAPI app skeleton, config/env loading, `.env.example`, CORS setup, `/api/health`. Pick a host that supports a
long-running process plus a future cron trigger (e.g. Render, Railway, Fly — plain Vercel functions are an awkward
fit for a stateful FastAPI app with background sync).
*Depends on: nothing. Blocks: chunks 3–6, 9, 10.*

**2. Database schema — `migrations/0001_init.sql` (S)**
The three tables above, one file, header comment explaining what it sets up. Hand off to the teammate to apply
immediately — this is the slowest-turnaround dependency in the whole plan, so start it in parallel with chunk 1.
*Depends on: nothing. Blocks: chunks 3, 4, 5, 6.*

**3. GitHub OAuth & sessions (M)**
Login/callback/logout, GitHub OAuth App registration, encrypted storage of each user's access token, signed session
cookie, `/api/me`. **Flags [`rules.md`](rules.md) rule 5 — touches auth tokens, request the narrowest OAuth scope that works.**
*Depends on: chunks 1, 2. Blocks: chunk 4.*

**4. PR sync & points engine (L — the hardest chunk)**
The GraphQL merged-PR search per user, diff-based categorization (file extensions → frontend/backend/full-stack/
docs/other), the self-repo/self-merge exclusion filters, upserts into `contributions`.
*Depends on: chunk 3. Blocks: chunk 6 having real data (6 can be built against fixtures earlier).*

**5. Issue browsing & categorization API (M)**
`GET /api/issues`: GitHub search for open, taggable issues (labels like `good first issue`/`help wanted`, optional
language filter), label-based categorization falling back to repo language, writes through `issue_cache`. Shares its
categorization helper with chunk 8's badge endpoint.
*Depends on: chunk 2 only — can run fully in parallel with chunks 3–4.*

**6. Points & leaderboard queries (S/M)**
`GET /api/me/contributions`, `/api/me`, `GET /api/leaderboard` — SQL aggregates over `contributions`, indexed on
`(merged_at, category, user_id)`. Decide and document the weekly boundary once (e.g. UTC Monday 00:00) so it doesn't
look inconsistent across timezones. Can be scaffolded against seed data before chunk 4 lands, then wired to real data.
*Depends on: chunk 2 for scaffolding, chunk 4 for real data.*

**7. Website rebuild (L)**
Login, issue browse with category filters, personal dashboard, leaderboard pages. Reuse only the CSS custom
properties in [`frontend/web/styles.css`](frontend/web/styles.css) (colours, fonts, radii) — not its markup or copy,
since the whole product framing changed. Can start against a mocked API contract in parallel with chunks 3–6, wired
to real endpoints as they land.
*Depends on: nothing to start; needs chunks 3, 5, 6 to finish for real data.*

**8. Chrome extension v1 (M)**
Manifest V3, host permissions limited to `github.com` and the backend origin only, a content script that finds issue
rows on GitHub issue-list pages, a service worker that batches calls to `/api/public/badges`, badge rendering. This
is more than "a small front end" — see [`frontend/extension/README.md`](frontend/extension/README.md) for why
(separate manifest, content script, background service worker, GitHub's own page structure can change under it).
Can build against a stubbed badge endpoint before chunk 5 is real.
*Depends on: chunk 5 for the real endpoint; buildable in parallel until then.*

**9. Anti-abuse & rate-limit hardening (S)**
Per-user sync rate limiting, per-IP limiting on the two public endpoints (they share one server-side GitHub token
budget — use conditional requests/ETags so cache hits don't cost rate-limit budget), basic bot/dependabot filtering.
Mostly folded into chunks 4/5 as built, plus one dedicated pass before demo. Explicitly accept, rather than solve,
the harder case of two colluding accounts merging trivial PRs into each other's repos — out of scope for a hackathon.
*Depends on: chunks 4, 5.*

**10. Deployment (S/M)**
Deploy backend and website incrementally as chunks land, not big-bang at the end. Production GitHub OAuth App, env
vars, CORS for the website and extension origins, an end-to-end smoke test.
*Depends on: chunk 1 to start; grows with each chunk.*

**11. Demo prep & lightweight tests (S)**
Real GitHub merges take real time — pre-arrange a couple of genuinely merged PRs on the two teammates' own GitHub
accounts before demo day so the leaderboard has real data. A handful of unit tests for the categorization heuristic
and the anti-gaming filters (cheap, high value, no manual re-checking needed later).
*Depends on: chunk 4.*

## Suggested sequencing (two natural tracks)

A starting point, not an assignment — chunks are deliberately not pre-assigned to a name:

- **Track A — GitHub integration & points engine:** chunks 1, 3, 4, 9
- **Track B — product surfaces:** chunks 5, 7, 8
- **Shared / either person:** chunk 0 (together), chunk 2 (whoever's free first — send it to the teammate ASAP),
  chunk 6 (bridges both tracks), chunks 10–11 (shared, ongoing)

Rough stages:
1. Chunk 0, then chunks 1 and 2 in parallel.
2. Chunk 3 (Track A) and chunk 5 (Track B) in parallel — both only need chunk 2.
3. Chunk 4 (Track A, needs chunk 3) and chunk 7 started against a mock, chunk 6 scaffolded against fixtures.
4. Chunk 8 wired to real chunk 5; chunk 6 and 7 wired to real data from chunk 4.
5. Chunks 9, 10, 11 to close out.

## Open decisions to make as a team

Not blocking, but decide before they bite:

- Hosting platform for the backend (needs a long-running process; Render/Railway/Fly suggested over serverless).
- The exact points formula (flat per merged PR to start is fine; weighting by issue difficulty labels is a later
  refinement, not an MVP requirement).
- Explicitly accepting that categorization is best-effort (open-issue labels are inconsistent across repos; merged-PR
  categorization from changed files is more reliable but still shown as "estimated," not fact).
- Whether to request any GitHub OAuth scope beyond basic identity — verify search results don't need `repo` scope
  before requesting it.

## Verification (per chunk, since there's no existing test suite)

- **Chunk 2:** teammate confirms the migration applied; the Supabase SQL editor shows the three tables.
- **Chunk 3:** log in with a real GitHub account, confirm a session cookie is set and `/api/me` returns that
  account's login and avatar.
- **Chunk 4:** run a sync for an account with at least one known merged PR; confirm a `contributions` row appears
  with the correct category and a `points_awarded` value, and that a PR merged into that same user's own repo is
  excluded.
- **Chunk 5:** call `/api/issues` with a category filter; confirm results are real open GitHub issues with a
  plausible category, and that a second call within the cache TTL doesn't re-hit GitHub (check logs/rate-limit
  headers).
- **Chunk 6:** seed a couple of fixture rows across two weeks; confirm `weekly` leaderboard excludes the older ones
  and `alltime` includes both.
- **Chunk 7:** click through login → browse → dashboard → leaderboard in a real browser against the deployed
  backend.
- **Chunk 8:** load the extension unpacked in Chrome, visit a real GitHub issues list page, confirm a badge appears
  on an issue known to be in `issue_cache` and no badge (or a neutral state) on one that isn't.
- **Chunk 10:** hit the deployed `/api/health` and the deployed website's login flow end-to-end from a browser, not
  just `curl`.

## Critical files

- `migrations/0001_init.sql` — to be created (chunk 2), the highest-latency dependency in the plan
- `backend/` — currently only a README; the FastAPI skeleton, OAuth, sync engine, and API routes all land here
- `frontend/web/styles.css` — reuse only its CSS custom properties, not its markup (chunk 7)
- `frontend/extension/README.md` — the agreed v1 sketch chunk 8 implements against
- `rules.md` — governs commit granularity, migration rules, and the auth-token flagging requirement for chunks 2–4
- `overview.md`, `readme.md`, `agent.md` — need rewriting in chunk 0 once the teammate confirms the pivot
