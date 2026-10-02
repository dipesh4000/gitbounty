import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";

import { CONTRIBUTOR, MAINTAINER, WEB_URL } from "../config";
import { issue, pull, repository, setGithubState } from "./github";
import { signIn, syncAndWait } from "./session";

/*
  Measured accessibility, not asserted good intentions.

  axe-core is run against every user-facing page, on the real production build, and the result is a count
  of actual violations rather than a claim. Alongside it are keyboard checks that axe cannot make: whether
  a page can be operated without a mouse, and whether focus is visible while doing it.

  axe finds roughly a third to a half of WCAG problems in practice. A clean run is evidence that a
  specific set of machine-checkable rules passes -- it is not a statement that the product is accessible,
  and docs/accessibility.md says so.
*/

const WCAG = ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"];

async function audit(page: Page, name: string) {
  const results = await new AxeBuilder({ page }).withTags(WCAG).analyze();
  if (results.violations.length) {
    console.log(`\n[a11y] ${name}: ${results.violations.length} violation(s)`);
    for (const violation of results.violations) {
      console.log(`  ${violation.impact}  ${violation.id}: ${violation.help}`);
      for (const node of violation.nodes.slice(0, 3)) {
        console.log(`      ${node.target.join(" ")}`);
      }
    }
  } else {
    console.log(`[a11y] ${name}: no violations (${results.passes.length} checks passed)`);
  }
  return results;
}

/** What is focused right now, described the way a person would. */
async function focused(page: Page) {
  return page.evaluate(() => {
    const element = document.activeElement as HTMLElement | null;
    if (!element || element === document.body) return null;
    const style = getComputedStyle(element);
    return {
      tag: element.tagName.toLowerCase(),
      name: (element.getAttribute("aria-label") ?? element.textContent ?? "").trim().slice(0, 40),
      // A visible focus ring: an outline, or a box-shadow standing in for one.
      hasVisibleFocus:
        (style.outlineStyle !== "none" && parseFloat(style.outlineWidth) > 0) ||
        style.boxShadow !== "none",
    };
  });
}

// --- the public pages ---------------------------------------------------------

test.describe("public pages", () => {
  test.beforeAll(async () => {
    await setGithubState({
      repositories: [repository()],
      issues: [issue(12, "Keyboard navigation skips the filter chips")],
      pulls: [],
      reviews: {},
      files: {},
    });
  });

  for (const path of ["/", "/explore", "/leaderboard", "/maintainers", "/docs", "/extension",
                      "/status", "/privacy", "/terms", "/contributors", "/how-it-works"]) {
    test(`${path} has no axe violations`, async ({ page }) => {
      await page.goto(`${WEB_URL}${path}`);
      await page.waitForLoadState("networkidle");
      const results = await audit(page, path);
      expect(results.violations, JSON.stringify(results.violations.map((v) => v.id))).toEqual([]);
    });
  }

  test("the 404 page has no axe violations", async ({ page }) => {
    await page.goto(`${WEB_URL}/this-page-does-not-exist`);
    const results = await audit(page, "404");
    expect(results.violations, JSON.stringify(results.violations.map((v) => v.id))).toEqual([]);
  });

  test("the landing page has exactly one h1 and no skipped heading levels", async ({ page }) => {
    await page.goto(WEB_URL);
    const levels = await page.evaluate(() =>
      [...document.querySelectorAll("h1,h2,h3,h4,h5,h6")].map((h) => Number(h.tagName[1])));

    expect(levels.filter((level) => level === 1)).toHaveLength(1);
    for (let index = 1; index < levels.length; index += 1) {
      expect(levels[index] - levels[index - 1], `after h${levels[index - 1]}`).toBeLessThanOrEqual(1);
    }
  });

  test("the landing page can be reached and operated from the keyboard", async ({ page }) => {
    await page.goto(WEB_URL);
    await page.keyboard.press("Tab");

    const first = await focused(page);
    expect(first, "something takes focus on the first Tab").not.toBeNull();
    expect(first!.hasVisibleFocus, `focus on <${first!.tag}> "${first!.name}" is invisible`).toBe(true);

    // Twenty tabs without landing on something unfocusable or losing the ring.
    for (let step = 0; step < 20; step += 1) {
      await page.keyboard.press("Tab");
      const current = await focused(page);
      if (!current) continue;
      expect(current.hasVisibleFocus, `focus on <${current.tag}> "${current.name}" is invisible`).toBe(true);
    }
  });

  test("every control has an accessible name", async ({ page }) => {
    await page.goto(WEB_URL);
    const unnamed = await page.evaluate(() =>
      [...document.querySelectorAll("button, a[href], input, select, textarea")]
        .filter((element) => {
          const label = element.getAttribute("aria-label")
            ?? element.getAttribute("title")
            ?? (element as HTMLElement).innerText
            ?? "";
          const labelled = element.id && document.querySelector(`label[for="${element.id}"]`);
          const wrapped = element.closest("label");
          return !label.trim() && !labelled && !wrapped;
        })
        .map((element) => element.outerHTML.slice(0, 120)));

    expect(unnamed, `unnamed controls:\n${unnamed.join("\n")}`).toEqual([]);
  });

  test("motion is suppressed when reduced motion is preferred", async ({ browser }) => {
    const context = await browser.newContext({ reducedMotion: "reduce" });
    const page = await context.newPage();
    await page.goto(WEB_URL);

    const moving = await page.evaluate(() =>
      [...document.querySelectorAll("*")].filter((element) => {
        const style = getComputedStyle(element);
        const duration = (value: string) =>
          value.split(",").some((part) => parseFloat(part) > 0);
        return duration(style.transitionDuration) || duration(style.animationDuration);
      }).length);

    expect(moving, "elements still animating under prefers-reduced-motion").toBe(0);
    await context.close();
  });

  test("the page reflows at 320px and under 200% zoom without horizontal scrolling", async ({ browser }) => {
    for (const [width, height, label] of [[320, 800, "320px"], [640, 400, "200% zoom (1280 at 200%)"]] as const) {
      const context = await browser.newContext({ viewport: { width, height } });
      const page = await context.newPage();
      await page.goto(WEB_URL);
      await page.waitForLoadState("networkidle");

      const overflow = await page.evaluate(() =>
        document.documentElement.scrollWidth - document.documentElement.clientWidth);
      expect(overflow, `horizontal overflow at ${label}`).toBeLessThanOrEqual(0);
      await context.close();
    }
  });
});

// --- the signed-in pages --------------------------------------------------------

test.describe("the signed-in workspace", () => {
  test("every view has no axe violations", async ({ browser }) => {
    await setGithubState({
      repositories: [repository()],
      issues: [issue(12, "Keyboard navigation skips the filter chips")],
      pulls: [pull(77, { author: CONTRIBUTOR.github_login, state: "closed", mergedAt: "2026-09-25T12:00:00Z" })],
      reviews: {},
      files: {},
    });

    const context = await browser.newContext();
    const { csrf_token: csrf } = await signIn(context, CONTRIBUTOR);
    await syncAndWait(context.request, csrf, { full: true });
    const page = await context.newPage();
    await page.goto(`${WEB_URL}/explore`);

    const violations: string[] = [];
    for (const view of ["Opportunities", "My repositories", "My PRs", "Points", "Leaderboard"]) {
      await page.getByRole("button", { name: view }).click();
      await page.waitForLoadState("networkidle");
      const results = await audit(page, view);
      violations.push(...results.violations.map((v) => `${view}: ${v.id}`));
    }

    expect(violations, violations.join("\n")).toEqual([]);
    await context.close();
  });

  test("the publish form has no axe violations and every field is labelled", async ({ browser }) => {
    await setGithubState({
      repositories: [repository()],
      issues: [issue(12, "Keyboard navigation skips the filter chips")],
      pulls: [], reviews: {}, files: {},
    });

    const context = await browser.newContext();
    await signIn(context, MAINTAINER);
    const page = await context.newPage();
    await page.goto(`${WEB_URL}/explore`);
    await page.getByRole("button", { name: "My repositories" }).click();
    await page.getByRole("button", { name: "Choose issues" }).click();
    await page.getByRole("checkbox").first().check();

    const results = await audit(page, "publish form");
    expect(results.violations, JSON.stringify(results.violations.map((v) => v.id))).toEqual([]);

    // Each field carries a name, which is what a screen reader announces.
    for (const role of ["checkbox", "spinbutton", "combobox"] as const) {
      const control = page.getByRole(role).first();
      const name = await control.evaluate((element) => {
        const wrapper = element.closest("label");
        return (element.getAttribute("aria-label") ?? wrapper?.textContent ?? "").trim();
      });
      expect(name, `the ${role} has no accessible name`).not.toBe("");
    }
    await context.close();
  });

  test("the publish flow can be completed with the keyboard alone", async ({ browser }) => {
    await setGithubState({
      repositories: [repository()],
      issues: [issue(12, "Keyboard navigation skips the filter chips")],
      pulls: [], reviews: {}, files: {},
    });

    const context = await browser.newContext();
    await signIn(context, MAINTAINER);
    const page = await context.newPage();
    await page.goto(`${WEB_URL}/explore`);

    // Tab to "My repositories" and activate it with the keyboard.
    for (let step = 0; step < 12; step += 1) {
      await page.keyboard.press("Tab");
      const current = await focused(page);
      if (current?.name === "My repositories") break;
    }
    expect((await focused(page))?.name).toBe("My repositories");
    await page.keyboard.press("Enter");
    await expect(page.getByRole("button", { name: "Choose issues" })).toBeVisible();

    for (let step = 0; step < 20; step += 1) {
      await page.keyboard.press("Tab");
      const current = await focused(page);
      if (current?.name === "Choose issues") break;
    }
    expect((await focused(page))?.name).toBe("Choose issues");
    await page.keyboard.press("Enter");

    // The checkbox can be reached and ticked with the space bar.
    const checkbox = page.getByRole("checkbox").first();
    await expect(checkbox).toBeVisible();
    await checkbox.focus();
    await page.keyboard.press("Space");
    await expect(checkbox).toBeChecked();

    await context.close();
  });

  test("loading and empty states are announced, not only drawn", async ({ browser }) => {
    await setGithubState({ repositories: [], issues: [], pulls: [], reviews: {}, files: {} });

    const context = await browser.newContext();
    await signIn(context, CONTRIBUTOR);
    const page = await context.newPage();
    await page.goto(`${WEB_URL}/explore`);
    await page.getByRole("button", { name: "My PRs" }).click();
    await page.waitForLoadState("networkidle");

    // Something on the page carries a live region, so a change is spoken rather than silently rendered.
    const liveRegions = await page.locator("[aria-live]").count();
    expect(liveRegions, "no aria-live region on a view whose content arrives asynchronously")
      .toBeGreaterThan(0);
    await context.close();
  });

  test("the tables are real tables to a screen reader, or explicitly not tables", async ({ browser }) => {
    const context = await browser.newContext();
    await signIn(context, CONTRIBUTOR);
    const page = await context.newPage();
    await page.goto(`${WEB_URL}/explore`);
    await page.waitForLoadState("networkidle");

    // The grid is built from divs. axe would object to a half-table -- role="table" with no row or cell
    // roles -- so the honest choice is to carry no table semantics at all and let each row read as text.
    const halfTables = await page.evaluate(() =>
      [...document.querySelectorAll('[role="table"], [role="grid"]')]
        .filter((table) => !table.querySelector('[role="row"]'))
        .length);
    expect(halfTables, "an element claims to be a table but has no rows").toBe(0);
  });
});
