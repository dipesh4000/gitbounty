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
    root.appendChild(board);
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

  syncButton.addEventListener("click", sync);
  load();
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
  if (document.getElementById("points-root")) initPoints();
  if (document.getElementById("leaderboard-root")) initLeaderboard();
});
