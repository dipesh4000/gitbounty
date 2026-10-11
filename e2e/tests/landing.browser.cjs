// Run against a production Next server; API stubs keep this independent of Postgres.
const assert = require("node:assert/strict");
const { chromium } = require("@playwright/test");
const AxeBuilder = require("@axe-core/playwright").default;
const { resolve } = require("node:path");
const { mkdirSync } = require("node:fs");

(async () => {
  const browser = await chromium.launch({ channel: process.env.E2E_BROWSER_CHANNEL || "chrome" });
  const base = process.env.LANDING_TEST_URL || "http://127.0.0.1:3100";
  try {
    mkdirSync(resolve(__dirname, "../test-results"), { recursive: true });
    for (const width of [1440, 768, 375, 320]) {
      const context = await browser.newContext({ viewport: { width, height: 960 }, reducedMotion: "reduce" });
      const page = await context.newPage();
      const errors = [];
      page.on("pageerror", error => errors.push(error.message));
      await page.route("**/api/me", route => route.fulfill({ status: 401, json: {} }));
      await page.route("**/api/issues?*", route => route.fulfill({ json: { items: [] } }));
      await page.goto(base);
      await page.getByText("No bounties have been published yet.").waitFor();
      await page.evaluate(() => document.fonts.ready);
      // Trigger lazy image loading throughout the real page.
      for (const image of await page.locator("img").all()) {
        if (await image.isVisible()) await image.scrollIntoViewIfNeeded();
        await image.evaluate(image => { image.loading = "eager"; return image.decode(); });
      }
      assert.equal(await page.locator("img").evaluateAll(images => images.every(image => image.complete && image.naturalWidth > 0)), true);
      assert.equal(await page.locator("img").evaluateAll(images => images.every(image => !image.currentSrc.includes("/_next/image"))), true);
      assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true, `overflow at ${width}`);
      await page.locator("#flow-tab-0").focus();
      await page.keyboard.press("ArrowDown");
      assert.equal(await page.locator("#flow-value").textContent(), "Contribution in progress");
      await page.locator("#role-contributor").focus();
      await page.keyboard.press("ArrowRight");
      assert.equal(await page.locator("#role-cta").getAttribute("href"), "/login?next=%2Fmaintainers");
      assert.equal(await page.getByRole("link", { name: "Docs", exact: true }).getAttribute("href"), "/docs");
      const audit = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21aa"]).analyze();
      assert.deepEqual(audit.violations.map(v => ({ id: v.id, targets: v.nodes.map(n => n.target) })), [], `axe at ${width}`);
      await page.evaluate(() => scrollTo(0, 0));
      await page.screenshot({ path: resolve(__dirname, `../test-results/landing-${width}.png`), fullPage: true });
      await page.emulateMedia({ reducedMotion: "no-preference" });
      await page.evaluate(() => scrollTo(0, 800));
      assert.equal(await page.locator("#nav").evaluate(el => Math.abs(el.getBoundingClientRect().top) < 1), true, "navigation stays sticky");
      await page.emulateMedia({ reducedMotion: "reduce" });
      await page.waitForFunction(() => [...document.querySelectorAll("[data-speed]")].every(el => getComputedStyle(el).translate === "none"));
      assert.deepEqual(errors, []);
      console.log(`Landing ${width}px: assets, layout, accessibility, tabs, links and reduced motion passed.`);
      await context.close();
    }
  } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
