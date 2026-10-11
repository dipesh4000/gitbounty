# Complete website test with your two GitHub accounts

Use **A as owner** and **B as contributor** throughout. No third account is needed.
The payment test uses official Circle USDC on **Avalanche Fuji, chain 43113**.
Test tokens have no monetary value. GitBounty never funds or guarantees an owner's promise.

## Choose where to test

The live website is `https://gitbounty-web.vercel.app`. On 2026-10-11, read-only checks confirmed
`/ready` is healthy, public bounties load, GitHub sign-in starts with the production callback,
and `/api/avax/config` reports SmoothSend enabled on Avalanche Fuji (43113). These checks do not
prove that GitHub login completes, webhooks are processed, or a payment succeeds.

For the deployed run, use the live website in both profiles. Allow
`https://gitbounty-web.vercel.app` as an origin in the SmoothSend dashboard, and set the production
backend variables described in [deployed GitHub configuration](setup.md#deployed-github-configuration).
Use a fresh repository and issues; the existing public bounty list contains other real rewards.
Verify the GitHub App webhook URL and event delivery in GitHub settings before relying on webhooks.

For a local run, use `start.bat`, `http://localhost:3000`, and the ignored `backend/.env` settings
below. A public HTTPS tunnel is needed for local webhook deliveries. Apply migrations through 0016
to a local throwaway database; shared targets require owner approval. The manual steps below work
in either environment after sign-in and payment configuration are complete.

## Prepare once

1. Use two browser profiles: A signed into GitHub and GitBounty in one, B in the other.
   Switching GitHub accounts alone does not change GitBounty's session. Check each workspace username.
   Select distinct browser-wallet accounts for A and B. Wallet links are permanent.
   Payments offers a browser-wallet selector and **Connect receiving / payer wallet** before rewards
   exist. Finish setup/unlock in the chosen wallet first; do not reset an old wallet without its recovery phrase.
2. For a local run, configure ignored `backend/.env` as described in [setup](setup.md#avalanche-payments-through-smoothsend):

   ```dotenv
   AVAX_PAYMENTS_ENABLED=true
   PAYMENT_MODE=usdc_fuji
   SMOOTHSEND_PUBLIC_KEY=your_dashboard_pk_nogas_key
   SMOOTHSEND_SECRET_KEY=your_dashboard_sk_nogas_key
   SMOOTHSEND_FEE_LIMIT_USDC=0.1
   ```

   Use the public `pk_nogas_…` key for the browser and secret `sk_nogas_…` key only on the backend;
   allow the exact website origin `http://localhost:3000` in SmoothSend.
   The selected mode is **user-pays-erc20**: the owner pays fees in USDC. Never put a secret key in the browser.
   For the deployed run, set corresponding Vercel backend variables and redeploy; use its HTTPS origin
   in SmoothSend. Do not put these backend settings in `NEXT_PUBLIC_` variables.
3. Open the chosen website's `/explore` page in both profiles, and confirm Payments says
   **USDC / Avalanche Fuji** and test mode. Missing configuration disables wallet actions.
4. A creates a fresh public repository `gitbounty-flow-test` with README and Issues enabled. B forks it.
   B authors PRs against A's repository, and A merges into its default branch. Record B's starting points.
5. For webhook testing, A installs the GitBounty GitHub App and connects this repository in Create a bounty.
   GitHub needs a public HTTPS webhook URL; use the deployed URL in setup or a tunnel for a local API.
   Confirm GitHub shows a successful webhook delivery. If webhooks are unavailable or delayed,
   use **B → My PRs → Sync GitHub** after merging. Automated E2E tests substitute GitHub.

## Create these issues in A's repository

Record actual issue numbers; do not assume they start at #1. Use Documentation or the closest category.

| Issue title | Work requested | Publish | Expected result |
|---|---|---|---|
| Add a getting-started example | Add three usage lines to README | 40 points + **1.25 USDC** | B's merged PR: +45 points and one payment reward |
| Fix a README spelling mistake | Correct a deliberate typo | 30 points, no payment | B's merged PR: +35 points, no payment |
| Add a troubleshooting note | Explain one setup error | 20 points, no payment | Unpublish before merge: +5 baseline only |
| Explain supported browsers | Add one sentence to README | 10 points, no payment | Archive before merge: +5 baseline only |
| Add a keyboard shortcut note | Document one shortcut | 15 points, no payment | Close without merged PR: +0 points |

## A: publish and inspect

1. **Create a bounty → choose repository → select issues & rewards**. Select the five issues and enter
   the values above. Put `1.25` in the first issue's optional USDC promise field.
2. Try points `0` and `1001`, and USDC `1.0000001`: invalid values must block review. Restore valid values.
   Review must show selected issues, points, category and payment before anything is published.
3. Publish once. Check **My published bounties** and History. Cash amount, chain and original payer are
   fixed at first publication. Existing points-only bounties cannot gain cash retroactively; use fresh issues.
4. In both profiles, Explore shows separate points and USDC. Check search, language/category filters,
   sorting, pagination and Refresh. Public listings may be cached for 30 seconds. Refresh bypasses the
   cache; publishing invalidates it. Identity, claims and payment data are never cached.
5. B must not be able to publish on A's repository without actual GitHub maintainer permission.
   B must not see A's private account data or be able to authorize A's payout.

## B then A: verify the cash-reward merge

1. B makes the usage-example change in B's fork and opens a PR against A's default branch.
   Include `Closes A_LOGIN/gitbounty-flow-test#ACTUAL_ISSUE_NUMBER` in the PR body, replacing placeholders.
   A Development-sidebar link alone is insufficient.
2. While draft/open, sync B's My PRs: no final award/payment should exist yet.
3. A reviews and merges. Wait for the webhook or sync B's My PRs. The author must be B, with
   **45 awarded points**: 40 bounty + 5 baseline. Claim any pending allocation from B's Points view.
4. B's total changes by 45 once. Both Payments views show one **1.25 USDC / Avalanche Fuji** reward,
   B as recipient and A as payer. Repeat sync and refresh: no duplicate award or reservation.

If B has never signed into GitBounty, optionally merge before B's first login, then sign in and claim.
If B already has an account, skip that first-registration case. Two existing accounts cannot test a
new registration again; do not delete account records or introduce a third account for this guide.

## B: claim the payment

Choose B's intended receiving wallet, then **Payments → Connect wallet and claim**. Review and sign
its identity message: this sends no funds and needs no gas. Check the permanent linked address.
The claim becomes recorded, waiting for the owner. Claiming does not mean money was transferred.

## A: fund and pay through SmoothSend

1. Select A's payer wallet and choose **Payments → Review payment**. Prove A's wallet if prompted.
   The review displays a **Funding address** for A's SmoothSend smart account. It differs from A's
   connected browser-wallet address; payment funds must be in that smart account on Fuji.
2. Obtain official test USDC from the [Circle faucet](https://faucet.circle.com/) for that funding
   address, or transfer test USDC there. For this example, provide at least **1.35 USDC**: 1.25 reward
   plus the configured 0.1 USDC fee allowance. Funding from an ordinary wallet needs Fuji AVAX gas
   for that separate transfer. USDC contract: `0x5425890298aed601595a70AB815c96711a31Bc65`, six decimals.
3. If the quote failed before funding, choose **Refresh fee quote**. Verify **1.25 USDC**, **Avalanche Fuji**,
   B's receiving address, A's funding address, quoted fee and allowance. Fees are additional to the
   full reward, paid by A in USDC. A quote exceeding the allowance blocks signing.
4. Choose **Confirm in wallet**. A signs an ERC-4337 UserOperation, and SmoothSend submits it.
   There is no direct payout fallback. Use **Verify payment** until **Paid and verified**.
5. Open the explorer transaction: B must receive exactly **1.25 USDC** from the smart account.
   SmoothSend's fee is charged separately to A. Pending/unknown operations must remain unpaid.
6. Refresh both profiles and verify/sync again: still one reward, one successful payout, no extra points.
   The **UserOperation hash** differs from the explorer **transaction hash**; recovery uses the operation hash.

Rejecting a signature sends nothing. Reopen Review to continue. After a timeout/reload, verify first;
**Resubmit same signed operation** reuses the stored signature and nonce. Do not manually send a
replacement reward. Only a verified failed operation permits a new attempt. Complete the unfinished
payment before starting another one from A's wallet.

B can optionally send the received test USDC using the browser wallet's Send action. B's ordinary
receiving wallet needs Fuji AVAX for that separate transaction; sponsored withdrawals are not implemented.

## Finish the other cases

1. B authors/A merges the spelling fix with its explicit closing reference: **+35 points**, no cash.
   A unpublishes issue three and archives issue four **before** their PRs merge: **+5 points each**.
   A closes issue five without a PR: **+0 points**. Across the four eligible PRs above, B gains **90 points**.
2. A authors a separate PR against A's own repository: no eligible award. Keep this out of B's totals.
   Unmerged PRs, manual issue closure and repeated syncs must not grant a bounty.
3. Check B's Points history and leaderboard against the starting total. Every award has a source/reason.
   Test leaderboard category/time filters, empty states and error retry controls.
4. Select a wrong payer wallet: refused. Payment must use Fuji; a mainnet promise cannot be relabeled
   as test USDC. Missing SmoothSend configuration must disable payment with no direct-transfer control.
5. Sign out and refresh: account views require login. Sign back in and confirm identities and wallet links.
6. At 320px and desktop width visit Explore, Create, My PRs, Points, Payments and Leaderboard. Use
   keyboard Tab/Enter, skip link and mobile navigation. Check readable labels/addresses and no page-wide overflow.
7. If using the extension, reload it and the GitHub issue tab: only published API rewards get badges.
8. Close an issue without merging a PR, then sync: it leaves Explore and earns zero points. Reopen
   it and sync: its published bounty returns. With Issues events enabled, repeat using verified
   webhook delivery. Check sync elapsed/completion seconds and server `sync.succeeded` timing fields.
   PR/payment reads refresh on focus and every 30 seconds while visible; those reads do not run GitHub sync.

## Record and stop

Record issue/PR numbers, starting/final points, public wallet addresses, operation hash, explorer link,
and any failed step. Never record private keys, cookies or tokens. This manual run proves the live
integration; automated tests simulate wallets/chain responses and do not send money.
For a local run, stop backend/frontend terminals and the webhook tunnel afterward; see [setup](setup.md#stop-after-testing).

| Problem | Next action |
|---|---|
| Payments disabled | Check public key, flag, mode, migrations and API restart |
| Quote fails | Check dashboard origin/network, smart-account USDC balance and SmoothSend's error |
| Reward missing | Check B authorship, closing reference, publication, webhook/sync |
| Baseline only | Bounty was unavailable/ineligible or closing reference was not detected |
| Payment pending | Verify saved UserOperation hash; resubmit the same saved operation if needed |
| Mainnet reward in Fuji mode | Original terms stay fixed; create a fresh Fuji bounty |
