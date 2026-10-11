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

  function issueUrl(issue) {
    if (!/^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/.test(issue.repository) || !Number.isSafeInteger(issue.number) || issue.number <= 0) return null;
    return `https://github.com/${issue.repository}/issues/${issue.number}`;
  }
  function promiseLabel(issue) {
    if (issue.reward_chain_id === 43113 && issue.reward_usdc) return `${issue.reward_usdc} USDC · Fuji testnet`;
    if (issue.reward_chain_id === 43114 && issue.reward_avax) return `${issue.reward_avax} AVAX · mainnet`;
    return "";
  }
  return { formatPoints, initials, normalizeActivity, popupState, issueUrl, promiseLabel };
});
