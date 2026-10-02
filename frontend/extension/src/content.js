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
  const BADGE_SOURCE_ATTRIBUTE = "data-gitbounty-source";
  const PR_BANNER_ATTRIBUTE = "data-gitbounty-pr-award";
  const LABEL_SELECTOR = 'a[href*="/labels/"], [data-testid="issue-label"], [data-name]';
  const CATEGORIES = new Set(["frontend", "backend", "fullstack", "full-stack", "docs", "testing", "devops", "design", "mobile", "other"]);
  const bountyRequests = new Map();
  const REQUEST_CACHE_TTL_MS = 60 * 1000;
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

  /*
    `source` decides what the badge is allowed to claim.

      "api"   -- a bounty published on GitBounty. Reads "40 GitBounty · Frontend".
      "label" -- only a `gitbounty:40` label on the GitHub issue. GitBounty has never seen it, so the
                 badge says "label" and never implies an award. An "api" badge always replaces a
                 "label" one for the same issue; the reverse is refused.
  */
  function upsertBadge(anchor, number, points, category, source = "api") {
    const container = badgeContainer(anchor);
    const visibleCategory = categoryLabel(category);
    let badge = container.querySelector(`[${BADGE_ISSUE_ATTRIBUTE}="${number}"]`);
    if (badge?.getAttribute(BADGE_SOURCE_ATTRIBUTE) === "api" && source !== "api") return;
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
    const published = source === "api";
    badge.setAttribute(BADGE_ATTRIBUTE, String(points));
    badge.setAttribute(BADGE_SOURCE_ATTRIBUTE, source);
    badge.setAttribute("data-gitbounty-category", visibleCategory);
    badge.classList.toggle("gitbounty-points-badge--label", !published);
    badge.setAttribute(
      "aria-label",
      published
        ? `${helpers.formatPoints(points)} GitBounty points, ${visibleCategory} category`
        : `${helpers.formatPoints(points)} points according to this issue's gitbounty label, not published on GitBounty`,
    );
    badge.title = published
      ? `GitBounty · ${helpers.formatPoints(points)} points · ${visibleCategory}`
      : `gitbounty label · ${helpers.formatPoints(points)} points · not published on GitBounty`;
    badge.replaceChildren();

    const amount = document.createElement("strong");
    amount.textContent = helpers.formatPoints(points);
    const brand = document.createElement("span");
    brand.textContent = published ? "GitBounty" : "label";
    badge.append(amount, brand);
    if (published) {
      const workCategory = document.createElement("span");
      workCategory.className = "gitbounty-points-badge__category";
      workCategory.textContent = visibleCategory;
      badge.append(workCategory);
    }
  }

  /*
    A `gitbounty:40` label is a *documented fallback*, not a published bounty: anyone with write access
    to a repository can add one, and GitBounty has not seen it. It is marked as a label value and never
    as a GitBounty award, and the API's answer always wins (upsertBadge is called with source "api"
    afterwards and overwrites this).
  */
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
    upsertBadge(anchor, parsed.number, points, categoryNear(label), "label");
    label.setAttribute(PROCESSED_ATTRIBUTE, String(points));
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
    const items = await repositoryBounties(location.repository);
    for (const item of items) {
      const bounty = helpers.findPublishedBounty(items, location.repository, item.number);
      const anchor = bounty && issueAnchor(location.repository, item.number);
      if (anchor) upsertBadge(anchor, item.number, bounty.points, bounty.category, "api");
    }
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
    if (!pullLocation || decoratingPull || document.querySelector(`[${PR_BANNER_ATTRIBUTE}]`)) return;
    const issueNumber = helpers.closingIssueNumbers(pullBodyText())[0];
    if (!issueNumber) return;
    decoratingPull = true;
    try {
      const bounty = helpers.findPublishedBounty(
        await repositoryBounties(pullLocation.repository),
        pullLocation.repository,
        issueNumber,
      );
      if (!bounty) return;  // not a published bounty: say nothing

      const banner = document.createElement("aside");
      banner.className = "gitbounty-pr-award";
      banner.setAttribute(PR_BANNER_ATTRIBUTE, String(bounty.points));
      banner.setAttribute("role", "note");

      const mark = document.createElement("strong");
      mark.textContent = "[+]";
      const message = document.createElement("span");
      message.append(`closes #${issueNumber} · `);
      const amount = document.createElement("strong");
      amount.textContent = `+${helpers.formatPoints(bounty.points)} GitBounty`;
      message.append(amount, ` (${categoryLabel(bounty.category)}) to this pull request's author when it is merged`);
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
