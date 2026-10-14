# Implementation-plan audit

Reviewed 2026-10-13. Scope: roadmap, source boundaries, direct package manifests/lockfiles, official provider docs, hackathon requirements, public service reads, focused tests and advisory queries. This is a planning and integration review, not a complete code-security audit or proof of account permissions.

The plan now has concrete decisions for the gaps below. Implementation gates remain open; updating documentation does not close them.

## Material gaps and resolution

| Priority | Finding and evidence | Decision / required proof | Phase |
|---|---|---|---|
| P1 | Earlier docs missed native GitHub OAuth in Privy | Use native GitHub onboarding; verify linked numeric ID and app session; custom JWT is optional | 5 |
| P1 | No escrow source/deployment exists | One non-upgradeable USDC escrow; local tests then real Fuji fund/settle | 1 |
| P1 | Refund policy promised protection after award without an on-chain reservation | Fixed work cutoff + seven-day claim grace; disjoint claim/refund conditions; disclose expiry even after points award | 1–3 |
| P1 | Backend signer trust understated | Immutable signer is trusted for GitHub eligibility/recipient; no fully trustless claim | 1–6 |
| P1 | Predictable caller-supplied bounty ID could be preemptively funded | Derive ID from chain, contract, payer and application reference on-chain | 1 |
| P1 | Approve/fund and claim gas were unspecified | Exact USDC approve then fund; test AVAX for both users; approval is not funding | 0–3 |
| P1 | In-process worker assumed reliable behind Vercel | Persistent API/worker preferred; otherwise explicit bounded request-driven drain; restart proof required | 0–4 |
| P1 | Immutable wallet trigger conflicts with generic switching/recovery promises | Preserve existing EOA; first link signed; voucher recipient frozen; same-address recovery only | 2–5 |
| P1 | External fallback cannot control an existing embedded wallet | Explain provider availability and export/recovery limits; no silent recipient change | 5 |
| P1 | Existing payment trigger could duplicate escrow allocation | Explicit reward mode, separate escrow terms, no legacy terms for new escrow issue, no retroactive attachment | 2 |
| P1 | Current parser accepts title/body and ignores actual close provenance | Same-repo body/default-branch rule plus GitHub ClosedEvent.closer evidence; shared webhook/sync cash service | 2 |
| P1 | No canonical funding-time cutoff or winner ordering | fundedAt <= mergedAt < workEndsAt; first eligible allocation processed wins once; numeric IDs and snapshots | 2 |
| P1 | Receipt verifier/transaction recovery underspecified | Exact contract + Transfer logs, canonical block hash threshold, persisted cursor, direct/AA differences, browser-close recovery | 2–4 |
| P1 | Runtime Python lockfile advisories found | Triage/update cryptography and FastAPI-compatible Starlette; rerun identity/webhook/signature tests | 0 |
| P2 | Contract compiler default may target unsupported EVM | Explicit evmVersion=cancun; pin artifact/compiler/OZ and prove Fuji deployment | 1 |
| P2 | EIP-712 payload/types/nonce renewal were vague | Exact version-1 domain/schema; nonce zero and terminal state; cross-language golden vector; same-recipient renewal | 1–2 |
| P2 | Privy account/SDK compatibility not established | Registry peers permit React 19; install/build/login/signing proof and dashboard settings still required | 0, 5 |
| P2 | SmoothSend advertised without current operational check | Local live preflight returns HTTP 403 CORS_ORIGIN_MISMATCH; align dashboard origin and repeat; sponsored arbitrary settle call remains optional | 0, 5 |
| P2 | “Exactly one points award” contradicts baseline+bounty model | One bounty allocation plus at most one baseline allocation; 40+5 example; append-only history | 2–4 |
| P2 | No dated schedule, source license, slides, portal receipt, or owner for accounts | Dated plan, slides, accurate provenance, owner publication/license, accepted submission evidence | 0, 6 |
| P2 | Existing-today incorrectly implied pre-Speedrun | Establish baseline at September 21 with dated owner evidence; mark unknown rather than invent dates | 0, 6 |
| P2 | Development dependency advisories found | Target globbing chain and pytest; do not force npm's suggested framework downgrade | 0 |

Relevant source: [worker startup](../backend/app/main.py), [worker/inbox processing](../backend/app/services/webhooks.py), [webhook route](../backend/app/routes/github_app.py), [allocation logic](../backend/app/features/points/store.py), [PR eligibility](../backend/app/features/merged_prs/lifecycle.py), [closing parser](../backend/app/features/merged_prs/issue_links.py), [wallet/payment route](../backend/app/routes/payments.py), [wallet immutability migration](../migrations/0015_avax_reward_promises.sql), [legacy provider migration](../migrations/0016_fuji_usdc.sql).

## Verified in this review

| Check | Result | Limit |
|---|---|---|
| Production /health | HTTP 200, status ok | Liveness only |
| Production /ready | HTTP 200; OAuth/session/encryption configured, database ok | Does not run OAuth or verify App/worker |
| Production /api/avax/config | HTTP 200; Fuji, USDC, six decimals, existing SmoothSend mode | Does not prove a payout |
| Fuji eth_chainId | 0xa869 = 43113 | One endpoint read |
| Fuji USDC eth_getCode and decimals | Bytecode present; decimals = 6 | Does not prove wallet balances or allowance |
| Backend test_avax.py + test_lifecycle.py | 34 passed, 6 skipped | Database-dependent cases skipped; no new escrow coverage |
| Web smoothsend-sdk + wallet-providers | 8 passed | Real SDK with substituted HTTP/RPC transport |
| Existing npm run check:smoothsend | Failed; follow-up identified HTTP 403 CORS_ORIGIN_MISMATCH on both methods | No signing/broadcast; local origin alignment remains open |
| Privy registry metadata | 3.48.1 current; React/React DOM peers ^18 or ^19 | Not installed/build-tested here |
| Web production npm advisory check | 0 reported findings | Point-in-time advisory coverage, not a safety guarantee |
| Web full npm advisory check | 4 high, 0 critical | Development globbing chain |
| Extension and E2E npm checks | 0 reported findings each | Point-in-time advisory coverage |
| Python OSV batch query | 55 locked package/version pairs queried; 3 affected packages | Advisory aliases can duplicate issues; reachability needs triage |
| Documentation verification | 22 authored Markdown files; local file links and heading anchors resolve | External account settings and unfinished deployment links remain gates |

Sandbox DNS/temp-cache issues were bypassed with approved read-only network checks and focused test reruns. The final test counts above are completed runs. No Git commands, package upgrades, account changes, deployments or broadcasts were performed.

## Dependency advisory work

- **Runtime cryptography 44.0.0:** OSV reports matching advisories, including [GHSA-537c-gmf6-5ccf](https://osv.dev/vulnerability/GHSA-537c-gmf6-5ccf). Review all matching ranges and upgrade the pinned package to a supported patched release; retain App RSA signing and OAuth-token encryption regression checks.
- **Runtime Starlette 0.41.3:** OSV reports matching advisories, including [GHSA-2c2j-9gv5-cj73](https://osv.dev/vulnerability/GHSA-2c2j-9gv5-cj73). Resolve through a compatible FastAPI/Starlette update, then test middleware, cookies, request limits and webhook acknowledgement.
- **Development pytest 8.3.4:** OSV reports [GHSA-6w46-j5rx-g56g](https://osv.dev/vulnerability/GHSA-6w46-j5rx-g56g). Upgrade the test dependency and rerun the suite.
- **Web development chain:** npm flags @next/eslint-plugin-next → fast-glob → micromatch → braces with [GHSA-vfj7-8cjw-p6xm](https://github.com/advisories/GHSA-vfj7-8cjw-p6xm). The production-only check reports zero. Find a supported patched dependency resolution; npm's proposed Next plugin 14.2.35 downgrade is not an approved compatibility decision.

These findings were not fixed in this documentation task. Exact patched versions must be selected from current affected/fixed ranges and verified in the implementation phase; never apply a blanket forced upgrade.

## Hackathon requirements checked

The supplied brief requires a working Avalanche prototype, live demo, seven submission fields, <=3-minute video, AI disclosure and a clear delta when reusing an existing project. Judging weights are 30/25/20/15/10; optional L1/privacy/interchain/mainnet work should not replace the working path.

The [live event portal](https://build.avax.network/events/3f8d455d-1eb5-425b-b859-4261a0ff8ad6) additionally requests pitch slides. Its prose says October 21 while the submission panel shows October 22, 2026, 03:29 Asia/Kolkata. The plan uses October 21, 18:00 IST internally and requires a final portal recheck.

## External gates still open

1. Actual production OAuth, App installation/permissions, and processed webhook after restart.
2. Owner-approved persistent hosting/account budget, App secret-file delivery and database retention/backup.
3. New escrow artifact, migrations, local integration and Fuji proof.
4. Privy dashboard, native GitHub subject mapping, wallet signing/recovery and exact SDK build compatibility.
5. SmoothSend local origin/dashboard alignment, sponsorship credits and live contract-call evidence if included.
6. Dated build-window provenance, source license/publication, video/slides, team and accepted portal receipt.

Each has an owner and acceptance check in [plan.md](../plan.md). They cannot be closed by reading docs alone.
