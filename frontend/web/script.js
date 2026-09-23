/* =========================================================
   GitBounty — main script

   Talks to the backend API. Set window.GITBOUNTY_API before this
   file loads to point it somewhere other than the local backend.
   ========================================================= */

const API_BASE = (window.GITBOUNTY_API || "http://localhost:8001").replace(/\/+$/, "");

/* ---- helpers ---- */

/* Issue titles come from strangers on GitHub, so nothing goes into
   innerHTML without passing through here first. */
function esc(value) {
  return String(value ?? "").replace(/[&<>"']/g, ch => (
    { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[ch]
  ));
}

function timeAgo(iso) {
  if (!iso) return "";
  const seconds = Math.floor((Date.now() - new Date(iso).getTime()) / 1000);
  const units = [["y", 31536000], ["mo", 2592000], ["d", 86400], ["h", 3600], ["m", 60]];
  for (const [suffix, size] of units) {
    const n = Math.floor(seconds / size);
    if (n >= 1) return `${n}${suffix} ago`;
  }
  return "just now";
}

function formatStars(n) {
  return n >= 1000 ? `${(n / 1000).toFixed(n >= 10000 ? 0 : 1)}k` : String(n ?? 0);
}

async function api(path, options = {}) {
  const res = await fetch(`${API_BASE}${path}`, { credentials: "include", ...options });
  if (!res.ok) {
    const detail = await res.json().catch(() => ({}));
    const error = new Error(detail.detail || `Request failed (${res.status})`);
    error.status = res.status;
    throw error;
  }
  return res.json();
}

/* ---- board state ---- */
const board = {
  category: null,      // null = all
  q: "",
  sort: "updated",
  page: 1,
  perPage: 24,
  items: [],
  hasMore: false,
  loading: false,
};

/* ---- hero mini-board: the five most-starred repos with open issues ---- */
async function buildHeroBoard() {
  const rows = document.getElementById("hero-board-rows");
  const count = document.getElementById("hero-board-count");
  if (!rows || !count) return;

  try {
    const [top, counts] = await Promise.all([
      api("/api/issues?sort=stars&per_page=5"),
      api("/api/issues/categories"),
    ]);

    const total = Object.values(counts).reduce((sum, n) => sum + n, 0);
    count.textContent = `${total} open`;

    rows.innerHTML = top.items.map(issue => `
      <li class="board-row">
        <div style="min-width:0;flex:1;">
          <span class="row-repo">${esc(issue.repository)}</span>
          <span class="row-title">${esc(issue.title)}</span>
        </div>
        <span class="row-amount">★ ${formatStars(issue.stars)}</span>
      </li>`).join("");

    if (!top.items.length) {
      rows.innerHTML = `<li class="board-row"><span class="row-title">No issues synced yet.</span></li>`;
    }
  } catch {
    count.textContent = "offline";
    rows.innerHTML = `<li class="board-row"><span class="row-title">Backend unavailable.</span></li>`;
  }
}

/* ---- the issue board ---- */
function issueCard(issue) {
  const labels = (issue.labels || []).slice(0, 3);
  return `
    <li class="bounty-card">
      <div class="bounty-top">
        <span class="bounty-repo">${esc(issue.repository)}</span>
        <span class="bounty-amount">★ ${formatStars(issue.stars)}</span>
      </div>
      <p class="bounty-title">${esc(issue.title)}</p>
      <div class="bounty-labels">
        <span class="tag">${esc(issue.category)}</span>
        ${labels.map(l => `<span class="tag">${esc(l)}</span>`).join("")}
      </div>
      <div class="bounty-bottom">
        <span class="bounty-age">${esc(timeAgo(issue.issue_updated_at))}</span>
        <a href="${esc(issue.html_url)}" target="_blank" rel="noopener" class="bounty-link">View issue →</a>
      </div>
    </li>`;
}

function boardQuery() {
  const params = new URLSearchParams({
    sort: board.sort,
    page: String(board.page),
    per_page: String(board.perPage),
  });
  if (board.category) params.set("category", board.category);
  if (board.q.trim()) params.set("q", board.q.trim());
  return params.toString();
}

async function loadIssues({ append = false } = {}) {
  const grid = document.getElementById("bounty-grid");
  if (!grid || board.loading) return;
  board.loading = true;

  if (!append) {
    board.page = 1;
    grid.innerHTML = `<li class="empty-state"><p>Loading issues…</p></li>`;
  }

  try {
    const data = await api(`/api/issues?${boardQuery()}`);
    board.items = append ? board.items.concat(data.items) : data.items;
    board.hasMore = data.has_more;

    grid.innerHTML = board.items.length
      ? board.items.map(issueCard).join("")
      : `<li class="empty-state"><p>No issues match your filters.</p></li>`;
  } catch (error) {
    grid.innerHTML = `<li class="empty-state"><p>${esc(
      error.status ? error.message : "Can't reach the backend. Is it running on " + API_BASE + "?"
    )}</p></li>`;
    board.hasMore = false;
  } finally {
    board.loading = false;
    renderLoadMore();
    renderFootnote();
  }
}

function renderLoadMore() {
  const grid = document.getElementById("bounty-grid");
  let btn = document.getElementById("load-more");

  if (!board.hasMore) {
    if (btn) btn.remove();
    return;
  }
  if (!btn) {
    btn = document.createElement("button");
    btn.id = "load-more";
    btn.type = "button";
    btn.className = "btn btn-outline";
    btn.style.cssText = "display:block;margin:24px auto 0;";
    btn.addEventListener("click", () => {
      board.page += 1;
      btn.textContent = "Loading…";
      loadIssues({ append: true });
    });
    grid.insertAdjacentElement("afterend", btn);
  }
  btn.textContent = "Load more";
}

async function renderFootnote() {
  const note = document.querySelector(".board-footnote");
  if (!note) return;
  try {
    const counts = await api("/api/issues/categories");
    const total = Object.values(counts).reduce((sum, n) => sum + n, 0);
    note.textContent = `${total} open issues synced from GitHub · ${
      Object.entries(counts).filter(([, n]) => n).map(([k, n]) => `${n} ${k}`).join(" · ")
    }`;
  } catch {
    note.textContent = "Backend unavailable — start the API to load issues.";
  }
}

/* ---- filters, search, sort ---- */
function initFilters() {
  const pills = document.querySelectorAll("#filter-pills .pill");
  pills.forEach(pill => {
    pill.addEventListener("click", () => {
      pills.forEach(other => other.classList.remove("is-active"));
      pill.classList.add("is-active");
      const value = pill.dataset.filter;
      board.category = value === "all" ? null : value;
      loadIssues();
    });
  });

  const search = document.getElementById("bounty-search");
  if (search) {
    let timer;
    search.addEventListener("input", () => {
      // Search runs on the server so it covers every page, not just what is
      // already on screen. Debounced so typing is not one request per key.
      clearTimeout(timer);
      timer = setTimeout(() => {
        board.q = search.value;
        loadIssues();
      }, 300);
    });
  }

  const sort = document.getElementById("bounty-sort");
  if (sort) {
    sort.addEventListener("change", () => {
      board.sort = sort.value;
      loadIssues();
    });
  }
}

/* ---- sign in with GitHub ---- */
const CONNECT_BUTTON_IDS = ["nav-connect", "nav-signin", "hero-connect", "cta-connect", "mobile-connect"];

async function initAuth() {
  const buttons = CONNECT_BUTTON_IDS
    .map(id => document.getElementById(id))
    .filter(Boolean);

  let user = null;
  try {
    user = await api("/api/me");
  } catch {
    user = null;   // 401 when signed out, which is the normal case
  }

  if (!user) {
    buttons.forEach(btn => {
      btn.addEventListener("click", () => {
        window.location.href = `${API_BASE}/auth/github`;
      });
    });
    return;
  }

  buttons.forEach(btn => {
    if (btn.id === "nav-signin") {
      btn.hidden = true;           // the handle button below replaces it
      return;
    }
    const isNav = ["nav-connect", "mobile-connect"].includes(btn.id);
    if (isNav) {
      btn.textContent = `@${user.github_login}`;
      btn.title = "Sign out";
      btn.addEventListener("click", async () => {
        await api("/auth/logout", { method: "POST" }).catch(() => {});
        window.location.reload();
      });
    } else {
      btn.textContent = "Browse issues";
      btn.addEventListener("click", () => {
        document.getElementById("bounties")?.scrollIntoView({ behavior: "smooth" });
      });
    }
  });
}

/* ---- sticky header scroll state ---- */
function initHeaderScroll() {
  const header = document.querySelector(".site-header");
  if (!header) return;
  const onScroll = () => {
    header.style.borderBottomColor = window.scrollY > 10
      ? "var(--border)"
      : "var(--border-soft)";
  };
  window.addEventListener("scroll", onScroll, { passive: true });
}

/* ---- mobile nav toggle ---- */
function initMobileNav() {
  const toggle = document.getElementById("menu-toggle");
  const header = document.querySelector(".site-header");
  if (!toggle || !header) return;

  toggle.addEventListener("click", () => {
    const isOpen = header.classList.toggle("is-open");
    toggle.setAttribute("aria-expanded", isOpen);
  });

  document.querySelectorAll(".mobile-nav a").forEach(a => {
    a.addEventListener("click", () => {
      header.classList.remove("is-open");
      toggle.setAttribute("aria-expanded", false);
    });
  });
}

/* ---- smooth-scroll for nav links + active section highlight ---- */
function initNavHighlight() {
  const sections = document.querySelectorAll("section[id]");
  const navLinks = document.querySelectorAll(".main-nav a");
  if (!sections.length || !navLinks.length) return;

  const observer = new IntersectionObserver(entries => {
    entries.forEach(entry => {
      if (entry.isIntersecting) {
        const id = entry.target.getAttribute("id");
        navLinks.forEach(a => {
          const match = a.getAttribute("href") === `#${id}`;
          a.style.color = match ? "var(--text)" : "";
        });
      }
    });
  }, { rootMargin: "-30% 0px -60% 0px" });

  sections.forEach(s => observer.observe(s));
}

/* ---- scroll-reveal for section headings ---- */
function initReveal() {
  if (!window.IntersectionObserver) return;

  const targets = document.querySelectorAll(
    ".section-head, .step, .feature, .audience-card, .price-card, .trust-card"
  );

  const io = new IntersectionObserver((entries, obs) => {
    entries.forEach(entry => {
      if (!entry.isIntersecting) return;
      entry.target.style.opacity = "1";
      entry.target.style.transform = "translateY(0)";
      obs.unobserve(entry.target);
    });
  }, { threshold: 0.12 });

  targets.forEach(el => {
    el.style.opacity = "0";
    el.style.transform = "translateY(18px)";
    el.style.transition = "opacity .5s ease, transform .5s ease";
    io.observe(el);
  });
}

/* ---- footer year ---- */
function setYear() {
  const el = document.getElementById("year");
  if (el) el.textContent = new Date().getFullYear();
}

/* ---- boot ---- */
document.addEventListener("DOMContentLoaded", () => {
  buildHeroBoard();
  loadIssues();
  initFilters();
  initAuth();
  initHeaderScroll();
  initMobileNav();
  initNavHighlight();
  setYear();

  requestAnimationFrame(() => requestAnimationFrame(initReveal));
});
