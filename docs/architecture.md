# Architecture

Reviewed 2026-10-13. This is the target specification, not a claim that escrow or Privy is implemented. [plan.md](../plan.md) controls sequencing; [implementation-audit.md](implementation-audit.md) records evidence and open gates.

## Current implementation

| Area | Existing source |
|---|---|
| Web | Next.js 16.4.0, React 19.3.0, TypeScript, viem |
| API/data | FastAPI, asyncpg, selected SQLAlchemy paths, numbered PostgreSQL migrations through 0016 |
| Login | GitHub OAuth, signed HttpOnly app session, encrypted GitHub access token |
| GitHub automation | App installation tokens, HMAC webhook inbox, in-process polling worker, contributor reconciliation |
| Ownership | Numeric GitHub IDs, pre-registration allocations, append-only points ledger |
| Wallet | EIP-1193 browser discovery; one immutable signed EOA link per GitHub identity |
| Payments | Historical AVAX/Fuji USDC promises, SmoothSend UserOperations, stored-operation recovery, receipt verification |

No contract workspace or Privy dependency exists yet. Public readiness proves database/OAuth settings are configured, not that production OAuth or webhook execution has completed.

## System shape

~~~text
GitHub OAuth or Privy native GitHub login
                    |
                    v
          Verified GitBounty session
                    |
                    v
Next.js --same-origin proxy--> FastAPI <--> PostgreSQL durable inbox/ledger
                                  |
                  GitHub App / eligibility / voucher signer
                                  |
                         Avalanche RPC verification
                                  |
User EOA or optional AA executor --> GitBountyEscrow --> Fuji test USDC
~~~

The chain verifies the signer's authorization, escrow accounting and replay. GitHub eligibility is a backend attestation. Describe this as attested escrow settlement; do not claim fully trustless GitHub verification.

## Target hackathon architecture

### Identity

Privy **natively supports GitHub OAuth**. The preferred upgrade is GitHub login through Privy and embedded EOA creation. Custom JWT/OIDC is an alternative for existing-auth federation and is not required for native GitHub login. [Official OAuth documentation](https://docs.privy.io/authentication/user-authentication/login-methods/oauth).

The app keeps its existing HttpOnly session as the API credential. A new auth exchange verifies the Privy access token, obtains server-verified linked-account data, resolves github_oauth to the stable numeric GitHub ID, and creates/updates the existing user by that ID. A browser user object is never identity proof. Validate the provider subject's numeric semantics against GitHub before migration; ambiguity must block linking.

Store a unique nullable privy_did, but keep users.id and users.github_id stable. A DID already mapped elsewhere, mismatched active GitHub session, missing GitHub account, expired token, wrong audience/issuer, or subject mismatch fails closed. Never auto-merge by email or username.

Native login does not grant repository permissions or guarantee a GitHub API token. Retain the existing GitHub owner-authorization flow for actions requiring its token, bound to the same numeric ID; use App installation tokens for repository reads/webhooks. Consolidating all user authorization is post-proof work.

Login migration must preserve points, pending allocations and linked wallets. Logout clears both app and Privy state. Keep direct GitHub OAuth available if the Privy rollout fails; choosing fallback must not silently change the user's wallet.

### Wallets and recovery

- Receiving wallets are EOAs for the MVP, including Privy embedded EOAs. Generic ERC-1271 smart-wallet linking is excluded until implemented and tested.
- Existing wallets are immutable through migration 0015. Reuse the linked EOA even if Privy creates another wallet.
- For a first link, show the address explicitly and issue a one-use challenge containing app origin, GitHub ID, selected address, nonce, chain and expiry. Validate the recovered address and consume atomically.
- A wallet-linked identity is not proof that the wallet is connected now. Recheck account and chain before signing.
- Once a voucher exists, its recipient cannot be changed by refresh, re-login, SDK fallback or an expired-voucher renewal.
- Recovery/export must preserve the same address. A newly connected external address cannot control an existing embedded address. Future wallet rotation needs a dedicated migration and revocation design.
- For an embedded wallet, test MFA and user-directed export/recovery while the provider works. Provider outages can still prevent signing; no offline-access guarantee is implied.

### GitHub eligibility

The GitHub App reads only selected public repositories, with Contents/Issues/Pull requests read permissions and automatic Metadata read. Subscribe to issues, pull_request, installation and installation_repositories. Preserve raw-byte HMAC verification and delivery-ID uniqueness.

Cash eligibility adds these rules to the existing points/allocation service:

1. Persist numeric repository, issue, PR and author IDs alongside display names.
2. Require a fresh open, published issue with no old bounty allocation or legacy cash terms.
3. Verify the PR through the App API: same repository, target default branch, merged state and author numeric ID; reject repository owner/self-bounty authors and bots for the MVP.
4. Accept one same-repository funded issue referenced by a supported closing keyword in the PR body. Title-only, commit-only, sidebar-only, cross-repository and multiple-funded-issue references cannot receive automatic cash.
5. Require canonical fundedAt <= mergedAt < workEndsAt. Reconciliation time does not determine eligibility. Confirm the issue timeline ClosedEvent.closer is the same PR with a focused GraphQL read, retaining event ID/time and handling pagination. Missing or ambiguous evidence pauses cash allocation; adding a closing keyword after merge cannot establish closure.
6. Save the verified PR body/closing-reference snapshot, merge time, author, funding block and rule version at allocation.
7. Under a lock and unique constraint, the first eligible allocation processed wins. Later merges/reopened issues cannot create another payout. Do not advertise earliest-merge ordering.
8. Webhooks and recovery sync call the same cash-validation/reservation function. An issue closed without an eligible PR gives no cash.

Existing points remain 5 baseline per eligible merged PR and 1–1000 bounty points. A 40-point bounty plus eligible baseline creates two award types totaling 45. If eligibility behavior changes, version the rule; never rewrite historical entries.

Official semantics: GitHub closing keywords act on the default branch. [GitHub issue linking](https://docs.github.com/en/issues/tracking-your-work-with-issues/using-issues/linking-a-pull-request-to-an-issue), [ClosedEvent and closer](https://docs.github.com/en/graphql/reference/issues#closedevent).

### Escrow contract

Implement one non-upgradeable GitBountyEscrow with immutable token and EOA authorizationSigner. Use OpenZeppelin EIP712, ECDSA, SafeERC20 and ReentrancyGuard, pinned to a tested release. There is no owner withdrawal, early cancellation, pause, token registry, signer rotation, partial payout or top-up.

Set the compiler's evmVersion explicitly to cancun and pin the compiler version/optimizer settings. Current Avalanche guidance warns newer compiler defaults can target unsupported hardforks. [Avalanche compiler guidance](https://build.avax.network/docs/primary-network/verify-contract/hardhat).

Public key derivation, with ABI encoding (not ambiguous packed strings):

~~~text
referenceId = keccak256(abi.encode(applicationNamespace, immutableDatabaseBountyId))
bountyId = keccak256(abi.encode(block.chainid, address(this), payer, referenceId))
~~~

The app stores one expected payer before funding. fund(referenceId, amount, workEndsAt) derives payer from msg.sender, so funding from another wallet produces a different ID. A copied reference cannot block the intended payer's ID. Fix the payer/reference and terms once instructions are issued; rejected/incorrect funding is not silently reassigned.

Contract fields per bounty: payer, amount, fundedAt, workEndsAt, claimUntil, state, recipient after settlement. Token and signer are immutable contract-wide. States: absent, funded, settled, refunded.

Actions:

- **fund:** require fresh ID, positive amount, nonzero reference, workEndsAt > block.timestamp, and checked timestamp arithmetic. Set claimUntil = workEndsAt + seven days. transferFrom payer into escrow; require exact token balance delta. Emit BountyFunded with ID/reference/payer/amount/times.
- **settle:** accept the typed voucher below; require funded state, nonzero recipient, exact token/amount, nonce zero, block.timestamp < deadline <= claimUntil, and authorized signer. Set settled before SafeERC20 transfer to recipient. Anyone may submit: recipient is voucher-bound, not msg.sender. Emit BountySettled with ID/recipient/amount/digest.
- **refund:** require funded state and block.timestamp >= claimUntil; set refunded before transfer to recorded payer. Anyone can trigger, but only payer receives. Emit BountyRefunded.
- **views:** expose bounty fields, immutable token/signer and domain data.

Contract invariants: each ID can leave funded only once; escrow token balance covers all outstanding liabilities; a direct token donation does not create a bounty or allow an admin withdrawal. Token pause/blacklisting or transfer failure must revert the action without destroying its funded state.

### Deadline policy

There are two clocks: workEndsAt is the eligible merge cutoff; claimUntil is the on-chain claim deadline. The seven-day grace permits delayed webhooks, registration and wallet linking. Claims before claimUntil can succeed; refunds at or after claimUntil can succeed. At the boundary the conditions do not overlap.

An off-chain award does **not** indefinitely lock refund. An unclaimed award can expire. A transaction broadcast before the deadline but mined after it fails. State these limits in the bounty terms and UI; points remain valid even if the cash claim expires. Guaranteed locking after an award would require another on-chain reservation action and is outside this MVP.

### Settlement authorization

Freeze this exact version-1 typed data in Solidity, Python and viem:

~~~text
domain = {
  name: "GitBountyEscrow",
  version: "1",
  chainId: 43113,
  verifyingContract: deployedEscrow
}
Settlement(
  bytes32 bountyId,
  address recipient,
  address token,
  uint256 amount,
  uint256 nonce,
  uint256 deadline
)
~~~

Nonce is zero for the one-shot MVP bounty; funded/settled state provides replay protection. The contract rejects nonzero values. The backend freezes the recipient at first voucher issuance. Use integer base units and UTC Unix seconds only.

deadline = min(currentChainTime + fifteen minutes, claimUntil). Read canonical chain state before issuing; do not issue when insufficient valid time remains. Persist the typed payload/digest, recipient and attempt before signing. Repeated requests return the same unexpired voucher; renew only deadline for the same recipient/amount/token/nonce. Different-domain or changed-recipient vouchers must never be issued for the same escrow.

A golden vector must prove equal digest and recovered signer across eth-account, viem and Solidity. Signatures are bearer authorizations to the exact recipient; avoid exposing them publicly or in logs.

### Funding and claim flow

~~~text
draft terms -> signed EOA payer link -> exact USDC allowance approval
-> fund transaction -> verified funding event + incoming Transfer
-> public funded bounty -> verified eligible PR -> single allocation
-> contributor login + wallet proof -> persisted signed voucher
-> settle call -> verified settlement event + outgoing Transfer -> paid
~~~

Approve is separate from fund. Approval only grants an allowance; it does not fund escrow. Use exact allowance, not unlimited approval. The payer needs test USDC and AVAX for approval/funding; the direct claimant needs AVAX even though the reward is USDC. Test faucets before recording.

### Provider boundaries

Privy supplies native GitHub onboarding, embedded EOA creation, external-wallet connection and user signatures. GitBounty stores reward records and verifies identity/chain evidence. Privy outage may block embedded signing or new Privy login; direct OAuth/external wallets preserve supported alternative paths, not control of the embedded address.

SmoothSend is optional developer-sponsored **claim execution**. Its ERC-4337 sender is a smart contract account owned by the EOA; it is not the receiving EOA. settle permits a relayer/SCW caller but always pays the voucher recipient. Maintainer funding remains direct in the MVP, preventing payer/refund-address confusion.

Store UserOperation hash separately from transaction hash. Resolve the bundler receipt and verify inner success plus the matching escrow/token logs. An outer successful EntryPoint transaction alone is insufficient. Gateway failure falls back to a direct call of the same valid voucher; idempotent on-chain state prevents two successful payments. See [dependency boundaries](dependency-boundaries.md).

### Browser extension

The extension remains an optional discovery surface with its existing permissions. It never signs, funds or claims. Read-only UI should link to real public bounty/settlement state.

## Data and API contract

Add a new migration, preserving historical data. New escrow rewards must not insert avax_reward_terms, so old reservation triggers cannot create a second cash path.

| Record | Required fields and constraints |
|---|---|
| User mapping | existing GitHub numeric ID + unique nullable Privy DID; no email/name merging |
| Escrow terms | unique issue/bounty reference and chain+contract+bountyId; numeric repo/issue IDs, payer GitHub ID/address, token, amount_units numeric(78,0) within uint256, work/claim times, reward mode |
| Funding evidence | chain, contract, bounty ID, tx hash, log index, block number/hash/time, exact payer/token/amount |
| Allocation | unique winning escrow allocation and existing points allocation reference; numeric author/PR IDs, merge/reference snapshot and rule version |
| Voucher | unique escrow recipient binding; typed payload, digest, deadline, nonce zero, issued timestamp; renewed attempts retained |
| Chain attempts/events | kind (approval/fund/settle/refund), EOA or AA, optional userOpHash/txHash, status, errors without secrets; unique chain+txHash+logIndex |
| Index cursor | chain+contract deployment start, last reconciled block/hash, bounded overlap for restarts |

Use the existing /api/avax prefix while migrating, or explicitly version/alias endpoints; avoid silently breaking the extension and website. Add config with execution_mode, network/token/contract/signer/deployment block and public deadline policy.

Product API operations: draft/freeze funding terms, funding instructions, reconcile funding, get claim authorization, record/reconcile settlement attempt, refund instructions/status, public bounty detail. Server-resolved records determine all authoritative fields. Client hashes are hints for lookup, never proof of settlement. App-session auth and existing CSRF protection apply to every private mutation.

Persist contribution state (available/awarded/ineligible), escrow state (unfunded/funded/settled/refunded) and attempt state (awaiting_signature/submitted/unknown/failed/verified) separately. Expired-claim/refundable badges are derived from chain time/state. Rejected signatures never downgrade a funded escrow.

## Verification and recovery

On every chain read, require eth_chainId == configured chain. Pin expected deployment address, bytecode and token/signer values.

For funding require successful receipt, expected BountyFunded from escrow, exact stored terms/times, incoming token Transfer from payer to escrow, and matching contract state. For settlement require BountySettled from escrow, expected ID/digest/recipient/amount, and exact token Transfer from escrow to recipient. Verify refunds analogously to the recorded payer.

For direct calls require transaction.to == escrow. For sponsored claims the enclosing transaction can target EntryPoint; match the correct UserOperation and log segment. Neither transaction.from nor msg.sender identifies the recipient.

Demo confirmation policy: require the receipt block hash to match the canonical block and query its hash again after observing at least one subsequent block. This is an application confirmation threshold, not a new consensus/finality claim. Missing/conflicting RPC data stays unknown and is retried. Store block hash/number/log index, and detect inconsistency rather than treating it as failure or sending again.

Index logs from deployment with bounded ranges and a persisted cursor; re-read a short overlap and deduplicate events. Browser hash submission and background scanning use the same verifier. Browser closure, HTTP timeout, duplicate delivery, replaced transaction and worker restart must recover existing business state.

## Deployment

Keep the frontend on Vercel. The target API is a persistent Python service (for example, an operator-provisioned non-sleeping Render service) with the durable PostgreSQL worker. Retain same-origin /api, /auth, /webhooks and health routes through explicit proxy rewrites. Current service rewrites require an implementation change to point at an external host. Verify cookies, redirects, Origin, forwarded protocol and webhook delivery after the switch.

Confirm hosting budget/account availability during Phase 0. Render free instances sleep; they are not the always-on target. If persistent hosting is unavailable, use an authenticated bounded request-driven drain/refresh with saved inbox state; document its latency and avoid claiming autonomous background processing.

Deliver the App RSA key via host secret-file facilities, preserving GITHUB_APP_PRIVATE_KEY_PATH or deliberately adding an environment-value loader; an arbitrary local path will not deploy. Store the separate escrow signer in server secret storage. Keep PostgreSQL connection pools within host limits; do not put an unbounded scanner in HTTP handlers.

Future readiness should report required schema, contract/token/signer consistency and worker heartbeat separately; provider keys alone do not prove operational capability. Public responses reveal statuses, not credentials.

Mainnet requires a separate configuration, review and new deployment. It must not reuse a Fuji payment record as mainnet settlement.
