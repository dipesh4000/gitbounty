(function exposePointsHelpers(root, factory) {
  const helpers = factory();
  if (typeof module === "object" && module.exports) module.exports = helpers;
  root.GitBountyPoints = helpers;
})(typeof globalThis === "object" ? globalThis : this, function createPointsHelpers() {
  "use strict";

  const POINTS_LABEL = /^gitbounty\s*:\s*(\d+)\s*(?:points?|pts?)?$/i;
  const ISSUE_PATH = /^\/([^/]+)\/([^/]+)\/issues(?:\/(\d+))?(?:\/|$)/;

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

  function formatPoints(points) {
    return Number(points).toLocaleString("en-US");
  }

  return { parsePointsLabel, parseIssueLocation, formatPoints };
});
