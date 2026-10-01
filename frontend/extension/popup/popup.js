/*
  The toolbar popup.

  Everything shown here comes from the GitBounty API or from the GitHub page the visitor is looking at.
  There is no demo account and no canned activity: with no session the popup says so and offers the real
  OAuth route, and with a broken API it says that instead of showing a number nobody earned.
*/
(function runGitBountyPopup() {
  "use strict";

  const { API_BASE, APP_BASE, SIGN_IN_URL, DASHBOARD_URL } = globalThis.GitBountyConfig;
  const data = globalThis.GitBountyPopupData;
  const ids = ["loading-state", "signed-out-state", "error-state", "signed-in-state"];
  const byId = (id) => document.getElementById(id);

  function show(id) {
    ids.forEach((candidate) => { byId(candidate).hidden = candidate !== id; });
  }

  function openTab(url) {
    chrome.tabs.create({ url });
  }

  async function api(path, options = {}) {
    let response;
    try {
      response = await fetch(`${API_BASE}${path}`, { credentials: "include", ...options });
    } catch {
      const error = new Error(`GitBounty is not running on ${API_BASE}.`);
      error.status = 0;
      throw error;
    }
    if (!response.ok) {
      const error = new Error(`GitBounty API returned ${response.status}`);
      error.status = response.status;
      throw error;
    }
    return response.json();
  }

  async function activePageContext() {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (!tab?.id || !tab.url?.startsWith("https://github.com/")) return null;
    try {
      return await chrome.tabs.sendMessage(tab.id, { type: "gitbounty:get-page-context" });
    } catch {
      // No content script on this page -- not an issue or pull request URL. Not an error.
      return null;
    }
  }

  function renderActivity(pointsPayload) {
    const list = byId("activity-list");
    list.replaceChildren();
    const activity = data.normalizeActivity(pointsPayload);
    byId("empty-activity").hidden = activity.length > 0;

    activity.forEach((merge) => {
      const row = document.createElement(merge.url ? "button" : "div");
      row.className = "activity-row";
      if (merge.url) {
        row.type = "button";
        row.addEventListener("click", () => openTab(merge.url));
      }
      const label = document.createElement("span");
      label.textContent = `#${merge.number} merged · ${merge.repository}`;
      const value = document.createElement("strong");
      value.textContent = `+${data.formatPoints(merge.points)}`;
      row.append(label, value);
      list.append(row);
    });
  }

  function renderSignedIn(user, pointsPayload, pageContext) {
    const login = user.github_login || pointsPayload.github_login || "contributor";
    byId("user-login").textContent = `@${login}`;
    byId("user-avatar").textContent = data.initials(login);
    byId("points-total").textContent = data.formatPoints(pointsPayload.week_points ?? pointsPayload.total_points);
    renderActivity(pointsPayload);

    /*
      The page panel appears only for an issue with a published GitBounty bounty. The content script
      returns null for anything else, so an untracked issue shows nothing rather than a guess.
    */
    const tracked = data.popupState(user, pageContext) === "tracked-issue";
    byId("page-context").hidden = !tracked;
    if (tracked) {
      const issue = pageContext.issue;
      byId("issue-title").textContent = `#${issue.number} ${issue.title}`;
      byId("issue-detail").textContent = `${issue.status || "open"} · ${issue.category || "tracked"}`.toUpperCase();
      byId("issue-points").textContent = `+${data.formatPoints(issue.points)}`;
    }
    show("signed-in-state");
  }

  async function load() {
    show("loading-state");
    const contextPromise = activePageContext();
    try {
      const user = await api("/api/me");
      const [pointsPayload, pageContext] = await Promise.all([api("/api/me/points"), contextPromise]);
      renderSignedIn(user, pointsPayload, pageContext);
    } catch (error) {
      await contextPromise;
      if (error.status === 401) {
        // Signed out, or the session expired. Same remedy either way: sign in again.
        show("signed-out-state");
        return;
      }
      byId("error-message").textContent = error.status === 503
        ? "GitBounty is running but not configured yet. Add the backend environment values, then try again."
        : error.status === 0
          ? `GitBounty is not running on ${API_BASE}.`
          : `The GitBounty API answered ${error.status}.`;
      show("error-state");
    }
  }

  byId("connect-button").addEventListener("click", () => openTab(SIGN_IN_URL));
  byId("retry-button").addEventListener("click", load);
  byId("refresh-button").addEventListener("click", () => {
    byId("popup-menu").hidden = true;
    // Drop the background worker's cached bounties too, or Refresh would re-show a stale answer.
    chrome.runtime.sendMessage({ type: "gitbounty:invalidate-cache" }, () => load());
  });
  byId("dashboard-button").addEventListener("click", () => openTab(DASHBOARD_URL));
  document.querySelectorAll("[data-open-external]").forEach((link) => {
    link.addEventListener("click", (event) => { event.preventDefault(); openTab(link.href); });
  });

  byId("menu-button").addEventListener("click", () => {
    const menu = byId("popup-menu");
    menu.hidden = !menu.hidden;
    byId("menu-button").setAttribute("aria-expanded", String(!menu.hidden));
  });
  byId("signout-button").addEventListener("click", async () => {
    try { await api("/auth/logout", { method: "POST" }); } catch { /* the session may already be gone */ }
    chrome.runtime.sendMessage({ type: "gitbounty:invalidate-cache" }, () => undefined);
    byId("popup-menu").hidden = true;
    show("signed-out-state");
  });

  // Opened outside the browser (a plain file load, for layout work): show the signed-out state, which
  // is the only one that needs no data. Never a fabricated signed-in view.
  if (globalThis.chrome?.tabs) load();
  else show("signed-out-state");

  globalThis.GitBountyPopup = { APP_BASE };
})();
