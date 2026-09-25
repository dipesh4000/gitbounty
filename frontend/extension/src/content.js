(function mountGitBountyOnGitHub() {
  "use strict";

  const helpers = globalThis.GitBountyPoints;
  if (!helpers) return;

  const issueLocation = helpers.parseIssueLocation(window.location.pathname);
  const pullLocation = helpers.parsePullLocation(window.location.pathname);
  if (!issueLocation && !pullLocation) return;

  const BADGE_ATTRIBUTE = "data-gitbounty-points-badge";
  const PROCESSED_ATTRIBUTE = "data-gitbounty-points-processed";
  const PR_BANNER_ATTRIBUTE = "data-gitbounty-pr-award";
  const ROW_BADGE_ATTRIBUTE = "data-gitbounty-row-badge";
  const LABEL_SELECTOR = 'a[href*="/labels/"], [data-testid="issue-label"], [data-name]';
  const CATEGORIES = new Set(["frontend", "backend", "fullstack", "full-stack", "docs"]);
  let scanTimer = null;
  let decoratingPull = false;

  function labelName(element) {
    return (
      element.getAttribute("data-name") ||
      element.textContent ||
      element.getAttribute("aria-label") ||
      element.getAttribute("title") ||
      ""
    ).trim();
  }

  function allLabels(root = document) {
    return [...root.querySelectorAll(LABEL_SELECTOR)].map((candidate) =>
      candidate.closest('a[href*="/labels/"]') || candidate
    );
  }

  function categoryNear(label) {
    const row = label.closest('[data-testid="issue-row"], .js-issue-row, article, li') || document;
    for (const candidate of allLabels(row)) {
      const normalized = labelName(candidate).toLowerCase().replace(/\s+/g, "-");
      if (CATEGORIES.has(normalized)) return normalized.replace("full-stack", "fullstack");
    }
    return "tracked";
  }

  function removeStaleBadge(label) {
    const sibling = label.previousElementSibling;
    if (sibling?.hasAttribute(BADGE_ATTRIBUTE)) sibling.remove();
    label.classList.remove("gitbounty-source-label");
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
      label.previousElementSibling?.getAttribute(BADGE_ATTRIBUTE) === value
    ) return;

    removeStaleBadge(label);
    const category = categoryNear(label);
    const badge = document.createElement("span");
    badge.className = "gitbounty-points-badge";
    badge.setAttribute(BADGE_ATTRIBUTE, value);
    badge.setAttribute("role", "note");
    badge.setAttribute("aria-label", `GitBounty: ${helpers.formatPoints(points)} issue points`);
    badge.title = `GitBounty · ${helpers.formatPoints(points)} issue points`;

    const dot = document.createElement("span");
    dot.className = "gitbounty-points-badge__dot";
    dot.setAttribute("aria-hidden", "true");
    const amount = document.createElement("span");
    amount.setAttribute("aria-hidden", "true");
    amount.textContent = `+${helpers.formatPoints(points)} · ${category.toUpperCase()}`;

    badge.append(dot, amount);
    label.classList.add("gitbounty-source-label");
    label.insertAdjacentElement("beforebegin", badge);
    label.setAttribute(PROCESSED_ATTRIBUTE, value);
  }

  function makeRowBadge(kind) {
    const badge = document.createElement("span");
    badge.className = `gitbounty-row-badge gitbounty-row-badge--${kind}`;
    badge.setAttribute(ROW_BADGE_ATTRIBUTE, kind);
    badge.setAttribute("role", "note");
    badge.textContent = kind === "base" ? "+5 base" : "not tracked";
    badge.setAttribute(
      "aria-label",
      kind === "base" ? "GitBounty: 5 baseline points on merge" : "Not tracked by GitBounty",
    );
    return badge;
  }

  function decorateIssueRows() {
    const rows = document.querySelectorAll('[data-testid="issue-row"], .js-issue-row');
    rows.forEach((row) => {
      if (row.querySelector(`[${BADGE_ATTRIBUTE}], [${ROW_BADGE_ATTRIBUTE}]`)) return;
      const labels = allLabels(row);
      if (labels.some((label) => helpers.parsePointsLabel(labelName(label)) !== null)) return;
      const categoryLabel = labels.find((label) => {
        const normalized = labelName(label).toLowerCase().replace(/\s+/g, "-");
        return CATEGORIES.has(normalized);
      });
      const anchor = labels.at(-1) || row.querySelector('a[href*="/issues/"]');
      if (anchor) anchor.insertAdjacentElement("afterend", makeRowBadge(categoryLabel ? "base" : "untracked"));
    });
  }

  function currentIssueContext() {
    const location = helpers.parseIssueLocation(window.location.pathname);
    if (!location?.number) return null;
    const pointsLabel = allLabels().find((label) => helpers.parsePointsLabel(labelName(label)) !== null);
    if (!pointsLabel) return null;
    const titleNode = document.querySelector('[data-testid="issue-title"] bdi, .js-issue-title, h1 bdi, h1');
    const statusText = document.querySelector('[data-testid="issue-state"], .State')?.textContent || "Open";
    const assigneeNode = document.querySelector(
      '[data-testid="assignees-section"] a[href^="/"], .assignee a[href^="/"], [aria-label^="Assignees"] a[href^="/"]'
    );
    return {
      issue: {
        repository: location.repository,
        number: location.number,
        title: (titleNode?.textContent || document.title.split(" · ")[0] || "Tracked issue").trim(),
        points: helpers.parsePointsLabel(labelName(pointsLabel)),
        category: categoryNear(pointsLabel),
        status: /closed|completed/i.test(statusText) ? "closed" : "open",
        assignee: assigneeNode?.textContent?.trim().replace(/^@/, "") || "unassigned",
      },
    };
  }

  async function issuePoints(repository, number) {
    try {
      const response = await fetch(`/${repository}/issues/${number}`, { credentials: "same-origin" });
      if (!response.ok) return null;
      const page = new DOMParser().parseFromString(await response.text(), "text/html");
      const label = allLabels(page).find((candidate) => helpers.parsePointsLabel(labelName(candidate)) !== null);
      return label ? helpers.parsePointsLabel(labelName(label)) : null;
    } catch {
      return null;
    }
  }

  function pullBodyText() {
    const body = document.querySelector('[data-testid="issue-body"], .comment-body, .js-comment-body, .markdown-body');
    return body?.textContent || "";
  }

  async function decoratePullRequest() {
    if (!pullLocation || decoratingPull || document.querySelector(`[${PR_BANNER_ATTRIBUTE}]`)) return;
    const issueNumber = helpers.closingIssueNumbers(pullBodyText())[0];
    if (!issueNumber) return;
    decoratingPull = true;
    const points = await issuePoints(pullLocation.repository, issueNumber);
    const total = (points ?? 0) + 5;
    const banner = document.createElement("aside");
    banner.className = "gitbounty-pr-award";
    banner.setAttribute(PR_BANNER_ATTRIBUTE, String(total));
    banner.setAttribute("role", "note");

    const mark = document.createElement("strong");
    mark.textContent = "[+]";
    const message = document.createElement("span");
    message.append(`closes #${issueNumber} · merging awards `);
    const amount = document.createElement("strong");
    amount.textContent = `+${helpers.formatPoints(total)}`;
    message.append(amount, " to whoever merges this");
    banner.append(mark, message);

    const anchor = document.querySelector('[data-testid="issue-metadata-fixed"], .gh-header-meta, #partial-discussion-header, .gh-header');
    if (anchor) anchor.insertAdjacentElement("afterend", banner);
    decoratingPull = false;
  }

  function scan() {
    scanTimer = null;
    const location = helpers.parseIssueLocation(window.location.pathname);
    if (location) {
      allLabels().forEach(decorateLabel);
      if (location.number === null) decorateIssueRows();
    }
    void decoratePullRequest();
  }

  function scheduleScan() {
    if (scanTimer !== null) window.clearTimeout(scanTimer);
    scanTimer = window.setTimeout(scan, 100);
  }

  const observer = new MutationObserver(scheduleScan);
  observer.observe(document.documentElement, { childList: true, subtree: true });
  document.addEventListener("turbo:load", scheduleScan);
  document.addEventListener("pjax:end", scheduleScan);

  if (globalThis.chrome?.runtime?.onMessage) {
    chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
      if (message?.type !== "gitbounty:get-page-context") return false;
      sendResponse(currentIssueContext());
      return false;
    });
  }

  scan();
})();
