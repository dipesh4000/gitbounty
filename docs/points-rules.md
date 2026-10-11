# Points and reward ownership

Product intent is in [overview.md](../overview.md); implementation progress is in [plan.md](../plan.md).

## Ownership and claim behavior

An eligible reward belongs to the PR author's stable GitHub numeric ID, whether or not they have registered
with GitBounty. Account creation is not a condition of earning it.

To claim, the contributor must sign in with that same GitHub account and create their GitBounty account.
Claiming preserves the original reward and its evidence and cannot produce a second award.
A renamed GitHub login must not lose ownership; another user cannot claim by supplying a login or numeric ID.

`reward_allocations` stores claimed and unclaimed rewards independently of registered accounts.
The website shows pending allocations and claims them into the ledger; the extension links to that screen.
Only claimed points enter public leaderboards. No expiry policy is implemented.
“Claim” means claiming points, not withdrawing cash.

## Rules enforced today

Rule version: `points-v1`, defined in [rules.py](../backend/app/features/points/rules.py).
These numbers are current behavior, not newly chosen in the documentation cleanup.

| Rule | Current behavior |
|---|---|
| Bounty | 1–1000 points, published by an authenticated maintainer with admin/maintain permission |
| Baseline | 5 points for an eligible merged PR in a repository with a published bounty |
| Recipient | PR author, not the person who clicks Merge |
| Eligible state | Merged; draft, open, reviewed, approved and closed-unmerged earn nothing |
| Own repository | A PR authored into the author's own repository earns nothing |
| Own bounty | A maintainer cannot earn their own published bounty; baseline may still apply |
| Multiple PRs for one bounty | One bounty award ever; current implementation credits whichever eligible sync records first |
| One PR closing multiple bounties | First matching bounty only |
| Re-sync | No duplicate award |
| Repricing after an award | Recorded award remains unchanged |
| Correction | Append an adjustment or withdrawal with a reason; never edit the original award |

An eligible 40-point bounty merge in a participating repository normally earns 40 bounty points plus 5 baseline points.
Categories are `frontend`, `backend`, `fullstack`, `docs`, `testing`, `devops`, `design`, `mobile`, `other`.
The maintainer's category is authoritative for bounty awards.

## Registered rewards only

Only a published GitBounty bounty creates a bounty reward.
A GitHub label alone never awards points. Labels currently suggest values in the maintainer form.
The extension displays registered API rewards only; it does not turn GitHub labels into badges.

## Audit and moderation

The append-only `points_ledger` stores amount, rule version, PR, bounty, category and reason.
`reward_allocations` preserves the GitHub identity and evidence before a user exists.
Totals and leaderboards sum entries; database uniqueness constraints prevent repeat awards.
Unpublishing stops future eligibility without erasing past awards.

Signed-in users can report a bounty, PR or award.
Administrators configured by `ADMIN_GITHUB_IDS` can review/resolve reports;
withdrawing writes a negative `void` entry. An empty administrator list grants nobody access.
There is no moderation UI.

No automated collusion or reverted-merge detection exists. Other implementation gaps are maintained in the plan.
