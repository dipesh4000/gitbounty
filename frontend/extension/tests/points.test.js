const test = require("node:test");
const assert = require("node:assert/strict");

const {
  closingIssueNumbers,
  findPublishedBounty,
  formatPoints,
  parseIssueLocation,
  parsePointsLabel,
  parsePullLocation,
} = require("../src/points.js");

test("parses the shared gitbounty points label without confusing similar labels", () => {
  assert.equal(parsePointsLabel("gitbounty:40"), 40);
  assert.equal(parsePointsLabel(" GitBounty: 1,000 "), null);
  assert.equal(parsePointsLabel("gitbounty:80 points"), 80);
  assert.equal(parsePointsLabel("gitbounty-ready"), null);
  assert.equal(parsePointsLabel("bounty:40"), null);
});

test("finds a website-published bounty by repository and issue number", () => {
  const items = [{ repository: "aasha-malik/gitbounty", number: 42, points: 40, category: "frontend", title: "Fix focus" }];
  assert.deepEqual(findPublishedBounty(items, "AASHA-MALIK/GITBOUNTY", 42), {
    points: 40,
    category: "frontend",
    title: "Fix focus",
  });
  assert.equal(findPublishedBounty(items, "aasha-malik/gitbounty", 43), null);
});

test("recognises issue lists and issue detail paths only", () => {
  assert.deepEqual(parseIssueLocation("/openframe/core/issues"), {
    repository: "openframe/core",
    number: null,
  });
  assert.deepEqual(parseIssueLocation("/openframe/core/issues/1842"), {
    repository: "openframe/core",
    number: 1842,
  });
  assert.equal(parseIssueLocation("/openframe/core/pulls/1842"), null);
  assert.equal(parseIssueLocation("/settings/issues"), null);
});

test("formats point values as stable, readable evidence", () => {
  assert.equal(formatPoints(40), "40");
  assert.equal(formatPoints(1200), "1,200");
});

test("recognises pull request paths and closing issue references", () => {
  assert.deepEqual(parsePullLocation("/openframe/core/pull/1910"), {
    repository: "openframe/core",
    number: 1910,
  });
  assert.equal(parsePullLocation("/openframe/core/issues/1910"), null);
  assert.deepEqual(closingIssueNumbers("Fixes #1842, resolves #611 and closes #1842"), [1842, 611]);
});
