(function mountGitBountyIssueBadges() {
  "use strict";

  const helpers = globalThis.GitBountyPoints;
  if (!helpers || !helpers.parseIssueLocation(window.location.pathname)) return;

  const BADGE_ATTRIBUTE = "data-gitbounty-points-badge";
  const PROCESSED_ATTRIBUTE = "data-gitbounty-points-processed";
  const LABEL_SELECTOR = 'a[href*="/labels/"], [data-testid="issue-label"], [data-name]';
  let scanTimer = null;

  function labelName(element) {
    return (
      element.getAttribute("data-name") ||
      element.textContent ||
      element.getAttribute("aria-label") ||
      element.getAttribute("title") ||
      ""
    ).trim();
  }

  function removeStaleBadge(label) {
    const sibling = label.nextElementSibling;
    if (sibling?.hasAttribute(BADGE_ATTRIBUTE)) sibling.remove();
    label.removeAttribute(PROCESSED_ATTRIBUTE);
  }

  function decorateLabel(label) {
    const points = helpers.parsePointsLabel(labelName(label));
    if (points === null) {
      if (label.hasAttribute(PROCESSED_ATTRIBUTE)) removeStaleBadge(label);
      return;
    }

    const value = String(points);
    if (
      label.getAttribute(PROCESSED_ATTRIBUTE) === value &&
      label.nextElementSibling?.getAttribute(BADGE_ATTRIBUTE) === value
    ) {
      return;
    }

    removeStaleBadge(label);
    const badge = document.createElement("span");
    badge.className = "gitbounty-points-badge";
    badge.setAttribute(BADGE_ATTRIBUTE, value);
    badge.setAttribute("role", "note");
    badge.setAttribute("aria-label", `GitBounty: ${helpers.formatPoints(points)} issue points`);
    badge.title = `GitBounty · ${helpers.formatPoints(points)} issue points`;

    const brand = document.createElement("span");
    brand.className = "gitbounty-points-badge__brand";
    brand.setAttribute("aria-hidden", "true");
    brand.textContent = "GB";

    const amount = document.createElement("span");
    amount.className = "gitbounty-points-badge__amount";
    amount.setAttribute("aria-hidden", "true");
    amount.textContent = `+${helpers.formatPoints(points)} PTS`;

    badge.append(brand, amount);
    label.insertAdjacentElement("afterend", badge);
    label.setAttribute(PROCESSED_ATTRIBUTE, value);
  }

  function scan() {
    scanTimer = null;
    if (!helpers.parseIssueLocation(window.location.pathname)) return;
    const labels = new Set();
    document.querySelectorAll(LABEL_SELECTOR).forEach((candidate) => {
      labels.add(candidate.closest('a[href*="/labels/"]') || candidate);
    });
    labels.forEach(decorateLabel);
  }

  function scheduleScan() {
    if (scanTimer !== null) window.clearTimeout(scanTimer);
    scanTimer = window.setTimeout(scan, 80);
  }

  const observer = new MutationObserver(scheduleScan);
  observer.observe(document.documentElement, { childList: true, subtree: true });
  document.addEventListener("turbo:load", scheduleScan);
  document.addEventListener("pjax:end", scheduleScan);
  scan();
})();
