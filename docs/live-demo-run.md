# Live two-account run

Public GitHub API identities verified October 17, 2026:

- Maintainer: dipesh4000, numeric ID 87355477.
- Contributor: dipesh-BS, numeric ID 288853389.
- Repository: dipesh4000/gitbounty, numeric ID 1374022338, public, default branch main.
- At preflight the repository reported zero open issues, and the production escrow bounty list was empty.

## Fresh test issue

Suggested title: Make public bounty discovery usable without signing in.

Acceptance criteria:

1. A signed-out visitor can read a real published issue directly on GitHub.
2. Search and good-first-issue filtering have clear loading, empty and failure states.
3. Mobile navigation exposes bounty discovery, escrow rewards and maintainer entry points.
4. Funding status, testnet asset, work cutoff and claim deadline are explained before contribution.
5. Keyboard operation and relevant frontend checks pass.

The landing changes developed in this session are a candidate contribution, not a completed live proof. The contributor must author the real PR through their own account. Fund the fresh bounty before that PR merges. Do not fabricate authorship, backdate funding, or reuse an already awarded issue.

## Ordered operator actions

1. Maintainer signs in, installs/connects the GitHub App, and creates the fresh issue.
2. Maintainer opens the app wallet, deposits the intended Fuji test USDC, publishes the issue with points, exact USDC and a future work cutoff, then reviews and confirms sponsored escrow funding. No external wallet signing or user-paid gas is part of this release.
3. Independently verify the deposit before merging any PR. Record the public bounty URL and funding hash.
4. Contributor opens a useful PR with `Closes #<fresh issue>` in the body, targeting main. The owner handles all Git commands and publication.
5. Maintainer reviews and merges before the work cutoff. Process the real delivery, retaining its ID, numeric author identity and closure evidence.
6. Contributor signs in as dipesh-BS, opens their app wallet, and confirms the exact authorized claim with SmoothSend-sponsored gas. Check the recipient binding before signing; preserve any historical issued binding.
7. Check the public settlement page and USDC transfer. Repeat refresh/recovery and confirm no duplicate award or payout.

Record issue URL, PR URL, bounty URL, funding hash, settlement hash, delivery ID and actual ledger totals here after the run. No live reward proof is recorded yet. The app holds encrypted signer keys and signs only the supported server-resolved actions after user confirmation. Never share keys. See managed-wallets.md and escrow-handoff.md for deployment flags and custody limitations.
