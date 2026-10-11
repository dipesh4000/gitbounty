// Real Chrome rendering; API and Chrome toolbar APIs are fixtures, never a live wallet.
const assert = require("node:assert/strict");
const { chromium } = require("@playwright/test");
const AxeBuilder = require("@axe-core/playwright").default;
const { resolve } = require("node:path");
const { pathToFileURL } = require("node:url");
const { mkdirSync } = require("node:fs");

(async () => {
  const browser = await chromium.launch({ channel: process.env.E2E_BROWSER_CHANNEL || "chrome" });
  try {
    const context = await browser.newContext({ viewport: { width: 400, height: 600 } });
    const page = await context.newPage();
    const errors = [];
    page.on("pageerror", error => errors.push(error.message));
    await page.addInitScript(() => {
      window.opened = [];
      window.chrome = { tabs: { query: async () => [], create: ({ url }) => window.opened.push(url) },
        runtime: { sendMessage: (_message, callback) => callback?.() } };
      window.fetch = async url => {
        const parsed = new URL(url);
        let body;
        if (parsed.pathname === "/api/me") body = { github_login: "preview-contributor" };
        else if (parsed.pathname.endsWith("/points")) body = { week_points: 45, recent_merges: [] };
        else if (parsed.pathname.endsWith("/claims")) body = { points: 0 };
        else if (parsed.pathname.endsWith("/balance")) body = { address: "0x" + "1".repeat(40), symbol: "USDC", balance: "12.500001",
          native_balance_avax: "0.042", network: "Avalanche Fuji", testnet: true, checked_at: new Date().toISOString() };
        else body = { items: [{ repository: "preview/project", number: 12, title: "Make keyboard navigation work for everyone", language: "TypeScript",
          category: "frontend", stars: 128, points: 40, reward_usdc: "1.25", reward_chain_id: 43113, labels: ["good first issue"] },
          { repository: "preview/docs", number: 7, title: "Write a clearer setup guide", language: "Markdown", category: "docs", stars: 64, points: 30, labels: [] }], has_more: false };
        return { ok: true, status: 200, json: async () => body };
      };
    });
    await page.goto(pathToFileURL(resolve(__dirname, "../../frontend/extension/popup/popup.html")).href);
    await page.getByRole("button", { name: "Account & wallet" }).click();
    await page.locator("#wallet-balance").filter({ hasText: "12.500001 USDC" }).waitFor();
    assert.equal(await page.locator(".discovery-card").count(), 2);
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
    const results = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21aa"]).analyze();
    assert.deepEqual(results.violations.map(v => ({ id: v.id, targets: v.nodes.map(n => n.target) })), []);
    mkdirSync(resolve(__dirname, "../test-results"), { recursive: true });
    await page.screenshot({ path: resolve(__dirname, "../test-results/extension-wallet.png") });
    await page.getByRole("button", { name: "Discover", exact: true }).click();
    const discoveryAudit = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21aa"]).analyze();
    assert.deepEqual(discoveryAudit.violations.map(v => ({ id: v.id, targets: v.nodes.map(n => n.target) })), []);
    await page.evaluate(() => { document.body.scrollTop = 0; window.scrollTo(0, 0); });
    await page.screenshot({ path: resolve(__dirname, "../test-results/extension-discovery.png") });
    await page.locator(".discovery-card a").first().click();
    assert.deepEqual(await page.evaluate(() => window.opened), ["https://github.com/preview/project/issues/12"]);
    await page.getByRole("button", { name: "Open extension menu" }).click();
    await page.keyboard.press("Escape");
    assert.equal(await page.locator("#menu-button").getAttribute("aria-expanded"), "false");
    assert.deepEqual(errors, []);
    console.log(`Extension Chrome rendering, safe navigation, keyboard menu and axe passed (${results.passes.length} checks).`);
  } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
