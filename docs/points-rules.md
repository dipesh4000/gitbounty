# Reward and eligibility rules

Reviewed 2026-10-13. These are target rules; existing runtime gaps are listed in [implementation-audit.md](implementation-audit.md).

GitBounty has off-chain points and separately funded Avalanche rewards. Points do not convert into money. A points-only bounty requires no wallet; a cash claim requires a proven receiving EOA.

## Identity

The stable numeric GitHub ID of the PR author owns an award. Username, merger, maintainer, email, wallet-provider DID and browser request fields cannot replace that identity. A contributor may register after the merge; keep the allocation pending without creating a fictional registered user.

Privy can supply native GitHub login and embedded wallets. Verify its token and linked identity server-side, and map to the existing numeric GitHub ID. Repository permission checks still require the correct GitHub authorization.

## Existing points behavior to preserve

- Current rule version: points-v1.
- Baseline: 5 points for an eligible merge in a participating repository.
- Bounty: maintainer-selected 1–1000 points, awarded once per issue.
- Eligible baseline and bounty are separate award types. A 40-point bounty may total 45 points across two ledger entries.
- Categories: frontend, backend, fullstack, docs, testing, devops, design, mobile, other.
- Only published registered bounties award bounty points; labels can suggest a value but do not create rewards.
- Self-owned repository merges and self-published bounty claims are excluded by the existing rules.
- Store snapshots and rule version; adjustments/voids append entries rather than editing history.
- Registration and retries must not duplicate allocations or ledger entries.
- Stricter eligibility changes require a new rule version. They do not retroactively rewrite points-v1 history.

## Funded reward eligibility

The MVP supports one whole USDC payout on a fresh, unawarded issue. No split rewards, top-ups, cash attachment to old awards, or reopening the same issue for another payout.

An automatic cash allocation requires:

1. Public repository within an active selected GitHub App installation.
2. Verified numeric repository, issue, PR and author IDs.
3. Published, canonically confirmed escrow funding before the merge.
4. PR merged into the repository's default branch.
5. One supported closing keyword in the PR body referencing exactly one funded issue in that same repository.
6. fundedAt <= mergedAt < workEndsAt, using funding block time and GitHub merge time.
7. Human PR author distinct from the bounty publisher/payer and repository owner.
8. No existing winner, legacy cash promise or conflicting cash mode.
9. No moderation hold when the voucher is issued.

Title-only, sidebar-only, commit-only, cross-repository or ambiguous multiple-funded-issue references are outside automatic cash eligibility. Manual issue closure alone never earns cash. The existing parser is broader; implementation must route both webhook and sync through the stricter cash service.

Confirm the actual issue timeline ClosedEvent.closer identifies the same PR, using a focused GitHub GraphQL read. Retain event ID/time with the award snapshot. A keyword added after merge or a manually closed issue does not establish this evidence.

## Winning allocation

Preserve one winning allocation per issue using a transaction lock and database unique constraint. The MVP winner is the first eligible allocation successfully processed, not a guarantee of earliest GitHub merge time. Later eligible merges may retain baseline points but cannot claim another issue reward.

Freeze verified author, PR ID, closing-reference snapshot, funding block/time and applied rules at allocation. Later PR body edits, username changes, issue reopening, unpublishing or archive actions cannot reassign the winner or withdraw funds before the contract deadline.

## Three independent states

| State family | Values / meaning |
|---|---|
| Contribution | available, awarded, ineligible or moderation hold |
| Escrow | unfunded, funded, settled, refunded |
| Attempt | awaiting_signature, submitted, unknown, failed, verified |

Public badges derive from these records and chain time: awaiting funding, funded, awarded, ready to claim, settling, paid, claim expired/refundable, refunded. Wallet rejection is an attempt failure; it does not make the escrow unfunded. A cash claim expiring does not void earned points.

## Immutable terms and wallet policy

Freeze chain, contract, token, amount_units, payer address/GitHub identity, application reference, bounty ID, workEndsAt and claimUntil before funding instructions. Funding receipt and contract state must match them.

A first payout address needs a one-use signed challenge from the authenticated owner. Existing wallet links are immutable. Preserve them through Privy migration; recovery uses the same address. Do not promise switching to a newly created wallet.

At first voucher issuance, freeze the recipient for that escrow. Expired voucher renewal may change only deadline for the same recipient and terms. Anyone may relay the voucher; the escrow always pays its bound recipient.

## Claim and refund deadlines

The exact MVP policy is:

- workEndsAt is the eligible merge cutoff.
- claimUntil = workEndsAt + seven days, enforced by the contract.
- settle requires funded state and block.timestamp < voucherDeadline <= claimUntil.
- refund requires funded state and block.timestamp >= claimUntil.
- refund always returns to the recorded payer; it can be triggered by anyone.
- no early cancellation or withdrawal is supported.

Display both times before funding and contribution. An off-chain award does not extend the on-chain window. A merged contributor must register, link a wallet and get the claim mined before claimUntil. A transaction broadcast earlier can still expire before mining. If unclaimed, the cash becomes refundable even when points were awarded.

A guarantee of indefinite locked funding after an off-chain award would need an on-chain reservation transition; that is deliberately outside the hackathon contract.

## Duplicate prevention and truth

Use unique delivery ID, points award key, issue winner, contract bounty ID, recipient binding and observed chain+transaction+log index. Contract funded→settled/refunded is a one-way transition.

“Funded” requires exact escrow event plus incoming USDC Transfer. “Paid” requires exact settlement event plus outgoing Transfer. A hash, gateway response, UserOperation submission, approval transaction or points award proves neither.

## Moderation and trust

Moderation may pause new authorization, but cannot revoke an already issued valid voucher or reverse a mined transfer. Claims can still expire under a hold; disclose that operational limit.

The authorization signer is trusted for GitHub eligibility. The contract does not understand PRs; a compromised signer could approve a wrong recipient. Test assets, signer separation and issuance logs limit prototype exposure without making it trustless.
