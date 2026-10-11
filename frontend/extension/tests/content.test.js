/*
  The content script, against DOM fixtures.

  The content script runs inside github.com, so it is tested the same way: a jsdom document shaped like
  a GitHub issue list or pull request page, a stubbed chrome.runtime that answers the way the background
  worker would, and then assertions about what was injected.
*/
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { JSDOM } = require("jsdom");
const windows = [];
test.afterEach(() => { for (const window of windows.splice(0)) window.close(); });

const CONTENT = fs.readFileSync(path.join(__dirname, "../src/content.js"), "utf8");
const POINTS = fs.readFileSync(path.join(__dirname, "../src/points.js"), "utf8");

const bounty = (number, points, category = "frontend", title = "Tracked issue") =>
  ({ repository: "openframe/core", number, points, category, title });

/**
 * Load a fixture at `url` with `items` as the background worker's answer, run the content script, and
 * return the window plus a record of what was asked for.
 */
async function mount({ fixture, url, items = [], ok = true }) {
  const html = fs.readFileSync(path.join(__dirname, fixture), "utf8")
    // The fixture loads the scripts itself when opened in a browser; here they are injected by hand.
    .replace(/<script src="[^"]*"><\/script>/g, "");

  const dom = new JSDOM(html, { url, runScripts: "outside-only", pretendToBeVisual: true });
  const { window } = dom;
  windows.push(window);
  const requests = [];

  window.chrome = {
    runtime: {
      lastError: null,
      sendMessage(message, callback) {
        requests.push(message);
        // Asynchronous, like the real one, so a synchronous first scan cannot see the answer.
        window.setTimeout(() => callback({ ok, items, viewer: "maya-dev" }), 0);
      },
      onMessage: { addListener(listener) { window.__gitbountyMessageListener = listener; } },
    },
  };

  window.eval(POINTS);
  window.eval(CONTENT);
  await settle(window);
  return { window, document: window.document, requests, dom, setItems(next) { items = next; } };
}

/** The script debounces scans by 100ms and the stubbed response resolves on a timer. */
function settle(window, ms = 400) {
  return new Promise((resolve) => window.setTimeout(resolve, ms));
}

const badges = (document) => [...document.querySelectorAll(".gitbounty-points-badge")];
const badgeFor = (document, number) =>
  document.querySelector(`.gitbounty-points-badge[data-gitbounty-issue-number="${number}"]`);

test("badges an issue the API reports as a published bounty", async () => {
  const { document } = await mount({
    fixture: "fixture.html",
    url: "https://github.com/openframe/core/issues",
    items: [bounty(1857, 60, "backend", "Typed events")],
  });

  const badge = badgeFor(document, 1857);
  assert.ok(badge, "#1857 is badged");
  assert.equal(badge.getAttribute("data-gitbounty-source"), "api");
  assert.equal(badge.getAttribute("data-gitbounty-points-badge"), "60");
  assert.match(badge.textContent, /60/);
  assert.match(badge.textContent, /GitBounty/);
  assert.match(badge.textContent, /Backend/);
});

test("does not badge an issue the API does not report, even on the same page", async () => {
  const { document } = await mount({
    fixture: "fixture.html",
    url: "https://github.com/openframe/core/issues",
    items: [bounty(1857, 60, "backend")],
  });

  assert.equal(badgeFor(document, 1850), null, "#1850 has no bounty and no label");
});

test("matches the repository case-insensitively but the issue number exactly", async () => {
  const { document } = await mount({
    fixture: "fixture.html",
    url: "https://github.com/openframe/core/issues",
    items: [
      { repository: "OpenFrame/CORE", number: 1857, points: 25, category: "docs", title: "Docs" },
      { repository: "openframe/core", number: 18570, points: 999, category: "other", title: "Not this one" },
    ],
  });

  assert.equal(badgeFor(document, 1857).getAttribute("data-gitbounty-points-badge"), "25");
  assert.equal(badgeFor(document, 18570), null, "an issue number that is not on the page is not badged");
  assert.ok(badges(document).every((badge) => badge.getAttribute("data-gitbounty-points-badge") !== "999"));
});

test("a GitHub label alone never creates a reward badge", async () => {
  const { document } = await mount({
    fixture: "fixture.html", url: "https://github.com/openframe/core/issues", items: [],
  });
  assert.equal(badgeFor(document, 1842), null);
  assert.deepEqual(badges(document), []);
});

test("the registered value is used even when a GitHub label says something else", async () => {
  const { document, window } = await mount({
    fixture: "fixture.html",
    url: "https://github.com/openframe/core/issues",
    items: [bounty(1842, 90, "frontend", "Keyboard navigation")],
  });

  const badge = badgeFor(document, 1842);
  assert.equal(badge.getAttribute("data-gitbounty-source"), "api");
  assert.equal(badge.getAttribute("data-gitbounty-points-badge"), "90", "90 from the API, not 40 from the label");

  // Another scan (as GitHub's own DOM updates trigger) must not downgrade it back to the label.
  document.querySelector(".issue").appendChild(document.createElement("span"));
  await settle(window);
  assert.equal(badgeFor(document, 1842).getAttribute("data-gitbounty-source"), "api");
  assert.equal(badgeFor(document, 1842).getAttribute("data-gitbounty-points-badge"), "90");
});

test("injection is idempotent across repeated DOM mutations", async () => {
  const { document, window } = await mount({
    fixture: "fixture.html",
    url: "https://github.com/openframe/core/issues",
    items: [bounty(1857, 60, "backend")],
  });
  const before = badges(document).length;

  for (let i = 0; i < 5; i += 1) {
    document.querySelector("main").appendChild(document.createElement("div"));
  }
  await settle(window);

  assert.equal(badges(document).length, before, "no duplicate badges after five mutations");
  assert.equal(document.querySelectorAll('[data-gitbounty-issue-number="1857"]').length, 1);
});

test("re-renders after GitHub's client-side navigation without duplicating", async () => {
  const { document, window } = await mount({
    fixture: "fixture.html",
    url: "https://github.com/openframe/core/issues",
    items: [bounty(1857, 60, "backend")],
  });
  const before = badges(document).length;

  document.dispatchEvent(new window.Event("turbo:load"));
  await settle(window);
  document.dispatchEvent(new window.Event("pjax:end"));
  await settle(window);

  assert.equal(badges(document).length, before);
});

test("an API failure leaves the page untouched rather than guessing", async () => {
  const { document } = await mount({
    fixture: "fixture.html",
    url: "https://github.com/openframe/core/issues",
    items: [],
    ok: false,
  });

  // A GitHub label must not substitute for unavailable registered reward data.
  assert.equal(badgeFor(document, 1857), null);
  assert.equal(badgeFor(document, 1850), null);
  const apiBadges = badges(document).filter((badge) => badge.getAttribute("data-gitbounty-source") === "api");
  assert.deepEqual(apiBadges, [], "nothing claims to come from the API");
});

test("a pull request closing a published bounty names the author as the recipient", async () => {
  const { document } = await mount({
    fixture: "pull-fixture.html",
    url: "https://github.com/openframe/core/pull/1910",
    items: [bounty(1842, 40, "frontend", "Keyboard navigation")],
  });

  const banner = document.querySelector(".gitbounty-pr-award");
  assert.ok(banner, "the banner is injected");
  assert.match(banner.textContent, /closes #1842/);
  assert.match(banner.textContent, /\+40 GitBounty/);
  assert.match(banner.textContent, /author/, "the recipient is the pull request's author");
  assert.doesNotMatch(banner.textContent, /merges this|whoever merges/i,
    "the person who clicks Merge does not earn the points");
});

test("a pull request closing an untracked issue gets no banner at all", async () => {
  const { document } = await mount({
    fixture: "pull-fixture.html",
    url: "https://github.com/openframe/core/pull/1910",
    items: [],
  });

  assert.equal(document.querySelector(".gitbounty-pr-award"), null,
    "no bounty means no reward to advertise, not a baseline guess");
});

test("the banner is injected once, however many times the page mutates", async () => {
  const { document, window } = await mount({
    fixture: "pull-fixture.html",
    url: "https://github.com/openframe/core/pull/1910",
    items: [bounty(1842, 40)],
  });

  for (let i = 0; i < 5; i += 1) {
    document.querySelector("main").appendChild(document.createElement("div"));
  }
  document.dispatchEvent(new window.Event("turbo:load"));
  await settle(window);

  assert.equal(document.querySelectorAll(".gitbounty-pr-award").length, 1);
});

test("the page context the popup reads describes published bounties only", async () => {
  const { window } = await mount({
    fixture: "fixture.html",
    url: "https://github.com/openframe/core/issues/1842",
    items: [],
  });

  const context = await new Promise((resolve) => {
    window.__gitbountyMessageListener({ type: "gitbounty:get-page-context" }, {}, resolve);
  });
  assert.equal(context, null, "a gitbounty:40 label alone is not a tracked issue");
});

test("the page context reports a published bounty's own value and category", async () => {
  const { window } = await mount({
    fixture: "fixture.html",
    url: "https://github.com/openframe/core/issues/1842",
    items: [bounty(1842, 40, "frontend", "Keyboard navigation")],
  });

  const context = await new Promise((resolve) => {
    window.__gitbountyMessageListener({ type: "gitbounty:get-page-context" }, {}, resolve);
  });
  assert.equal(context.issue.number, 1842);
  assert.equal(context.issue.points, 40);
  assert.equal(context.issue.category, "frontend");
  assert.equal(context.issue.repository, "openframe/core");
});

test("the content script does nothing outside issue and pull paths", async () => {
  const { document, requests } = await mount({
    fixture: "fixture.html",
    url: "https://github.com/openframe/core/blob/main/README.md",
    items: [bounty(1857, 60)],
  });

  assert.deepEqual(badges(document), []);
  assert.deepEqual(requests, [], "the API is not called at all");
});

test("refresh removes an unpublished reward and updates a changed value", async () => {
  const { document, window, setItems } = await mount({
    fixture: "fixture.html", url: "https://github.com/openframe/core/issues",
    items: [bounty(1842, 40), bounty(1857, 60)],
  });
  setItems([bounty(1857, 80, "docs")]);
  document.dispatchEvent(new window.Event("visibilitychange"));
  await settle(window);
  assert.equal(badgeFor(document, 1842), null);
  assert.equal(badgeFor(document, 1857).getAttribute("data-gitbounty-points-badge"), "80");
  assert.match(badgeFor(document, 1857).textContent, /Docs/);
});

test("navigation away from a PR removes its reward banner", async () => {
  const { document, window } = await mount({
    fixture: "pull-fixture.html", url: "https://github.com/openframe/core/pull/1910",
    items: [bounty(1842, 40)],
  });
  assert.ok(document.querySelector(".gitbounty-pr-award"));
  window.history.pushState({}, "", "/openframe/core/issues");
  document.dispatchEvent(new window.Event("turbo:load"));
  await settle(window);
  assert.equal(document.querySelector(".gitbounty-pr-award"), null);
});

test("an unpublished PR reward disappears on refresh", async () => {
  const { document, window, setItems } = await mount({
    fixture: "pull-fixture.html", url: "https://github.com/openframe/core/pull/1910",
    items: [bounty(1842, 40)],
  });
  setItems([]);
  document.dispatchEvent(new window.Event("visibilitychange"));
  await settle(window);
  assert.equal(document.querySelector(".gitbounty-pr-award"), null);
});
