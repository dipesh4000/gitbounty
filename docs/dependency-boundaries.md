# External dependency verification and boundaries

Reviewed 2026-10-13. “Documented” means current official documentation supports the capability. “Checked” means the specific read-only request or local test succeeded. Neither proves an account's permissions, billing entitlement, or live signing. Record all remaining gates before enabling a feature.

## Dependency register

| Dependency | Scope and evidence | Required preflight / remaining gate | Failure path |
|---|---|---|---|
| GitHub OAuth | Existing login/token code; production readiness reports configured | Real OAuth callback, numeric ID, secure cookie, logout, owner permissions | Existing session/read-only history; no forged fallback identity |
| GitHub App/API | Existing signed inbox/installation token code | Selected public repo; read Contents/Issues/PR permissions; App RSA secret file; production processed delivery; rate-limit handling | Durable queue + explicit sync/reconciliation |
| Avalanche Fuji RPC | Live eth_chainId = 0xa869 checked | Tested compiler target; deployment bytecode/signer; receipt/log and canonical block policy; backup RPC availability | Unknown state + retry/switch RPC; never blindly resend |
| Circle Fuji USDC | Official address matches code; bytecode exists; decimals() = 6 checked | A's allowance/balance; A/B faucet AVAX; exact transfers, token pause behavior | Stop funding/settlement safely; no silent token replacement |
| Privy auth/wallets | Official native GitHub OAuth, EVM chains and React requirements checked; not installed | Account app/origins; GitHub enabled; numeric subject mapping; server verification; peer resolution; wallet creation/MFA/export | Existing GitHub login + proven external EOA; embedded signing can remain unavailable |
| SmoothSend | Avalanche connector docs and installed SDK 2.3.8 confirm /avax, Privy signer and ERC-4337 surfaces | Local preflight returns 403 CORS_ORIGIN_MISMATCH; align intended origin with dashboard, then confirm credits/network, inner receipt and a sponsored settle call | Direct call with same voucher and recipient, using AVAX |
| PostgreSQL | Production readiness database check passed | Schema 0017+, backups/restore, TLS, pool limits, current provider retention and availability during judging | Pause mutations; retain chain evidence |
| Vercel | Current same-origin services/rewrites exist; public endpoints respond | Cookie/proxy/redirect tests; actual worker execution contract; package builds | Explicit request-driven sync if no persistent worker |
| Persistent Python host | Recommended target for current worker, e.g. non-sleeping Render service | Account/budget/secret-file setup/rewrite cutover; no account provisioned in this review | Bounded authenticated inbox drain; no autonomous-processing claim |
| Explorer | Snowtrace used by brief/Circle and existing links | Verify deployed contract and actual transaction URLs; source-verification API/key if needed | Avalanche explorer link/manual RPC proof |
| Contract tools | Hardhat 3 + existing Node 24/viem; OpenZeppelin planned | Pin npm/compiler/OZ versions, EVM target and lockfile; local compile/test and Fuji smoke | Fix toolchain before contract/UI integration |
| Existing application packages | npm and uv lockfiles; focused tests passed | Clean install, peer/engine check, dependency advisories, full build/runtime and DB/E2E checks | Preserve known-good lockfiles; avoid broad upgrade during sprint |
| Optional wallet services | WalletConnect, RPC analytics, onramps are not MVP requirements | Only introduce a new project ID/account if the implemented UX actually needs it | Injected EVM wallet and Fuji faucet |
| AI tools | Development aid, no product runtime requirement | Accurate disclosure of actual tools/use | Application runs without model/API access |

No owner credentials, billing values or signing keys were read into this document. Provider entitlements remain unverified until the operator checks the relevant dashboard.

## Privy integration decision

Privy natively supports GitHub OAuth. The earlier statement implying custom JWT was necessary was incorrect. Enable GitHub in the Privy dashboard and use its verified linked identity for onboarding. Custom JWT is a separate existing-auth option with its own dashboard access/verification setup.

The backend must validate a Privy access token (ES256, issuer, app audience, expiry and DID) and fetch the user server-side or verify a signed identity token. An access token authenticates a DID; a client-supplied linkedAccounts object is not verified GitHub data. Keep secrets server-side; use a supported server SDK or maintained JWT library with cryptography, not a handwritten JWT verifier.

Native GitHub identity and repository API authorization are distinct. Preserve existing maintainer OAuth authorization bound to the same numeric GitHub ID, or deliberately implement GitHub App user authorization. Do not assume a Privy token can be sent to GitHub's API.

React 18+ and TypeScript 5+ meet Privy's documented minimums. npm registry metadata checked October 13 reports @privy-io/react-auth 3.48.1 and React/React DOM peers ^18 or ^19, which permit the project's React 19.3.0. This does not establish complete Next 16.4.0 build compatibility. Install the chosen pinned version during implementation, inspect peer/optional-peer resolution and run typecheck/build/start plus login/signing checks. viem is already installed; avoid adding wagmi, TanStack Query, Solana, or WalletConnect just for a pattern that does not need them.

Official references: [native GitHub OAuth](https://docs.privy.io/authentication/user-authentication/login-methods/oauth), [access tokens](https://docs.privy.io/authentication/user-authentication/access-tokens), [identity tokens](https://docs.privy.io/user-management/users/identity-tokens), [React installation](https://docs.privy.io/basics/react/installation), [EVM networks](https://docs.privy.io/basics/react/advanced/configuring-evm-networks), [custom JWT setup](https://docs.privy.io/authentication/user-authentication/jwt-based-auth/setup).

### Real wallet portability limit

An external-wallet fallback helps users who control an externally usable EOA. It does not transfer control of an existing embedded wallet to a new address. Already issued vouchers remain bound to the original recipient. Test user-directed export/recovery and MFA on the chosen configuration, and explain that provider availability may still be required. Existing immutable wallet links cannot be replaced without a separate policy/migration.

## SmoothSend verification

Use Avalanche-specific documentation from the installed SmoothSend connector, retrieved October 13: avax-overview, avax-api-reference and get_avax_addresses(fuji). The public [Avalanche quickstart](https://docs.smoothsend.xyz/avax/quickstart) was not reachable through the web reader; the connector supplied the primary provider guidance.

Documented Fuji contracts:

| Contract | Provider-reported address |
|---|---|
| EntryPoint v0.7 | 0x0000000071727De22E5E9d8BAf0edAc6f37da032 |
| VerifyingPaymaster | 0x3207f577792F9d549acB2A6C97c0f74EAeB166d8 |
| SimpleAccountFactory | 0x55326f005a0959F75496cdd692505fFB520972f5 |

Treat these as provider-reported until bytecode and configured gateway defaults are checked. Read defaults at runtime but compare expected chain/EntryPoint and record the version used.

The project currently uses user-pays-erc20. The optional hackathon enhancement is developer-sponsored **claim** execution, which needs account credits and a real arbitrary settle-call proof. “No limitations” removes a product constraint; it does not prove that the local key, origin and dashboard credits work.

The real installed SDK tests passed 6 SmoothSend cases plus 2 wallet-provider cases, with HTTP/RPC transport substituted. They prove the SDK adapter contract, not the remote paymaster. npm run check:smoothsend failed its live read-only gateway check on October 13 without signing or broadcasting. A sanitized follow-up showed getChainId and getSupportedEntryPoints both return HTTP 403 / CORS_ORIGIN_MISMATCH.

Operator action: align the exact intended FRONTEND_URL origin with the SmoothSend dashboard allowlist for the key, then rerun the read-only check. Do not bypass origin checks or print credentials. This result is specific to the local configuration tested; production sponsorship and account credits remain unproven until tested there.

A userOpHash is not an explorer transaction hash. Resolve it to transactionHash, check inner success, and verify the matching escrow and Transfer events. The SCW executes while the voucher pays the receiving EOA. Keep maintainer funding direct during this sprint.

## GitHub requirements

Minimum App installation permissions in the current source are Contents read, Issues read, Pull requests read, plus implicit Metadata read. OAuth currently requests read:user; confirm the actual maintainer-permission endpoint using the real token rather than expanding scope speculatively.

Acknowledge webhooks after persistence within GitHub's response window, then process durably. Redelivery uses the same delivery ID; deduplication must survive it. Respect Retry-After and reset headers. See [GitHub webhook best practices](https://docs.github.com/en/webhooks/using-webhooks/best-practices-for-using-webhooks).

Supported cash closure is same-repository body keyword on a PR targeting the default branch. Title/body regex alone does not prove GitHub closed the registered issue. Snapshot verified evidence and use the same service for sync and webhooks. See [GitHub PR-to-issue linking](https://docs.github.com/en/issues/tracking-your-work-with-issues/using-issues/linking-a-pull-request-to-an-issue).

Use one focused GraphQL query through existing httpx to verify the issue's ClosedEvent.closer is the same PR. Record the event ID/time and paginate; no GraphQL client dependency is needed. Validate that read against the real installation token in Phase 0/2. [GitHub issue-event schema](https://docs.github.com/en/graphql/reference/issues#closedevent).

## Chain, token, gas and explorer

Fuji uses chain ID 43113 and RPC https://api.avax-test.network/ext/bc/C/rpc. Circle lists Fuji USDC as 0x5425890298aed601595a70AB815c96711a31Bc65. Its bytecode/decimals were checked live; it reports six decimals.

Fund with exact approve followed by fund. Direct payer and contributor need faucet AVAX for gas. User-pays-erc20 also requires a fee-token reserve in the smart account; developer-sponsored operations require provider sponsorship. None of these modes makes the USDC reward itself free or proves funding.

Use Snowtrace for the brief's public evidence and an Avalanche explorer fallback. Neither determines paid status; RPC receipt/state/log verification does.

Official references: [Avalanche network parameters](https://build.avax.network/docs/primary-network), [Circle token addresses](https://developers.circle.com/stablecoins/usdc-contract-addresses), [Circle test-token faucet](https://faucet.circle.com/).

## Deployment and worker gate

The source starts an infinite polling task in FastAPI lifespan. A Vercel service declaration alone does not establish durable worker execution. Function background work has execution limits; current code must prove recovery outside an active request.

Preferred deployment uses a non-sleeping persistent Python API process and existing PostgreSQL inbox, with explicit Vercel proxy rewrites. Confirm hosting with the operator before purchasing anything. Render free service sleep behavior makes it unsuitable for an always-on guarantee. If no persistent host is available, use a bounded authenticated drain/refresh endpoint and show the user a pending/refresh state.

References: [Vercel function limits](https://vercel.com/docs/functions/limitations), [FastAPI on Render](https://render.com/docs/deploy-fastapi), [Render free-service behavior](https://render.com/docs/free).

The App key currently loads from a path. Configure a real secret file on the host or intentionally implement a key-content loader; a developer's disk path cannot be copied to production. Validate same-origin proxy cookies, callbacks, webhook signatures, database pool sizing and worker restart.

## Package and license gate

Current frontend manifest: Next 16.4.0, React/React DOM 19.3.0, viem ^2.57.4, SmoothSend ^2.3.8, Node 24. Current backend: Python >=3.12,<3.13, locked FastAPI/uvicorn/httpx/asyncpg/cryptography and eth-account/eth-abi/eth-utils.

Preserve lockfiles; npm ci and uv sync --locked are the reproducible installation paths. This review ran npm advisory queries for web/full, web/production, extension and E2E plus an OSV batch query for 55 Python lockfile package/version pairs:

| Scope | Result |
|---|---|
| Web production, extension and E2E | Zero reported findings in each |
| Web including development | Four high findings in @next/eslint-plugin-next → fast-glob → micromatch → braces |
| Python runtime | cryptography 44.0.0 and Starlette 0.41.3 reported affected |
| Python development | pytest 8.3.4 reported affected |

Full advisory details/actions are in [implementation-audit.md](implementation-audit.md). Aliased OSV records are not independent vulnerability counts. Phase 0 must resolve supported patched versions, test compatibility and recheck advisories. Do not use a forced Next plugin downgrade or independently upgrade Starlette outside FastAPI's supported bounds. Point-in-time zero findings do not prove absence of vulnerabilities.

Use existing eth-account for EIP-712 signing and httpx for RPC. Add maintained JWT verification only if the chosen Privy path needs it. Use [Hardhat 3](https://hardhat.org/docs/getting-started) and [OpenZeppelin](https://docs.openzeppelin.com/contracts/5.x/utilities) rather than bespoke signing/security primitives. Set evmVersion=cancun explicitly per [current Avalanche guidance](https://build.avax.network/docs/primary-network/verify-contract/hardhat).

The root project has no selected source license. A package's MIT license does not license GitBounty's own code. Owner chooses the project/contract license and retains third-party notices before claiming the reusable-open-source bonus.

## Required capability proofs before demo freeze

- Existing production GitHub login and selected App repository work.
- Worker processes a persisted delivery after a restart.
- Fresh issue funding produces a matching escrow event and exact incoming USDC transfer.
- An eligible second-user PR creates one winning cash allocation and correct points totals.
- Direct claim transfers once; browser closure and duplicate requests recover it.
- Deadlines, exact refund boundary and recipient immutability pass tests.
- Privy native GitHub→embedded EOA→signed challenge works if included.
- SmoothSend arbitrary sponsored settle call works if included.
- All provider accounts, data and demo links remain available through judging.

A documented capability is never checked off as an account-level operational proof.
