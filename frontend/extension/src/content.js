(function mountGitBountyOnGitHub() {
  "use strict";

  const helpers = globalThis.GitBountyPoints;
  if (!helpers) return;

  const issueLocation = helpers.parseIssueLocation(window.location.pathname);
  const pullLocation = helpers.parsePullLocation(window.location.pathname);
  if (!issueLocation && !pullLocation) return;

  const BADGE_ATTRIBUTE = "data-gitbounty-points-badge";
  const BADGE_ISSUE_ATTRIBUTE = "data-gitbounty-issue-number";
  const PROCESSED_ATTRIBUTE = "data-gitbounty-points-processed";
  const PR_BANNER_ATTRIBUTE = "data-gitbounty-pr-award";
  const LABEL_SELECTOR = 'a[href*="/labels/"], [data-testid="issue-label"], [data-name]';
  const CATEGORIES = new Set(["frontend", "backend", "fullstack", "full-stack", "docs", "testing", "devops", "design", "mobile", "other"]);
  const bountyRequests = new Map();
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

  function normalizeCategory(value) {
    const normalized = String(value || "other").toLowerCase().replace(/\s+/g, "-");
    return normalized === "full-stack" ? "fullstack" : CATEGORIES.has(normalized) ? normalized : "other";
  }

  function categoryLabel(value) {
    const normalized = normalizeCategory(value);
    if (normalized === "fullstack") return "Full-stack";
    if (normalized === "devops") return "DevOps";
    return normalized.charAt(0).toUpperCase() + normalized.slice(1);
  }

  function categoryNear(label) {
    const row = label.closest('[data-testid="issue-row"], .js-issue-row, article, li') || document;
    for (const candidate of allLabels(row)) {
      const raw = labelName(candidate);
      const normalized = normalizeCategory(raw);
      if (normalized !== "other" || /^other$/i.test(raw)) return normalized;
    }
    return "other";
  }

  function issueAnchor(repository, number, root = document) {
    return [...root.querySelectorAll('a[href*="/issues/"]')].find((anchor) => {
      try {
        const parsed = helpers.parseIssueLocation(new URL(anchor.href, window.location.origin).pathname);
        return parsed?.repository.toLowerCase() === repository.toLowerCase() && parsed.number === Number(number);
      } catch {
        return false;
      }
    }) || null;
  }

  function badgeContainer(anchor) {
    return anchor.closest('[data-testid="issue-row"], .js-issue-row, article, li') || anchor.parentElement || document;
  }

  function upsertBadge(anchor, number, points, category) {
    const container = badgeContainer(anchor);
    const visibleCategory = categoryLabel(category);
    let badge = container.querySelector(`[${BADGE_ISSUE_ATTRIBUTE}="${number}"]`);
    if (
      badge?.getAttribute(BADGE_ATTRIBUTE) === String(points) &&
      badge.getAttribute("data-gitbounty-category") === visibleCategory
    ) return;
    if (!badge) {
      badge = document.createElement("span");
      badge.className = "gitbounty-points-badge";
      badge.setAttribute(BADGE_ISSUE_ATTRIBUTE, String(number));
      badge.setAttribute("role", "note");
      anchor.insertAdjacentElement("afterend", badge);
    }
    badge.setAttribute(BADGE_ATTRIBUTE, String(points));
    badge.setAttribute("data-gitbounty-category", visibleCategory);
    badge.setAttribute("aria-label", `${helpers.formatPoints(points)} GitBounty points, ${visibleCategory} category`);
    badge.title = `GitBounty · ${helpers.formatPoints(points)} points · ${visibleCategory}`;
    badge.replaceChildren();

    const amount = document.createElement("strong");
    amount.textContent = helpers.formatPoints(points);
    const brand = document.createElement("span");
    brand.textContent = "GitBounty";
    const workCategory = document.createElement("span");
    workCategory.className = "gitbounty-points-badge__category";
    workCategory.textContent = visibleCategory;
    badge.append(amount, brand, workCategory);
  }

  function decorateLabel(label) {
    const points = helpers.parsePointsLabel(labelName(label));
    if (points === null) return;
    const pageLocation = helpers.parseIssueLocation(window.location.pathname);
    const row = label.closest('[data-testid="issue-row"], .js-issue-row, article, li');
    const anchor = row
      ? [...row.querySelectorAll('a[href*="/issues/"]')].find((candidate) => helpers.parseIssueLocation(new URL(candidate.href, window.location.origin).pathname)?.number)
      : document.querySelector('[data-testid="issue-title"] bdi, .js-issue-title, h1 bdi, h1');
    const parsed = anchor?.href ? helpers.parseIssueLocation(new URL(anchor.href, window.location.origin).pathname) : pageLocation;
    if (!anchor || !parsed?.number) return;
    upsertBadge(anchor, parsed.number, points, categoryNear(label));
    label.classList.add("gitbounty-source-label");
    label.setAttribute(PROCESSED_ATTRIBUTE, String(points));
  }

  function repositoryBounties(repository) {
    const key = repository.toLowerCase();
    if (!bountyRequests.has(key)) {
      const request = new Promise((resolve) => {
        if (!globalThis.chrome?.runtime?.sendMessage) {
          resolve([]);
          return;
        }
        chrome.runtime.sendMessage(
          { type: "gitbounty:get-repository-bounties", repository },
          (response) => {
            if (chrome.runtime.lastError || !response?.ok) resolve([]);
            else resolve(Array.isArray(response.items) ? response.items : []);
          },
        );
      });
      bountyRequests.set(key, request);
    }
    return bountyRequests.get(key);
  }

  async function decoratePublishedBounties(location) {
    const items = await repositoryBounties(location.repository);
    for (const item of items) {
      const bounty = helpers.findPublishedBounty(items, location.repository, item.number);
      const anchor = bounty && issueAnchor(location.repository, item.number);
      if (anchor) upsertBadge(anchor, item.number, bounty.points, bounty.category);
    }
  }

  async function currentIssueContext() {
    const location = helpers.parseIssueLocation(window.location.pathname);
    if (!location?.number) return null;
    const items = await repositoryBounties(location.repository);
    const published = helpers.findPublishedBounty(items, location.repository, location.number);
    const pointsLabel = allLabels().find((label) => helpers.parsePointsLabel(labelName(label)) !== null);
    const points = published?.points ?? (pointsLabel ? helpers.parsePointsLabel(labelName(pointsLabel)) : null);
    if (points === null) return null;
    const titleNode = document.querySelector('[data-testid="issue-title"] bdi, .js-issue-title, h1 bdi, h1');
    const statusText = document.querySelector('[data-testid="issue-state"], .State')?.textContent || "Open";
    const assigneeNode = document.querySelector(
      '[data-testid="assignees-section"] a[href^="/"], .assignee a[href^="/"], [aria-label^="Assignees"] a[href^="/"]'
    );
    return {
      issue: {
        repository: location.repository,
        number: location.number,
        title: (published?.title || titleNode?.textContent || document.title.split(" · ")[0] || "Tracked issue").trim(),
        points,
        category: published?.category || (pointsLabel ? categoryNear(pointsLabel) : "other"),
        status: /closed|completed/i.test(statusText) ? "closed" : "open",
        assignee: assigneeNode?.textContent?.trim().replace(/^@/, "") || "unassigned",
      },
    };
  }

  async function issuePoints(repository, number) {
    const published = helpers.findPublishedBounty(await repositoryBounties(repository), repository, number);
    if (published) return published.points;
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
      void decoratePublishedBounties(location);
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
      currentIssueContext().then(sendResponse);
      return true;
    });
  }

  scan();
})();
