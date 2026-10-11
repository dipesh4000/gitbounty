(function mountGitBountyOnGitHub() {
  "use strict";

  const helpers = globalThis.GitBountyPoints;
  if (!helpers) return;

  const issueLocation = helpers.parseIssueLocation(window.location.pathname);
  const pullLocation = helpers.parsePullLocation(window.location.pathname);
  if (!issueLocation && !pullLocation) return;

  const BADGE_ATTRIBUTE = "data-gitbounty-points-badge";
  const BADGE_ISSUE_ATTRIBUTE = "data-gitbounty-issue-number";
  const BADGE_SOURCE_ATTRIBUTE = "data-gitbounty-source";
  const PR_BANNER_ATTRIBUTE = "data-gitbounty-pr-award";
  const CATEGORIES = new Set(["frontend", "backend", "fullstack", "full-stack", "docs", "testing", "devops", "design", "mobile", "other"]);
  const bountyRequests = new Map();
  const REQUEST_CACHE_TTL_MS = 30 * 1000;
  let scanTimer = null;
  let decoratingPull = false;

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

  function upsertBadge(anchor, number, points, category, source = "api") {
    const container = badgeContainer(anchor);
    const visibleCategory = categoryLabel(category);
    let badge = container.querySelector(`[${BADGE_ISSUE_ATTRIBUTE}="${number}"]`);
    if (
      badge?.getAttribute(BADGE_ATTRIBUTE) === String(points) &&
      badge.getAttribute("data-gitbounty-category") === visibleCategory &&
      badge.getAttribute(BADGE_SOURCE_ATTRIBUTE) === source
    ) return;
    if (!badge) {
      badge = document.createElement("span");
      badge.className = "gitbounty-points-badge";
      badge.setAttribute(BADGE_ISSUE_ATTRIBUTE, String(number));
      badge.setAttribute("role", "note");
      anchor.insertAdjacentElement("afterend", badge);
    }
    badge.setAttribute(BADGE_ATTRIBUTE, String(points));
    badge.setAttribute(BADGE_SOURCE_ATTRIBUTE, source);
    badge.setAttribute("data-gitbounty-category", visibleCategory);
    badge.setAttribute(
      "aria-label",
      `${helpers.formatPoints(points)} GitBounty points, ${visibleCategory} category`,
    );
    badge.title = `GitBounty · ${helpers.formatPoints(points)} points · ${visibleCategory}`;
    badge.replaceChildren();

    const amount = document.createElement("strong");
    amount.textContent = helpers.formatPoints(points);
    const brand = document.createElement("span");
    brand.textContent = "GitBounty";
    badge.append(amount, brand);
    {
      const workCategory = document.createElement("span");
      workCategory.className = "gitbounty-points-badge__category";
      workCategory.textContent = visibleCategory;
      badge.append(workCategory);
    }
  }

  /*
    One request per repository per page view, with an expiry. The background worker holds the real cache
    (keyed by repository *and* signed-in account); this only stops a burst of MutationObserver scans
    from asking the same question ten times in a row.
  */
  function repositoryBounties(repository) {
    const key = repository.toLowerCase();
    const cached = bountyRequests.get(key);
    if (cached && cached.expires > Date.now()) return cached.request;

    const request = new Promise((resolve) => {
      if (!globalThis.chrome?.runtime?.sendMessage) {
        resolve([]);
        return;
      }
      chrome.runtime.sendMessage(
        { type: "gitbounty:get-repository-bounties", repository },
        (response) => {
          if (chrome.runtime.lastError || !response?.ok) {
            // A failure must not be remembered, or one blip hides every badge until a full reload.
            bountyRequests.delete(key);
            resolve([]);
          } else {
            resolve(Array.isArray(response.items) ? response.items : []);
          }
        },
      );
    });
    bountyRequests.set(key, { expires: Date.now() + REQUEST_CACHE_TTL_MS, request });
    return request;
  }

  async function decoratePublishedBounties(location) {
    const pathname = window.location.pathname;
    const items = await repositoryBounties(location.repository);
    if (window.location.pathname !== pathname) return;
    const active = new Set();
    for (const item of items) {
      if (location.number && location.number !== Number(item.number)) continue;
      const bounty = helpers.findPublishedBounty(items, location.repository, item.number);
      const anchor = bounty && (location.number
        ? document.querySelector('[data-testid="issue-title"] bdi, .js-issue-title, h1 bdi, h1')
          || issueAnchor(location.repository, item.number)
        : issueAnchor(location.repository, item.number));
      if (anchor) {
        active.add(String(item.number));
        upsertBadge(anchor, item.number, bounty.points, bounty.category, "api");
      }
    }
    document.querySelectorAll(`[${BADGE_ISSUE_ATTRIBUTE}]`).forEach((badge) => {
      if (!active.has(badge.getAttribute(BADGE_ISSUE_ATTRIBUTE))) badge.remove();
    });
  }

  async function currentIssueContext() {
    const location = helpers.parseIssueLocation(window.location.pathname);
    if (!location?.number) return null;
    const items = await repositoryBounties(location.repository);
    // Published bounties only. The popup presents this as "a tracked issue, worth N", which a bare
    // GitHub label does not make true.
    const published = helpers.findPublishedBounty(items, location.repository, location.number);
    if (!published) return null;
    const titleNode = document.querySelector('[data-testid="issue-title"] bdi, .js-issue-title, h1 bdi, h1');
    const statusText = document.querySelector('[data-testid="issue-state"], .State')?.textContent || "Open";
    const assigneeNode = document.querySelector(
      '[data-testid="assignees-section"] a[href^="/"], .assignee a[href^="/"], [aria-label^="Assignees"] a[href^="/"]'
    );
    return {
      issue: {
        repository: location.repository,
        number: location.number,
        title: (published.title || titleNode?.textContent || document.title.split(" · ")[0] || "Tracked issue").trim(),
        points: published.points,
        category: published.category,
        status: /closed|completed/i.test(statusText) ? "closed" : "open",
        assignee: assigneeNode?.textContent?.trim().replace(/^@/, "") || "unassigned",
      },
    };
  }

  function pullBodyText() {
    const body = document.querySelector('[data-testid="issue-body"], .comment-body, .js-comment-body, .markdown-body');
    return body?.textContent || "";
  }

  /*
    The pull-request banner.

    Two rules it must not break. The points go to the **pull request's author**, not to whoever clicks
    Merge -- the backend awards on `author:<login>`, and saying otherwise would be plainly wrong. And
    nothing is shown at all unless the issue this PR closes has a bounty published on GitBounty: a
    banner on untracked work is an invented reward.
  */
  async function decoratePullRequest() {
    const pullLocation = helpers.parsePullLocation(window.location.pathname);
    const existing = document.querySelector(`[${PR_BANNER_ATTRIBUTE}]`);
    if (!pullLocation) { existing?.remove(); return; }
    if (decoratingPull) return;
    const pathname = window.location.pathname;
    const issueNumber = helpers.closingIssueNumbers(pullBodyText())[0];
    if (!issueNumber) { existing?.remove(); return; }
    decoratingPull = true;
    try {
      const bounty = helpers.findPublishedBounty(
        await repositoryBounties(pullLocation.repository),
        pullLocation.repository,
        issueNumber,
      );
      if (window.location.pathname !== pathname) return;
      if (!bounty) { existing?.remove(); return; }
      const key = `${pathname}:${issueNumber}:${bounty.points}:${bounty.category}`;
      if (existing?.getAttribute("data-gitbounty-context") === key) return;
      existing?.remove();

      const banner = document.createElement("aside");
      banner.className = "gitbounty-pr-award";
      banner.setAttribute("data-gitbounty-context", key);
      banner.setAttribute(PR_BANNER_ATTRIBUTE, String(bounty.points));
      banner.setAttribute("role", "note");

      const mark = document.createElement("strong");
      mark.textContent = "[+]";
      const message = document.createElement("span");
      message.append(`closes #${issueNumber} · `);
      const amount = document.createElement("strong");
      amount.textContent = `+${helpers.formatPoints(bounty.points)} GitBounty`;
      message.append(amount, ` (${categoryLabel(bounty.category)}) available to this pull request's author after an eligible merge`);
      banner.append(mark, message);

      const anchor = document.querySelector('[data-testid="issue-metadata-fixed"], .gh-header-meta, #partial-discussion-header, .gh-header');
      if (anchor) anchor.insertAdjacentElement("afterend", banner);
    } finally {
      decoratingPull = false;
    }
  }

  function scan() {
    scanTimer = null;
    const location = helpers.parseIssueLocation(window.location.pathname);
    if (location) {
      void decoratePublishedBounties(location);
    }
    if (!location) document.querySelectorAll(`[${BADGE_ISSUE_ATTRIBUTE}]`).forEach((badge) => badge.remove());
    void decoratePullRequest();
  }

  function scheduleScan() {
    if (scanTimer !== null) window.clearTimeout(scanTimer);
    scanTimer = window.setTimeout(scan, 100);
  }

  const observer = new MutationObserver(scheduleScan);
  observer.observe(document.documentElement, { childList: true, subtree: true });
  function refresh() {
    if (document.hidden) return;
    bountyRequests.clear();
    scheduleScan();
  }
  document.addEventListener("turbo:load", refresh);
  document.addEventListener("pjax:end", refresh);
  document.addEventListener("visibilitychange", refresh);
  const refreshTimer = window.setInterval(refresh, 30 * 1000);
  window.addEventListener("pagehide", () => {
    observer.disconnect();
    window.clearInterval(refreshTimer);
    window.clearTimeout(scanTimer);
  });

  if (globalThis.chrome?.runtime?.onMessage) {
    chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
      if (message?.type !== "gitbounty:get-page-context") return false;
      currentIssueContext().then(sendResponse);
      return true;
    });
  }

  scan();
})();
