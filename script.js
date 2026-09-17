/* =========================================================
   GitBounty — main script
   ========================================================= */

/* ---- sample bounty data (replace with API calls) ---- */
const BOUNTIES = [
  { id:1,  repo:"awslabs/cli-agent-orchestrator", title:"Threat model for agent manipulation (prompt injection) in a shared deployment", amount:100, currency:"USDC", label:"enhancement", age:"1d ago" },
  { id:2,  repo:"awslabs/cli-agent-orchestrator", title:"Tenant-scoped audit trail for security-relevant events", amount:55, currency:"USDC", label:"enhancement", age:"1d ago" },
  { id:3,  repo:"vercel/next.js", title:"App router: RSC hydration mismatch on nested layouts", amount:250, currency:"USDC", label:"bug", age:"3d ago" },
  { id:4,  repo:"facebook/react", title:"Document useId hook edge cases in concurrent mode", amount:75, currency:"USDC", label:"docs", age:"5d ago" },
  { id:5,  repo:"microsoft/TypeScript", title:"Type narrowing breaks with generic constraints in union types", amount:400, currency:"USDC", label:"bug", age:"2d ago" },
  { id:6,  repo:"open-telemetry/opentelemetry-js", title:"Add OTLP/gRPC exporter streaming support", amount:180, currency:"USDC", label:"enhancement", age:"6d ago" },
  { id:7,  repo:"supabase/supabase", title:"Write migration guide for RLS with multi-tenant schemas", amount:60, currency:"USDC", label:"docs", age:"4d ago" },
  { id:8,  repo:"prettier/prettier", title:"Support formatting MDX 3 expression blocks", amount:120, currency:"USDC", label:"enhancement", age:"2d ago" },
  { id:9,  repo:"vitejs/vite", title:"Fix SASS preprocessor crashing on circular imports in monorepo", amount:90, currency:"USDC", label:"bug", age:"8h ago" },
  { id:10, repo:"prisma/prisma", title:"Add first-class support for Postgres array columns in client", amount:300, currency:"USDC", label:"enhancement", age:"1d ago" },
  { id:11, repo:"tiangolo/fastapi", title:"Correct middleware ordering docs for ASGI lifespan events", amount:45, currency:"USDC", label:"docs", age:"3d ago" },
  { id:12, repo:"astro-build/astro", title:"Content collection schema validation throws unhelpful errors", amount:150, currency:"USDC", label:"good-first-issue", age:"2d ago" },
];

/* ---- hero board mini-preview (5 entries) ---- */
function buildHeroBoard() {
  const rows  = document.getElementById("hero-board-rows");
  const count = document.getElementById("hero-board-count");
  if (!rows || !count) return;

  const top5 = [...BOUNTIES].sort((a,b) => b.amount - a.amount).slice(0,5);
  count.textContent = `${BOUNTIES.length} open`;

  top5.forEach(b => {
    const li = document.createElement("li");
    li.className = "board-row";
    li.innerHTML = `
      <div style="min-width:0;flex:1;">
        <span class="row-repo">${b.repo}</span>
        <span class="row-title">${b.title}</span>
      </div>
      <span class="row-amount">$${b.amount} ${b.currency}</span>`;
    rows.appendChild(li);
  });
}

/* ---- full bounty grid ---- */
let activeFilter = "all";
let searchQuery  = "";
let sortOrder    = "amount-desc";

function renderBounties() {
  const grid = document.getElementById("bounty-grid");
  if (!grid) return;

  let list = BOUNTIES.filter(b => {
    const matchFilter = activeFilter === "all" || b.label === activeFilter;
    const q = searchQuery.toLowerCase();
    const matchSearch = !q || b.title.toLowerCase().includes(q) || b.repo.toLowerCase().includes(q);
    return matchFilter && matchSearch;
  });

  if (sortOrder === "amount-desc") list.sort((a,b) => b.amount - a.amount);
  else if (sortOrder === "amount-asc") list.sort((a,b) => a.amount - b.amount);
  else if (sortOrder === "newest")     list.sort((a,b) => a.id - b.id);

  grid.innerHTML = "";

  if (list.length === 0) {
    grid.innerHTML = `<li class="empty-state"><p>No bounties match your filters.</p></li>`;
    return;
  }

  list.forEach(b => {
    const li = document.createElement("li");
    li.className = "bounty-card";
    li.innerHTML = `
      <div class="bounty-top">
        <span class="bounty-repo">${b.repo}</span>
        <span class="bounty-amount">$${b.amount} ${b.currency}</span>
      </div>
      <p class="bounty-title">${b.title}</p>
      <div class="bounty-labels">
        <span class="tag">${labelDisplay(b.label)}</span>
      </div>
      <div class="bounty-bottom">
        <span class="bounty-age">${b.age}</span>
        <a href="https://github.com/${b.repo}/issues" target="_blank" rel="noopener" class="bounty-link">View issue →</a>
      </div>`;
    grid.appendChild(li);
  });
}

function labelDisplay(l) {
  const map = {
    "enhancement": "enhancement",
    "bug": "bug",
    "docs": "docs",
    "good-first-issue": "good first issue",
  };
  return map[l] || l;
}

/* ---- filter pills ---- */
function initFilters() {
  const pills = document.querySelectorAll("#filter-pills .pill");
  pills.forEach(p => {
    p.addEventListener("click", () => {
      pills.forEach(x => x.classList.remove("is-active"));
      p.classList.add("is-active");
      activeFilter = p.dataset.filter;
      renderBounties();
    });
  });

  const search = document.getElementById("bounty-search");
  if (search) {
    search.addEventListener("input", () => {
      searchQuery = search.value;
      renderBounties();
    });
  }

  const sort = document.getElementById("bounty-sort");
  if (sort) {
    sort.addEventListener("change", () => {
      sortOrder = sort.value;
      renderBounties();
    });
  }
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

  // close on link click
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

/* ---- GitHub connect button (stub — wire to your OAuth flow) ---- */
function initCTAButtons() {
  const AUTH_URL = "#"; // replace with /api/auth/github

  ["nav-connect", "hero-connect", "cta-connect", "mobile-connect"].forEach(id => {
    const btn = document.getElementById(id);
    if (btn) btn.addEventListener("click", () => { window.location.href = AUTH_URL; });
  });
}

/* ---- scroll-reveal for section headings ---- */
function initReveal() {
  if (!window.IntersectionObserver) return;

  const targets = document.querySelectorAll(
    ".section-head, .step, .feature, .audience-card, .price-card, .bounty-card, .trust-card"
  );

  const io = new IntersectionObserver((entries, obs) => {
    entries.forEach(entry => {
      if (!entry.isIntersecting) return;
      entry.target.style.opacity  = "1";
      entry.target.style.transform = "translateY(0)";
      obs.unobserve(entry.target);
    });
  }, { threshold: 0.12 });

  targets.forEach(el => {
    el.style.opacity    = "0";
    el.style.transform  = "translateY(18px)";
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
  renderBounties();
  initFilters();
  initHeaderScroll();
  initMobileNav();
  initNavHighlight();
  initCTAButtons();
  setYear();

  // slight delay so CSS paint is done before reveal kicks in
  requestAnimationFrame(() => requestAnimationFrame(initReveal));
});
