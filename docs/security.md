# Security and trust boundaries

GitBounty joins GitHub identity to transactions that can move tokens. Treat identity mapping, settlement authorization, contract state, and receipt verification as security-critical.

## Trust model

| Actor or system | Trusted for | Not trusted for |
|---|---|---|
| GitHub | Repository, PR, merge, and numeric user identity | Wallet ownership or payment success |
| Privy | Auth token issuance and wallet operations within configured controls | Reward eligibility, amount, or canonical GitBounty data |
| Browser wallet | User-approved signatures from its selected address | GitHub identity or server-derived payment terms |
| GitBounty backend | Eligibility rules and settlement authorization | Custody of user wallets |
| Escrow contract | Fund custody, voucher verification, replay protection, transfer execution | GitHub semantics |
| RPC/provider | Chain data transport | Final truth without cross-checking receipt contents |
| SmoothSend | Optional transaction execution | Reward ownership or proof of payment |

## Identity controls

- Use the numeric GitHub ID for ownership; logins are mutable display data.
- Verify Privy access-token ES256 signature, issuer, audience, expiry and DID on the backend. Obtain linked identity from a server fetch or verified identity token, never a browser object.
- Privy natively supports GitHub OAuth. Resolve its linked numeric subject to the same GitHub ID as the application user; reject conflicting DID/session mappings. Native login does not authorize repository API calls.
- Require a fresh, one-use challenge bound to origin, GitHub ID, address, chain and expiry before recording an address. Preserve existing immutable links.
- Prevent one wallet from being silently reassigned across incompatible GitHub identities.
- Test Privy MFA and same-address export/recovery. An external wallet cannot replace control of an unavailable embedded wallet, and expired vouchers cannot be renewed to another recipient.

## GitHub controls

- Verify OAuth state and rotate authenticated sessions.
- Encrypt GitHub access tokens at rest and never return them through public schemas.
- Verify GitHub webhook HMAC over raw request bytes with constant-time comparison.
- Persist delivery IDs and reject duplicate processing.
- Verify installation, repository, issue, PR, merge, and author through GitHub before awarding.
- Share the same eligibility implementation between webhook processing and reconciliation.
- Cash eligibility requires the default branch, supported body reference, funding/merge cutoff, numeric identities and actual issue ClosedEvent.closer matching the PR. Keep an immutable evidence snapshot; later body edits cannot invent closure.
- Persist exactly one winner per issue. The MVP uses first eligible allocation processed, not earliest merge ordering.

## Contract controls

- Use EIP-712 typed settlement authorizations with chain ID and verifying contract in the domain.
- Freeze the exact version-1 schema in architecture.md and prove a Python/viem/Solidity golden vector. Bind bounty ID, recipient, token, amount, nonce zero, and deadline.
- Consume state before external token transfer and protect against reentrancy.
- Reject zero addresses, zero amounts, unsupported tokens, duplicate bounty IDs, expired vouchers, wrong signers, and already-settled bounties.
- Derive bounty IDs from chain, contract, recorded payer and application reference; copied references from another sender cannot preempt the expected ID.
- Set claimUntil = workEndsAt + seven days. Settlement requires block.timestamp < deadline <= claimUntil; refund requires >= claimUntil. No early cancellation. Test equality and both race orderings.
- Use SafeERC20-compatible transfers and explicitly exclude unsupported fee-on-transfer or rebasing tokens for the MVP.
- Use a non-upgradeable contract with immutable USDC and EOA authorization signer. No admin withdrawal, pause, signer rotation or rescue path in this MVP.

## Authorization signer

The backend settlement signer is powerful: compromise could authorize payouts from funded escrows. Therefore:

- Keep it separate from deployer, treasury, and user wallet keys.
- Store it only in the deployment platform's secret facility or an external signer/KMS.
- Never expose it to the browser or logs.
- Rate-limit voucher issuance and record every issued digest.
- Make voucher creation idempotent for a bounty and recipient.
- If the immutable signer is compromised, stop new off-chain issuance and new funding, investigate issued vouchers, and deploy a separately reviewed contract. Existing valid vouchers cannot be revoked, and old escrows retain their claim/refund rules.
- Use only test assets on Fuji until key management and incident procedures are reviewed.

The signer can authorize a malicious recipient if compromised. Contract tests/replay protection do not remove this trust. An off-chain allocation or moderation hold does not extend claimUntil.

## Funding and settlement verification

Funding verification checks:

- expected chain;
- expected escrow contract;
- successful receipt;
- correct `BountyFunded` event;
- correct payer, token, amount, and bounty ID;
- observed token transfer into escrow.
- exact USDC allowance and separate fund transaction; approval alone is never funding evidence.

Settlement verification checks:

- expected chain and contract;
- successful receipt;
- correct `BountySettled` event;
- exact bounty ID and recipient;
- exact ERC-20 token and amount;
- no conflicting settlement record.
- matching canonical receipt block hash, rechecked after at least one subsequent block under the demo policy.

Direct calls target escrow; an AA transaction can target EntryPoint. Verify inner UserOperation success and matching escrow/token logs. The receiving EOA need not equal msg.sender or transaction.from.

Use one verifier for browser-submitted hashes and a bounded persisted log scanner. Recover mined transactions after browser closure without creating another reward.

A transaction hash, provider callback, or pending UserOperation is never enough to mark a reward paid.

## Secrets

Never put the following in source, documentation, screenshots, video, logs, analytics, or chat:

- OAuth client secrets or access tokens;
- session cookies or CSRF values;
- database URLs/passwords;
- GitHub App private keys or webhook secrets;
- Privy app secrets or authorization keys;
- escrow settlement signer private key;
- wallet private keys, seed phrases, or recovery material;
- SmoothSend secret keys.

Public identifiers such as app IDs, wallet addresses, contract addresses, transaction hashes, public dashboard keys, and RPC URLs may be exposed only when their provider classifies them as public.

## Database and operations

- Apply schema changes only through new numbered migrations.
- Back up shared databases before migrations and require explicit owner authorization.
- Keep the points ledger append-only; corrections are new entries.
- Preserve historical payment evidence when changing providers.
- Redact request bodies and authorization headers from logs.
- Rate-limit login, wallet challenge, funding refresh, voucher issuance, and transaction verification.
- Ensure production test-auth paths and development stubs are disabled.
- Prove worker progress after a restart on the selected deployment; an untracked asyncio task is not durable execution.
- Deliver the GitHub App RSA key through a real host secret file or deliberate environment loader.
- Resolve the locked cryptography/Starlette advisories listed in implementation-audit.md and rerun middleware, OAuth, webhook, encryption and signature tests.

## Demo safety

- Use Fuji and test USDC.
- Prepare wallets before recording; never display secret material.
- Show public addresses and transaction hashes only.
- Cap bounty amounts to the minimum needed for a clear demo.
- Rehearse wrong-network and rejected-signature recovery without risking real funds.

## Mainnet gate

Do not deploy or advertise mainnet settlement until contract review, signer management, monitoring, refund behavior, legal/product disclosures, and incident response are explicitly approved. A mainnet bonus is not worth risking user funds.
