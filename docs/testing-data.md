# Hackathon verification runbook

Use this runbook for deterministic testing and the final live proof. Account A is the maintainer/payer. Account B is the contributor/recipient. They must be distinct GitHub identities.

## Test fixture

- Public repository: `TODO/demo-repository`
- Issue: `TODO`
- Bounty points: `40`
- Baseline points: use the configured rule version
- Fuji USDC reward: `1.00` test USDC or another deliberately small amount
- Chain: Avalanche Fuji, chain ID `43113`
- Escrow address: `0xc8ff1527BF4d43A3bC7EA3d9fb415D5647739f65`
- Funding transaction: `TODO`
- Settlement transaction: `TODO`
- Work cutoff / claim deadline: `TODO` / `work cutoff + seven days`
- Expected points: `40 bounty + 5 eligible baseline = 45`, with separate award types

Never put private keys, OAuth tokens, session cookies, provider secrets, or database credentials in this document.

## Layer 1 — Deterministic checks

### Contract

Verify at minimum:

- exact funding succeeds;
- duplicate bounty ID fails;
- another address funding the same application reference produces a different payer-bound ID;
- unsupported token fails;
- zero amount and zero address fail;
- correct EIP-712 voucher settles once;
- wrong chain/domain, signer, bounty, recipient, token, amount, nonce, or deadline fails;
- replay fails;
- refund cannot happen before its condition;
- settlement requires timestamp < deadline <= claimUntil; refund requires timestamp >= claimUntil, including equality;
- claimUntil is exactly workEndsAt + seven days; no early cancellation or withdrawal exists;
- settlement and refund cannot both succeed;
- multiple escrows and donated tokens preserve outstanding-liability accounting;
- transfer failure reverts without corrupting state;
- emitted events contain the expected indexed identifiers;
- Python eth-account, viem and Solidity agree on one golden EIP-712 digest/signature;
- compiler artifact with evmVersion=cancun deploys and executes on Fuji.

### Backend

Verify:

- client-supplied identity and payment terms are ignored or rejected;
- numeric GitHub identity survives login renames;
- duplicate webhook and sync do not duplicate awards;
- no legacy payment term/trigger creates a second cash allocation for a new escrow;
- default-branch/body/same-repository and actual ClosedEvent.closer checks reject false issue-closure claims;
- missing, edited-after-merge and ambiguous closing evidence cannot allocate cash;
- merge before funding, merge after work cutoff, bots and self-bounties cannot allocate cash;
- first processed eligible winner is stable under concurrent webhook/sync and later issue reopening;
- voucher issuance requires funded state, eligible merge, correct claimant, and proven wallet;
- concurrent voucher requests return one logical authorization;
- an expired voucher renews only the deadline, preserving its recipient/token/amount/nonce;
- existing immutable wallet links survive Privy migration; mismatched app/DID/GitHub identities fail;
- receipt verification checks chain, contract, event, token, amount, recipient, and success;
- pending, missing, malformed, reverted, and conflicting receipts never mark paid;
- historical SmoothSend records remain readable during migration;
- restart and overlapping event scans recover existing state without duplicate awards/transfers;
- a successful AA outer receipt without inner success and correct escrow/token logs never marks paid.

### Frontend

Verify:

- points-only and funded rewards are visually distinct;
- Fuji testnet is unmistakable;
- embedded and external wallets can be selected intentionally;
- wrong-network recovery is understandable;
- funding shows contract, token, amount, and purpose before signature;
- exact allowance approval is a separate step and never shows funded by itself;
- direct payer/contributor AVAX needs are distinct from USDC reward balances;
- claim shows exact recipient and amount before signature;
- pending states survive refresh;
- Snowtrace links use verified identifiers;
- keyboard, focus, reduced-motion, error, empty, narrow-screen, and loading states work;
- closing the browser after a broadcast still permits recovery from chain events;
- work/claim deadlines and expired-but-points-retained state are understandable;
- native Privy GitHub login, logout, token refresh, new/existing-user mapping and same-address recovery work if included.

## Layer 2 — Local integration

Use simulated GitHub plus isolated PostgreSQL and a local EVM node:

Extend the fake GitHub server with actual PR default-branch metadata and ClosedEvent.closer GraphQL fixtures. Use a local mock USDC contract only in deterministic tests; it does not replace official USDC in Fuji evidence.

1. Create account A and account B fixtures.
2. Connect a repository fixture as A.
3. Create a bounty and fund the local escrow.
4. Process a signed webhook fixture for B's eligible merged PR.
5. Confirm one bounty allocation, at most one baseline allocation per PR, and correct point totals.
6. Link B's wallet through a real local signature.
7. Request and submit the settlement voucher.
8. Confirm exact settlement and paid state.
9. Replay webhook, sync, voucher request, settlement, and receipt verification.
10. Confirm totals and balances remain correct.
11. Restart the worker and recover a persisted delivery.
12. Stop the browser after transaction broadcast, recover its event, and confirm no new send is needed.
13. Advance local time to both sides of claimUntil and prove only settlement or refund can succeed.

## Layer 3 — Fuji contract smoke test

Before involving GitHub:

1. Deploy the exact tested contract artifact to Fuji.
2. Record the deployment transaction and address.
3. Fund a disposable bounty with a tiny amount of official test USDC.
   First approve the exact escrow allowance, then submit fund. Record both transactions.
4. Generate a valid settlement authorization for a controlled recipient.
5. Settle it once.
6. Confirm the escrow event and exact token transfer on Snowtrace.
7. Confirm a replay fails.
8. Use a separate short-lived disposable bounty to verify refund-to-payer at the boundary; do not expire the judge's main demo bounty.

This isolates contract/RPC/token problems from GitHub and product-flow problems.

## Final live Fuji runbook

### Prepare

1. Confirm the deployed `/ready` status and public configuration.
2. Confirm production test-auth and development stubs are disabled.
3. Confirm A and B can complete production login.
4. Confirm A has Fuji AVAX for gas and enough official test USDC for the bounty.
5. Confirm B's embedded or external receiving EOA is on Fuji, under B's control, and has AVAX for the direct fallback.
6. Start screen recording before the product flow or capture a clean rehearsal first.
7. Confirm worker heartbeat or the explicitly selected bounded-drain mode, signer/token/contract consistency, and future work/claim deadlines.

### Publish and fund

1. A installs/connects the GitHub App on the demo repository.
2. A creates an issue with clear acceptance criteria.
3. A creates a GitBounty reward for that issue.
4. The UI shows points, Fuji, token, amount, escrow contract, work cutoff and seven-day claim grace.
5. A approves the exact USDC allowance, then submits the separate funding transaction.
6. GitBounty verifies the funding transaction before showing the bounty as funded.
7. Open the public bounty view in a signed-out window.

### Contribute

1. B creates a branch or fork and authors the change.
2. B opens a PR targeting the default branch with an unambiguous body reference such as `Closes #<issue>`.
3. A reviews and merges the PR; A must not be the PR author.
4. Wait for webhook processing. If recovery sync is used, record that fact.
5. Confirm actual issue-closure provenance identifies B's PR and the allocation belongs to B's numeric GitHub ID.
6. Confirm bounty and eligible baseline awards appear once each, with the expected combined total.

### Claim

1. B signs in and opens the reward.
2. B creates or selects the intended wallet and completes the signed ownership challenge.
3. GitBounty displays the exact escrow, token, amount, recipient, chain, and authorization expiry.
4. B approves the settlement transaction with enough AVAX, before claimUntil. If sponsorship is used, record its UserOperation and resolved transaction separately.
5. GitBounty shows pending until the receipt is verifiable.
6. GitBounty shows paid only after matching the contract event and exact USDC transfer.
7. Open the successful transaction on Snowtrace.

### Prove idempotency

1. Refresh both accounts.
2. Re-run contributor sync.
3. Re-deliver or simulate the same webhook only through the documented safe mechanism.
4. Request the claim again.
5. Confirm no duplicate points, allocation, voucher, or transfer appears.

## Evidence package

Record public identifiers only:

- deployed app URL;
- public repository URL;
- GitHub issue URL;
- merged PR URL;
- escrow contract address and deployment transaction;
- funding transaction;
- settlement transaction;
- recipient address;
- screenshots of funded, awarded, pending, and paid states;
- exact check commands and results;
- demo video URL.
- pitch slides URL/file and accepted portal receipt;
- work/claim deadlines, rule version and actual worker processing/recovery evidence.

## Failure recovery

| Symptom | Check |
|---|---|
| Login fails | OAuth/Privy origin, callback, audience, cookie policy, linked GitHub account |
| Repository unavailable | GitHub App installation scope and user permission |
| Merge not recognized | PR author, merged state, closing reference, repository, webhook delivery, recovery sync |
| Funding stays pending | chain, contract, receipt status, event, token transfer, confirmation policy |
| Approval succeeded but no funding | allowance is not a deposit; inspect the separate fund transaction |
| Wrong wallet | linked GitHub identity, signed challenge, selected account, Privy user mapping |
| Voucher refused | domain, chain, contract, signer, nonce, deadline, exact stored terms |
| Claim stays pending | transaction receipt, contract event, ERC-20 log, RPC visibility |
| Replay appears possible | contract state, database uniqueness, voucher nonce, receipt association |
| Embedded provider unavailable | recover/control the same EOA; a new external address cannot replace it |
| Claim expired | claimUntil and canonical block time; points remain, cash may be refunded |
| Worker does not progress | selected execution mode, heartbeat, persisted inbox and retry deadline |
| Sponsorship fails | local preflight, key/origin/credits, SCW/EntryPoint; use same voucher through direct fallback |

Do not bypass a failed invariant to finish the demo. Diagnose it, fix the shared boundary, rerun deterministic checks, and start the live flow with a fresh bounty if necessary.
