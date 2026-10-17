# Hackathon submission package

Draft updated 2026-10-13. Product descriptions below describe the target; replace them with shipped behavior before submission. Do not claim escrow, Privy or sponsorship is live until evidence exists. The [implementation audit](implementation-audit.md) records the current status.

## Portal requirements and deadline

The supplied brief asks for the seven sections below, a deployed Avalanche prototype, a live demo and a clear existing-project delta. The [Builder Hub portal](https://build.avax.network/events/3f8d455d-1eb5-425b-b859-4261a0ff8ad6) additionally requests a pitch presentation and team members.

The event prose says October 21; its submission panel displays October 22, 2026, 03:29 Asia/Kolkata. Our internal deadline is October 21, 18:00 IST. Recheck the portal before submission and retain its acceptance receipt. Demo-day time is not confirmed in this document.

## 1. Project name and one-line description

**GitBounty** — Reward the verified author of a merged GitHub pull request with contribution points and a funded USDC bounty on Avalanche.

## 2. Full description

Target copy, to be validated against shipped behavior:

GitBounty helps public-repository maintainers make useful issues visible and reward the developers who solve them. Maintainers publish a bounty with acceptance criteria, contribution points and an optional test USDC reward held in an Avalanche Fuji escrow. Contributors use their normal GitHub pull-request workflow.

GitBounty verifies the repository, merge, issue closure and PR author's numeric GitHub identity, then reserves one issue reward. The author can register after the merge without losing their points allocation. A proven receiving wallet claims the signed authorization, and GitBounty verifies the exact escrow event and USDC transfer before showing paid.

A funded reward has visible work and claim deadlines. Claims must settle before the claim deadline; afterward unclaimed USDC can return to the payer. GitBounty's backend signer attests GitHub eligibility; the escrow enforces funding, authorized payout and one-time settlement.

Target users: maintainers who want visible prefunding and contributors who want clear terms, accurate attribution and payment evidence.

## 3. Tech stack

State each integration as shipped or omitted in the final version:

- Next.js, React, TypeScript and viem for the website and direct EVM wallet calls.
- FastAPI, Python, PostgreSQL, SQLAlchemy/asyncpg for eligibility, ledger and receipt verification.
- GitHub OAuth/App and signed webhooks for identity, repository authorization and merge evidence; a focused GraphQL read verifies issue closure provenance.
- Solidity GitBountyEscrow on Avalanche Fuji; OpenZeppelin primitives, Hardhat 3, compiler EVM target cancun.
- Official Fuji test USDC with six-decimal integer amounts.
- Privy native GitHub login and embedded/external EOA onboarding **if the integration ships**.
- SmoothSend developer-sponsored ERC-4337 claims **only if demonstrated**, alongside the working direct route.
- Vercel web hosting and the actually deployed API/worker host; do not name an unprovisioned service as deployed.

## 4. Live links

- Application: [GitBounty](https://gitbounty-web.vercel.app) — landing/API reachable; end-to-end escrow proof pending.
- Public source repository: **TODO — owner supplies/publishes URL**
- Public completed-bounty page: **TODO**
- GitHub demo issue and merged PR: **TODO**
- Fuji escrow contract: [0xc8ff…9f65](https://testnet.snowtrace.io/address/0xc8ff1527BF4d43A3bC7EA3d9fb415D5647739f65)
- Deployment transaction: [0x302e…52e4d](https://testnet.snowtrace.io/tx/0x302e9e0dce61ad1dd1fa8a7dccbca71c9f7d3f15a185ee0204fa728b84952e4d)
- Funding and settlement transactions: **TODO**
- Video: **TODO**
- Pitch slides: **TODO**

Verify these from a signed-out browser. Never put a UserOperation hash into a transaction-explorer URL.

## 5. Source code

Include application and contract source, deterministic tests, numbered migrations, lockfiles, exact setup, compiler/build metadata, deployment block/address, ABI and public transaction evidence.

The owner handles source publication and selects an explicit license. A public repository without a license is source-visible; it should not be presented as reusable open source. Retain third-party notices.

## 6. Demo video and pitch slides

Video URL: **TODO — maximum 180 seconds**

Suggested recording:

| Time | What the viewer sees |
|---|---|
| 0:00–0:15 | Maintainer problem, target user and one-line pitch |
| 0:15–0:45 | Real issue, terms/deadlines, allowance/funding, public funded state |
| 0:45–1:10 | B's useful PR, body closing reference, A's review/merge |
| 1:10–1:30 | Verified author, one bounty allocation and accurate points |
| 1:30–2:10 | B's wallet, exact claim review and transaction |
| 2:10–2:35 | Public paid state and successful Fuji receipt/token transfer |
| 2:35–3:00 | Architecture, signer trust, Avalanche rationale and shipped delta |

Pre-stage accounts and faucet assets. Trim waiting with clearly indicated cuts; do not fake a live merge, balance or transaction. Keep a full rehearsal recording and public evidence links.

Slides URL/file: **TODO — required by portal**

Five slides are sufficient:

1. Problem and target maintainer/contributor.
2. Real GitHub-to-reward workflow and originality.
3. Architecture and trust: GitHub evidence, signer, escrow, wallet.
4. Avalanche deployment and exact settlement proof.
5. What shipped during Speedrun, actual limitations and next step.

The slides support the product demo; they do not replace it.

## 7. AI tools disclosure

Draft factual disclosure; amend to match actual implementation:

> We used OpenAI Codex for implementation planning, documentation review, dependency research, debugging support and test execution. We will list any additional tools and their actual use here. Contract implementation, live transaction and end-to-end testing claims will be added only when completed.

Do not say all security-sensitive code was reviewed or that a live Fuji flow passed before those checks exist.

## Existing project versus Speedrun delta

Build window: September 21–October 21, 2026. Existing source today is not proof it predates September 21. Owner must establish the baseline with dated source/deployment records without inventing provenance.

| Item | Exists in current source | Before September 21? | Shipped during build window? | Evidence |
|---|---|---|---|---|
| Web/API, GitHub OAuth, points/leaderboard | Yes | TODO dated verification | TODO | TODO |
| GitHub App/inbox, numeric allocations, extension | Yes | TODO dated verification | TODO | TODO |
| Legacy SmoothSend payments/recovery | Yes | TODO dated verification | TODO | TODO |
| USDC escrow contract and funding | Contract deployed; smoke funding pending | [Contract](https://testnet.snowtrace.io/address/0xc8ff1527BF4d43A3bC7EA3d9fb415D5647739f65) | Deployment recorded | [Deployment](https://testnet.snowtrace.io/tx/0x302e9e0dce61ad1dd1fa8a7dccbca71c9f7d3f15a185ee0204fa728b84952e4d) |
| GitHub closure/eligibility→voucher settlement | Planned | TODO | Pending | TODO |
| Privy native GitHub + embedded wallet | Planned | TODO | Pending or omitted | TODO |
| Sponsored claim | Optional | TODO | Pending or omitted | TODO |
| Real two-account Fuji proof and public detail | Pending | TODO | Pending | TODO |

Only the actual within-window delta should be presented as new work. Existing-project reuse is allowed by the brief.

## Originality and Avalanche fit

Use evidence, not “first ever” claims:

- Show a maintainer's real issue and why its acceptance criteria matter.
- Show transparent prefunding and deadlines before a contributor works.
- Show attribution to the numeric PR author rather than the merger or a mutable username.
- Show a late-registration allocation without duplicate rewards.
- Explain that off-chain points and exact funded USDC solve different needs.

Avalanche C-Chain gives this prototype EVM escrow and observable settlement on a public network. Fuji supplies a usable test environment; test AVAX pays gas and official test USDC makes a small reward easy to inspect. This is a reason to use Avalanche, not a claim that these capabilities are exclusive to it.

## Evidence checklist

- [ ] Builder Hub registration and team membership confirmed.
- [ ] Production app/API and database available through judging.
- [ ] Real GitHub OAuth and selected App repository checked.
- [ ] Worker delivery/restart or explicitly disclosed sync path verified.
- [ ] Public source repository, license status and setup accurate.
- [ ] Contract, tests, compiler target/artifact, ABI and deployment recorded.
- [ ] Real fresh bounty funded with matching escrow/token evidence.
- [ ] Distinct contributor's default-branch PR actually closes the issue.
- [ ] One winner; bounty and baseline totals correct after retries.
- [ ] Wallet linked/created and controlled by the contributor.
- [ ] Claim settles once; backend and public chain evidence agree.
- [ ] Work/claim deadlines, refund and signer trust disclosed.
- [ ] Native Privy login/wallet flow demonstrated if listed.
- [ ] Sponsored arbitrary contract call demonstrated if listed.
- [ ] Video <=180 seconds and accessible without permission requests.
- [ ] Pitch slides uploaded.
- [ ] AI disclosure and dated baseline/delta accurate.
- [ ] All URLs checked signed out.
- [ ] Portal submission accepted and receipt retained.

## Judging alignment

| Criterion | Weight | Evidence |
|---|---|---|
| Works | 30% | Deployed two-account GitHub→Fuji flow and recovery |
| Originality | 25% | Useful maintainer example, author attribution, prefunding and late claim |
| Technical depth | 20% | Own contract/tests, shared eligibility, EIP-712, durable events and idempotency |
| Avalanche fit | 15% | Fuji contract, exact test USDC settlement, explicit chain rationale |
| Demo/communication | 10% | Working video, slides, readable public proof and honest delta |

Bonuses are separate. A licensed reusable escrow/verifier example is the preferred small extension. Mainnet, custom L1, eERC and ICM/ICTT count only when actually shipped and meaningful to this product; none replaces the core proof.
