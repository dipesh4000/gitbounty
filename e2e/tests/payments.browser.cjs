// Read-only fixture APIs: verify the real payment screen without signatures or transfers.
const assert = require("node:assert/strict");
const { chromium } = require("@playwright/test");
const AxeBuilder = require("@axe-core/playwright").default;
const { mkdirSync } = require("node:fs");

(async () => {
  const browser = await chromium.launch({ channel: "chrome" });
  const config = { enabled: true, testnet: true, symbol: "USDC", network: "Avalanche Fuji", chain_id: 43113 };
  const base = { ...config, repository: "org/project", review_status: "clear", reward_amount: "2", status: null, claimed_at: null, github_id: 2, issue_number: 1 };
  try {
    mkdirSync("test-results", { recursive: true });
    for (const width of [1440, 960, 320]) {
      const context = await browser.newContext({ viewport: { width, height: 960 } });
      const page = await context.newPage();
      const errors = [];
      page.on("pageerror", error => errors.push(error.message));
      await page.addInitScript(() => {
        window.ethereum = { request: async ({ method }) => method === "eth_accounts" ? ["0x1111111111111111111111111111111111111111"] : [], on() {}, removeListener() {} };
      });
      await page.route("**/api/**", async route => {
        const path = new URL(route.request().url()).pathname;
        const body = path === "/api/me" ? { id: 1, github_id: 1, github_login: "owner" }
          : path === "/api/me/points" ? { total_points: 25 }
          : path === "/api/avax/config" ? config
          : path === "/api/avax/rewards" ? { enabled: true, wallet: "0x1111111111111111111111111111111111111111", payment_config: config, has_more: false,
            owner_promises: [{ ...base, bounty_status: "published", issue_number: 3 }],
            items: [{ ...base, id: 1, is_payer: true, contributor_login: "sam" },
              { ...base, id: 2, issue_number: 2, is_payer: false, claimed_at: "now", payer_login: "alex" }] } : {};
        await route.fulfill({ json: body, headers: { "access-control-allow-origin": route.request().headers().origin || "http://127.0.0.1:3101", "access-control-allow-credentials": "true" } });
      });
      await page.goto(`${process.env.PAYMENTS_WEB_URL || "http://127.0.0.1:3101"}/explore#rewards`);
      await page.getByText("Wallet linked to GitHub", { exact: true }).waitFor();
      await page.getByRole("button", { name: "Check browser connection" }).click();
      await page.getByText("Connected · matches linked wallet", { exact: false }).waitFor();
      assert(await page.getByRole("button", { name: "Waiting for contributor", exact: true }).isDisabled());
      await page.getByRole("button", { name: "Owner payouts", exact: true }).click();
      assert.equal(await page.getByText("Promised by @alex").count(), 0);
      await page.getByRole("button", { name: "Contributor rewards", exact: true }).click();
      await page.getByText("Promised by @alex").waitFor();
      assert.equal(await page.getByText("Pay @sam", { exact: true }).count(), 0);
      await page.getByRole("button", { name: "All activity", exact: true }).click();
      assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), `overflow at ${width}`);
      const audit = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21aa"]).analyze();
      assert.deepEqual(audit.violations.map(v => ({ id: v.id, targets: v.nodes.map(n => n.target) })), []);
      await page.evaluate(() => window.scrollTo(0, 0));
      await page.screenshot({ path: `test-results/payments-${width}.png`, fullPage: true });
      assert.deepEqual(errors, []);
      console.log(`Payments ${width}px: wallet state, roles, next actions, overflow and accessibility passed.`);
      await context.close();
    }
  } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
