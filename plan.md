# Progress and next steps

Updated 2026-10-10 from the source, local git history and verification. This page tracks implementation, not promises.
Product decisions are in [overview.md](overview.md).

## Current implementation

| Area | Present in code | Remaining work |
|---|---|---|
| Sign-in | GitHub OAuth, signed cookies, encrypted stored tokens, logout | Verify real GitHub authorization end to end |
| Maintainers | Repository permission checks; publish/edit/unpublish/archive; bounty history; GitHub App connection | Verify installation against a real GitHub App |
| Website | Public explorer, signed-in workspace, PR/points history, claims, leaderboards and App setup | Verify the complete journey with real GitHub |
| Contribution tracking | Contributor sync plus signed, durable GitHub App webhook processing | Verify delivery and retry behavior with GitHub |
| Points | Bounties, baseline, append-only ledger, pre-registration allocations and idempotent claims | Verify a claim made after a real pre-registration merge |
| Extension | Registered-only badges, stale-state refresh, points/activity popup and claim link | Verify current GitHub DOM and live browser behavior |
| Moderation | Report/review/resolve APIs and award withdrawal | Moderation UI and stronger collusion controls |
| Python | FastAPI, uv lockfile, async SQLAlchemy issue-board and authentication queries | Migrate remaining asyncpg queries |
| Database | Numbered SQL migrations 0001–0015; local migration runner | Owner approval to apply 0015 to shared database; remaining SQLAlchemy migration |
| AVAX | Fixed owner promises, wallet ownership proofs, individual signed payments and receipt verification | Enable after shared migration approval; verify a real wallet/mainnet payment and withdrawal |
| Operations | Readiness, structured logs, rate limiting, CI and a durable webhook retry worker | Hosting, monitoring and production configuration |

There is no deployed service or extension-store release documented in this repository.
The extension currently targets localhost. Owner-funded AVAX payment code is present;
live execution is disabled pending shared migration/configuration. No mainnet payment has been verified.

## Execution order

1. **Prove the current journey.** Run the existing checks with local Postgres; verify real OAuth, publish a bounty,
   see it on GitHub, merge an eligible PR, sync, and inspect its award on both surfaces.
2. **uv adopted.** Backend project metadata, lockfile, setup and CI now use uv with Python 3.12. The E2E launcher supports Windows and POSIX virtualenv paths.
3. **SQLAlchemy migration started.** Public issue-board and authentication queries use mapped models and async sessions. Migrate remaining queries in small steps while retaining
   API behavior, token protection, transactions and database uniqueness constraints.
   Keep numbered SQL migrations; do not generate or apply a schema at application startup.
4. **Reward identity model implemented.** Rewards are reserved by numeric GitHub identity and claimed once by
   the authenticated owner. Existing ledger awards are backfilled as claimed reservations.
5. **GitHub App path implemented.** Selected public repositories accept signed, deduplicated deliveries through
   a durable Postgres inbox. The worker revalidates GitHub data, retries failures and shares sync award rules.
6. **Complete extension verification.** Registered-only badges and visible-page refresh/removal are implemented.
   Verify account points and navigation against live GitHub. Browser refresh remains independent of webhooks.
7. **Release only after verification.** Choose hosting, finish production configuration, verify recovery,
   and prepare extension distribution. No automatic deployment is authorised by this plan.

## Cleanup and GitHub App implementation

- Public extension bounty lookups no longer fetch identity or cache per account; redundant tests removed.
- Migration 0013 reserves awards by numeric GitHub ID, backfills existing awards without changing the ledger,
  and adds GET/POST `/api/me/claims`. Sync uses the same reservation boundary.
- Storage, claims, points API and moderation checks: 89 passed against local Postgres.
- Migration 0014 adds selected repository connections and a durable, signed webhook inbox. The worker
  verifies live installation/repository/PR author data, shares the award rules, and retries failures.
- Removed duplicate bounty matching and a configuration-reloading test that contaminated later tests.
- Website and extension claim links and website repository-connection controls are wired to these APIs.
- The unused `/api/me/merged-prs` endpoint and its duplicate tests were removed; `/api/me/pull-requests` is the current contract.
- Removed unused all-repository issue loading, category-count and standalone rules routes, plus the global issue-search sync service.
  The explorer reads maintainer-published rewards; points history includes the applied rules.
- Repeated boundary tests were consolidated and obsolete route tests removed. The backend suite now has 304 passing cases, down from 437.
- Removed archived designs, the unused root MCP npm package and generated build/test output at the owner's request.
  The setup guide includes the existing local Windows database and manual end-to-end verification steps.

## Evidence and verification limits

- Recent commits record backend, frontend component, end-to-end and accessibility checks. Those are historical results,
  not a fresh test run on this machine.
- On 2026-10-06, all 33 extension tests pass, including runtime popup claim behavior.
- All 61 website component tests pass; lint, typecheck and the production vinext build pass.
- uv lock validation and 103 backend unit tests passed on Python 3.12.13.
- Full backend baseline: 431 passed with isolated local PostgreSQL 17.11, no skips.
  Source and migration reads now explicitly use UTF-8 on Windows. Local checks use IPv4 to avoid localhost fallback delays.
- Final backend verification: 304 passed, no skips, in 96.53 seconds against local Postgres with dedicated test databases.
  One existing Starlette/AnyIO deprecation warning remains. IPv4 avoids localhost connection fallback delays.
- All 26 E2E/accessibility checks pass on Windows with installed Chrome, local PostgreSQL, the production website build
  and a simulated GitHub HTTP server. Bundled Chromium download timed out; that browser was not verified locally.
  The harness rejects remote database hosts and names without the `_e2e` suffix before connecting.
- Real GitHub OAuth, the complete live contribution flow, hosted operation and backup restoration were not verified in this review.
- Database tests can skip without local Postgres; a run with skips does not prove database behavior.
- Automated accessibility coverage passes in Chrome. Screen-reader use still needs human verification.

## Flow repair and supplied design — 2026-10-09

- Fixed direct migration launch, anchored configuration to `backend/.env`, and corrected the local
  frontend redirect to port 3000. OAuth preserves the allowed Explore/Create destination.
- Applied migrations 0013 and 0014 to the configured Supabase database with explicit owner approval.
  Readiness now detects missing reward/App tables. Public issues and leaderboard return 200;
  the live board currently has no published bounties.
- Replaced the old landing implementation with the supplied purple design, local fonts and mascot.
  Explore is public; Create and Leaderboard routes open functional workspaces. Extension branding
  matches, and a claims failure no longer hides the authenticated account.
- Current checks: 54 website component tests, 34 extension tests and all 26 browser/accessibility
  checks passed. Website lint, typecheck and the normal production build passed.
  Focused backend auth/migration/observability checks passed (38 cases), followed by 9 config and
  observability cases including the added schema-readiness regression. These are targeted checks,
  not a fresh full backend suite.
- The browser suite uses isolated local Postgres and simulated GitHub. Live GitHub sign-in completion,
  real contribution awards and App/webhook delivery still need the manual setup-guide checks.
  The owner explicitly chose to retain Nishika's GitBounty (local) OAuth app.
- Security-relevant changes: environment-file selection and signed-session OAuth return destination.
  OAuth credentials were retained; token encryption and permissions were not broadened.
  Points remain the only reward; Avalanche integration is deferred.

## UI polish and measured read performance — 2026-10-10

- Applied the new HTML reference's charcoal canvas, lavender accents and purple contribution graph.
  Improved workspace surfaces, inputs, table spacing and empty states. Landing examples stay visibly
  illustrative; account, board and leaderboard data remain API-backed.
- Hero product preview straightens using a CSS scroll timeline, with static fallbacks for small
  screens, unsupported browsers and reduced motion. Verified the transform changes during scrolling.
- Public explorer/leaderboard load alongside the session check. Explorer text/language filters debounce
  for 250ms; resource requests are aborted when superseded. Language-only empty states now clear correctly.
- Timed read-only queries against the configured database: pooled asyncpg SELECT 1 took about 0.82s;
  the issue-board warm median was 2.44s. Connection-scoped autocommit for its single SELECT reduced
  the final warm median to 1.62s (five warm samples, empty board). This removes BEGIN/ROLLBACK round
  trips without caching stale rewards or changing write transactions. Network latency remains material;
  these are local-to-database timings, not production or populated-board benchmarks.
- Verification: 55 website component tests, typecheck, lint and production build passed; all 26 Chrome
  production E2E/accessibility checks passed with isolated local Postgres and simulated GitHub. Desktop
  and mobile rendering were inspected. After the read optimization, the full backend suite passed:
  309 tests, no skips, one existing Starlette/AnyIO deprecation warning. A regression checks that later
  sessions still open transactions after board reads. The complete publish-to-award browser journey
  was rerun successfully against the final optimized backend.
- Added [copy-ready test data](docs/testing-data.md): eight issues across two repositories, publishing
  values, lifecycle visibility, search, expected award totals and pre-registration claim checks.
  No external test records were created. Live GitHub OAuth/App delivery and real claims remain pending.
- No token, key, secret, schema or permission changes. Shared database access was read-only.

## Login-first entry flow - 2026-10-10

- Owner selected login-first workspace access. Explore, Create and Leaderboard landing actions open a
  dedicated sign-in page, preserving the destination; direct workspace routes show the same gate.
  Informational pages and real landing bounty previews remain public.
- Workspace data waits for confirmed identity. Failed session checks offer retry. Signed-in visitors
  continue to their selected workspace. The extension's Points deep link survives sign-in.
- Security-relevant change: OAuth return paths also allow internal leaderboard and Points destinations.
  Arbitrary URLs, protocol-relative URLs and query-bearing variants remain rejected. Token encryption,
  credentials, scopes and extension permissions are unchanged.
- Checked: 57 website component tests and all 27 focused backend auth checks passed, with no skips.
  Website typecheck, lint, production build and all 29 Chrome E2E/accessibility checks passed against
  isolated local Postgres and simulated GitHub. Live GitHub OAuth remains a manual verification item.

## Frontend cleanup and extension entry - 2026-10-10

- Compared the owner-provided example folder as visual reference only; its placeholder links and
  mock interactions were not adopted. The folder remains owner-owned and untracked.
- Extension CTA opens a public installation guide for the actual 0.4.0 developer build, with
  local-backend requirements, browser-specific instructions and published-bounty troubleshooting.
  Removed outdated label-only fallback claims and the assumed main-branch source link.
- Production browser clicks exposed a vinext beta Link runtime error (prefetch and navigation
  functions were undefined). Replaced page links with native anchors and documented the narrow
  framework-specific lint exception. Landing, login, docs and extension clicks now pass in production.
- Removed 398 unused CSS lines from the previous landing design; kept shared tokens, focus and reduced
  motion rules. Moved metadata into the shared page renderer and removed the extra helper file.
  Framework route entry files remain thin. e2e/ and migrations/ are retained: they provide regression
  coverage and the authoritative schema history, with no frontend runtime cost.
- Verified desktop and 320px login rendering, public information access, signed-in redirect selection,
  external redirect rejection and the full publish-to-award journey. Checks are recorded above.
- No new dependencies, extension permission changes, credentials or schema changes. No shared database
  writes or external test records were created. Copy-ready test content remains in docs/testing-data.md.

## Standalone landing concept - 2026-10-10

- Added frontend/web/landing-preview.html for owner design review before app integration.
  One self-contained HTML file embeds existing Mona Sans fonts, logo and mascot, with midnight/purple
  styling, a scroll-reactive hero, workflow tabs, role tabs and an illustrative contribution graph.
- CTA dialogs explain intended app destinations. All sample data is labelled; no API or auth changes.
- Checked in local Chrome: workflow and role switching, CTA dialog, no JavaScript errors and no
  horizontal overflow at 320, 375, 768 and 1440px. Desktop and mobile screenshots captured.
- Revised the preview from owner screenshots: larger tilted-word hero, a mascot-centred
  issue-to-PR-to-points scene, purple texture, and a grouped footer. Local Chrome checks passed
  at 320, 375, 768 and 1440px; footer preview links and JavaScript errors were checked.
- Embedded the owner-provided mascot sheet once in the standalone HTML and show distinct search,
  rocket and award poses. Added subtle entrance, float, sparkle and hover motion with reduced-motion
  support. Checked image loading, zero external requests, tabs and 320-1440px layout in local Chrome.
- App integration awaits owner feedback on the preview.

## Known limitations to retain through the migration

- No automated detection of two-account collusion or reverted merges.
- Repository matching is not rename/transfer-aware.
- Issue links made only through GitHub's Development sidebar are not discovered by the current REST/text matching.
- Initial GitHub search is capped at 1000 results; repository/issue listing also has paging limits.
- Sync jobs are in-process and can be interrupted by a restart; stale runs are released on a later attempt.
- Rate limiting is per process, so scaling needs a shared strategy.
- No account deletion/retention workflow, metrics service or moderation UI.
- Frontend toolchain upgrades must verify `next start` as well as `next build`.
  Old audit counts are not current security evidence.

## Standard Next.js runtime — 2026-10-11

- Replaced Vinext and its Cloudflare Vite worker with Next.js 16.4 and React 19.3. The existing App Router
  pages, metadata and `next/image` usage remain; Next now provides the build, server and image optimizer.
- Standardized local and CI JavaScript tooling on Node 24 LTS. Vercel's web service now uses the `nextjs`
  framework preset, while FastAPI remains a separate service behind the existing same-origin rewrites.
- Updated the production E2E launcher to build and serve with the Next CLI. GitHub OAuth still requires a
  deployed manual check with the configured callback URL and credentials.

## Documentation maintenance

Keep status here, product decisions in the overview, and runnable instructions in setup.
Update the relevant page when code changes. Do not add a separate audit, handoff or feature-status document.
Git history retains superseded plans and historical verification details.

## Public bounty cache - 2026-10-10

- Public issue listings use a bounded, per-tab 30-second cache that survives native page navigation.
  Filter/page keys stay separate; Refresh bypasses the cache. Writes invalidate before and after completion,
  and a read started before invalidation cannot repopulate stale data. Storage failure falls back to API reads.
- Identity, points, claims, leaderboard personalization and payment data are not cached.
- Verified 61 website tests, including expiry, refresh, private-read exclusion, write races and capacity.
  No new dependencies or shared database changes. First-load database latency remains unchanged.

## Owner-funded AVAX promises and browser-wallet payments - 2026-10-10

- Owner approved exact AVAX amounts at first publication, individual owner payments, no GitBounty
  funding/guarantee, and browser wallets with each party paying gas. This supersedes the supplied
  Privy/SmoothSend, sponsored withdrawal and points-conversion design. Points remain separate.
- Migration 0015 stores immutable promises, merge-linked cash reservations, signature challenges,
  immutable wallet links, one payment row per claim and append-only confirmed receipt history.
  No old points awards acquire cash value. Claim amount and recipient never come from payout inputs.
- Contributors explicitly sign a one-time, expiring wallet challenge and claim. Owners review and sign
  each transfer in their own wallet. Server verification checks mainnet chain, sender, recipient, exact
  value, calldata, nonce and receipt. Pending transactions remain unpaid. Manual review holds are supported.
- Payment intents reserve a nonce before wallet interaction and serialize unfinished payments per payer.
  Concurrent/repeated calls reuse the same row/nonce. Only a confirmed reverted transaction allows a new
  nonce on that row; paid rows return without another RPC. Existing transaction hashes can be reconciled.
- Added paginated AVAX rewards, exact publication fields and owner-guarantee wording. viem loads only
  on wallet action. eth-account verifies signatures; no private keys or provider secrets are stored.
  Live wallet actions reject development identity fallback outside the automated test environment.
- Verified: full backend suite 317 passed without skips, then final focused wallet/payment checks 5 passed.
  Website 64 tests, typecheck, lint and production build passed. All 29 production Chrome E2E/accessibility
  checks passed; the new AVAX view and publication form also passed focused production accessibility checks.
  Production runtime npm audit reports zero vulnerabilities after the ws override; existing development
  toolchain advisories remain outside this change.
- Tests use local PostgreSQL and simulated chain RPC. No real-money transaction, live wallet signing,
  or withdrawal was performed. The payment flag defaults false for new installations.
- After explicit owner approval, backed up the configured Supabase public schema to the user's local
  temp directory (`gitbounty-before-0015-20261010T114024Z.dump`), applied migration 0015 and verified all
  15 migration checksums. Enabled AVAX_PAYMENTS_ENABLED in the ignored local backend configuration.
  Real OAuth is configured and the development identity stub is disabled. All six new tables exist;
  cash promises, claims and payments are empty. Verified the configured RPC reports Avalanche mainnet
  and the running local backend reports ready. Hosted deployments need the same payment environment flag.

## Session-read latency - 2026-10-10

- Session identity remains uncached and fresh on every request. Its single SELECT now uses connection-
  scoped autocommit, removing BEGIN/ROLLBACK network round trips while later write sessions retain transactions.
- Read-only measurements against the configured remote database: warm median 2.475s with a transaction,
  1.638s with autocommit (three warm samples per mode; about 34% lower database-read latency).
  These are database timings, not full-page or production benchmarks. No shared data was changed.
- Verified 34 focused auth, cash-payment and claim tests, including fresh username reads and transaction
  restoration. Public bounty listings retain the separate bounded 30-second browser cache.

## Fuji USDC, required SmoothSend and interior workflow — 2026-10-10

- Latest owner decisions supersede the earlier direct-wallet payment design: Avalanche only,
  official Circle USDC on Fuji for testing, mandatory SmoothSend execution, connected browser wallets
  for identity/signing, and owner-paid USDC fees (`user-pays-erc20`). No direct payout fallback.
- Immutable promises include their original network; existing mainnet promises are preserved.
  Exact full rewards are transferred separately from a capped USDC paymaster allowance. The server
  derives smart-account addresses and saves signed operations before broadcast. Recovery resubmits the
  same operation/nonce; only verified failed operations release a nonce. Receipt checks isolate the
  operation's own EntryPoint event and exact token Transfer, including bundled transactions.
- Migration 0016 was explicitly approved, backed up and applied to configured Supabase. All 16 migration
  checksums verified; the new receipt table exists and cash promises remain empty. Backup:
  `gitbounty-before-0016-20261010T171431Z.dump` in the user's local temp directory.
- Ignored local settings select `PAYMENT_MODE=usdc_fuji`, enabled execution flag, and 0.1 USDC fee allowance.
  No public SmoothSend key is configured yet: execution correctly remains disabled until the owner adds
  their `pk_nogas_…` key and allows the website origin in the provider dashboard. No private keys are stored.
- Registered Codex MCP server `smoothsend-mcp` with pinned @smoothsend/mcp 1.2.0; reload Codex to load it.
  Runtime uses the Avalanche subpath of SDK 2.3.8, loaded only for wallet actions. Reproducible installs use
  project legacy peer resolution because unused Aptos wallet peers conflict. Runtime npm audit: zero findings.
- Interior workspace now has persistent navigation, next-step guides, network context, three-stage
  publication, and payment review showing recipient, smart-account funding address, reward and USDC fee.
  Mobile navigation, responsive tables and focus states improved. Landing page remains unchanged.
- Replaced testing-data.md with a complete A-owner/B-contributor walkthrough: five issues, expected
  +90 points across four eligible PRs, exact 1.25 USDC payout, recovery, authorization and UI checks.
  First-registration testing is conditional on B actually being new; no third account is required.
- Verified 324 backend tests without skips, 65 website tests, typecheck, lint and production build.
  All 30 production Chrome E2E/accessibility checks passed. Payment cards passed axe/reflow checks at
  1440/960/320px. Independently matched the operation hash against the SmoothSend SDK; live read-only RPC
  confirms Fuji chain 43113 and official USDC decimals 6. Public SmoothSend Fuji defaults are available.
- Automated tests substitute GitHub, wallet signatures and chain responses. No live SmoothSend submission,
  real GitHub two-account run, payment or withdrawal was performed. The walkthrough remains the live check.
- Final layout corrections passed three focused production browser/accessibility checks, including
  every workspace view at 960/320px. Rebuilt against the normal local API after the E2E harness.
  Stopped local PostgreSQL and all spawned services; development/test ports were verified closed.

## Extension discovery and wallet reads — 2026-10-10

- Added a read-only, authenticated linked-wallet balance endpoint on the configured Avalanche chain.
  Reports exact USDC/native AVAX separately, preserves missing-wallet and RPC-error states, and works
  independently of payout configuration. No signing, new host permissions or shared migration.
- Added case-insensitive maintainer-label beginner filtering before pagination and stable issue ordering.
  Only open, published GitBounty bounties are included. Verified 17 focused issue/payment tests locally.
- Extension 0.5.0 now defaults to Discover with separate Account & wallet controls and a compact balance
  summary. Added title/language/category/beginner filters, stable paging, safe GitHub issue links and
  separate points/payment metadata. Search cancellation prevents stale responses replacing fresh filters.
- Fixed all-time points mislabeled as weekly, failed sign-out falsely hiding a live session, menu Escape/
  expanded state, and account-wide failures caused by optional data. Late wallet reads cannot reappear after logout.
- Verified extension syntax and 39 DOM/logic tests. Real Chrome renders the popup with fixture APIs and
  passes axe/keyboard/navigation checks. Unpacked cookie access and live-wallet reads still need the documented
  manual run. No runtime dependencies, permissions or remote executable code were added.
- Full backend regression suite passed: 327 tests without skips.

## Supplied landing preview assessment — 2026-10-10

- Fixed the owner's supplied `../web/index.html` and mirrored it to the existing repository
  `frontend/web/landing-preview.html`. Original source backup in local temp:
  `gitbounty-landing-source-20261010T174344Z.html`. The new preview is about 354 KB versus the
  previous 2.6 MB preview; this is a preview-file comparison, not a live-site performance benchmark.
- Fixed JavaScript parallax ignoring reduced motion, low-contrast extension-example text and
  Terms dialog incorrectly implying sign-in. The live React homepage remains unchanged.
- Documented the shared visual direction and contributor/maintainer/payment flows in DESIGN.md.
  The HTML is suitable as a landing design foundation, but sample data and explanatory CTA dialogs
  require real React/auth/API integration before it becomes the production homepage.
- Chrome checks passed at 1440/960/320px: no horizontal overflow, local artwork/fonts loaded,
  no external requests or JavaScript errors, keyboard role/workflow tabs, Terms/Escape dialog,
  reduced-motion preference changes and axe accessibility. Reviewed desktop/mobile screenshots.
- The extension's wallet/discovery browser checks use fixtures. No live payout, GitHub OAuth,
  unpacked Chrome cookie access or live wallet transfer was performed in this change.

## Repository authorization recovery — 2026-10-11

- Read-only diagnosis against configured GitHub credentials returned 401 Bad credentials. The
  repository picker incorrectly mapped rejected authorization to a generic 502 with an ineffective retry.
  No credential values were printed and no stored credentials or shared database rows were changed.
- Shared repository/issue GitHub client calls now distinguish rejected credentials. Maintainer reads
  and writes return 401 with a reauthorization instruction; the workspace links directly to GitHub OAuth
  with a return to `/maintainers`. Missing/unreadable tokens use the same recovery action. Transient
  errors retain retry, and rate limits preserve Retry-After. No permission or ownership checks were relaxed.
- Styled error actions for dark-theme contrast, wrapping and keyboard focus; hide the empty table on
  failure, normalize installation-link spacing and debounce repository search to avoid per-keystroke requests.
- Verified 17 focused backend tests, all 66 website tests, typecheck, lint and production build.
  Chrome recovery/retry/focus/reflow/axe checks passed at 1440/960/320px in development and production.
  The person must reconnect GitHub to obtain a valid credential; automated checks substitute GitHub responses.
  Existing user-started development servers are preserved; the temporary production test server is stopped.
