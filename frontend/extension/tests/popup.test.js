const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const { formatPoints, initials, normalizeActivity, popupState } = require("../popup/data.js");
const config = require("../src/config.js");

const read = (relative) => fs.readFileSync(path.join(__dirname, "..", relative), "utf8");

test("derives all three popup states from auth and page context", () => {
  assert.equal(popupState(null, null), "signed-out");
  assert.equal(popupState({ github_login: "maya-dev" }, null), "default");
  assert.equal(
    popupState({ github_login: "maya-dev" }, { issue: { points: 40 } }),
    "tracked-issue",
  );
});

test("formats identities and activity without inventing records", () => {
  assert.equal(initials("maya-dev"), "MD");
  assert.equal(formatPoints(1200), "1,200");
  assert.deepEqual(normalizeActivity({ recent_merges: [] }), []);
  assert.deepEqual(normalizeActivity({}), [], "a payload with no merges yields no activity");
  assert.deepEqual(normalizeActivity({
    recent_merges: [{ number: 611, repo_full_name: "relaylabs/queue", points: 65, url: "https://example.test" }],
  }), [{ number: 611, repository: "relaylabs/queue", points: 65, url: "https://example.test" }]);
});

test("every GitBounty URL points at the local app, and nowhere unrelated", () => {
  const popupHtml = read("popup/popup.html");
  const popupJs = read("popup/popup.js");
  const source = `${popupHtml}\n${popupJs}\n${read("src/config.js")}\n${read("src/background.js")}`;

  assert.equal(config.API_BASE, "http://localhost:8001");
  assert.equal(config.APP_BASE, "http://localhost:3000");
  assert.equal(config.DASHBOARD_URL, "http://localhost:3000/explore");
  assert.equal(config.SIGN_IN_URL, "http://localhost:8001/auth/github", "Connect GitHub uses the real OAuth route");
  assert.match(popupHtml, /href="http:\/\/localhost:3000\/"/);
  assert.doesNotMatch(source, /chatgpt\.site/i);
  assert.doesNotMatch(source, /localhost:8000/, "the website is on 3000, not the old 8000");
});

test("the popup contains no demo session and no fabricated account", () => {
  const popupJs = read("popup/popup.js");

  assert.doesNotMatch(popupJs, /demoAccount|DEMO_SESSION|gitbounty_demo_session/,
    "the hard-coded account and its localStorage flag are gone");
  assert.doesNotMatch(popupJs, /localStorage/,
    "no client-side flag may stand in for a session");
  // The old popup hard-coded 185 points and three invented repositories.
  assert.doesNotMatch(popupJs, /aasha-malik|openframe\/core|relaylabs\/queue|halyard\/docs/);
  assert.doesNotMatch(popupJs, /\b185\b/);
  // Connect must navigate to the backend, not render a signed-in view.
  assert.match(popupJs, /connect-button[\s\S]{0,120}openTab\(SIGN_IN_URL\)/);
});

test("a 401 is presented as signed out, and other failures as failures", () => {
  const popupJs = read("popup/popup.js");
  assert.match(popupJs, /error\.status === 401[\s\S]{0,160}show\("signed-out-state"\)/);
  assert.match(popupJs, /error\.status === 503/);
  assert.match(popupJs, /show\("error-state"\)/);
});

test("refresh and sign out drop the background worker's cached bounties", () => {
  const popupJs = read("popup/popup.js");
  const invalidations = popupJs.match(/gitbounty:invalidate-cache/g) || [];
  assert.equal(invalidations.length, 2, "once for Refresh, once for Sign out");
});


// --- disconnected and error states ------------------------------------------

test("the popup tells apart signed-out, unconfigured, unreachable and other failures", () => {
  const popupJs = read("popup/popup.js");

  // Each of the four has its own branch, and none of them shows a points figure.
  assert.match(popupJs, /error\.status === 401[\s\S]{0,160}show\("signed-out-state"\)/);
  assert.match(popupJs, /error\.status === 503[\s\S]{0,200}not configured yet/);
  assert.match(popupJs, /error\.status === 0[\s\S]{0,160}is not running on/);
  assert.match(popupJs, /The GitBounty API answered \$\{error\.status\}/);
});

test("a network failure is reported as the API not running, with its address", () => {
  const popupJs = read("popup/popup.js");

  // fetch only rejects for a network-level problem; that must not surface as an unhandled rejection.
  assert.match(popupJs, /try \{[\s\S]{0,200}await fetch\([\s\S]{0,200}\} catch \{/);
  assert.match(popupJs, /error\.status = 0/);
  assert.match(popupJs, /\$\{API_BASE\}/);
});

test("the content script answers nothing rather than guessing when the worker cannot be reached", () => {
  const contentJs = read("src/content.js");

  // No chrome.runtime at all (a plain page load), or a failed message, both resolve to an empty list.
  assert.match(contentJs, /if \(!globalThis\.chrome\?\.runtime\?\.sendMessage\) \{\s*resolve\(\[\]\);/);
  assert.match(contentJs, /chrome\.runtime\.lastError \|\| !response\?\.ok[\s\S]{0,200}resolve\(\[\]\)/);
  // And a failure is not remembered, so one blip does not hide every badge until a reload.
  assert.match(contentJs, /bountyRequests\.delete\(key\)/);
});

test("the background worker reports a failure instead of inventing an empty success", () => {
  const backgroundJs = read("src/background.js");

  assert.match(backgroundJs, /return \{ ok: false, items: \[\], viewer, status: error\.status \|\| 0 \}/);
  // A failure is never written to the cache.
  assert.match(backgroundJs, /\/\/ Not cached[\s\S]{0,160}return \{ ok: false/);
});
