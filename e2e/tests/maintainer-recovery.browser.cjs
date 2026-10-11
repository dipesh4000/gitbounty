// Production website rendering with rejected/transient GitHub responses substituted locally.
const assert = require("node:assert/strict");
const { chromium } = require("@playwright/test");
const AxeBuilder = require("@axe-core/playwright").default;
const { mkdirSync } = require("node:fs");

(async () => {
  const browser = await chromium.launch({ channel: process.env.E2E_BROWSER_CHANNEL || "chrome" });
  try {
    for (const width of [1440, 960, 320]) {
      const context = await browser.newContext({ viewport: { width, height: 960 } });
      const page = await context.newPage();
      let rejected = true, repositoryReads = 0;
      const errors = [];
      page.on("pageerror", error => errors.push(error.message));
      await page.route("**/api/**", async route => {
        const path = new URL(route.request().url()).pathname;
        let status = 200, body = {};
        if (path === "/api/me") body = { id: 1, github_id: 1, github_login: "owner", name: null, avatar_url: null };
        else if (path === "/api/me/points") body = { total_points: 0 };
        else if (path === "/api/avax/config") body = { enabled: false, testnet: true, symbol: "USDC", chain_id: 43113 };
        else if (path === "/api/github-app") body = { configured: true, install_url: "https://github.com/apps/gitbounty/installations/new", repositories: [] };
        else if (path === "/api/maintainer/repositories") {
          repositoryReads++;
          status = rejected ? 401 : 502;
          body = { detail: rejected ? "Sign in with GitHub again." : "GitHub could not be read. Try again." };
        }
        await route.fulfill({ status, contentType: "application/json", headers: { "access-control-allow-origin": route.request().headers().origin || "http://127.0.0.1:3100", "access-control-allow-credentials": "true" }, body: JSON.stringify(body) });
      });
      await page.goto(`${process.env.RECOVERY_WEB_URL || "http://127.0.0.1:3100"}/maintainers`);
      const reconnect = page.getByRole("link", { name: "Reconnect GitHub", exact: true });
      await reconnect.waitFor();
      assert.match(await reconnect.getAttribute("href"), /\/auth\/github\?next=%2Fmaintainers$/);
      assert.equal(await page.getByRole("button", { name: "Try again" }).count(), 0);
      assert.equal(await page.locator(".bounty-repo-table").count(), 0);
      assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
      await reconnect.focus();
      assert(await reconnect.evaluate(el => getComputedStyle(el).outlineStyle !== "none"));
      const audit = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21aa"]).analyze();
      assert.deepEqual(audit.violations.map(v => ({ id: v.id, targets: v.nodes.map(n => n.target) })), []);
      mkdirSync("test-results", { recursive: true });
      await page.evaluate(() => window.scrollTo(0, 0));
      await page.waitForTimeout(150);
      await page.screenshot({ path: `test-results/maintainer-recovery-${width}.png`, fullPage: true });
      rejected = false;
      await page.getByRole("button", { name: "Refresh", exact: true }).click();
      const retry = page.getByRole("button", { name: "Try again", exact: true });
      await retry.waitFor();
      const beforeRetry = repositoryReads;
      await retry.click();
      await retry.waitFor();
      assert(repositoryReads > beforeRetry);
      assert.deepEqual(errors, []);
      console.log(`Maintainer recovery ${width}px: reconnect, retry, reflow, focus and axe passed.`);
      await context.close();
    }
  } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
