/* ---------------------------------------------------------
   GitBounty — app pages (leaderboard, your points)

   Plain JavaScript, no build step, matching the rest of the site.

   Everything rendered here comes from GitHub by way of our API: logins, repository names, pull request titles.
   None of it is trustworthy, so this file builds DOM nodes and sets textContent. There is no innerHTML with
   values in it anywhere, which is what stops a pull request titled "<img onerror=...>" from running.
--------------------------------------------------------- */

/* The website and the API are separate origins. In development the API is on :8000 and the site is served by
   some other static server; in production this is set once, at the top of the page, via GITBOUNTY_API_BASE. */
const API_BASE = window.GITBOUNTY_API_BASE ?? "http://127.0.0.1:8000";

/* The shared category vocabulary (feature-seams.md, seam 3). The API rejects anything not in this list, so if
   these ever disagree the API wins. */
const CATEGORIES = [
  "frontend", "backend", "fullstack", "docs",
  "testing", "devops", "design", "mobile", "other",
];

const PERIODS = [
  { value: "all", label: "All time" },
  { value: "month", label: "This month" },
  { value: "week", label: "This week" },
];

/* ---------------- tiny helpers ---------------- */

function el(tag, props = {}, children = []) {
  const node = document.createElement(tag);
  for (const [key, value] of Object.entries(props)) {
    if (value === null || value === undefined) continue;
    if (key === "class") node.className = value;
    else if (key === "text") node.textContent = value;      // always textContent, never innerHTML
    else if (key.startsWith("on")) node.addEventListener(key.slice(2).toLowerCase(), value);
    else node.setAttribute(key, value);
  }
  for (const child of [].concat(children)) {
    if (child) node.appendChild(child);
  }
  return node;
}

function clear(node) {
  while (node.firstChild) node.removeChild(node.firstChild);
}

function plural(count, word) {
  return `${count} ${word}${count === 1 ? "" : "s"}`;
}

function formatDate(iso) {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "";
  return date.toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" });
}

/* One place that knows how to talk to the API, so every page reports a failure the same way. */
async function api(path) {
  let response;
  try {
    response = await fetch(`${API_BASE}${path}`, { headers: { Accept: "application/json" } });
  } catch (cause) {
    // fetch only rejects for network-level problems: server down, DNS, CORS refusal.
    throw new ApiError("Can't reach the GitBounty API.", { unreachable: true, cause });
  }
  if (!response.ok) {
    let detail = `The API returned ${response.status}.`;
    try {
      const body = await response.json();
      if (typeof body.detail === "string") detail = body.detail;
    } catch { /* a non-JSON error body is fine; the status line above still describes it */ }
    throw new ApiError(detail, { status: response.status });
  }
  return response.json();
}

async function apiPost(path) {
  let response;
  try {
    response = await fetch(`${API_BASE}${path}`, {
      method: "POST",
      headers: { Accept: "application/json" },
    });
  } catch (cause) {
    throw new ApiError("Can't reach the GitBounty API.", { unreachable: true, cause });
  }
  if (!response.ok) {
    let detail = `The API returned ${response.status}.`;
    try {
      const body = await response.json();
      if (typeof body.detail === "string") detail = body.detail;
    } catch { /* see above */ }
    throw new ApiError(detail, { status: response.status });
  }
  return response.json();
}

class ApiError extends Error {
  constructor(message, { status = null, unreachable = false, cause = null } = {}) {
    super(message);
    this.status = status;
    this.unreachable = unreachable;
    this.cause = cause;
  }
}

/* GitHub's own mark, drawn inline so the button needs no image request and follows the text colour. */
const GITHUB_MARK =
  "M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49"
  + "-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07"
  + "-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2"
  + ".82.64-.18 1.32-.27 2-.27s1.36.09 2 .27c1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82"
  + " 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.01 8.01 0 0"
  + " 0 16 8c0-4.42-3.58-8-8-8Z";

function githubIcon() {
  const ns = "http://www.w3.org/2000/svg";
  const svg = document.createElementNS(ns, "svg");
  svg.setAttribute("viewBox", "0 0 16 16");
  svg.setAttribute("aria-hidden", "true");
  const path = document.createElementNS(ns, "path");
  path.setAttribute("d", GITHUB_MARK);
  svg.appendChild(path);
  return svg;
}

/* One board renderer, shared by the leaderboard page and the landing page's top three. */
function boardElement(entries) {
  const board = el("ol", { class: "board" });
  for (const entry of entries) {
    const isYou = entry.github_login === window.GITBOUNTY_VIEWER;
    board.appendChild(
      el("li", { class: `board-entry${isYou ? " is-you" : ""}` }, [
        el("span", { class: "entry-rank", text: String(entry.rank) }),
        el("span", { class: "entry-who" }, [
          entry.avatar_url
            ? el("img", { class: "entry-avatar", src: entry.avatar_url, alt: "", loading: "lazy" })
            : el("span", {
                class: "entry-avatar is-placeholder",
                text: (entry.github_login[0] || "?").toUpperCase(),
                "aria-hidden": "true",
              }),
          el("span", { class: "entry-login", text: entry.github_login }),
          isYou ? el("span", { class: "entry-you-tag", text: "you" }) : null,
        ]),
        el("span", { class: "entry-merges", text: plural(entry.merges, "merge") }),
        el("span", { class: "entry-points" }, [
          document.createTextNode(String(entry.points)),
          el("span", { text: "pts" }),
        ]),
      ])
    );
  }
  return board;
}

/* ---------------- shared states ---------------- */

function showSkeleton(root, rows = 5) {
  clear(root);
  const board = el("div", { class: "board" });
  for (let i = 0; i < rows; i += 1) board.appendChild(el("div", { class: "skeleton-row" }));
  root.appendChild(board);
}

function showState(root, title, message, extra = null) {
  clear(root);
  root.appendChild(
    el("div", { class: "state" }, [
      el("h2", { text: title }),
      el("p", { text: message }),
      extra,
    ])
  );
}

/* An unreachable API during development almost always means the server isn't running, so say that rather than
   showing a bare "failed to fetch". */
function showApiError(root, error) {
  if (error.unreachable) {
    showState(
      root,
      "Can't reach the API",
      `Nothing is answering at ${API_BASE}. Start the backend and reload.`,
      el("p", { class: "app-section-note", text: "cd backend && .venv/bin/uvicorn app.main:app --reload" })
    );
    return;
  }
  showState(root, "Something went wrong", error.message);
}

/* ---------------- leaderboard page ---------------- */

function initLeaderboard() {
  const root = document.getElementById("leaderboard-root");
  const periodGroup = document.getElementById("period-control");
  const categoryGroup = document.getElementById("category-control");

  const params = new URLSearchParams(location.search);
  const state = {
    period: PERIODS.some((p) => p.value === params.get("period")) ? params.get("period") : "all",
    category: CATEGORIES.includes(params.get("category")) ? params.get("category") : null,
  };

  function buildControls() {
    clear(periodGroup);
    for (const period of PERIODS) {
      periodGroup.appendChild(
        el("button", {
          type: "button",
          text: period.label,
          "aria-pressed": String(state.period === period.value),
          onclick: () => {
            state.period = period.value;
            refresh();
          },
        })
      );
    }

    clear(categoryGroup);
    const options = [{ value: null, label: "All work" }].concat(
      CATEGORIES.map((c) => ({ value: c, label: c }))
    );
    for (const option of options) {
      categoryGroup.appendChild(
        el("button", {
          type: "button",
          class: `pill${state.category === option.value ? " is-active" : ""}`,
          text: option.label,
          onclick: () => {
            state.category = option.value;
            refresh();
          },
        })
      );
    }
  }

  /* Keep the address bar in step, so a filtered board can be linked to and the back button works. */
  function syncUrl() {
    const next = new URLSearchParams();
    if (state.period !== "all") next.set("period", state.period);
    if (state.category) next.set("category", state.category);
    const query = next.toString();
    history.replaceState(null, "", query ? `?${query}` : location.pathname);
  }

  function renderEntries(entries) {
    clear(root);

    if (entries.length === 0) {
      showState(
        root,
        "Nothing here yet",
        state.category || state.period !== "all"
          ? "No merges match this filter. Try a wider time range or another kind of work."
          : "No merges have been counted yet. Sync your GitHub account to get on the board.",
        el("a", { class: "btn btn-primary", href: "points.html", text: "Go to your points" })
      );
      return;
    }

    root.appendChild(boardElement(entries));
  }

  async function refresh() {
    buildControls();
    syncUrl();
    showSkeleton(root);

    const query = new URLSearchParams({ period: state.period });
    if (state.category) query.set("category", state.category);

    try {
      const data = await api(`/api/leaderboard?${query}`);
      renderEntries(data.entries);
    } catch (error) {
      showApiError(root, error);
    }
  }

  refresh();
}

/* ---------------- your points page ---------------- */

function initPoints() {
  /* Behind the "login": without the flag, go to the landing page and press the button. */
  if (session() && !session().requireSession()) return;

  const root = document.getElementById("points-root");
  const syncButton = document.getElementById("sync-button");
  const syncResult = document.getElementById("sync-result");

  function renderCategories(byCategory) {
    const entries = Object.entries(byCategory).sort((a, b) => b[1] - a[1]);
    if (entries.length === 0) return null;
    const highest = entries[0][1];

    return el("section", { class: "app-section" }, [
      el("h2", { text: "Where your points came from" }),
      el("p", { class: "app-section-note", text: "Points by kind of work." }),
      el(
        "div",
        { class: "cat-list" },
        entries.map(([category, points]) =>
          el("div", { class: "cat-row" }, [
            el("span", { class: "cat-name", text: category }),
            el("span", { class: "cat-bar" }, [
              el("span", {
                class: "cat-bar-fill",
                style: `width: ${highest ? Math.max(4, (points / highest) * 100) : 0}%`,
              }),
            ]),
            el("span", { class: "cat-points", text: String(points) }),
          ])
        )
      ),
    ]);
  }

  function renderMerges(merges) {
    if (merges.length === 0) return null;

    return el("section", { class: "app-section" }, [
      el("h2", { text: "Your merged pull requests" }),
      el("p", {
        class: "app-section-note",
        text: "Newest first. A pull request that closed an issue with points on it earns those points too.",
      }),
      el(
        "div",
        { class: "merge-list" },
        merges.map((merge) =>
          el("div", { class: "merge-item" }, [
            el("div", { class: "merge-main" }, [
              el("span", { class: "merge-repo", text: `${merge.repo_full_name} #${merge.number}` }),
              el("a", {
                class: "merge-title",
                href: merge.url,
                target: "_blank",
                rel: "noopener noreferrer",
                text: merge.title,
              }),
              el("div", { class: "merge-meta" }, [
                el("span", { class: "tag", text: merge.category }),
                el("span", { class: "merge-date", text: formatDate(merge.merged_at) }),
              ]),
            ]),
            el("div", { class: "merge-points" }, [
              document.createTextNode(`+${merge.points}`),
              el("small", {
                text: merge.issue_points
                  ? `${merge.issue_points} from the issue`
                  : "no points on the issue",
              }),
            ]),
          ])
        )
      ),
    ]);
  }

  function render(data) {
    clear(root);
    window.GITBOUNTY_VIEWER = data.github_login;

    root.appendChild(
      el("div", { class: "stat-row" }, [
        el("div", { class: "stat-card is-headline" }, [
          el("span", { class: "stat-num", text: String(data.total_points) }),
          el("span", { class: "stat-label", text: "points" }),
        ]),
        el("div", { class: "stat-card" }, [
          el("span", { class: "stat-num", text: String(data.total_merges) }),
          el("span", { class: "stat-label", text: "merged pull requests" }),
        ]),
      ])
    );

    if (data.total_merges === 0) {
      root.appendChild(
        el("div", { class: "state" }, [
          el("h2", { text: "No merges counted yet" }),
          el("p", {
            text: "Sync with GitHub to look for pull requests you've had merged. "
              + "Merging your own pull request into your own repository doesn't count.",
          }),
        ])
      );
      return;
    }

    const categories = renderCategories(data.points_by_category);
    if (categories) root.appendChild(categories);

    const merges = renderMerges(data.recent_merges);
    if (merges) root.appendChild(merges);
  }

  async function load() {
    showSkeleton(root, 3);
    try {
      render(await api("/api/me/points"));
    } catch (error) {
      showApiError(root, error);
    }
  }

  async function sync() {
    syncButton.setAttribute("aria-busy", "true");
    syncButton.disabled = true;
    syncResult.className = "sync-result";
    syncResult.textContent = "Asking GitHub for your merged pull requests…";

    try {
      const result = await apiPost("/api/me/sync");
      const parts = [`Counted ${plural(result.newly_counted, "new merge")}`];
      if (result.updated > 0) parts.push(`topped up ${plural(result.updated, "merge")}`);
      if (result.self_merges_skipped > 0) {
        parts.push(`skipped ${plural(result.self_merges_skipped, "self-merge")}`);
      }
      syncResult.textContent = `${parts.join(", ")}.`;
      await load();
    } catch (error) {
      syncResult.className = "sync-result is-error";
      syncResult.textContent = error.unreachable
        ? `Can't reach the API at ${API_BASE}. Is the backend running?`
        : error.message;
    } finally {
      syncButton.removeAttribute("aria-busy");
      syncButton.disabled = false;
    }
  }

  root.parentNode.insertBefore(
    stubNote("Nobody has been authenticated. The backend treats every request as the user in DEV_GITHUB_LOGIN."),
    root
  );

  syncButton.addEventListener("click", sync);
  load();
}

/* ---------------- the signed-in header, and the landing page ---------------- */

/* The sign-in here is a stub for Nishika's GitHub Login, which isn't built. See auth-stub.js. */
function session() {
  return window.GitBountySession;
}

function signInButton(big = false) {
  return el(
    "button",
    {
      class: `btn btn-primary${big ? " btn-lg" : ""}`,
      type: "button",
      onclick: () => session().signIn(),
    },
    [githubIcon(), document.createTextNode("Sign in with GitHub")]
  );
}

function initAccountSlot() {
  const slot = document.getElementById("account-slot");
  if (!slot || !session()) return;
  clear(slot);

  if (!session().isSignedIn()) {
    slot.appendChild(signInButton());
    return;
  }

  /* Identity and sign-out only. Navigation is the nav's job, and having "Your points" in both put the same
     link on screen twice. */
  const who = el("span", { class: "account-who" });
  slot.appendChild(who);
  slot.appendChild(
    el("button", { class: "btn btn-outline", type: "button", text: "Sign out", onclick: () => session().signOut() })
  );

  /* Who you are comes from the API, not from this browser: the backend's stub decides the user, and showing a
     different name here would be a lie. */
  api("/api/me")
    .then((me) => {
      window.GITBOUNTY_VIEWER = me.github_login;
      clear(who);
      who.appendChild(el("b", { text: `@${me.github_login}` }));
    })
    .catch(() => clear(who));
}

/* The on-screen reminder that nobody has actually been authenticated. */
function stubNote(extra) {
  return el("div", { class: "stub-note" }, [
    el("span", {}, [
      el("strong", { text: "Test login. " }),
      document.createTextNode(extra),
    ]),
  ]);
}

function initHome() {
  const actions = document.getElementById("hero-actions");
  const fineprint = document.getElementById("hero-fineprint");
  const strip = document.getElementById("cat-strip");
  const mini = document.getElementById("mini-board");

  const signedIn = session() && session().isSignedIn();

  clear(actions);
  if (signedIn) {
    actions.appendChild(el("a", { class: "btn btn-primary btn-lg", href: "points.html", text: "Go to your points" }));
    actions.appendChild(el("a", { class: "btn btn-outline btn-lg", href: "leaderboard.html", text: "Leaderboard" }));
    fineprint.textContent = "You're signed in with the test login. Sign out from the header.";
  } else {
    actions.appendChild(signInButton(true));
    actions.appendChild(el("a", { class: "btn btn-outline btn-lg", href: "leaderboard.html", text: "Browse the leaderboard" }));
    fineprint.textContent =
      "Test login: one click, no GitHub account needed. Real GitHub sign-in isn't built yet.";
  }

  clear(strip);
  for (const category of CATEGORIES) {
    strip.appendChild(el("a", { class: "pill", href: `leaderboard.html?category=${category}`, text: category }));
  }

  showSkeleton(mini, 3);
  api("/api/leaderboard?limit=3")
    .then((data) => {
      clear(mini);
      if (data.entries.length === 0) {
        showState(mini, "No one on the board yet", "Be the first: sign in and sync your merged pull requests.");
        return;
      }
      mini.appendChild(boardElement(data.entries));
    })
    .catch((error) => showApiError(mini, error));
}

/* ---------------- shared page setup ---------------- */

function initMobileNav() {
  const header = document.querySelector(".site-header");
  const toggle = document.getElementById("menu-toggle");
  if (!header || !toggle) return;

  toggle.addEventListener("click", () => {
    const open = header.classList.toggle("is-open");
    toggle.setAttribute("aria-expanded", String(open));
  });
}

function setYear() {
  const slot = document.getElementById("year");
  if (slot) slot.textContent = String(new Date().getFullYear());
}

document.addEventListener("DOMContentLoaded", () => {
  initMobileNav();
  setYear();
  initAccountSlot();
  if (document.getElementById("hero-actions")) initHome();
  if (document.getElementById("points-root")) initPoints();
  if (document.getElementById("leaderboard-root")) initLeaderboard();
});
