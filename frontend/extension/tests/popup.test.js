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
