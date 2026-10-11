# Browser and accessibility checks

The harness starts the real FastAPI backend, a production website build and a fake GitHub HTTP server.
It uses local Postgres and a gated test sign-in route. It does not prove real GitHub OAuth.

Set up Python/backend and website dependencies using [setup](../docs/setup.md), then from this folder:

```text
npm ci
npx playwright install chromium
npm test
```

The launcher supports Windows and POSIX virtualenv paths and process cleanup.
If bundled Chromium cannot be downloaded, use an installed Chrome or Edge in a fresh test profile:

```powershell
$env:E2E_BROWSER_CHANNEL = "chrome"  # or "msedge"
$env:E2E_DATABASE_URL = "postgresql://gitbounty@127.0.0.1:5440/gitbounty_e2e"
npm test
```

Omit `E2E_BROWSER_CHANNEL` to use bundled Chromium. Set the database URL to your local test instance;
credentials depend on its configuration.

The harness drops/recreates its dedicated `gitbounty_e2e` database.
Never point it at shared or valuable data. It only accepts loopback hosts and simple database names ending in `_e2e`.
Ports: website 3100, API 8101, fake GitHub 8099.

Coverage includes publish → PR lifecycle → merge → award → re-sync → leaderboard,
login-first landing navigation, public extension setup, safe return destinations, test-auth
restrictions, rate limiting and automated accessibility checks. This folder runs only during testing;
it is not shipped in the website bundle.
The test-only login requires the exact test environment and a matching secret.
Keep that configuration out of normal operation.

Accessibility checks use Chromium/axe plus keyboard, focus, reduced-motion and reflow checks.
They do not establish screen-reader usability or complete accessibility.
Current implementation limitations are in [plan](../plan.md).

Standalone UI checks use installed Chrome and need no running backend or database:

```text
npm run test:extension-ui
npm run test:landing-preview
```

The extension check renders the actual popup with fixture API and browser-extension responses;
it does not establish unpacked-extension cookie access or live wallet balances. The landing check
renders `frontend/web/landing-preview.html`, checks desktop/tablet/mobile reflow, local assets,
keyboard tabs, dialogs, reduced motion and axe accessibility. Screenshots are in `test-results`.

With the production website running on port 3100, `node tests/maintainer-recovery.browser.cjs`
checks rejected GitHub authorization and transient retry at three widths using substituted API responses.
Set `RECOVERY_WEB_URL` to check a different local website URL. It does not perform OAuth or touch stored tokens.
