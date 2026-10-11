# Product overview

This is the agreed product direction as of 2026-10-10. For implementation status, read [plan.md](plan.md).
The [README](readme.md) is the entry point; this file defines the intended experience.

## The idea

GitBounty connects maintainers with contributors through points rewards attached to GitHub issues.
Maintainers choose the issue and its reward. Contributors work through normal GitHub pull requests.
The reward belongs to the author of an eligible merged PR, not the person who clicks Merge.

The [GitPaid showcase](https://ethglobal.com/showcase/gitpaid-cemw9) is a product-flow reference.
The owner approved Avalanche rewards on 2026-10-10. Each bounty may carry an exact payment promise
chosen before publication, separate from points. Current testing uses official USDC on Avalanche Fuji;
existing native AVAX mainnet promises retain their terms. The organization owner promises and pays each reward
individually; GitBounty neither funds nor guarantees payment. There is no points-to-money conversion.
Wallet and payment execution must use the existing verified-merge eligibility and numeric identity.

## Intended journey

1. A maintainer signs in with GitHub and connects selected repositories through the GitBounty GitHub App.
2. They publish a points bounty on an open issue through GitBounty.
3. A contributor discovers it on the website or sees its registered reward beside the issue on GitHub through the extension.
4. The contributor submits a PR that closes the issue. They do not need a GitBounty account to be eligible.
5. GitHub sends a webhook when the PR merges. GitBounty verifies the merge and reward rules.
6. The reward is allocated to the PR author's stable GitHub numeric ID, including before registration.
7. The contributor signs in with that same GitHub account to create their GitBounty account and claim the allocated points.
8. Their points and contribution history are available through the website and extension.

GitHub App delivery processing, pre-registration allocations and authenticated claims are implemented.
Contributor sync remains available for reconciliation. The complete journey still needs live GitHub verification.

## Product boundaries

- Only GitBounty-registered, published rewards are shown as opportunities. External bounty labels are not rewards.
  The extension displays API-registered rewards only.
- Points recognise contributions and are not redeemable. An explicitly published AVAX promise is separate
  from points; an eligible merge does not mean money has been paid. Published cash terms cannot change.
- The website works independently of the extension. Explore, Create and Leaderboard require GitHub sign-in;
  landing previews and informational pages, including extension setup, remain public.
- Public repositories remain the scope. Adding a GitHub App does not automatically add private-repository support.
- An issue closing alone is not proof of an eligible contribution: validate the merged PR and its author.
- Historical awards remain auditable. Retries, syncs, registration and claims must never duplicate an award.
- GitHub numeric IDs establish identity; account names can change. A claim cannot redirect a reward to another account.

## What remains a product decision

The current 5-point baseline and 1–1000-point bounty bounds remain in place unless explicitly changed.
Do not invent expiry rules for unclaimed points, transfer rights, or automatic financial redemption.
Unclaimed allocations stay off public leaderboards until claimed. The claim screen is in the Points workspace.
Hosting, stronger collusion controls, retention/deletion policy and licensing remain open.

The chosen engineering direction is uv, async SQLAlchemy and GitHub App webhooks.
Numbered SQL migrations remain the current schema workflow; Alembic has not been selected.

The owner selected connected browser wallets for identity and signing, and later required SmoothSend
for all payout execution. Only Avalanche mainnet and Fuji are supported. Owners fund their SmoothSend
smart accounts and pay the provider's fee in USDC (`user-pays-erc20`), additional to the full reward.
Contributors receive funds in their linked browser wallets. Sponsored withdrawals are not implemented.
Wallet links are permanent and keyed by numeric GitHub identity. The server resolves amounts, recipients,
network and nonce from immutable claims. No direct payout fallback, server signing key or escrow exists.
Execution requires migrations through 0016, AVAX_PAYMENTS_ENABLED and a configured public SmoothSend key.
Each owner explicitly reviews and signs the individual UserOperation. Unknown/pending operations stay unpaid.
