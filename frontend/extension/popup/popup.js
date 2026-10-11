/* Account reads and public discovery are independent: no fabricated balances or rewards. */
(function runGitBountyPopup() {
  "use strict";
  const { API_BASE, APP_BASE, SIGN_IN_URL, DASHBOARD_URL } = globalThis.GitBountyConfig;
  const data = globalThis.GitBountyPopupData;
  const byId = id => document.getElementById(id);
  let authEpoch = 0, feedEpoch = 0, page = 1, feedController, searchTimer;

  function selectView(account) {
    byId("account-panel").hidden = !account; byId("discovery-panel").hidden = account;
    byId("discover-tab").setAttribute("aria-pressed", String(!account)); byId("account-tab").setAttribute("aria-pressed", String(account));
  }
  byId("discover-tab").addEventListener("click", () => selectView(false));
  byId("account-tab").addEventListener("click", () => selectView(true));
  byId("wallet-summary").addEventListener("click", () => selectView(true));
  function show(id) {
    if (id === "signed-out-state") { byId("account-overview").textContent = "Sign in to see your wallet and points."; byId("wallet-summary").hidden = true; }
    if (id === "loading-state") { byId("account-overview").textContent = "Reading your account…"; byId("wallet-summary").hidden = true; }
    ["loading-state", "signed-out-state", "error-state", "signed-in-state"].forEach(candidate => { byId(candidate).hidden = candidate !== id; });
  }
  function closeMenu() { byId("popup-menu").hidden = true; byId("menu-button").setAttribute("aria-expanded", "false"); }
  function openTab(url) {
    let target; try { target = new URL(url); } catch { return; }
    if (target.origin === APP_BASE || target.origin === API_BASE || target.origin === "https://github.com") chrome.tabs.create({ url: target.href });
  }
  async function api(path, options = {}) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 12000);
    const abort = () => controller.abort();
    if (options.signal?.aborted) controller.abort();
    options.signal?.addEventListener("abort", abort, { once: true });
    try {
      const response = await fetch(`${API_BASE}${path}`, { credentials: "include", ...options, signal: controller.signal });
      if (!response.ok) { const error = new Error(`GitBounty API returned ${response.status}`); error.status = response.status; throw error; }
      return await response.json();
    } catch (error) { if (error.status === undefined) error.status = 0; throw error; }
    finally { clearTimeout(timeout); options.signal?.removeEventListener("abort", abort); }
  }
  async function activePageContext() {
    try {
      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
      if (!tab?.id || !tab.url?.startsWith("https://github.com/")) return null;
      return await chrome.tabs.sendMessage(tab.id, { type: "gitbounty:get-page-context" });
    } catch { return null; }
  }
  function renderActivity(payload) {
    const list = byId("activity-list"); list.replaceChildren();
    const activity = data.normalizeActivity(payload);
    byId("empty-activity").hidden = activity.length > 0;
    activity.forEach(merge => {
      const row = document.createElement(merge.url ? "button" : "div"); row.className = "activity-row";
      if (merge.url) { row.type = "button"; row.addEventListener("click", () => openTab(merge.url)); }
      const label = document.createElement("span"); label.textContent = `#${merge.number} merged · ${merge.repository}`;
      const value = document.createElement("strong"); value.textContent = `+${data.formatPoints(merge.points)}`;
      row.append(label, value); list.append(row);
    });
  }
  async function loadWallet(epoch = authEpoch) {
    byId("wallet-refresh").disabled = true; byId("wallet-values").hidden = true;
    byId("wallet-network").textContent = ""; byId("wallet-status").textContent = "Reading wallet…";
    try {
      const wallet = await api("/api/avax/wallet/balance");
      if (epoch !== authEpoch) return;
      byId("wallet-network").textContent = `${wallet.network || "Avalanche"}${wallet.testnet ? " · TEST TOKENS, NO REAL VALUE" : ""}`;
      byId("wallet-summary").hidden = false;
      if (!wallet.address || wallet.balance == null) { byId("wallet-status").textContent = "No wallet linked. Link your receiving wallet on the website."; byId("wallet-summary").textContent = "Link your wallet →"; return; }
      byId("wallet-summary").textContent = `${wallet.balance} ${wallet.symbol}${wallet.testnet ? " · Fuji testnet" : " · Avalanche"} →`;
      byId("wallet-status").textContent = ""; byId("wallet-values").hidden = false;
      byId("wallet-balance").textContent = `${wallet.balance} ${wallet.symbol}`;
      byId("wallet-gas").textContent = wallet.symbol === "USDC" ? `${wallet.native_balance_avax} AVAX · native gas balance` : "Native Avalanche balance";
      byId("wallet-address").textContent = wallet.address;
      const time = new Date(wallet.checked_at);
      byId("wallet-checked").textContent = Number.isNaN(time.getTime()) ? "Read from Avalanche" : `Checked ${time.toLocaleTimeString()}`;
    } catch (error) {
      if (epoch !== authEpoch) return;
      if (error.status === 401) { authEpoch++; show("signed-out-state"); }
      else { byId("wallet-status").textContent = "Balance unavailable. Refresh to retry; no zero balance is assumed.";
        byId("wallet-summary").hidden = false; byId("wallet-summary").textContent = "Balance unavailable · retry →"; }
    } finally { if (epoch === authEpoch) byId("wallet-refresh").disabled = false; }
  }
  async function load() {
    const epoch = ++authEpoch; closeMenu(); show("loading-state");
    try {
      const user = await api("/api/me");
      const [points, context, claims] = await Promise.all([
        api("/api/me/points").catch(error => { if (error.status === 401) throw error; return null; }), activePageContext(),
        api("/api/me/claims").catch(error => { if (error.status === 401) throw error; return { points: 0, error: "Claims could not load. Open the dashboard to retry." }; }),
      ]);
      if (epoch !== authEpoch) return;
      const login = user.github_login || "contributor";
      byId("user-login").textContent = `@${login}`; byId("user-login").title = `GitHub account: @${login}`;
      byId("user-avatar").textContent = data.initials(login);
      byId("points-total").textContent = points ? data.formatPoints(points.week_points ?? points.total_points) : "—";
      byId("points-period").textContent = points?.week_points != null ? "this week" : "all time";
      byId("account-overview").textContent = `@${login} · ${points ? data.formatPoints(points.week_points ?? points.total_points) : "—"} points ${points?.week_points != null ? "this week" : "all time"}`;
      renderActivity(points);
      byId("claims-notice").textContent = claims.error || (!points ? "Points could not load. Refresh to retry." : "");
      byId("claims-notice").hidden = !byId("claims-notice").textContent;
      byId("claims-button").hidden = !claims.points;
      byId("claims-button").textContent = `Claim ${data.formatPoints(claims.points)} points`;
      const tracked = data.popupState(user, context) === "tracked-issue";
      byId("page-context").hidden = !tracked;
      if (tracked) {
        byId("issue-title").textContent = `#${context.issue.number} ${context.issue.title}`;
        byId("issue-detail").textContent = `${context.issue.status || "open"} · ${context.issue.category || "tracked"}`;
        byId("issue-points").textContent = `+${data.formatPoints(context.issue.points)} points`;
      }
      show("signed-in-state"); void loadWallet(epoch);
    } catch (error) {
      if (epoch !== authEpoch) return;
      if (error.status === 401) { show("signed-out-state"); return; }
      byId("error-message").textContent = error.status === 503 ? "GitBounty is running but not configured yet. Check backend setup, then retry." : error.status === 0 ? `GitBounty is not running on ${API_BASE}, or the request timed out.` : `The GitBounty API answered ${error.status}.`;
      byId("account-overview").textContent = "Account unavailable. Open Account & wallet to retry."; show("error-state");
    }
  }
  async function discover() {
    clearTimeout(searchTimer); feedController?.abort(); feedController = new AbortController();
    const epoch = ++feedEpoch;
    const params = new URLSearchParams({ page: String(page), per_page: "5", sort: byId("issue-sort").value });
    for (const [key, id] of [["q", "issue-search"], ["language", "issue-language"], ["category", "issue-category"]]) if (byId(id).value.trim()) params.set(key, byId(id).value.trim());
    if (byId("issue-beginner").checked) params.set("beginner", "true");
    byId("discovery-list").replaceChildren(); byId("discovery-list").setAttribute("aria-busy", "true");
    byId("discovery-status").textContent = "Finding published issues…"; byId("discover-retry").hidden = true;
    byId("issues-previous").disabled = true; byId("issues-next").disabled = true;
    byId("filters-clear").hidden = !["q", "language", "category", "beginner"].some(key => params.has(key));
    try {
      const result = await api(`/api/issues?${params}`, { signal: feedController.signal });
      if (epoch !== feedEpoch) return;
      const items = Array.isArray(result.items) ? result.items : [];
      items.forEach(issue => {
        const url = data.issueUrl(issue); if (!url) return;
        const row = document.createElement("li"); row.className = "discovery-card";
        const meta = document.createElement("p"); meta.className = "issue-repository"; meta.textContent = `${issue.repository} #${issue.number}`;
        const link = document.createElement("a"); link.href = url; link.textContent = issue.title; link.addEventListener("click", event => { event.preventDefault(); openTab(url); });
        const details = document.createElement("p"); details.className = "discovery-meta";
        details.textContent = `${issue.language || "Language unspecified"} · ${issue.category || "Uncategorized"} · ${data.formatPoints(issue.stars)} stars`;
        const reward = document.createElement("p"); reward.className = "discovery-reward";
        reward.textContent = `${data.formatPoints(issue.points)} points${data.promiseLabel(issue) ? ` · ${data.promiseLabel(issue)} promised` : " · Points only"}`;
        row.append(meta, link, details, reward);
        if ((Array.isArray(issue.labels) ? issue.labels : []).some(label => /^(good first issue|good-first-issue|good first contribution|good-first-contribution)$/i.test(label))) {
          const beginner = document.createElement("small"); beginner.className = "beginner-badge"; beginner.textContent = "Good first issue · maintainer label"; row.append(beginner);
        }
        byId("discovery-list").append(row);
      });
      const count = byId("discovery-list").children.length;
      byId("discovery-status").textContent = count ? `${count} published ${count === 1 ? "issue" : "issues"} · check requirements on GitHub before starting.` : "No matching published issues. Clear filters or ask a maintainer to publish a bounty.";
      byId("issues-page").textContent = `Page ${page}`; byId("issues-previous").disabled = page === 1;
      byId("issues-next").disabled = !result.has_more;
    } catch {
      if (epoch !== feedEpoch) return;
      byId("discovery-status").textContent = "Issues could not load. Check the local API and retry."; byId("discover-retry").hidden = false;
    } finally { if (epoch === feedEpoch) byId("discovery-list").setAttribute("aria-busy", "false"); }
  }
  function filterChanged(delay = 0) {
    page = 1; feedEpoch++; feedController?.abort(); clearTimeout(searchTimer);
    byId("issues-previous").disabled = true; byId("issues-next").disabled = true;
    searchTimer = setTimeout(discover, delay);
  }
  ["issue-search", "issue-language"].forEach(id => byId(id).addEventListener("input", () => filterChanged(250)));
  ["issue-category", "issue-sort", "issue-beginner"].forEach(id => byId(id).addEventListener("change", () => filterChanged()));
  byId("discovery-form").addEventListener("submit", event => { event.preventDefault(); filterChanged(); });
  byId("filters-clear").addEventListener("click", () => { byId("discovery-form").reset(); filterChanged(); byId("issue-search").focus(); });
  byId("issues-previous").addEventListener("click", () => { page--; void discover(); });
  byId("issues-next").addEventListener("click", () => { page++; void discover(); });
  byId("discover-refresh").addEventListener("click", () => void discover());
  byId("discover-retry").addEventListener("click", () => void discover());
  byId("wallet-refresh").addEventListener("click", () => void loadWallet());
  byId("wallet-button").addEventListener("click", () => openTab(`${DASHBOARD_URL}#rewards`));
  byId("explore-button").addEventListener("click", () => openTab(DASHBOARD_URL));
  byId("create-button").addEventListener("click", () => openTab(`${APP_BASE}/maintainers`));
  byId("connect-button").addEventListener("click", () => openTab(SIGN_IN_URL));
  byId("retry-button").addEventListener("click", load);
  byId("claims-button").addEventListener("click", () => openTab(`${DASHBOARD_URL}#points`));
  byId("dashboard-button").addEventListener("click", () => openTab(DASHBOARD_URL));
  document.querySelectorAll("[data-open-external]").forEach(link => link.addEventListener("click", event => { event.preventDefault(); openTab(link.href); }));
  byId("refresh-button").addEventListener("click", () => {
    closeMenu(); chrome.runtime.sendMessage({ type: "gitbounty:invalidate-cache" }, () => { void load(); void discover(); });
  });
  byId("menu-button").addEventListener("click", () => { const menu = byId("popup-menu"); menu.hidden = !menu.hidden; byId("menu-button").setAttribute("aria-expanded", String(!menu.hidden)); });
  document.addEventListener("keydown", event => { if (event.key === "Escape" && !byId("popup-menu").hidden) { closeMenu(); byId("menu-button").focus(); } });
  document.addEventListener("click", event => { if (!event.target.closest(".popup-header")) closeMenu(); });
  byId("signout-button").addEventListener("click", async () => {
    byId("signout-button").disabled = true;
    try {
      await api("/auth/logout", { method: "POST" }); authEpoch++; byId("wallet-values").hidden = true;
      chrome.runtime.sendMessage({ type: "gitbounty:invalidate-cache" }, () => undefined); closeMenu(); show("signed-out-state");
    } catch { byId("claims-notice").textContent = "Sign out failed. Retry from the menu or open the website."; byId("claims-notice").hidden = false; }
    finally { byId("signout-button").disabled = false; }
  });
  if (globalThis.chrome?.tabs) { void load(); void discover(); }
  else show("signed-out-state");
  globalThis.GitBountyPopup = { APP_BASE };
})();
