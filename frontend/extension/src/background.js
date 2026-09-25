(function runGitBountyBackground() {
  "use strict";

  const API_BASE = "http://localhost:8001";

  chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
    if (message?.type !== "gitbounty:get-repository-bounties") return false;
    const repository = String(message.repository || "").trim();
    if (!repository.includes("/")) {
      sendResponse({ ok: false, items: [] });
      return false;
    }

    const query = new URLSearchParams({ repository, per_page: "100" });
    fetch(`${API_BASE}/api/issues?${query}`, { credentials: "include" })
      .then(async (response) => {
        if (!response.ok) throw new Error(`GitBounty API returned ${response.status}`);
        return response.json();
      })
      .then((payload) => sendResponse({ ok: true, items: Array.isArray(payload?.items) ? payload.items : [] }))
      .catch(() => sendResponse({ ok: false, items: [] }));
    return true;
  });
})();
