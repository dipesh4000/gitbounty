(function runGitBountyPopup() {
  "use strict";

  const API_BASE = "http://localhost:8001";
  const DASHBOARD_URL = "https://gitbounty-ledger.aasthamalik-work.chatgpt.site/contributors";
  const DEMO_SESSION_KEY = "gitbounty_demo_session";
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
    const response = await fetch(`${API_BASE}${path}`, { credentials: "include", ...options });
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

    const tracked = data.popupState(user, pageContext) === "tracked-issue";
    byId("page-context").hidden = !tracked;
    if (tracked) {
      const issue = pageContext.issue;
      byId("issue-title").textContent = `#${issue.number} ${issue.title}`;
      byId("issue-detail").textContent = `${issue.assignee || "unassigned"} · ${issue.category || "tracked"}`.toUpperCase();
      byId("issue-points").textContent = `+${data.formatPoints(issue.points)}`;
    }
    show("signed-in-state");
  }

  function demoAccount() {
    return {
      user: { github_login: "aasha-malik" },
      points: {
        github_login: "aasha-malik",
        total_points: 185,
        week_points: 185,
        recent_merges: [
          { number: 1857, repo_full_name: "openframe/core", points: 5 },
          { number: 611, repo_full_name: "relaylabs/queue", points: 65 },
          { number: 93, repo_full_name: "halyard/docs", points: 25 },
        ],
      },
    };
  }

  async function load() {
    show("loading-state");
    const contextPromise = activePageContext();
    if (window.localStorage.getItem(DEMO_SESSION_KEY) === "connected") {
      const demo = demoAccount();
      renderSignedIn(demo.user, demo.points, await contextPromise);
      return;
    }
    try {
      const user = await api("/api/me");
      const [pointsPayload, pageContext] = await Promise.all([api("/api/me/points"), contextPromise]);
      renderSignedIn(user, pointsPayload, pageContext);
    } catch (error) {
      await contextPromise;
      if (error.status === 401) {
        show("signed-out-state");
        return;
      }
      byId("error-message").textContent = error.status === 503
        ? "GitBounty is not configured yet. Add the backend environment values, then try again."
        : "The GitBounty API is not running on localhost:8001.";
      show("error-state");
    }
  }

  byId("connect-button").addEventListener("click", async () => {
    window.localStorage.setItem(DEMO_SESSION_KEY, "connected");
    const demo = demoAccount();
    renderSignedIn(demo.user, demo.points, await activePageContext());
  });
  byId("retry-button").addEventListener("click", load);
  byId("refresh-button").addEventListener("click", () => { byId("popup-menu").hidden = true; load(); });
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
    window.localStorage.removeItem(DEMO_SESSION_KEY);
    try { await api("/auth/logout", { method: "POST" }); } catch { /* the local session may already be gone */ }
    byId("popup-menu").hidden = true;
    show("signed-out-state");
  });

  function renderPreview() {
    const state = new URLSearchParams(window.location.search).get("state") || "tracked";
    if (state === "signed-out") {
      show("signed-out-state");
      return;
    }
    const { user, points } = demoAccount();
    const context = state === "tracked" ? {
      issue: {
        number: 1842,
        title: "Improve keyboard navigation",
        assignee: "unassigned",
        category: "frontend",
        points: 40,
      },
    } : null;
    renderSignedIn(user, points, context);
  }

  if (globalThis.chrome?.tabs) load();
  else renderPreview();
})();
