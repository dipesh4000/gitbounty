# Known limitations

Everything GitBounty does not do, stated plainly. A capability list without this is marketing.

## Not deployed

GitBounty runs locally. There is no hosted instance, no domain, no CI deployment step and no monitoring. No
page claims otherwise. This is the owner's current choice, not an oversight.

## Anti-abuse

| | |
|---|---|
| **Two cooperating accounts** | **Not detected.** Moderation can now withdraw an award once a person notices, but nothing finds one. A publishes a bounty on their repository, B fixes it, B is credited; they swap next time. The self-merge rule does not catch it. The 1000-point ceiling makes it slow rather than impossible. Candidate mitigations — minimum repository age or stars, a per-pair rate limit, a cap on points from one maintainer, review of outliers — are none of them built |
| **Low-value merges** | A typo fix in a participating repository earns the same baseline as a real fix |
| **Reverted merges** | Not detected. The correction mechanism exists (`record_adjustment`) but nothing calls it automatically |
| **Moderation** | Three endpoints exist (report, review, resolve) and withdrawing an award writes an append-only `void` entry. **There is no UI for any of it**, no queue, no assignment, and no notification — a moderator works through the API. Nothing *detects* abuse; a person still has to notice |
| **Renamed or transferred repositories** | A bounty stops matching new pull requests after a rename. Matching is case-insensitive but not rename-aware |

## Pull request lifecycle

All seven states GitHub gives evidence for are tracked: draft, open, in review, changes requested,
approved, merged, and closed without merging — plus "ineligible, with a reason". Each is derived from
something GitHub reports (the draft flag, the open/closed state, the merge timestamp, the reviews
endpoint), never guessed.

What is **not** modelled:

- **Review requests with no review yet.** A pull request with a requested reviewer who has not responded
  reads as `open`, not `in_review`. The search result does not carry requested reviewers, and fetching
  them would cost a second request per pull request for a distinction nobody asked for.
- **Merge conflicts, failing checks, or a stale base branch.** All of these are things GitHub shows and
  GitBounty does not.
- **Review state for closed, merged or draft pull requests.** Reviews are looked up only for work still in
  flight, because that is one request per pull request. A merged pull request's state is already decided.
- **Push-time updates.** Nothing happens until a sync runs; there are no webhooks (see
  [`architecture.md`](architecture.md) for why).

## Issues linked outside the pull request text

A closing link made by hand through GitHub's "Development" sidebar, with no `Closes #12` in the title or
body, is not found. GitHub only exposes those through GraphQL (`closingIssuesReferences`) and this codebase
speaks REST. The fix is a GraphQL query, not a better regular expression.

## Repositories

- **Private repositories are not supported.** The OAuth scope is `read:user` and publishing refuses a
  private repository with an explanation. Supporting them means a GitHub App — see
  [`github-app.md`](github-app.md).
- **Organisation repositories work**, where GitHub reports `admin` or `maintain`. Being a member is not
  enough, deliberately.

## Scale

- GitHub's search API caps at **1000 results**, so a first import for somebody with more merged pull
  requests than that cannot reach the oldest. Incremental sync keeps the newest reachable.
- Repository and issue listings page to 500 and 500.
- Synchronisation makes one GitHub request per pull request when categorising from files
  (`inspect_files=false` skips it).
- There is **no API rate limiting** of GitBounty's own endpoints.

## Observability

Structured JSON logs with a correlation id on every line and on every response, and eleven named events
covering synchronisation, bounty mutations, award outcomes, authorization refusals and rate-limit
rejections — see [`observability.md`](observability.md).

**Not done**: no metrics are emitted (no counters, no histograms, no `/metrics`), and there is no
error-reporting integration. Both mean choosing a vendor, which is an owner decision, and no telemetry
goes to a third party without disclosure and approval.

## Rate limiting

Every endpoint group is limited, by user identity where there is one and by client address otherwise.

**Not done**: the counter is a fixed window held **in one process**. More than one instance multiplies
every limit by the number of instances, and a fixed window allows up to twice the limit in a burst
spanning two windows. A deployment behind a proxy must also configure trusted proxy headers, because the
limiter deliberately ignores `X-Forwarded-For`.

## Testing

| Covered | Not covered |
|---|---|
| Backend: 277 tests — unit, API integration, auth, CSRF, migrations, idempotency, mocked GitHub, leaderboards | |
| Extension: 35 tests — logic plus jsdom DOM-injection against GitHub-shaped fixtures | |
| Browser: the landing page's live data, and the extension badging a real github.com issue list, both verified in real Chrome | **Frontend component tests: none.** No test runner for `frontend/web`. The website is covered only by lint, typecheck, build and manual browsing |
| 22 automated accessibility checks (axe-core, WCAG 2.0/2.1 A and AA) over every user-facing page, plus keyboard operation, visible focus, heading structure, accessible names, reduced motion and reflow — see [`accessibility.md`](accessibility.md) | **No screen reader has been used**, and no disabled user has tested it. axe finds roughly a third to a half of WCAG issues. Four known defects are listed in that document, including focus not being managed in the edit and history panels |
| | **No end-to-end test** driving a browser through sign-in → publish → merge → award |

A real OAuth sign-in has **not** been completed end to end in this environment: it needs a human at
github.com to authorise an app. The implementation, its state handling and its failure paths are covered by
tests; the round trip through github.com is not.

## Dependencies

Measured 2026-10-02 on Linux 7.0.0-34-generic, Node v22.23.0, npm 10.9.8.

### Production dependencies: no known vulnerabilities

```
cd frontend/web       && npm audit --omit=dev   # found 0 vulnerabilities
cd frontend/extension && npm audit --omit=dev   # found 0 vulnerabilities
cd frontend/extension && npm audit              # found 0 vulnerabilities
cd e2e                && npm audit              # found 0 vulnerabilities
```

Nothing that ships to a browser or runs in production has a known advisory. `frontend/web` ships `react`
and `react-dom` only; `frontend/extension` has no runtime dependency at all. Backend dependencies are
pinned exactly in `backend/requirements.txt` (seven packages, all permissive licences — the inventory is in
[`handoff.md`](handoff.md)).

### Development toolchain: 11 findings, not fixable without breaking the build

`npm audit` in `frontend/web` reports **13 vulnerabilities (1 low, 2 moderate, 10 high)**, every one of
them in the build or test toolchain (the two moderate ones arrived with vitest and its dependencies). None of these packages runs in production, and none is reachable by a visitor.

| Package | Severity | Direct? | Reached through |
|---|---|---|---|
| `@cloudflare/vite-plugin` | high | yes | `miniflare`, `wrangler`, `ws` |
| `wrangler` | high | yes | `esbuild`, `miniflare` |
| `vite` | high | yes | `launch-editor` NTLMv2 hash disclosure (Windows); `server.fs.deny` bypass (Windows) |
| `vinext` | high | yes | `image-size` |
| `react-server-dom-webpack` | high | yes | denial of service in Server Functions |
| `miniflare` | high | no | `sharp`, `undici`, `ws` |
| `ws` | high | no | uninitialised memory disclosure; memory-exhaustion DoS |
| `undici` | high | no | TLS validation bypass via SOCKS5 ProxyAgent; header injection via Set-Cookie |
| `sharp` | high | no | libvips CVE-2026-33327/33328/35590/35591; libheif GHSA-g89c-p67h-r497 |
| `image-size` | high | no | DoS in the JXL, HEIF and ICNS parsers |
| `esbuild` | low | no | arbitrary file read from the dev server (Windows) |

Several are Windows-specific; development here is on Linux. All of them require either running the dev
server or processing hostile input through a build-time image or WebSocket path.

### The upgrade was attempted, and reverted

Three attempts, 2026-10-02:

1. `npm install --save-dev @cloudflare/vite-plugin@latest wrangler@latest vite@latest vinext@latest
   react-server-dom-webpack@latest` — **ERESOLVE.** `react-server-dom-webpack@19.3.0` needs
   `react@^19.3.0`; the project pins `react@19.2.6`, and moving React is a much larger change than an
   audit fix.
2. The same without `react-server-dom-webpack` — **ERESOLVE.** `vinext@1.0.1` needs
   `@vitejs/plugin-rsc@^0.5.34`; the project pins `0.5.26`.
3. Adding `@vitejs/plugin-rsc@latest` resolved the tree and **installed cleanly**, moving
   `@cloudflare/vite-plugin` 1.37.1 → 1.62.4, `@vitejs/plugin-rsc` 0.5.26 → 0.5.35, `vinext`
   1.0.0-beta.2 → 1.0.1, `vite` 8.0.13 → 8.3.2, `wrangler` 4.92.0 → 4.146.0. It reduced the findings from
   11 to 5, and `npm run lint`, `npm run typecheck` and `npm run build` all passed.

   **But `npm run start` then failed**, so the production server could not run at all:

   ```
   Error [ERR_UNSUPPORTED_ESM_URL_SCHEME]: Only URLs with a scheme in: file, data, and node are
   supported by the default ESM loader. Received protocol 'cloudflare:'
       at throwIfUnsupportedURLScheme (node:internal/modules/esm/load:199:11)
   ```

   `vinext start` runs the built worker under plain Node, and the newer `@cloudflare/vite-plugin` emits a
   `cloudflare:` module specifier that only the Workers runtime understands. A green build is not evidence
   the app runs — this was caught only because the routes were re-checked afterwards.

The upgrade was reverted in full (`git checkout -- package.json package-lock.json && npm ci`), the build
re-run, and all routes re-verified (`/` 200, `/explore` 200, `/nope` 404). **Nothing is suppressed:** no
`npm audit` override, no `.nsprc`, no `--audit-level` raised to hide anything. CI runs
`npm audit --omit=dev --audit-level=high`, which is the check that reflects what actually ships, and it
passes on its own merits rather than by exclusion.

### A safe upgrade path, for whoever does it next

Do not run `npm audit fix --force`. In order:

1. Reproduce the failure first, so you know when you have fixed it:
   `npm run build && npm run start`, then `curl -sI localhost:3000/`. A successful build proves nothing.
2. Upgrade **React to 19.3+ and `react-server-dom-webpack` together**, since they are version-locked. That
   alone clears one high finding and unblocks attempt 1 above.
3. Upgrade `@vitejs/plugin-rsc` and `vinext` together; `vinext` pins the plugin by peer range.
4. Upgrade `@cloudflare/vite-plugin` and `wrangler` **last and together**, and expect the `cloudflare:`
   specifier problem. Either the project moves to running the built worker under `wrangler dev`/`vercel`
   rather than `vinext start`, or it waits for a `vinext` release that handles the newer plugin's output.
   Check <https://github.com/cloudflare/workers-sdk> and the `vinext` changelog before trying.
5. After each step: `npm run lint && npm run typecheck && npm run build && npm run start`, plus a request
   to `/`, `/explore` and an unknown path.

This is a toolchain decision with no production exposure, so it is worth doing deliberately rather than
under audit pressure. It is listed in [`deployment-readiness.md`](deployment-readiness.md) as recommended,
not blocking.

## Responsive layout

Measured 2026-10-02, headless Chrome 149.0.7827.155 driven over the DevTools Protocol
(`Emulation.setDeviceMetricsOverride`, `deviceScaleFactor: 2`, `mobile: true`), against the **production
build** (`npm run build && npm run start`) with the API on `localhost:8001` and seeded data.

Measurement: `document.documentElement.scrollWidth - document.documentElement.clientWidth`, after the page
had loaded and its data had arrived.

| Width | Route | Horizontal overflow |
|---|---|---|
| 360px | `/leaderboard` (interior page) | **0px** |
| 390px | `/` (landing) | **0px** |
| 390px | `/explore` (signed-in workspace) | **0px** |
| 768px | `/explore` (signed-in workspace) | **0px** |

**What this does and does not establish.** It establishes that nothing forces a horizontal scrollbar at
those three widths on those routes — the single most common responsive failure, and the one that makes a
page unusable on a phone. It establishes nothing about whether the result *looks* right: overlapping text,
a cramped table, an unreachable control or a truncated label would all measure 0px. Those were looked at in
captured screenshots and judged acceptable, which is an opinion, not a measurement.

Not measured: 320px, landscape phones, short viewports, browser zoom above 100%, and every route other than
the four above. `frontend/web` has no automated visual or layout regression test.

## Legal and policy

The privacy and terms pages are **summaries written by engineers**, say so on their faces, and have not
been reviewed by a lawyer. There is no cookie banner, no data-processing agreement, no deletion endpoint
and no stated retention period.

## Licence

There is no `LICENSE` file, so by default **no rights are granted**. Choosing one is an owner decision; see
[`handoff.md`](handoff.md).

## Documentation that predates current decisions

`overview.md`, `agent.md`, `plan.md`, `feature-split.md` and `feature-seams.md` are the team's working
notes and describe an earlier design — in particular, awarding points from a `gitbounty:N` GitHub label on
any repository. [`PRODUCT.md`](../PRODUCT.md) and [`points-rules.md`](points-rules.md) are current and win.
`docs/original-money-pitch.md` is the original escrow pitch, kept as history and implemented nowhere.
