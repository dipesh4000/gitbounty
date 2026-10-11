const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const { formatPoints, initials, normalizeActivity, popupState } = require("../popup/data.js");
const { JSDOM } = require("jsdom");
const config = require("../src/config.js");

const read = (relative) => fs.readFileSync(path.join(__dirname, "..", relative), "utf8");

test("derives all three popup states from auth and page context", () => {
  assert.equal(popupState(null, null), "signed-out");
  assert.equal(popupState({ github_login: "maya-dev" }, null), "default");
  assert.equal(
    popupState({ github_login: "maya-dev" }, { issue: { points: 40 } }),
    "tracked-issue",
  );
});

test("formats identities and activity without inventing records", () => {
  assert.equal(initials("maya-dev"), "MD");
  assert.equal(formatPoints(1200), "1,200");
  assert.deepEqual(normalizeActivity({ recent_merges: [] }), []);
  assert.deepEqual(normalizeActivity({}), [], "a payload with no merges yields no activity");
  assert.deepEqual(normalizeActivity({
    recent_merges: [{ number: 611, repo_full_name: "relaylabs/queue", points: 65, url: "https://example.test" }],
  }), [{ number: 611, repository: "relaylabs/queue", points: 65, url: "https://example.test" }]);
});

test("every GitBounty URL points at the local app, and nowhere unrelated", () => {
  const popupHtml = read("popup/popup.html");
  const popupJs = read("popup/popup.js");
  const source = `${popupHtml}\n${popupJs}\n${read("src/config.js")}\n${read("src/background.js")}`;

  assert.equal(config.API_BASE, "http://localhost:8001");
  assert.equal(config.APP_BASE, "http://localhost:3000");
  assert.equal(config.DASHBOARD_URL, "http://localhost:3000/explore");
  assert.equal(config.SIGN_IN_URL, "http://localhost:8001/auth/github", "Connect GitHub uses the real OAuth route");
  assert.match(popupHtml, /href="http:\/\/localhost:3000\/"/);
  assert.doesNotMatch(source, /chatgpt\.site/i);
  assert.doesNotMatch(source, /localhost:8000/, "the website is on 3000, not the old 8000");
});


test("popup renders real account/claims, navigates, and distinguishes API failures", async () => {
  for (const status of [200, 401, 503, 500, 0]) {
    const dom = new JSDOM(read("popup/popup.html"), { runScripts: "outside-only", url: "https://extension.test" });
    const { window } = dom;
    const opened = [];
    const invalidations = [];
    window.chrome = {
      tabs: { query: async () => [], create: ({ url }) => opened.push(url) },
      runtime: { sendMessage: (message, callback) => { invalidations.push(message.type); callback(); } },
    };
    window.fetch = async (url) => {
      if (!status) throw new Error("offline");
      const payload = url.endsWith("/api/me/claims") ? { points: 40, items: [] }
        : url.endsWith("/api/me/points") ? { week_points: 45, recent_merges: [] }
        : { github_login: "actual-author" };
      return { ok: status === 200, status, json: async () => payload };
    };
    try {
      for (const file of ["src/config.js", "popup/data.js", "popup/popup.js"]) window.eval(read(file));
      await new Promise(setImmediate);
      const byId = (id) => window.document.getElementById(id);
      const visible = status === 200 ? "signed-in-state" : status === 401 ? "signed-out-state" : "error-state";
      assert.equal(byId(visible).hidden, false);
      if (status === 200) {
        assert.equal(byId("user-login").textContent, "@actual-author");
        assert.equal(byId("points-total").textContent, "45");
        assert.equal(byId("claims-button").textContent, "Claim 40 points");
        byId("claims-button").click();
        assert.deepEqual(opened, [config.DASHBOARD_URL + "#points"]);
        byId("refresh-button").click();
        await new Promise(setImmediate);
        assert.deepEqual(invalidations, ["gitbounty:invalidate-cache"]);
        byId("signout-button").click();
        await new Promise(setImmediate);
        assert.equal(byId("signed-out-state").hidden, false);
      } else if (status !== 401) {
        assert.match(byId("error-message").textContent,
          status === 503 ? /not configured/ : status === 0 ? /not running/ : /500/);
      }
    } finally { window.close(); }
  }
});


test("a claims failure preserves the signed-in account and bounty navigation", async () => {
  const dom = new JSDOM(read("popup/popup.html"), {runScripts:"outside-only"});
  const {window} = dom;
  const opened = [];
  window.chrome = {tabs:{query:async()=>[],create:({url})=>opened.push(url)}};
  window.fetch = async url => ({ok:!url.endsWith("/claims"),status:url.endsWith("/claims")?503:200,
    json:async()=>url.endsWith("/points")?{week_points:45,recent_merges:[]}:{github_login:"actual-author"}});
  try {
    for (const file of ["src/config.js","popup/data.js","popup/popup.js"]) window.eval(read(file));
    await new Promise(setImmediate);
    assert.equal(window.document.getElementById("signed-in-state").hidden,false);
    assert.equal(window.document.getElementById("points-total").textContent,"45");
    assert.match(window.document.getElementById("claims-notice").textContent,/could not load/);
    window.document.getElementById("create-button").click();
    window.document.getElementById("explore-button").click();
    assert.deepEqual(opened,[config.APP_BASE+"/maintainers",config.DASHBOARD_URL]);
  } finally {window.close();}
});


const nextTurn = () => new Promise(setImmediate);
const bounty = number => ({ repository: "org/project", number, title: `Fix issue ${number}`, language: "Rust", category: "backend", stars: 12, points: 40,
  labels: ["Good First Issue"], reward_usdc: "1.25", reward_chain_id: 43113 });
async function bootPopup(respond) {
  const dom = new JSDOM(read("popup/popup.html"), { runScripts: "outside-only" });
  const opened = [];
  dom.window.chrome = { tabs: { query: async () => [], create: ({ url }) => opened.push(url) },
    runtime: { sendMessage: (_message, callback) => callback?.() } };
  dom.window.fetch = async (url, options) => {
    const answer = await respond(new URL(url), options);
    return { ok: (answer.status ?? 200) === 200, status: answer.status ?? 200, json: async () => answer.body };
  };
  for (const file of ["src/config.js", "popup/data.js", "popup/popup.js"]) dom.window.eval(read(file));
  await nextTurn();
  return { dom, window: dom.window, opened, byId: id => dom.window.document.getElementById(id) };
}
function accountResponse(url) {
  return { body: url.pathname.endsWith("/points") ? { total_points: 12, recent_merges: [] }
    : url.pathname.endsWith("/claims") ? { points: 0 } : { github_login: "actual-author" } };
}

test("discovery pages and filters published issues while signed out, with safe links", async () => {
  const queries = [];
  const popup = await bootPopup(url => {
    if (url.pathname === "/api/issues") { queries.push(url.searchParams); return { body: { items: [bounty(Number(url.searchParams.get("page")))], has_more: url.searchParams.get("page") === "1" } }; }
    return { status: 401 };
  });
  const { window, byId, opened, dom } = popup;
  try {
    assert.equal(byId("signed-out-state").hidden, false);
    assert.match(byId("discovery-list").textContent, /1.25 USDC · Fuji testnet promised/);
    byId("discovery-list").querySelector("a").click();
    assert.deepEqual(opened, ["https://github.com/org/project/issues/1"]);
    byId("issues-next").click(); await nextTurn();
    assert.equal(queries.at(-1).get("page"), "2");
    assert.match(byId("discovery-list").textContent, /Fix issue 2/);
    byId("issue-beginner").checked = true;
    byId("issue-beginner").dispatchEvent(new window.Event("change"));
    await new Promise(resolve => setTimeout(resolve, 10)); await nextTurn();
    assert.equal(queries.at(-1).get("page"), "1");
    assert.equal(queries.at(-1).get("beginner"), "true");
    assert.equal(byId("filters-clear").hidden, false);
    const helpers = window.GitBountyPopupData;
    assert.equal(helpers.issueUrl({ repository: "javascript:alert(1)", number: 1 }), null);
    assert.equal(helpers.issueUrl({ repository: "org/repo", number: -1 }), null);
  } finally { dom.window.close(); }
});

test("stale discovery responses cannot replace newer filter results", async () => {
  let resolveOld;
  const old = new Promise(resolve => { resolveOld = resolve; });
  const popup = await bootPopup(url => url.pathname === "/api/issues"
    ? url.searchParams.has("q") ? { body: { items: [{ ...bounty(2), title: "<img src=x onerror=alert(1)>" }], has_more: false } } : old
    : { status: 401 });
  try {
    popup.byId("issue-search").value = "keyboard";
    popup.byId("issue-search").dispatchEvent(new popup.window.Event("input"));
    await new Promise(resolve => setTimeout(resolve, 300)); await nextTurn();
    resolveOld({ body: { items: [bounty(1)], has_more: true } }); await nextTurn();
    assert.match(popup.byId("discovery-list").textContent, /<img src=x onerror=alert\(1\)>/);
    assert.equal(popup.byId("discovery-list").querySelector("img"), null);
    assert.equal(popup.byId("issues-next").disabled, true);
  } finally { popup.window.close(); }
});

test("shows exact wallet balance separately from all-time points and handles logout failure", async () => {
  const popup = await bootPopup(url => url.pathname === "/api/avax/wallet/balance" ? { body: {
    address: "0x" + "1".repeat(40), balance: "1.250001", symbol: "USDC", native_balance_avax: "0.123456789123456789",
    network: "Avalanche Fuji", testnet: true, checked_at: "2026-10-10T10:00:00Z" } }
    : url.pathname === "/auth/logout" ? { status: 503 }
    : url.pathname === "/api/issues" ? { body: { items: [], has_more: false } } : accountResponse(url));
  try {
    assert.equal(popup.byId("wallet-balance").textContent, "1.250001 USDC");
    assert.match(popup.byId("wallet-gas").textContent, /0.123456789123456789 AVAX/);
    assert.match(popup.byId("wallet-network").textContent, /TEST TOKENS/);
    assert.equal(popup.byId("points-period").textContent, "all time");
    popup.byId("wallet-button").click();
    assert.equal(popup.opened.at(-1), config.DASHBOARD_URL + "#rewards");
    popup.byId("signout-button").click(); await nextTurn();
    assert.equal(popup.byId("signed-in-state").hidden, false);
    assert.match(popup.byId("claims-notice").textContent, /Sign out failed/);
    popup.byId("menu-button").click();
    popup.window.document.dispatchEvent(new popup.window.KeyboardEvent("keydown", { key: "Escape" }));
    assert.equal(popup.byId("menu-button").getAttribute("aria-expanded"), "false");
  } finally { popup.window.close(); }
});

test("balance failure does not fabricate zero or hide account and issue discovery", async () => {
  const popup = await bootPopup(url => url.pathname === "/api/avax/wallet/balance" ? { status: 502 }
    : url.pathname === "/api/issues" ? { body: { items: [bounty(1)], has_more: false } } : accountResponse(url));
  try {
    assert.equal(popup.byId("signed-in-state").hidden, false);
    assert.equal(popup.byId("wallet-values").hidden, true);
    assert.match(popup.byId("wallet-status").textContent, /Balance unavailable/);
    assert.match(popup.byId("discovery-list").textContent, /Fix issue 1/);
  } finally { popup.window.close(); }
});

test("a late private balance response cannot revive the wallet after logout", async () => {
  let resolveWallet;
  const wallet = new Promise(resolve => { resolveWallet = resolve; });
  const popup = await bootPopup(url => url.pathname === "/api/avax/wallet/balance" ? wallet
    : url.pathname === "/api/issues" ? { body: { items: [], has_more: false } } : accountResponse(url));
  try {
    popup.byId("signout-button").click(); await nextTurn();
    resolveWallet({ body: { address: "0xprivate", balance: "100", symbol: "USDC" } }); await nextTurn();
    assert.equal(popup.byId("signed-out-state").hidden, false);
    assert.equal(popup.byId("wallet-values").hidden, true);
    assert.equal(popup.byId("wallet-balance").textContent, "");
  } finally { popup.window.close(); }
});
