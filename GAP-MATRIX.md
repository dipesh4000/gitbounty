# GitBounty gap matrix

Evidence-based audit of GitBounty against its own intended workflow, with GitPaid
(<https://github.com/sundai-club/git-paid/>) used only as a product-flow benchmark. No GitPaid code or branding is
copied; where GitPaid's approach is unsafe, the safe GitBounty equivalent is stated instead.

**Product boundary (unchanged).** GitBounty is a points/XP recognition platform. It is not a cash bounty platform,
cryptocurrency product, wallet, escrow service, blockchain application, or payment processor. Nothing in this
document proposes changing that.

Audit performed on branch `feat/buyer-ready-points-platform`, forked from `feat/open-source-ledger-landing` at
`3df882b`, against `origin/main` at `b6b26c4` (fetched 2026-10-01).

## 0. Corrections to the brief's assumptions

Every item the brief listed as "verify" was checked. These were **not** true as stated:

| Brief's assumption | Verified reality | Evidence |
|---|---|---|
| "No GitBounty button or URL should redirect to chatgpt.site" | Already fixed. No occurrence of `chatgpt.site`, `chatgpt.com` or `openai.` remains in tracked source. | `grep -rn 'chatgpt.site\|chatgpt\.com\|openai\.'` over tracked files → no matches. Removed by `3df882b` "Keep GitBounty navigation local" (deleted `frontend/web/.openai/hosting.json`). |
| "Extension popup used fabricated profile, points, and activity data" | Partly. `popup/data.js` is honest and derives everything from the API payload. The fabrication lives in `popup/popup.js` `demoAccount()` and in the Connect button, which writes `gitbounty_demo_session` and renders invented data with **no** dev-mode gate. | `frontend/extension/popup/popup.js:84-100`, `:129-132` |
| "The public GitHub Pages URL rendered repository/Jekyll material" | Not reproducible from this repo: there is no `.github/`, no Pages workflow, and no `_config.yml`. Any Pages site is configured in GitHub repository settings, i.e. owner-only. | `ls .github` → does not exist |
| "`POST /api/me/sync` existed but the web frontend did not invoke it" | Confirmed, and worse: no frontend or extension code references `/api/me/sync` at all, so **no** merged PR is ever recorded through the UI. | `grep -rn 'me/sync' frontend/` → no matches |
| "Category leaderboards were incomplete" | The API supports `period` and `category` and ties break deterministically. What is missing is month/week UI, pagination, and current-user position outside the first page. | `backend/app/features/points/store.py:leaderboard`, `backend/app/features/points/router.py:get_leaderboard` |
| "Some frontend files were excluded from linting" | Confirmed, and all three excluded files are **dead code** that nothing imports. | `frontend/web/eslint.config.mjs:12-13`; `AuthProvider.tsx` is live, `BountyBoard.tsx` and `SiteFooter.tsx` are imported by nothing |

Two things the brief did not mention and that are more serious than most of what it did:

1. **The public landing page is entirely fabricated data.** `frontend/web/app/components/BroadsheetLanding.jsx`
   is what `/` renders. It ships nine invented issues in invented repositories (`openframe/core`,
   `relaylabs/queue`, `marrow/orm`…), a nine-person invented leaderboard with invented point totals up to 4,210,
   an invented "you: rank 27, 45 points" row, and a visible Live/Loading/Empty/Offline state switcher. None of it
   is labelled as sample data in the UI. Evidence: `BroadsheetLanding.jsx:16-36`, `:107-115`.
2. **`backend/.env` on this machine points `DATABASE_URL` at the shared Supabase pooler**
   (`aws-0-ap-southeast-2.pooler.supabase.com:5432`), and the backend test suite reads that same `.env`, so tests
   are environment-dependent. One test already fails because of it. Evidence: `.venv/bin/python -m pytest -q` →
   `FAILED tests/test_points_api.py::test_the_website_origin_is_allowed_but_a_stranger_is_not`, because the
   developer's `ALLOWED_ORIGINS` overrides the default the test asserts.

## 1. Repository and source of truth

| # | Intended | Verified current | GitPaid | Safe? | Required change | Pri | Files | Acceptance test | Owner action |
|---|---|---|---|---|---|---|---|---|---|
| 1.1 | One branch holds all legitimate work | Diverged. 5 commits on the feature branch are absent from `origin/main`; 4 commits incl. migration 0005 are absent from the branch. | n/a | n/a | Merge `origin/main` into the feature branch; no rebase, no force-push | P0 | whole repo | `git log --oneline origin/main --not HEAD` is empty | no |
| 1.2 | Migrations 0001–0005 all present | Branch has 0001–0004 only; `0005_merged_prs.sql` exists only on `origin/main` | n/a | n/a | Preserve 0005 through the merge | P0 | `migrations/` | `ls migrations/0005_*.sql` | no |
| 1.3 | `PRODUCT.md` truthfully describes GitBounty | `origin/main`'s `PRODUCT.md` is a **verbatim copy of GitPaid's README** — "Git Paid - GitHub Bounty Platform", Radius SDK, escrow, Prisma, `RADIUS_ESCROW_API_KEY`. The branch's own `PRODUCT.md` is GitBounty-true but stale (claims the frontend is demo data and that OAuth "belongs to later backend integration"). | GitPaid's own README | Unsafe to copy (third-party copyright; describes escrow/wallet architecture out of scope) | Keep the branch's file, rewrite it to current reality; never take `origin/main`'s | P0 | `PRODUCT.md` | No occurrence of "Radius", "escrow", "Git Paid" in `PRODUCT.md` | no |
| 1.4 | Agent/working-rule docs retained | `origin/main` **deletes** `CLAUDE.md`, `AGENTS.md`, `agent.md`, `rules.md`, `feature-seams.md`, `feature-split.md`, `plan.md` and guts `overview.md` (164 → ~20 lines) | n/a | n/a | Keep the branch's versions on merge; these are the project's working contract | P0 | those 8 files | all 8 present and unchanged after merge | no |
| 1.5 | Historical work identified before deletion | `origin/main` adds `examples/web/` — the original vanilla single-page site (`index.html`, `styles.css`, `script.js`, assets) that `frontend/web/` was ported from, plus a pitch screenshot | n/a | n/a | Take it from `origin/main` and keep it, as the visual specification of record | P1 | `examples/` | `examples/web/index.html` present | no |
| 1.6 | A real licence | `readme.md:36` shows an MIT shields.io badge; there is no `LICENSE` file | n/a | n/a | Cannot be invented. Either add MIT (matching the badge) or drop the badge | P1 | `LICENSE`, `readme.md` | `LICENSE` exists **or** badge removed | **yes — owner must confirm the licence** |
| 1.7 | `readme.md` describes the product being built | `readme.md` is the money/escrow pitch: wallets, ERC-20, `ENGINE_PRIVATE_KEY`, Solidity, "paid straight to their wallet" | GitPaid is genuinely that product | Unsafe as current spec | Replace with a points-product README; keep the money design as an explicitly future design doc | P0 | `readme.md`, `docs/future-paid-bounties.md` | No wallet/escrow/ERC-20 language outside the clearly-marked future doc | no |

## 2. Authentication and demo data

| # | Intended | Verified current | GitPaid | Safe? | Required change | Pri | Files | Acceptance test | Owner action |
|---|---|---|---|---|---|---|---|---|---|
| 2.1 | Connect GitHub starts real OAuth | `DEMO_CONNECT = true`, so every Connect button fakes a session as the hard-coded user `aastha-malik` and redirects to `/explore`. The real redirect to `/auth/github` is dead code behind that flag. | Real OAuth (Passport) | GitPaid's flow is safe in shape; its scopes (`repo`, `admin:repo_hook`) are not | Delete `demoSession.ts`; wire Connect to `${API_BASE}/auth/github` | P0 | `app/lib/demoSession.ts`, `app/components/AuthProvider.tsx`, `app/lib/api.ts` | Fresh browser: Connect → github.com/login/oauth/authorize | no |
| 2.2 | Backend OAuth is the only identity path | Real OAuth exists and is correct in shape: 32-byte `secrets.token_urlsafe` state, `compare_digest` verification, state popped before use, token Fernet-encrypted, session holds only the row id, `github_id` is the conflict key. | equivalent | safe | Keep; harden cookie flags and add scope breadth for repo listing | P0 | `backend/app/auth.py` | `/api/me` returns the real login after callback | no |
| 2.3 | Extension shows real auth state | `popup.js` Connect button writes `localStorage.gitbounty_demo_session` and renders `demoAccount()`: login `aasha-malik`, 185 points, three invented merges. Not gated by any dev flag. | n/a | n/a | Remove; Connect must open the real backend OAuth URL in a tab | P0 | `frontend/extension/popup/popup.js` | Popup with no session shows signed-out, never a number | no |
| 2.4 | Dashboard link works | `popup.js` `DASHBOARD_URL = "http://localhost:8000/explore"`; the web app's dev server is port 3000 | n/a | n/a | Point at 3000, make it configurable | P0 | `popup/popup.js` | Clicking Open dashboard reaches the running app | no |
| 2.5 | No fabricated data in normal runtime | The public landing page is 100% invented (see §0). | GitPaid has no fabricated landing data | n/a | Replace invented issues/leaderboard with real API reads, or with honest static copy that claims no data | P0 | `BroadsheetLanding.jsx` | `/` shows no invented repo, user or score | no |
| 2.6 | Session cookie hardened | `SessionMiddleware` sets `same_site="lax"`, 14-day `max_age`, and `https_only` derived from `FRONTEND_URL` — which is `http://localhost:8000` here, so Secure is off (correct locally, fragile as the production switch). Starlette sets HttpOnly. No rotation on login. | JWT in cookie | GitPaid's is weaker | Make Secure an explicit setting; rotate the session id on login | P0 | `backend/app/main.py`, `app/auth.py` | Cookie has HttpOnly+SameSite; Secure when configured | no |
| 2.7 | Tokens never reach the browser | Holds. `UserPublic` omits the token; `models.py:USER_PUBLIC_COLUMNS` deliberately excludes it. | GitPaid returns a JWT to the browser | our approach is safer | none | — | `backend/app/models.py:27` | no token field in any response schema | no |
| 2.8 | Logout and revocation | `POST /auth/logout` clears the session. No GitHub token revocation, and the stored encrypted token is left behind. | n/a | n/a | Clear the stored token on logout; handle 401 from GitHub as "reconnect" | P1 | `backend/app/auth.py` | After logout, `/api/me` → 401 | no |
| 2.9 | CSRF on cookie-authenticated writes | **Gap.** `POST /api/maintainer/bounties`, `/api/me/sync`, `/api/issues/sync`, `/auth/logout` are cookie-authenticated with no CSRF token. CORS limits browsers to the allowlisted origins, which blunts but does not close this. | GitPaid has the same class of problem | unsafe | Add a double-submit CSRF token or require a custom header on writes | P0 | `backend/app/main.py` + routers | Cross-origin form POST is rejected | no |
| 2.10 | Stable identity key | Holds: `users.github_id` is the unique key everywhere; login is treated as mutable. | GitPaid keys on GitHub id too | safe | none | — | `migrations/0001_users.sql` | — | no |

## 3. Synchronisation

| # | Intended | Verified current | GitPaid | Safe? | Required change | Pri | Files | Acceptance test | Owner action |
|---|---|---|---|---|---|---|---|---|---|
| 3.1 | Sync runs after first login | Never runs. Nothing in `frontend/` or `frontend/extension/` references `/api/me/sync`. | GitPaid uses webhooks instead | GitPaid's webhook path is unsafe as implemented (per brief); polling as the user is the safe choice here | Trigger sync after callback; add a visible Sync action | P0 | `app/auth.py`, new frontend sync control | After OAuth, My PRs is populated without manual curl | no |
| 3.2 | Visible progress and last-synced time | Nothing stored: no sync-status table, no cursor, no last-error. | n/a | n/a | Add `sync_runs` / status columns, surface in UI | P0 | new migration, frontend | UI shows last-synced time and failure reason | no |
| 3.3 | Pagination handled | Partly. `fetch_merged_prs` paginates GitHub search but search caps at 1000 results. `list_user_repositories` and `list_repo_issues` paginate to a 500 cap. | n/a | n/a | Document caps; add incremental sync by `merged_at` so the cap stops mattering | P1 | `backend/app/features/merged_prs/github.py`, `app/github.py` | sync of >1000 PRs completes over runs | no |
| 3.4 | Rate limits respected and recoverable | Partly: `GitHubRateLimited` is raised and mapped to 429 with `Retry-After`. No proactive backoff, and the error is not shown anywhere in the UI. | n/a | n/a | Surface 429 in the UI as a recoverable state | P1 | frontend | Mocked 429 shows "try again in N" | no |
| 3.5 | Idempotent, never double-awards | Holds at the row level: `unique (user_id, github_pr_id)` plus `on conflict … where excluded.points > merged_prs.points`. | GitPaid's release path has atomicity problems | ours is safer | Keep; add an append-only ledger so corrections are entries, not overwrites | P0 | `store.py:record_merges`, new migration | re-sync twice → same total | no |
| 3.6 | Does not block page render | Holds today only because sync never runs. Once wired, `/api/me/sync` is a synchronous request that fans out one GitHub call per PR. | n/a | n/a | Run as a background task; return immediately with a status row | P0 | `points/router.py` | `/explore` renders before sync finishes | no |

## 4. Maintainer workflow

| # | Intended | Verified current | GitPaid | Safe? | Required change | Pri | Files | Acceptance test | Owner action |
|---|---|---|---|---|---|---|---|---|---|
| 4.1 | List authorised repositories | `GET /api/maintainer/issues` lists repos but filters to `owner.type == "User"` **and** `owner.login == user.github_login`, public only — so organisation repos are impossible even for an admin. | GitPaid allows org repos | n/a | Add org support via `permissions.admin`/`maintain` from the GitHub API, server-verified | P1 | `backend/app/routes/maintainer.py:_is_personal_owner` | An org admin can publish; a plain member cannot | no |
| 4.2 | No URL pasting | Holds — repositories are discovered from the token. | n/a | n/a | none | — | `maintainer.py:list_owned_issues` | — | no |
| 4.3 | Search/filter issues before publishing | Not present in `BountyManager`. | GitPaid has none either | n/a | Add search and repo filter | P1 | `app/components/BountyManager.tsx` | typing filters the list | no |
| 4.4 | Edit a published bounty | Partly: re-publishing the same issue upserts `issue_points`, so the value can be changed, but there is no edit UI and no audit of the change. | GitPaid has none | n/a | Add explicit edit endpoint + history row | P1 | `maintainer.py`, migration | changing 40→50 leaves an audit row | no |
| 4.5 | Unpublish / archive | **Absent.** No delete or state column. A published bounty is permanent. | GitPaid can cancel | n/a | Add `status` (`published`/`unpublished`/`archived`) and endpoints | P1 | migration, `maintainer.py`, frontend | unpublished bounty leaves the explorer | no |
| 4.6 | Server-side authorisation on every write | Holds for publish: ownership is re-fetched from GitHub per request and the client's claim is never trusted. | GitPaid trusts more | ours is safer | none for publish; apply same rule to new edit/unpublish endpoints | P0 | `maintainer.py:_load_owned_repository` | publishing for a repo you don't own → 403 | no |
| 4.7 | Duplicate active bounties prevented | Holds: `unique (repo_full_name, issue_number)` on `issue_points`. | n/a | safe | none | — | `migrations/0004` | — | no |
| 4.8 | Deleted/renamed/transferred/closed issues | Partly: publishing re-verifies the issue is open and 404/403 are mapped. Nothing re-checks afterwards, so a closed or deleted issue stays in the explorer forever. | n/a | n/a | Add a refresh pass that marks issues closed/missing | P1 | `app/services/issue_sync.py` | closing an issue on GitHub removes it from the board after refresh | no |
| 4.9 | Private repos | Explicitly rejected with a clear 400; OAuth scope is `read:user` only. | GitPaid requests `repo` | GitPaid's broad scope is the unsafe choice | Keep public-only; document a GitHub App as the least-privilege path | P2 | `maintainer.py`, docs | private repo → explanatory 400 | **yes if private support is wanted — GitHub App creation** |

## 5. Contributor PR lifecycle

| # | Intended | Verified current | GitPaid | Safe? | Required change | Pri | Files | Acceptance test | Owner action |
|---|---|---|---|---|---|---|---|---|---|
| 5.1 | Submitted / draft / in review / changes requested / approved / merged / closed / ineligible | **Only merged exists.** `fetch_merged_prs` searches `is:merged`; `merged_prs` is the only table; the UI hard-codes `<span className="app-status is-merged">Merged</span>`. The My PRs header nonetheless says "Track the work you have submitted." | GitPaid tracks claim states | n/a | Fetch all authored PRs with review state; add a `pull_requests` table and real status column | P1 | new migration, `github.py`, `ContributorWorkspace.tsx` | an open PR appears as Open, not Merged | no |
| 5.2 | Award goes to the eligible PR author | Holds in the backend: sync searches `author:<login>` as the signed-in user, so the author is the recipient. | GitPaid releases to the claimer | ours is safer | none in backend; fix extension copy (§8) | P0 | `merged_prs/github.py` | — | no |
| 5.3 | Self-reward rejected | Partly: `is_self_merge` drops PRs whose repo owner equals the author. Two colluding accounts are not caught, and a maintainer completing their own published bounty in someone else's repo is not caught. | GitPaid has no such rule | ours is safer but incomplete | Add documented policy + per-issue cap + flagging | P0 | `models.py:is_self_merge`, `points/rules.py` | self-merge earns 0 | no |
| 5.4 | Only published bounties award their value | **Violated.** `_issue_points` falls back to **any** `gitbounty:N` label on **any** repo, so points can be earned from an issue that was never published on GitBounty. | n/a | n/a | Decide and document: label-only issues must either be a documented fallback or stop awarding | P0 | `merged_prs/service.py:_issue_points`, `points/rules.py` | an unpublished labelled issue awards baseline only | no |
| 5.5 | Points never silently inflate | Partly: points can only increase on re-sync (`where excluded.points > …`). That is the opposite failure — a maintainer who lowers a value can never correct an over-award. | GitPaid has no correction model | n/a | Append-only ledger with adjustment entries | P0 | new migration, store | lowering a value creates a negative adjustment, not a rewrite | no |
| 5.6 | Reverted merges, reopened PRs, multiple PRs per bounty | Undefined and untested. Several PRs each closing the same issue each receive the full issue value. | undefined too | n/a | Define rules, enforce with a unique award per (bounty, completion) | P0 | rules + migration | second PR closing the same bounty earns baseline only | no |
| 5.7 | Immutable audit history | Absent. `merged_prs` rows are mutated in place. | absent | n/a | Add `points_ledger` append-only table with rule version and reason | P0 | new migration | every total reconstructible from ledger rows | no |

## 6. Points ledger and anti-gaming

| # | Intended | Verified current | GitPaid | Safe? | Required change | Pri | Files | Acceptance test | Owner action |
|---|---|---|---|---|---|---|---|---|---|
| 6.1 | Server-side min/max bounty points | `MAX_ISSUE_POINTS: int | None = None` — explicitly uncapped, with a comment admitting it is the known cheat. DB check is only `points > 0`. | GitPaid caps by funds held | n/a | Set a documented max and enforce in Pydantic **and** a DB check | P0 | `points/rules.py`, `maintainer.py`, migration | publishing 100000 points → 422 | no |
| 6.2 | Full provenance per award | Partly: repo, issue, PR, category, points stored. Missing: who set the value, which rule version, why, and the maintainer/bounty link. | n/a | n/a | Ledger columns for rule version, reason, bounty id, actor | P0 | new migration | every row names its rule version | no |
| 6.3 | Transactional award | Holds for the write (`async with connection.transaction()`), but the GitHub fan-out happens outside it, so a partial sync is possible (and safe, being idempotent). | GitPaid is not transactional | ours is safer | none | — | `points/router.py` | — | no |
| 6.4 | Documented policy for the nine abuse cases | Not written down anywhere; some cases silently resolve in the contributor's favour (e.g. one PR closing three bounties earns all three). | n/a | n/a | Write `docs/points-rules.md`, enforce, test | P0 | docs + rules | each case has a test | no |
| 6.5 | Value frozen at the right point | Not frozen: `_issue_points` reads the current value at sync time, so a value raised after the merge still pays out. | n/a | n/a | Freeze at merge time; later changes become adjustments | P0 | service + ledger | raising after merge does not change the award | no |
| 6.6 | Moderation hooks | Absent. | absent | n/a | Add flag/void entries, no admin UI needed yet | P2 | migration, endpoint | a voided award leaves the leaderboard | no |
| 6.7 | Auditable points history UI | Partly: My PRs lists merges with points; no ledger view, no adjustments. | n/a | n/a | Add a points history route | P1 | frontend | each entry shows source and reason | no |
| 6.8 | Baseline merge reward is real and documented | `FLAT_POINTS_PER_MERGE = 5` is enforced in the backend, so the figure is genuine — but it rewards **any** merged PR in **any** repository, which is trivially farmable with a second account. | n/a | n/a | Either restrict the baseline to tracked repositories or drop it; `PRODUCT.md` must state the choice | P0 | `points/rules.py`, `PRODUCT.md` | documented rule matches enforced rule | no |

## 7. Categories and leaderboards

| # | Intended | Verified current | Safe? | Required change | Pri | Files | Acceptance test |
|---|---|---|---|---|---|---|---|
| 7.1 | Overall + per-category boards | API supports all nine categories; UI exposes category chips | safe | none | — | `points/router.py` | existing tests |
| 7.2 | Week / month / all-time | API supports all three; **UI only ever requests `period=all`** | — | add the time filter to the UI | P1 | `ContributorWorkspace.tsx:88` | switching to Week changes the list |
| 7.3 | Deterministic ties | Holds: `order by points desc, merges desc, github_login asc` | safe | none | — | `store.py:leaderboard` | existing test |
| 7.4 | Pagination | Absent: `limit` only, max 100, no offset | — | add offset/cursor | P1 | `points/router.py`, store | page 2 returns ranks 101+ |
| 7.5 | Current-user position outside page 1 | Absent | — | add a `me` block to the response | P1 | router, store | a rank-150 user still sees their rank |
| 7.6 | Honest empty states | Holds — empty states are honest and specific | safe | none | — | `ContributorWorkspace.tsx` | — |
| 7.7 | Category provenance | Partly: maintainer choice wins for a published bounty (`issues.category`), but a **merge's** category comes from `categorise()` over changed files and never consults the published bounty's category — so a bounty published as Docs can score as Backend. No provenance column. | — | prefer the bounty's category for an awarded merge; record provenance | P1 | `merged_prs/service.py`, migration | awarded merge inherits the bounty category |
| 7.8 | Efficient aggregates | `merged_prs` has user/merged_at/category indexes; the leaderboard group-by has no composite index | — | add `(category, merged_at)` | P2 | migration | query plan uses the index |

## 8. Extension

| # | Intended | Verified current | Safe? | Required change | Pri | Files | Acceptance test |
|---|---|---|---|---|---|---|---|
| 8.1 | Badge only for an exact published bounty | `findPublishedBounty` matches repo (case-insensitively) and number exactly — correct. But `decorateLabel` **also** badges any `gitbounty:N` label with no API confirmation, so an unpublished issue gets a badge. | partly | make the label path an explicitly documented fallback that never claims a GitBounty award | P1 | `src/content.js:decorateLabel` | unpublished labelled issue shows no GitBounty badge |
| 8.2 | Never say the merger earns points | **Violated.** `content.js` builds the string `"… to whoever merges this"`. | unsafe (wrong recipient) | say "to the pull request author, when merged" | P0 | `src/content.js:decoratePullRequest` | fixture asserts the author wording |
| 8.3 | Never show a reward for untracked work | **Violated.** `decoratePullRequest` computes `(points ?? 0) + 5` and shows a banner even when no bounty exists. | unsafe | no banner without a published bounty | P0 | `src/content.js` | untracked PR gets no banner |
| 8.4 | Full pagination | `per_page=100`, single request, no `page` loop | — | paginate until `has_more` is false | P1 | `src/background.js` | 150 bounties all badge |
| 8.5 | Cache scoped by repo+user, with expiry | `bountyRequests` is an in-page `Map` keyed by repo only, never expires, not scoped by user | — | add TTL and include the authenticated user in the key | P1 | `src/content.js`, `background.js` | cache expires; switching user refetches |
| 8.6 | Idempotent injection, Turbo-safe | Holds: `upsertBadge` reuses an existing badge, debounced MutationObserver + `turbo:load`/`pjax:end` | safe | none | — | `src/content.js` | existing tests |
| 8.7 | Minimal permissions | Holds: `activeTab` + `http://localhost:8001/*`, globs limited to issue/pull paths, no remote code | safe | none | — | `manifest.json` | — |
| 8.8 | Popup shows real state | **Violated** — see 2.3 | unsafe | remove fake account | P0 | `popup/popup.js` | no session → signed-out |
| 8.9 | Real browser verification | Never done | — | load unpacked in Chrome/Brave, capture evidence | P1 | — | screenshot/DOM evidence |

## 9. Frontend and UX

| # | Intended | Verified current | Required change | Pri | Files |
|---|---|---|---|---|---|
| 9.1 | Authenticated dashboard distinct from marketing | Holds — `/explore` is a real app shell | none | — | `ContributorWorkspace.tsx` |
| 9.2 | Nav covers issues, repos, PRs, leaderboard, points, profile | Only Issues / My PRs / Leaderboard (+ Add issues). No points history, no profile, no maintainer workspace route | add the missing views | P1 | `ContributorWorkspace.tsx` |
| 9.3 | Every link does something real | `SiteFooter.tsx` has five `href="#"` dead anchors — but the file is dead code, imported by nothing | delete the dead components | P1 | 13 unused components |
| 9.4 | Copy agrees with reality | `InteriorPage.tsx` says "Preview data on the homepage", "data connection pending", "no toolbar popup yet" (there is one), extension "VERSION 0.1.0" (manifest says 0.3.0), and privacy claims `read:user` is enough | rewrite from the implementation | P0 | `InteriorPage.tsx` |
| 9.5 | Fonts local | `BroadsheetLanding.jsx:144` `@import url('https://fonts.googleapis.com/…')` — the landing page fetches Google Fonts at runtime even though `layout.tsx` already self-hosts the same three families | drop the import, use the self-hosted variables | P0 | `BroadsheetLanding.jsx` |
| 9.6 | Colours from variables | `BroadsheetLanding.jsx` hard-codes ~40 hex values (`#B7F34A`, `#080B09`…), against `CLAUDE.md`'s rule and diverging from `globals.css --accent: #C5F53A` | use the variables | P1 | `BroadsheetLanding.jsx` |
| 9.7 | Lint covers application files | 3 files excluded | delete them (all dead) and drop the exclusions | P0 | `eslint.config.mjs` |
| 9.8 | Typecheck passes | `npx tsc --noEmit` reports 6 errors (`InteriorPage.tsx` union narrowing, `worker/index.ts` missing `Fetcher`, generated `.next/types/validator.ts`); there is no `typecheck` npm script | fix and add the script | P0 | `tsconfig.json`, `package.json`, those files |
| 9.9 | 404 / unauthorized / error routes | None exist (`app/` has no `not-found.tsx`, `error.tsx`) | add them | P1 | `app/` |
| 9.10 | No deployment claim | `/status` says "Public landing live" and "The public landing experience is shareable" — nothing is deployed | correct the copy | P0 | `InteriorPage.tsx` |

## 10–14. API, tests, CI, security, ops

| # | Intended | Verified current | Required change | Pri | Owner action |
|---|---|---|---|---|---|
| 10.1 | Validated inputs | Mostly good: `Literal` categories, `Field(gt=0)`, whitelisted `sort` (no SQL injection path found — every query is parameterised, the only interpolation is the whitelisted `order_by`) | add max points, repo-name regex | P0 | no |
| 10.2 | Migration runner / status check | None. Migrations are applied by hand with no record of what has been applied | add a `migrations` ledger table + checker script | P1 | no |
| 10.3 | Clean-database bootstrap proof | None. `dev/schema.sql` and `migrations/` are two independent copies of the same tables and can drift (0005 ≈ dev/schema.sql but they are separate files) | make the migrations the single source and bootstrap tests from them | P0 | no |
| 10.4 | API rate limiting | Absent | add a simple limiter | P2 | no |
| 10.5 | Structured logs with correlation ids | `logging.basicConfig(level=INFO)` only | add request-id middleware + JSON logs | P2 | no |
| 10.6 | Readiness endpoint | `/health` is liveness only and checks nothing | add `/ready` that checks the pool | P1 | no |
| 11.1 | Backend tests | 152 pass, 24 skip without a DB; 176 with the local container — **but one fails** because the suite reads the developer's `.env` | isolate tests from `.env` | P0 | no |
| 11.2 | Frontend tests | **None at all.** No test runner, no test script | add component/state tests | P1 | no |
| 11.3 | Extension tests | 9 pass (`node --test`) | add the cases in §8 | P1 | no |
| 11.4 | CI | **No `.github/` at all.** No workflow, no secret scanning, no dependency audit, no branch protection | add a workflow covering lint, typecheck, build, tests, audit, secret scan, migration bootstrap | P1 | **yes — branch protection is a repo setting** |
| 12.1 | Secrets not in tracked files or history | `.gitignore` covers `.env`; `git log` shows no `.env` committed. `backend/.env` exists locally, untracked. | verify with a history scan and keep it that way | P0 | no |
| 12.2 | Compromised secrets rotated | `backend/.env` holds a live GitHub OAuth client secret, session secret, Fernet key and the Supabase pooler URL, all shared during development | write a rotation checklist; note that rotating `TOKEN_ENCRYPTION_KEY` invalidates every stored token and forces re-login | P0 | **yes — only the owner can rotate these** |
| 12.3 | XSS | No `innerHTML` with user data found; the extension builds nodes with `textContent`. One `dangerouslySetInnerHTML` in `layout.tsx` contains a static comment only. | none | — | no |
| 12.4 | Dependency audit | Not run in this repo before | run `npm audit` and `pip`-level review, record a licence inventory | P1 | no |
| 13.1 | Buyer documentation | `readme.md` is the wrong product; no architecture doc, no runbook, no API doc, no handoff checklist | write them | P1 | no |
| 14.1 | Future paid-bounty design doc | Absent; `readme.md` doubles as it by accident | write `docs/future-paid-bounties.md` as an explicit future proposal | P2 | no |

## Integration strategy for the divergence (before any merge)

The two branches each contain work the other lacks, and `origin/main` additionally **deletes** files this branch
depends on. Three options were considered:

1. **Rebase the branch onto `origin/main`** — rejected. It rewrites five published commits
   (`origin/feat/open-source-ledger-landing` exists on the remote), and it would replay the branch on top of a tree
   where `rules.md`, `agent.md` and the rest have been deleted, forcing the same conflicts in five separate steps.
2. **Reset/force either side** — rejected outright; it destroys a teammate's commits.
3. **A normal merge commit, `origin/main` into the feature branch** — chosen. It is additive, keeps both
   histories intact, needs no history rewrite, and resolves the doc deletions once instead of five times. The
   merge is performed with `--no-commit` so every conflicting path is resolved deliberately:
   - **take from `origin/main`:** `migrations/0005_merged_prs.sql`, `examples/web/**`
   - **keep from this branch:** `CLAUDE.md`, `AGENTS.md`, `agent.md`, `rules.md`, `overview.md`, `plan.md`,
     `feature-split.md`, `feature-seams.md`, `frontend/web/package-lock.json`, `frontend/web/package.json`
   - **rewrite afterwards:** `PRODUCT.md` (neither version is correct), `readme.md`
   - **reject entirely:** `origin/main`'s GitPaid-derived `PRODUCT.md` content

Nothing is merged into `main` and nothing is pushed without explicit approval.

## Priority order

**P0 (foundation):** 1.1–1.4, 1.7, 2.1, 2.3–2.6, 2.9, 3.1, 3.2, 3.5, 3.6, 4.6, 5.2–5.7, 6.1–6.5, 6.8, 8.2, 8.3,
8.8, 9.4, 9.5, 9.7, 9.8, 9.10, 10.1, 10.3, 11.1, 12.1, 12.2

**P1:** 1.5, 1.6, 2.8, 3.3, 3.4, 4.1, 4.3–4.5, 4.8, 5.1, 6.7, 7.2, 7.4, 7.5, 7.7, 8.1, 8.4, 8.5, 8.9, 9.2, 9.3,
9.6, 9.9, 10.2, 10.6, 11.2–11.4, 12.4, 13.1

**P2:** 4.9, 6.6, 7.8, 10.4, 10.5, 14.1

## Owner-only actions

1. Confirm the intended open-source licence (or confirm the MIT badge should go). — 1.6
2. Rotate the GitHub OAuth client secret, `SESSION_SECRET`, `TOKEN_ENCRYPTION_KEY` and the Supabase
   password/URL. Rotating `TOKEN_ENCRYPTION_KEY` invalidates every stored GitHub token and forces all users to
   sign in again. — 12.2
3. Approve any migration applied to the shared Supabase project. — 10.2
4. Enable branch protection and CI credentials on the GitHub repository. — 11.4
5. Create a GitHub App if private-repository support is wanted. — 4.9
