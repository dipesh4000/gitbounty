(function exposePopupData(root, factory) {
  const helpers = factory();
  if (typeof module === "object" && module.exports) module.exports = helpers;
  root.GitBountyPopupData = helpers;
})(typeof globalThis === "object" ? globalThis : this, function createPopupData() {
  "use strict";

  function formatPoints(value) {
    const points = Number(value);
    return Number.isFinite(points) ? points.toLocaleString("en-US") : "0";
  }

  function initials(login) {
    const clean = String(login || "").replace(/^@/, "").trim();
    if (!clean) return "GB";
    const parts = clean.split(/[-_.\s]+/).filter(Boolean);
    return (parts.length > 1 ? parts[0][0] + parts[1][0] : clean.slice(0, 2)).toUpperCase();
  }

  function normalizeActivity(pointsPayload) {
    const merges = Array.isArray(pointsPayload?.recent_merges) ? pointsPayload.recent_merges : [];
    return merges.slice(0, 3).map((merge) => ({
      number: Number(merge.number) || 0,
      repository: String(merge.repo_full_name || "unknown/repository"),
      points: Number(merge.points) || 0,
      url: typeof merge.url === "string" ? merge.url : "",
    }));
  }

  function popupState(user, pageContext) {
    if (!user) return "signed-out";
    return pageContext?.issue?.points != null ? "tracked-issue" : "default";
  }

  return { formatPoints, initials, normalizeActivity, popupState };
});
