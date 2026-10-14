# GitBounty hackathon implementation plan

Reviewed 2026-10-13 against the source tree, public endpoints, provider documentation, and the [official event](https://build.avax.network/events/3f8d455d-1eb5-425b-b859-4261a0ff8ad6). Product scope is in [overview.md](overview.md); technical decisions are in [architecture](docs/architecture.md); findings and verification limits are in the [audit](docs/implementation-audit.md).

## Outcome and delivery dates

Ship one public GitHub issue bounty that a maintainer funds on Avalanche Fuji, a different contributor earns through a verified merged PR, and that contributor claims exactly once. Points remain off-chain reputation.

The event narrative says October 21; its submission panel displays **October 22, 2026, 03:29 Asia/Kolkata**. Use **October 21, 18:00 IST** as our internal submission target, and recheck the portal before submitting. The portal also requests **pitch slides**, in addition to the seven submission fields supplied in the brief.

| Date, IST | Milestone | Exit evidence |
|---|---|---|
| October 13 | Phase 0: dependency/configuration preflight | prerequisites recorded with owners; no hidden required provider |
| October 14 | Phase 1: local escrow and Fuji smoke test | tested artifact, address, funding and settlement transactions |
| October 15 | Phase 2: backend integration | migration, eligibility reservation, signed authorization, verifier |
| October 16 | Phase 3: complete direct-wallet UI | public funded bounty and usable claim/refund flow |
| October 17 | Phase 4: live two-account proof | real GitHub delivery, points, exact Fuji settlement |
| October 18 | Phase 5: Privy onboarding; optional SmoothSend spike | native GitHub login/wallet proof, or documented direct fallback |
| October 19 | Phase 6: package and feature freeze | video, pitch slides, source/setup, delta and evidence links |
| October 20 | Buffer and clean-browser rehearsal | reproducible demo, recovery paths, links checked |
| October 21, 18:00 | Submit through Builder Hub | accepted submission receipt, team and files confirmed |

These are execution targets, not claims of completed work. All runtime phases are open until their exit evidence exists. If implementation starts late, cut optional integrations first and preserve the live proof and submission buffer.

## Current baseline and limitations

Existing source includes Next.js/React/viem, FastAPI/PostgreSQL, GitHub OAuth/App, durable webhook inbox, points and allocations, browser wallet proofs, and a SmoothSend payment path. Public read-only checks on October 13 returned HTTP 200 for health, readiness, and the Fuji payment configuration. This proves reachability/configuration, not production sign-in, GitHub installation, webhook execution, or a payment.

The following need implementation or proof:

- No escrow source/deployment exists in the repository.
- Privy is not installed. Its current docs **do support native GitHub OAuth**; the previous custom-JWT-first assumption was incorrect.
- The webhook worker starts with an in-process asyncio task. Existing Vercel rewrites do not prove it stays alive after a request.
- Existing wallets are permanently linked by an immutable database trigger.
- Existing allocations select one bounty per issue; baseline and bounty points can be two ledger entries.
- Existing closing-reference parsing reads title/body. Cash eligibility needs stricter body/default-branch checks and immutable award evidence.
- Historical payment terms and triggers use the old provider flow. New escrow rewards need an explicit mode and separate records.
- Account-specific Privy/SmoothSend entitlements, budgets, domain configuration and signing are unverified.

## Decisions frozen for the MVP

1. **Chain and asset:** Fuji 43113, official test USDC only; direct transactions use faucet AVAX for gas.
2. **Contract:** non-upgradeable, immutable USDC address and EOA authorization signer; OpenZeppelin EIP712/ECDSA/SafeERC20/ReentrancyGuard. No admin withdrawal, early cancellation, top-up, partial payout, token registry, pause, or signer rotation.
3. **Toolchain:** Hardhat 3 with Node 24 and viem; pin compiler, evmVersion = cancun, package versions and lockfile. Avalanche's current deployment guide requires this explicit target. Prove the artifact on Fuji before application integration.
4. **Identity:** stable numeric GitHub ID owns rewards; Privy native GitHub login is the preferred onboarding upgrade. Keep existing OAuth as a tested fallback. GitHub App authorization remains necessary.
5. **Wallet:** EOA receiving address, including a Privy embedded EOA. Existing links remain unchanged; first-time links are signed and permanent for the MVP. Recovery uses the same key/address. Address replacement is deferred.
6. **Reward:** one whole payout per issue and one winning allocation. Cash attaches only to a fresh, unawarded issue. No retroactive conversion of old points or promises.
7. **Deadlines:** work must merge after confirmed funding and before workEndsAt. claimUntil = workEndsAt + seven days. Settlement requires block.timestamp < claimUntil; refund requires >= claimUntil. This limited claim window must be visible before work/funding.
8. **Trust:** GitBounty's signer attests GitHub eligibility and recipient. The contract protects escrow accounting and replay, but cannot independently verify GitHub or stop a compromised signer from authorizing a wrong recipient.
9. **Provider scope:** direct EVM funding/claim is required. Privy UX is preferred; SmoothSend developer-sponsored claim is optional after a real contract-call proof. No generic provider abstraction or additional wallet framework unless the chosen SDK requires it.
10. **Hosting:** use an always-on Python API process for the durable inbox/reconciliation loop, while retaining the same-origin web proxy. Confirm account/budget availability first. If unavailable, implement a bounded authenticated request-driven drain and show explicit refresh/sync; do not claim autonomous background execution.

See [architecture](docs/architecture.md) for exact transaction, authorization, and deadline semantics.

## Phase 0 — Close prerequisites and scope

Owner: project maintainer/operator. Target: October 13.

- Confirm registration, team membership, portal fields, slide upload, deadline, and application availability through the judging period.
- Record the pre-September-21 baseline versus work within the September-21–October-21 build window using dated source/deployment evidence supplied by the owner. Existing today does not imply pre-Speedrun.
- Choose two distinct GitHub users, a public demo repository, a fresh issue, and a useful change with acceptance criteria.
- Verify GitHub OAuth callback, App installation, minimum permissions, events and private-key delivery on the selected host.
- Inventory secrets by variable name only: sessions, token encryption, App key/webhook secret, database, escrow signer, and optional provider configuration.
- Confirm database TLS, connection limits, backup/restore, and availability beyond submission.
- Check Fuji RPC chain ID, token bytecode/decimals, wallet balances, and faucets. Fund A and B with test AVAX before the demo. No claim can assume gas sponsorship.
- Complete the [dependency preflight](docs/dependency-boundaries.md), including package peer/engine resolution and exact account entitlements.
- Align the local SmoothSend FRONTEND_URL origin with its dashboard allowlist, then rerun the SDK preflight. This review identified HTTP 403 CORS_ORIGIN_MISMATCH; it did not change account settings.
- Resolve the advisory findings for locked cryptography/Starlette and pytest; review the web development globbing chain. Upgrade FastAPI/Starlette together within supported bounds, then rerun OAuth, webhook, signature and browser regression checks. Do not use a forced framework downgrade suggested by npm audit.
- Decide the worker execution mode and record who owns deployment, keys, provider credits and submission.
- Select an explicit source license before describing a component as reusable open source. Owner handles source publication and all Git operations.

Exit: every required prerequisite has either a successful check or a concrete blocking owner/action. No runtime feature is marked done because documentation exists.

## Phase 1 — Escrow, tests and Fuji smoke test

Owner: contract/backend implementer; operator supplies deployment and signer keys. Target: October 14.

- Add the Hardhat workspace and one GitBountyEscrow contract following [the contract specification](docs/architecture.md#escrow-contract).
- Derive the on-chain ID from chain, contract, msg.sender payer, and immutable application reference. This prevents another address from preempting the expected bounty ID.
- Implement fund, settle and permissionless refund-to-recorded-payer. Use exact token balance delta on funding.
- Require an immutable work deadline and seven-day claim grace. Test the exact timestamp boundary and both transaction orderings of settlement/refund.
- Use EIP-712 Settlement with exact types and a cross-language golden vector shared by Python eth-account, viem, and Solidity.
- Test replay, wrong domain/signer/recipient/amount/token, malformed signatures, duplicate IDs, transfer failure, cross-bounty accounting, direct token donations, and conservation of escrow liabilities.
- Pin an Avalanche-compatible EVM compiler target; retain full compiler/build metadata and constructor arguments.
- Deploy the tested artifact to Fuji. Record deployment block/hash, contract bytecode, immutable signer/token, ABI and source. Verify explorer source where supported.
- Fund a disposable bounty through an exact USDC approve followed by fund; settle once and independently decode the logs.

Exit: local tests and Fuji fund/settle pass; attempts to pay twice fail; public deployment and successful transactions are recorded. No production/audit certification is implied by tests.

## Phase 2 — Backend eligibility, migration and verification

Owner: backend implementer. Target: October 15. Depends on Phase 1 ABI.

- Add a new numbered migration after 0016. Preserve applied files and historical promises/receipts.
- Introduce explicit points-only, legacy-payment and escrow reward modes; prevent simultaneous legacy and escrow payouts for one issue.
- Add the schema/constraints in [architecture](docs/architecture.md#data-and-api-contract). Do not reuse amount_wei as the new USDC field.
- Reuse allocation/ledger logic, preserving baseline 5 and bounty 1–1000 rules, categories, rule version and snapshots. Bump the eligibility rule version when behavior changes.
- Enforce cash eligibility: numeric repository/issue/PR/author IDs, active public App scope, same-repository closing keyword in the PR body, default branch, verified merge, no self-bounty, and fundedAt <= mergedAt < workEndsAt.
- Verify the issue's actual ClosedEvent.closer is this PR using one focused GitHub GraphQL read through existing httpx; retain event ID/time and paginate as needed. A body edited after merge cannot by itself prove issue closure. Missing/ambiguous closure evidence pauses cash allocation.
- Freeze first eligible processed allocation under a database lock; document this ordering, never promise “earliest merge wins.” Reject ambiguous multi-funded-issue PRs instead of choosing based on text order.
- Snapshot accepted closing references and author at allocation. Later GitHub edits cannot replace the winner.
- Persist chain funding evidence before enabling cash eligibility; a late indexing result uses the canonical funding block time, not the time the HTTP request completed.
- Reserve cash for an unregistered GitHub author without creating a fake user; require real sign-in and wallet proof before issuing a voucher.
- Build and persist a complete unsigned typed-data payload/digest before signing; return only the locked recipient/terms. Concurrent requests return the same live voucher. Expired vouchers may be renewed for the same recipient and nonce.
- Decode event + exact ERC-20 Transfer and match chain/contract/bounty/amount/recipient. For direct calls, transaction.to is escrow; for AA it may be EntryPoint. Never require transaction.from == recipient.
- Add reconciliation from the deployment block with a bounded event cursor and overlap, retries and unique event identity. Recover broadcast success even if the browser closed before recording its hash.
- Make the durable webhook worker restart-safe; respect GitHub rate-limit/reset headers. Production proof must include one processed delivery without relying on a lucky warm function.
- Expose separate contribution, escrow, and attempt states so a rejected signature does not erase funded state.

Exit: fake client terms fail, duplicated deliveries/sync/requests do not duplicate allocations or payout, expired/failed/mismatched receipts never mark paid, and local GitHub→chain integration passes.

## Phase 3 — Direct-wallet vertical slice and public proof UI

Owner: frontend implementer. Target: October 16. Depends on Phase 2 API.

- Reuse API/CSRF helpers, wallet discovery, viem and existing styles.
- Show a public bounty detail route with issue/PR, points, amount, funding, work deadline, claim deadline, contract and verified transaction links. No login required to inspect proof.
- Give A a review → exact allowance approval → fund flow. Approval alone must never show funded.
- Give B a signed wallet-link challenge → voucher → settle flow. Give payer an explicit refund action only after claimUntil.
- Check account, chain and live contract state immediately before every signature; show USDC and AVAX needs independently.
- Preserve existing permanently linked wallet, reject accidental switching, and provide recovery/export guidance.
- Recover from refresh, transaction replacement, unknown receipts, rejected signatures and RPC timeouts. Retry verification before offering a new send.
- Show points totals accurately: a 40-point bounty plus eligible 5-point baseline totals 45 across distinct award types.
- Show wallet-provider errors separately from reward eligibility and chain settlement. No fabricated zero balances.
- Verify keyboard/mobile/contrast, empty/loading/error states and plain testnet labels.

Exit: the deployed direct-wallet journey can fund, award, claim, verify and display evidence; a signed-out judge can inspect the same completed bounty.

## Phase 4 — Real two-account proof

Owner: implementer + operator using accounts A/B. Target: October 17.

Execute [testing-data.md](docs/testing-data.md) using real GitHub and Fuji:

- A installs/connects the App, creates the issue, and funds the exact test USDC bounty.
- B authors a meaningful PR with Closes #issue in its body targeting the default branch.
- A reviews/merges. Capture actual delivery ID, processed result, and B's numeric author ID.
- Confirm one bounty allocation, at most one baseline allocation per PR, and correct ledger totals; pending registration remains supported.
- B proves the receiving EOA and settles. Check B's balance change and matching contract/token logs.
- Re-run sync/refresh/voucher/receipt recovery; replay must never transfer again.
- Restart the worker and recover a deliberately pending delivery; close the browser after a broadcast and recover the settlement from logs.
- Save public evidence and exact test output. Use a separate disposable bounty for refund tests.

Exit: a complete production run with issue, PR, processed GitHub delivery, funding hash, settlement hash and public completed-bounty page. Sync recovery is disclosed if used; it does not substitute for claiming webhook automation works.

## Phase 5 — Privy onboarding and optional sponsored claim

Owner: identity/frontend implementer. Target: October 18. Depends on the direct-wallet proof.

Privy preferred path:

- Pin @privy-io/react-auth after peer/engine checks against Next 16.4.0, React 19.3.0, Node 24 and installed viem.
- Enable native GitHub OAuth in Privy. Set exact origins/callbacks and Fuji defaultChain/supportedChains; configure a suitable RPC explicitly.
- Exchange a verified Privy access token plus server-fetched or signed identity data for the existing application session. Validate issuer/audience/expiry/algorithm and DID consistency.
- Resolve github_oauth subject to a numeric GitHub ID, cross-check its semantics against GitHub, and map to the existing user. Never map by email or username; block mismatched existing sessions/DIDs.
- Keep GitHub API authorization separate: retain a verified owner OAuth token for permission checks or implement GitHub App user authorization. Native Privy login alone does not supply repository permissions.
- Create an embedded EOA when needed; use existing externally linked EOA when present. Do not delegate wallet control to the server.
- Require a fresh signed challenge and explicit receiving address. Test two accounts, login migration, MFA, logout, token refresh, and same-address recovery/export.
- Make logout clear both app and Privy state; API actions check the app session and privileged actions require fresh proof. Remove ambiguity between an A GitHub session and a B Privy wallet.

SmoothSend optional spike:

- Use Avalanche /avax documentation and the installed real SDK; choose developer-sponsored claim only.
- Prove an arbitrary settle call on Fuji, with the user-controlled embedded EOA signing and the ERC-4337 smart account executing.
- Keep recipient independent of msg.sender. Store userOpHash and resolved transactionHash separately.
- Verify bundler network/EntryPoint/paymaster code, exact origin/key, account credit budget and inner UserOperation success.
- If the gateway accepts but the UI times out, reconcile before re-submitting. On gateway failure, submit the same valid voucher directly with AVAX gas.
- Do not migrate maintainer funding to a smart account during this sprint: that changes payer/refund addresses and USDC allowance ownership.

Exit: native GitHub login + embedded-wallet creation + funded claim works for a new user, or the tested direct fallback remains the submission path. Sponsorship is included only after its actual live contract-call evidence exists.

## Phase 6 — Submission, judging and feature freeze

Owner: project owner with implementation support. Target: October 19.

- Fill [submission package](docs/hackathon-submission.md) with verified links, team, description, stack, live app, source, <=180-second video, AI disclosure and portal pitch slides.
- Present the pre-build-window baseline and actual within-window delta using dated evidence; do not label every existing component pre-hackathon.
- Explain originality using concrete workflow differences and one real maintainer/contributor use case. Do not claim to be the first bounty platform.
- Explain Avalanche's role as public funded escrow and final settlement; admit the GitHub signer trust boundary. No claim of exclusive Avalanche capabilities.
- Prepare five concise slides: problem/user, live flow, architecture/trust, Avalanche proof, shipped delta/next step.
- Record an honest walkthrough of funding, merged PR, author, claim and explorer receipt; pre-stage accounts/assets and trim waiting, with cuts labelled where relevant.
- Owner publishes source without secrets and selects a license. An unlicensed public repository is source-visible, not reusable open source.
- Rehearse in a clean browser; verify all URLs and uploads; keep the site/API/database/keys available during judging.
- Submit early, confirm portal receipt and membership, and preserve the accepted files.

Exit: every submission item is present and accessible; the portal acknowledges receipt. This is the completion condition, not merely a successful build.

## Judging priorities and cut line

| Criterion | Weight | Required product evidence |
|---|---|---|
| Works | 30% | deployed real GitHub→Fuji settlement and recovery |
| Originality | 25% | author-based attribution, visible prefunding, late-registration claim, useful maintainer scenario |
| Technical depth | 20% | own escrow/tests, explicit trust model, shared eligibility, replay/idempotency, durable verification |
| Avalanche fit | 15% | C-Chain contract, USDC, transaction evidence, reason for public escrow |
| Demo/communication | 10% | <=3-minute working demo, slides, accessible links, clear shipped delta |

Weights and the existing-project allowance are from the user-supplied official brief. The live [event page](https://build.avax.network/events/3f8d455d-1eb5-425b-b859-4261a0ff8ad6) was also checked.

Cut in order: SmoothSend enhancement, full Privy rollout, extension polish, nonessential moderation/treasury UI, mainnet, privacy, interchain, custom L1. Keep tested direct funding/settlement, visible deadlines, real proof, slides/video and submission buffer. Provider pricing or native-login migration must never force a partial payment demo.

After submission readiness, the best low-risk bonus is a licensed reusable escrow/verifier example. Mainnet, eERC, ICM/ICTT and L1 deployment remain separate scoped work only if meaningful to the product. This plan does not authorize spending funds, publishing source, or operating Git for the owner.
