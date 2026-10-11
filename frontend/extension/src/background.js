/*
  The service worker: a background script with no page of its own. It exists because a content script
  running inside github.com cannot call localhost directly -- the page's origin is not ours -- so the
  content script asks the worker, and the worker makes the request with the extension's own permissions.

  It is also the only place that knows how to page through the API and how long an answer stays good for.
*/
importScripts("config.js");

(function runGitBountyBackground() {
  "use strict";

  const { API_BASE } = globalThis.GitBountyConfig;

  // A published bounty does not change minute to minute, and a GitHub issue list can trigger several
  // lookups at once, so answers are cached briefly. Short enough that un-publishing is visible quickly.
  const CACHE_TTL_MS = 30 * 1000;
  const PER_PAGE = 100;
  // A guard, not a product limit: stop walking pages if the API ever stops saying has_more.
  const MAX_PAGES = 50;

  // The issue board is public and identical for every viewer.
  const cache = new Map();

  /** Every published bounty for one repository, following the API's pagination to the end. */
  async function fetchAllBounties(repository) {
    const items = [];
    for (let page = 1; page <= MAX_PAGES; page += 1) {
      const query = new URLSearchParams({
        repository,
        per_page: String(PER_PAGE),
        page: String(page),
      });
      const response = await fetch(`${API_BASE}/api/issues?${query}`, { credentials: "include" });
      if (!response.ok) {
        const error = new Error(`GitBounty API returned ${response.status}`);
        error.status = response.status;
        throw error;
      }
      const payload = await response.json();
      if (Array.isArray(payload?.items)) items.push(...payload.items);
      if (!payload?.has_more) break;
    }
    return items;
  }

  async function repositoryBounties(repository) {
    const key = repository.toLowerCase();
    const cached = cache.get(key);
    if (cached && cached.expires > Date.now()) return cached.result;

    let result;
    try {
      result = { ok: true, items: await fetchAllBounties(repository) };
    } catch (error) {
      // Not cached: a failure should be retried on the next page view, not remembered until expiry.
      return { ok: false, items: [], status: error.status || 0 };
    }
    cache.set(key, { expires: Date.now() + CACHE_TTL_MS, result });
    return result;
  }

  chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
    if (message?.type === "gitbounty:invalidate-cache") {
      cache.clear();
      sendResponse({ ok: true });
      return false;
    }
    if (message?.type !== "gitbounty:get-repository-bounties") return false;

    const repository = String(message.repository || "").trim();
    if (!/^[\w.-]+\/[\w.-]+$/.test(repository)) {
      sendResponse({ ok: false, items: [] });
      return false;
    }
    repositoryBounties(repository).then(sendResponse);
    return true;
  });
})();
