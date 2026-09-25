"use client";

import Image from "next/image";
import { useEffect, useMemo, useState } from "react";
import logoMark from "../../public/assets/logo_mark.svg";

const categories = ["All", "Frontend", "Backend", "Full-stack", "Docs", "Testing", "DevOps", "Design", "Mobile"];

const issues = [
  { repo: "openframe/core", number: 1842, title: "Improve keyboard navigation in the command palette", category: "Frontend", labels: ["accessibility", "react"], language: "TypeScript", stars: "12.8k", updated: "18 min", points: 40 },
  { repo: "parcel-labs/router", number: 638, title: "Add request cancellation to the Python client", category: "Backend", labels: ["good first issue", "api"], language: "Python", stars: "8.4k", updated: "1 hr", points: 25 },
  { repo: "northstar/docs", number: 291, title: "Document the plugin migration path for v3", category: "Docs", labels: ["documentation", "v3"], language: "MDX", stars: "4.1k", updated: "3 hrs", points: 15 },
  { repo: "relay-kit/relay", number: 972, title: "Stabilize retry tests on slower CI runners", category: "Testing", labels: ["tests", "ci"], language: "Go", stars: "6.7k", updated: "5 hrs", points: null },
  { repo: "quarry/mobile", number: 407, title: "Respect reduced motion in shared transitions", category: "Mobile", labels: ["android", "a11y"], language: "Kotlin", stars: "3.9k", updated: "1 day", points: 30 },
];

const stages = [
  ["01", "FIND", "Filter open issues by the work you know."],
  ["02", "BUILD", "Discuss the approach and contribute through the repository’s normal workflow."],
  ["03", "MERGE", "GitBounty verifies the merged pull request and the issue it closed."],
  ["04", "EARN", "The evidence becomes part of your contribution record."],
];

const categoryIndex = [
  ["01", "FRONTEND", "src/components/*.tsx"],
  ["02", "BACKEND", "server/routes/*.py"],
  ["03", "FULL-STACK", "app/**/*.{ts,tsx}"],
  ["04", "DOCUMENTATION", "docs/**/*.md"],
  ["05", "TESTING", "tests/**/*_test.py"],
  ["06", "DEVOPS", ".github/workflows/*.yml"],
  ["07", "DESIGN", "tokens/**/*.json"],
  ["08", "MOBILE", "app/src/**/*.kt"],
];

const leaders = [
  ["01", "Maya Chen", "@maya-dev", "1,240", "18", "Frontend", "+2"],
  ["02", "Arjun Rao", "@arjun-ships", "1,105", "15", "Backend", "—"],
  ["03", "Lena Park", "@lenapark", "980", "14", "Docs", "+4"],
  ["04", "Noah Williams", "@nw-builds", "845", "11", "Testing", "−1"],
  ["05", "Samira Ali", "@samira-oss", "790", "12", "DevOps", "+1"],
];

const faqs = [
  ["Is GitBounty paying real money?", "No. The current product awards points and recognition. It does not use money, cryptocurrency, wallets, blockchain, or escrow."],
  ["How are points assigned?", "Maintainers can attach a point value to an issue. A small baseline amount may also be awarded for valid merged contributions; the exact baseline policy is still being finalized."],
  ["Does every merged PR earn points?", "The product is designed to recognize valid merged work, including a small baseline reward. Eligibility rules are still being hardened before public launch."],
  ["What stops someone from farming points?", "Self-merges and duplicate awards are excluded by design. Collusion and suspicious allocation need additional safeguards, and GitBounty does not claim that problem is solved yet."],
  ["Do maintainers need to install anything?", "No separate code-review system is required. Maintainers keep using GitHub and can signal issue value through GitBounty’s planned workflow."],
  ["Is the Chrome extension required?", "No. The website is the complete product. The optional extension is a future convenience for seeing signals on GitHub."],
  ["Does GitBounty replace GitHub’s workflow?", "No. Issues, discussion, pull requests, review, and merges stay on GitHub. GitBounty adds discovery and a points record around that work."],
];

function Logo() {
  return <span className="brand-lockup"><Image src={logoMark} alt="" width={27} height={24} priority /><span>GitBounty</span></span>;
}

export function LedgerLanding() {
  const [menuOpen, setMenuOpen] = useState(false);
  const [scrolled, setScrolled] = useState(false);
  const [activeCategory, setActiveCategory] = useState("All");
  const [query, setQuery] = useState("");
  const [sort, setSort] = useState("Newest");
  const [stage, setStage] = useState(0);
  const [issueState, setIssueState] = useState<"results" | "loading" | "error">("results");
  const [range, setRange] = useState("Week");
  const [leaderCategory, setLeaderCategory] = useState("All categories");
  const [openFaq, setOpenFaq] = useState(0);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 18);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  useEffect(() => {
    const steps = document.querySelectorAll<HTMLButtonElement>(".stage-list button");
    const observer = new IntersectionObserver((entries) => {
      const active = entries.find((entry) => entry.isIntersecting);
      if (active) setStage(Number((active.target as HTMLElement).dataset.stage));
    }, { rootMargin: "-42% 0px -46% 0px", threshold: 0 });
    steps.forEach((step) => observer.observe(step));
    return () => observer.disconnect();
  }, []);

  const filteredIssues = useMemo(() => issues.filter((issue) => {
    const categoryMatch = activeCategory === "All" || issue.category === activeCategory;
    const searchMatch = `${issue.repo} ${issue.title} ${issue.labels.join(" ")} ${issue.language}`.toLowerCase().includes(query.toLowerCase());
    return categoryMatch && searchMatch;
  }), [activeCategory, query]);

  const sortedIssues = useMemo(() => [...filteredIssues].sort((left, right) => {
    if (sort === "Points: high") return (right.points ?? 0) - (left.points ?? 0);
    if (sort === "Stars") return Number.parseFloat(right.stars) - Number.parseFloat(left.stars);
    return issues.indexOf(left) - issues.indexOf(right);
  }), [filteredIssues, sort]);

  const visibleLeaders = leaderCategory === "All categories"
    ? leaders
    : leaders.filter((leader) => leader[5] === leaderCategory);

  return (
    <>
      {/*
      THESIS: GitBounty is a living ledger where open issues become verified contribution history; it refuses the generic centered SaaS hero.
      OWN-WORLD: near-black editorial bands, hairline rules, off-white type, disciplined graphite artifacts, and lime used only for action and verified state.
      STORY: find relevant work, ship through GitHub, see every point traced to a merge, then explore open issues.
      FIRST VIEWPORT: a two-column manifesto and live issue-to-merge ledger share the screen; the primary action sits beneath the headline while the next ruled strip peeks below.
      FORM: neo-minimalist typographic brutalism with cinematic editorial pacing; brief-pinned evidence key 23d5f985, so the concept roll was skipped by rule.
      FINISH: unreviewed and undocumented is unfinished; this build ends with the finish review, the verdict, DESIGN.md, and every shipping raster carrying its provenance.
      */}
      <a className="skip-link" href="#content">Skip to content</a>
      <header className={`ledger-header${scrolled ? " is-scrolled" : ""}${menuOpen ? " is-open" : ""}`}>
        <div className="shell nav-row">
          <a href="#top" aria-label="GitBounty home"><Logo /></a>
          <nav className="desktop-nav" aria-label="Primary navigation">
            <a href="#issues">Explore Issues</a><a href="#how">How It Works</a><a href="#leaderboard">Leaderboard</a><a href="#maintainers">For Maintainers</a><a href="https://github.com" target="_blank" rel="noreferrer">GitHub ↗</a>
          </nav>
          <div className="nav-actions"><button className="text-action">Sign in</button><button className="button button-primary">Connect GitHub</button></div>
          <button className="menu-button" aria-expanded={menuOpen} aria-controls="mobile-menu" onClick={() => setMenuOpen(!menuOpen)}><span /><span /><span /><span className="sr-only">Toggle menu</span></button>
        </div>
        <nav id="mobile-menu" className="mobile-menu" aria-label="Mobile navigation">
          <a href="#issues" onClick={() => setMenuOpen(false)}>Explore Issues</a><a href="#how" onClick={() => setMenuOpen(false)}>How It Works</a><a href="#leaderboard" onClick={() => setMenuOpen(false)}>Leaderboard</a><a href="#maintainers" onClick={() => setMenuOpen(false)}>For Maintainers</a><button className="button button-primary">Connect GitHub</button>
        </nav>
      </header>

      <main id="content">
        <section className="hero" id="top">
          <div className="shell hero-grid">
            <div className="hero-copy">
              <h1>Code that ships<br />should count.</h1>
              <p>GitBounty turns merged open-source contributions into a visible record of impact. Discover issues that match your skills, ship the work through GitHub, and earn points when your pull request merges.</p>
              <div className="hero-actions"><a className="button button-primary button-large" href="#issues">Explore open issues</a><a className="button button-secondary button-large" href="#provenance">How points work</a></div>
              <span className="hero-note"><i /> Built around GitHub. No new contribution workflow.</span>
            </div>

            <div className="contribution-ledger" aria-label="Example contribution moving from issue to merged pull request">
              <div className="artifact-top"><span>CONTRIBUTION / 0045</span><span className="artifact-live"><i /> VERIFIED</span></div>
              <div className="ledger-path"><span className="path-on">ISSUE</span><b /> <span>CODE</span><b /> <span>PR</span><b /> <span>MERGE</span><b /> <span>POINTS</span></div>
              <div className="issue-record">
                <div><span className="mono muted">openframe/core</span><span className="issue-id">#1842</span></div>
                <h2>Improve keyboard navigation</h2>
                <div className="record-tags"><span>FRONTEND</span><span>ACCESSIBILITY</span><strong>+40 POINTS</strong></div>
              </div>
              <div className="diff-record" aria-label="Code diff excerpt">
                <span className="diff-file">src/components/CommandPalette.tsx</span>
                <code><i>−</i> onKeyDown=&#123;closePalette&#125;</code>
                <code><b>+</b> onKeyDown=&#123;handleRovingFocus&#125;</code>
                <code><b>+</b> aria-activedescendant=&#123;activeId&#125;</code>
              </div>
              <div className="merge-record">
                <div><span>PR #1910</span><strong>MERGED</strong></div>
                <dl><div><dt>checks</dt><dd>12/12</dd></div><div><dt>review</dt><dd>approved</dd></div><div><dt>contributor</dt><dd>@maya-dev</dd></div></dl>
              </div>
              <div className="earned-record"><span>TOTAL EARNED</span><strong>+45</strong></div>
            </div>
          </div>
        </section>

        <section className="manifesto">
          <div className="shell manifesto-grid">
            <h2>Open source already has the work.<br />It needs a better signal.</h2>
            <ol><li><span>01</span> Find work matched to your stack.</li><li><span>02</span> Keep the contribution on GitHub.</li><li><span>03</span> Build reputation from merged code.</li></ol>
          </div>
        </section>

        <section className="section issue-explorer" id="issues">
          <div className="shell">
            <div className="section-intro split-intro"><h2>Work worth<br />opening.</h2><p>Browse unassigned issues by the kind of work you actually want to do. Demo content is illustrative; no repository shown here is presented as a GitBounty customer.</p></div>
            <div className="explorer-frame">
              <div className="explorer-toolbar">
                <label className="search-control"><span className="sr-only">Search issues</span><svg aria-hidden="true" viewBox="0 0 24 24"><circle cx="10.8" cy="10.8" r="6.3" /><path d="m15.6 15.6 4.1 4.1" /></svg><input value={query} onChange={(event) => { setQuery(event.target.value); setIssueState("results"); }} placeholder="Search repository, label, stack…" /></label>
                <label className="sort-control"><span>SORT</span><select value={sort} onChange={(event) => setSort(event.target.value)}><option>Newest</option><option>Points: high</option><option>Stars</option></select></label>
              </div>
              <div className="filter-row" role="group" aria-label="Issue categories">{categories.map((category) => <button key={category} aria-pressed={activeCategory === category} className={activeCategory === category ? "is-active" : ""} onClick={() => { setActiveCategory(category); setIssueState("results"); }}>{category}</button>)}</div>
              <div className="explorer-heading"><span>OPEN ISSUES <b>{sortedIssues.length.toString().padStart(2, "0")}</b></span><div className="state-switch" aria-label="Preview interface states"><button className={issueState === "results" ? "is-active" : ""} onClick={() => setIssueState("results")}>Live</button><button className={issueState === "loading" ? "is-active" : ""} onClick={() => setIssueState("loading")}>Loading</button><button className={issueState === "error" ? "is-active" : ""} onClick={() => setIssueState("error")}>Offline</button></div></div>
              {issueState === "loading" ? <div className="system-state loading-state" aria-live="polite"><i /><div><strong>Indexing open issues</strong><span>Reading repository metadata and category labels…</span></div></div> : issueState === "error" ? <div className="system-state error-state" role="alert"><span>BACKEND UNAVAILABLE</span><div><strong>The issue index could not be reached.</strong><p>Your filters are still here. Try the request again when the service reconnects.</p><button className="button button-secondary" onClick={() => setIssueState("results")}>Retry request</button></div></div> : sortedIssues.length === 0 ? <div className="system-state empty-state"><span>0 RESULTS</span><div><strong>No open issues match that search.</strong><p>Try a repository name, language, or remove the active category.</p><button className="button button-secondary" onClick={() => { setQuery(""); setActiveCategory("All"); }}>Clear filters</button></div></div> : <ul className="issue-list">{sortedIssues.map((issue) => <li key={issue.number}>
                <div className="issue-primary"><span className="mono">{issue.repo} <i>#{issue.number}</i></span><h3>{issue.title}</h3><div className="issue-labels"><span>{issue.category}</span>{issue.labels.map((label) => <span key={label}>{label}</span>)}</div></div>
                <dl className="issue-meta"><div><dt>STACK</dt><dd>{issue.language}</dd></div><div><dt>REPO</dt><dd>★ {issue.stars}</dd></div><div><dt>UPDATED</dt><dd>{issue.updated} ago</dd></div></dl>
                <div className="issue-action"><span className={issue.points ? "has-points" : "baseline"}>{issue.points ? `+${issue.points} PTS` : "BASELINE"}</span><a href="https://github.com" target="_blank" rel="noreferrer" aria-label={`View issue ${issue.number}`}>View issue ↗</a></div>
              </li>)}</ul>}
            </div>
          </div>
        </section>

        <section className="section process-section" id="how">
          <div className="shell process-grid">
            <div className="process-copy"><h2>One workflow.<br />A clearer record.</h2><p>The contribution stays where it belongs. GitBounty observes the evidence around it.</p><div className="stage-list">{stages.map((item, index) => <button data-stage={index} key={item[1]} className={stage === index ? "is-active" : ""} onMouseEnter={() => setStage(index)} onFocus={() => setStage(index)} onClick={() => setStage(index)}><span>{item[0]}</span><div><strong>{item[1]}</strong><p>{item[2]}</p></div></button>)}</div></div>
            <div className="sticky-artifact">
              <div className="artifact-caption"><span>SYSTEM TRACE</span><span>STAGE {stage + 1}/4</span></div>
              <div className="trace-progress"><i style={{ transform: `scaleX(${(stage + 1) * 0.25})` }} /></div>
              <div className={`trace-card stage-${stage}`}>
                <div className="trace-top"><span>openframe/core</span><span>{["OPEN", "BRANCH", "REVIEW", "VERIFIED"][stage]}</span></div>
                <div className="trace-branch"><i /> <span>{["issue/1842", "fix/keyboard-nav", "pull/1910", "ledger/0045"][stage]}</span></div>
                <h3>{["Improve keyboard navigation", "3 files changed · +38 −9", "12 checks passed · 2 approvals", "+45 points recorded"][stage]}</h3>
                <div className="trace-lines"><span /><span /><span /></div>
                <div className="trace-footer"><span>{["ready to claim", "work in progress", "merge approved", "contribution history updated"][stage]}</span><strong>{["FIND", "BUILD", "MERGE", "EARN"][stage]}</strong></div>
              </div>
            </div>
          </div>
        </section>

        <section className="section provenance" id="provenance">
          <div className="shell provenance-grid"><div><h2>Every point has a commit behind it.</h2><p>GitBounty records where points came from, what shipped, and when it merged. Recognition stays attached to the work that earned it.</p></div><div className="receipt">
            <div className="receipt-head"><span>CONTRIBUTION RECEIPT</span><span>GB-0045</span></div>
            <dl className="receipt-evidence"><div><dt>CONTRIBUTOR</dt><dd>@maya-dev</dd></div><div><dt>REPOSITORY</dt><dd>openframe/core</dd></div><div><dt>PULL REQUEST</dt><dd>#1910</dd></div><div><dt>CLOSED ISSUE</dt><dd>#1842</dd></div><div><dt>CATEGORY</dt><dd>FRONTEND</dd></div><div><dt>MERGED AT</dt><dd>2026-09-21 14:32 UTC</dd></div></dl>
            <div className="receipt-total"><div><span>BASE MERGE REWARD</span><b>+5</b></div><div><span>ISSUE VALUE</span><b>+40</b></div><div><strong>TOTAL EARNED</strong><strong>+45</strong></div></div>
            <p>Illustrative contribution record</p>
          </div></div>
        </section>

        <section className="two-sided" id="maintainers">
          <div className="shell side-grid"><article className="contributor-side"><span>FOR CONTRIBUTORS</span><h2>Stop searching<br />at random.</h2><ul><li>Browse work by discipline.</li><li>See what an issue is worth before starting.</li><li>Keep working through GitHub.</li><li>Build a record from merged contributions.</li><li>Compare by week, category, or all time.</li></ul></article><article className="maintainer-side"><span>FOR MAINTAINERS</span><h2>Give important work<br />a signal.</h2><ul><li>Assign points through a GitHub label.</li><li>Bring overlooked issues back into view.</li><li>Attract contributors with relevant skills.</li><li>Preserve the existing review process.</li><li>Keep control of what gets merged.</li></ul></article></div>
        </section>

        <section className="section category-section"><div className="shell"><div className="section-intro split-intro"><h2>Work has<br />a shape.</h2><p>GitBounty classifies opportunity from issue labels, repository context, and the files changed by merged work.</p></div><div className="category-index">{categoryIndex.map((item) => <button type="button" key={item[1]}><span>{item[0]}</span><strong>{item[1]}</strong><code>{item[2]}</code><i aria-hidden="true">↗</i></button>)}</div></div></section>

        <section className="section leaderboard-section" id="leaderboard"><div className="shell"><div className="leaderboard-head"><div><h2>Recognition for<br />work that merged.</h2><p>An illustrative ranking of verified contribution records.</p></div><div className="leaderboard-controls"><label><span>CATEGORY</span><select value={leaderCategory} onChange={(event) => setLeaderCategory(event.target.value)}><option>All categories</option><option>Frontend</option><option>Backend</option><option>Docs</option><option>Testing</option><option>DevOps</option></select></label><div className="range-control" role="group" aria-label="Leaderboard time range">{["Week", "Month", "All-time"].map((item) => <button key={item} aria-pressed={range === item} onClick={() => setRange(item)}>{item}</button>)}</div></div></div><div className="leaderboard-table"><div className="leader-row leader-labels"><span>RANK</span><span>CONTRIBUTOR</span><span>POINTS</span><span>MERGES</span><span>STRONGEST</span><span>MOVE</span></div>{visibleLeaders.map((leader, index) => <div className={`leader-row${leader[2] === "@lenapark" ? " current" : ""}`} key={leader[2]}><span>{leader[0]}</span><span className="leader-person"><i className={`identicon identicon-${index}`} aria-hidden="true">{Array.from({ length: 9 }, (_, cell) => <span key={cell} />)}</i><b>{leader[1]}<small>{leader[2]}</small></b></span><strong className="point-value">{leader[3]}</strong><span>{leader[4]}</span><span>{leader[5]}</span><span className={leader[6].startsWith("+") ? "movement-up" : ""}>{leader[6]}</span></div>)}</div><p className="illustrative-note">Illustrative leaderboard data and generated identicons — not production rankings or GitHub profiles.</p></div></section>

        <section className="section extension-section"><div className="shell extension-grid"><div className="extension-copy"><span className="optional-label">OPTIONAL EXTENSION · FUTURE</span><h2>Stay on GitHub.</h2><p>See the signal where the work already lives. The extension is optional—the complete product remains available on the web.</p><p className="extension-status">Not publicly released. Shown here as a product direction.</p></div><div className="browser-frame"><div className="browser-chrome"><i /><i /><i /><span>github.com/openframe/core/issues</span></div><div className="browser-body"><div className="github-sidebar"><span /><span /><span /><span /></div><div className="github-list"><div className="github-list-head"><strong>Issues</strong><button>New issue</button></div>{issues.slice(0, 3).map((issue) => <div className="github-issue" key={issue.number}><i /><div><strong>{issue.title}</strong><span>#{issue.number} · opened {issue.updated} ago</span></div><em>{issue.category}</em>{issue.points && <b>+{issue.points}</b>}</div>)}</div></div></div></div></section>

        <section className="section integrity-section"><div className="shell integrity-grid"><div><h2>Points should be<br />difficult to fake.</h2><p>The ledger is only useful if contribution evidence remains inspectable. Some safeguards are clear; others still need work before public launch.</p></div><div className="audit-log"><div className="audit-head"><span>VERIFICATION POLICY</span><span>STATUS</span></div><div><span className="audit-pass">PASS</span><p>Self-merges do not count.</p><code>rule/self-merge</code></div><div><span className="audit-pass">PASS</span><p>The same pull request cannot be awarded twice.</p><code>unique/pr-id</code></div><div><span className="audit-pass">PASS</span><p>Every award retains repository and merge evidence.</p><code>ledger/provenance</code></div><div><span className="audit-review">REVIEW</span><p>Re-sync must preserve already-earned points.</p><code>sync/non-destructive</code></div><div><span className="audit-open">OPEN</span><p>Collusion and suspicious allocation need stronger safeguards.</p><code>policy/not-solved</code></div></div></div></section>

        <section className="architecture"><div className="shell"><h2>Built around existing workflows.</h2><div className="architecture-line">{["GitHub identity", "Issue discovery", "Pull request", "Merge verification", "Points ledger", "Leaderboards"].map((item, index) => <div key={item}><span>{index + 1}</span><strong>{item}</strong>{index < 5 && <i />}</div>)}</div><p>No replacement workflow. No separate code review system. GitBounty begins and ends with the work already happening on GitHub.</p></div></section>

        <section className="section faq-section"><div className="shell faq-grid"><h2>Questions,<br />answered plainly.</h2><div className="faq-list">{faqs.map((faq, index) => <div className={openFaq === index ? "is-open" : ""} key={faq[0]}><button aria-expanded={openFaq === index} onClick={() => setOpenFaq(openFaq === index ? -1 : index)}><span>{faq[0]}</span><i aria-hidden="true" /></button><div className="faq-answer"><p>{faq[1]}</p></div></div>)}</div></div></section>

        <section className="final-cta"><div className="shell final-cta-grid"><h2>Your next contribution<br />is already open.</h2><div><p>Find an issue that matches your skills and make the work count.</p><div><a className="button button-dark button-large" href="#issues">Explore open issues</a><button className="button button-green-outline button-large">Connect GitHub</button></div></div></div></section>
      </main>

      <footer className="ledger-footer"><div className="shell footer-grid"><div><Logo /><p>Open-source work, made visible.</p></div><div><strong>PRODUCT</strong><a href="#issues">Explore issues</a><a href="#how">How it works</a><a href="#leaderboard">Leaderboard</a></div><div><strong>CONTRIBUTE</strong><a href="#maintainers">For maintainers</a><a href="https://github.com" target="_blank" rel="noreferrer">GitHub repository ↗</a><a href="#top">Documentation</a></div><div><strong>SYSTEM</strong><a href="#top">Privacy</a><a href="#top">Terms</a><a href="#top">Status</a></div></div><div className="shell footer-bottom"><span>© 2026 GitBounty</span><code>build points-alpha / web-001</code></div></footer>
    </>
  );
}
