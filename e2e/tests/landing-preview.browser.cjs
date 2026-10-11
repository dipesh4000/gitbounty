// Standalone supplied design: local assets, responsive layout and its actual interactions.
const assert = require("node:assert/strict");
const { chromium } = require("@playwright/test");
const AxeBuilder = require("@axe-core/playwright").default;
const { resolve } = require("node:path");
const { pathToFileURL } = require("node:url");
const { mkdirSync } = require("node:fs");

(async () => {
  const browser = await chromium.launch({ channel: process.env.E2E_BROWSER_CHANNEL || "chrome" });
  const source = process.argv[2] || resolve(__dirname, "../../frontend/web/landing-preview.html");
  try {
    mkdirSync(resolve(__dirname, "../test-results"), { recursive: true });
    for (const width of [1440, 960, 320]) {
      const context = await browser.newContext({ viewport: { width, height: 960 }, reducedMotion: "reduce" });
      const page = await context.newPage();
      const errors = [], requests = [];
      page.on("pageerror", error => errors.push(error.message));
      page.on("request", request => { if (/^https?:/.test(request.url())) requests.push(request.url()); });
      await page.goto(pathToFileURL(source).href);
      await page.evaluate(() => document.fonts.ready);
      assert.equal(await page.locator("img").evaluateAll(images => images.every(image => image.complete && image.naturalWidth > 0)), true, "all artwork loads");
      assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true, `overflow at ${width}`);
      assert.equal(await page.locator(".nav .btn.primary").evaluate(el => el.getBoundingClientRect().right <= innerWidth), true, "mobile CTA fits");
      const audit = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21aa"]).analyze();
      assert.deepEqual(audit.violations.map(v => ({ id: v.id, targets: v.nodes.map(n => n.target) })), [], `axe at ${width}`);
      await page.screenshot({ path: resolve(__dirname, `../test-results/landing-preview-${width}.png`) });
      await page.locator("#flow-tab-0").focus();
      await page.keyboard.press("ArrowDown");
      await page.waitForFunction(() => document.getElementById("flow-value").textContent === "Contribution in progress");
      assert.equal(await page.locator("#flow-tab-1").getAttribute("aria-selected"), "true");
      await page.locator("#role-contributor").focus();
      await page.keyboard.press("ArrowRight");
      assert.equal(await page.locator("#role-cta").getAttribute("data-preview"), "Create a bounty");
      await page.locator('[data-preview="Terms"]').click();
      assert.match(await page.locator("#dialog-copy").textContent(), /No sign-in is required/);
      await page.keyboard.press("Escape");
      assert.equal(await page.locator("#preview-dialog").evaluate(el => el.open), false);
      await page.evaluate(() => scrollTo(0, 600));
      await page.waitForTimeout(100);
      assert.equal(await page.locator("[data-speed]").evaluateAll(es => es.every(el => getComputedStyle(el).translate === "none")), true);
      await page.emulateMedia({ reducedMotion: "no-preference" });
      await page.evaluate(() => scrollTo(0, 800));
      await page.waitForTimeout(100);
      await page.emulateMedia({ reducedMotion: "reduce" });
      await page.waitForTimeout(100);
      assert.equal(await page.locator("[data-speed]").evaluateAll(es => es.every(el => getComputedStyle(el).translate === "none")), true, "live motion preference changes");
      assert.deepEqual(errors, []);
      assert.deepEqual(requests, [], "standalone preview makes no external requests");
      await context.close();
      console.log(`Landing preview ${width}px: layout, assets, axe, tabs, dialog and reduced motion passed.`);
    }
  } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
