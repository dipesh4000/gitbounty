const test = require("node:test");
const assert = require("node:assert/strict");

const { formatPoints, initials, normalizeActivity, popupState } = require("../popup/data.js");

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
  assert.deepEqual(normalizeActivity({
    recent_merges: [{ number: 611, repo_full_name: "relaylabs/queue", points: 65, url: "https://example.test" }],
  }), [{ number: 611, repository: "relaylabs/queue", points: 65, url: "https://example.test" }]);
});
