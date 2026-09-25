(function exposePointsHelpers(root, factory) {
  const helpers = factory();
  if (typeof module === "object" && module.exports) module.exports = helpers;
  root.GitBountyPoints = helpers;
})(typeof globalThis === "object" ? globalThis : this, function createPointsHelpers() {
  "use strict";

  const POINTS_LABEL = /^gitbounty\s*:\s*(\d+)\s*(?:points?|pts?)?$/i;
  const ISSUE_PATH = /^\/([^/]+)\/([^/]+)\/issues(?:\/(\d+))?(?:\/|$)/;
  const PULL_PATH = /^\/([^/]+)\/([^/]+)\/pull\/(\d+)(?:\/|$)/;
  const CLOSING_REFERENCE = /\b(?:close[sd]?|fix(?:e[sd])?|resolve[sd]?)\s+#(\d+)\b/gi;

  function parsePointsLabel(value) {
    const match = String(value || "").trim().match(POINTS_LABEL);
    if (!match) return null;
    const points = Number(match[1]);
    return Number.isSafeInteger(points) ? points : null;
  }

  function parseIssueLocation(pathname) {
    const match = String(pathname || "").match(ISSUE_PATH);
    if (!match) return null;
    return {
      repository: `${decodeURIComponent(match[1])}/${decodeURIComponent(match[2])}`,
      number: match[3] ? Number(match[3]) : null,
    };
  }

  function parsePullLocation(pathname) {
    const match = String(pathname || "").match(PULL_PATH);
    if (!match) return null;
    return {
      repository: `${decodeURIComponent(match[1])}/${decodeURIComponent(match[2])}`,
      number: Number(match[3]),
    };
  }

  function closingIssueNumbers(value) {
    const numbers = [];
    const seen = new Set();
    for (const match of String(value || "").matchAll(CLOSING_REFERENCE)) {
      const number = Number(match[1]);
      if (!seen.has(number)) {
        seen.add(number);
        numbers.push(number);
      }
    }
    return numbers;
  }

  function formatPoints(points) {
    return Number(points).toLocaleString("en-US");
  }

  return { closingIssueNumbers, parsePointsLabel, parseIssueLocation, parsePullLocation, formatPoints };
});
