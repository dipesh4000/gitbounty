# GitBounty browser extension

Optional Manifest V3 extension for Chrome, Brave and Edge. The website works without it.
The implementation targets the local API and is not store-published.

## Current behavior

- Adds published GitBounty point values and categories beside matching GitHub issues.
- Adds a reward banner to supported PR pages containing a closing reference.
- Discover view: search published issue titles, filter language/category or maintainer-labeled good first issues,
  sort by update/stars, and page through results. Cards open GitHub and show points separately from promises.
- Account & wallet view: real linked-wallet balance on the configured Avalanche network, native gas balance,
  points, recent activity, tracked issue context, and links to claim points or manage payments on the website.
- Discovery works while signed out. Account and balance reads require the real GitBounty session.
  Private data is fetched fresh; an unavailable balance is not displayed as zero.
- Ignores label-only rewards; only registered API data creates a badge.
- Refreshes visible pages every 30 seconds and on navigation/visibility changes; removes stale badges and banners.
  API caching can delay a change until a later refresh; this is polling, not instant push.

External dollar bounty labels are not supported. Discovery lists only open, published GitBounty bounties,
not all GitHub issues or the Good First Issue site's index. The beginner filter recognizes case-insensitive
`good first issue`, `good-first-issue`, `good first contribution`, and `good-first-contribution` labels.
Maintainers supply these labels; they do not verify difficulty, availability or a guaranteed payment.

Wallet balances are for the permanent linked receiving EOA, not the owner's SmoothSend funding smart account.
Fuji balances are explicitly test tokens with no monetary value. Payments and wallet linking stay on the
website; payouts require SmoothSend, while wallet linking uses an ownership signature. The extension
never signs or sends funds and requests no new permissions.
Webhook processing and pre-registration claims are backend features; the extension links claims to the website.

## Run

Start the backend and website using [setup](../../docs/setup.md).
Open the browser's extensions page, enable Developer mode and load this folder unpacked.
Publish a bounty, then open that repository's GitHub issue list.
Reload the extension and GitHub tab after changing files.

From this folder, install test dependencies and check:

```text
npm ci
npm run check
```

Real-browser checks should include issue lists/details, navigation without reload, PR banners,
signed-in/out popup, API failure, and an edited/unpublished bounty.
DOM fixture tests do not prove compatibility with GitHub's current page structure.

## Files and permissions

- `manifest.json`: permissions and page matching.
- `src/content.js`, `src/points.js`: inspect GitHub pages and insert badges.
- `src/background.js`: API requests and a 30-second repository cache.
- `src/config.js`: API and website URLs.
- `popup/`: account points, activity and issue context.

`activeTab` supports inspecting the current tab when the popup is opened.
The only API host permission is localhost:8001; content scripts match GitHub issue/PR URLs.
No secrets or remotely loaded executable code belong here.
[Plan](../../plan.md) tracks refresh and distribution work.

## Check the new popup

Run `npm run test:extension-ui` from `e2e/` after installing its test dependencies. It renders the actual
popup in Chrome, checks both views with axe, and exercises navigation. Chrome APIs and API responses are
fixtures; this does not prove unpacked-extension cookie access or a real wallet balance.

For the manual run: reload this unpacked extension, start the API/site, and reopen its toolbar popup.
Discover should show real published issues before login. Try a beginner label, filters, Next/Previous,
empty results and an unavailable API. Sign in through Account & wallet, then reopen the popup. Compare
its username and linked address with the website. Refresh balance and compare the active Fuji token/native
balances with the explorer. Link a wallet on the website if none exists. Sign out and confirm private data
is hidden while public discovery remains available. Sign out errors must leave a retry message.
