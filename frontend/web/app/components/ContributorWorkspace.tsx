"use client";

import { useEffect, useMemo, useState } from "react";
import { MarketingShell } from "./MarketingShell";
import { useAuth } from "./AuthProvider";

const issues = [
  { repo: "openframe/core", number: 1842, title: "Improve keyboard navigation in the command palette", category: "Frontend", labels: ["TypeScript", "a11y"], points: 40, stars: "12.4k", updated: "3d ago", updatedMinutes: 4320 },
  { repo: "relaylabs/queue", number: 611, title: "Retry backoff ignores max_delay under sustained load", category: "Backend", labels: ["Go", "good first issue"], points: 60, stars: "3.1k", updated: "20m ago", updatedMinutes: 20 },
  { repo: "marrow/orm", number: 2207, title: "Support composite keys in the migration diff", category: "Full-stack", labels: ["Postgres", "TypeScript"], points: 80, stars: "8.7k", updated: "5d ago", updatedMinutes: 7200 },
  { repo: "halyard/docs", number: 93, title: "Document streaming responses with runnable examples", category: "Docs", labels: ["MDX", "documentation"], points: 20, stars: "1.2k", updated: "3h ago", updatedMinutes: 180 },
  { repo: "cinder/test-kit", number: 418, title: "Snapshot test is flaky on Windows path separators", category: "Testing", labels: ["Rust", "flaky"], points: 30, stars: "2.4k", updated: "40m ago", updatedMinutes: 40 },
  { repo: "harbor/app", number: 274, title: "Android back gesture dismisses a nested modal twice", category: "Mobile", labels: ["Kotlin", "Android"], points: 35, stars: "1.8k", updated: "2d ago", updatedMinutes: 2880 },
];

const pullRequests = [
  { repo: "openframe/core", number: 1910, title: "Trap focus and loop arrow keys", category: "Frontend", points: 45, merged: "Today" },
  { repo: "relaylabs/queue", number: 611, title: "Make retry ceilings deterministic", category: "Backend", points: 65, merged: "Yesterday" },
  { repo: "halyard/docs", number: 93, title: "Add runnable streaming examples", category: "Docs", points: 25, merged: "4 days ago" },
];

const categories = ["All", "Frontend", "Backend", "Full-stack", "Docs", "Testing", "Mobile"];

export function ContributorWorkspace() {
  const { user, loading } = useAuth();
  const [category, setCategory] = useState("All");
  const [query, setQuery] = useState("");
  const [sort, setSort] = useState<"points" | "recent">("points");
  const [scanning, setScanning] = useState(false);
  const login = user?.github_login;

  useEffect(() => {
    if (!loading && !user) window.location.replace("/");
  }, [loading, user]);

  const visibleIssues = useMemo(() => {
    const normalized = query.trim().toLowerCase();
    const filtered = issues.filter((issue) => {
      const categoryMatch = category === "All" || issue.category === category;
      const queryMatch = !normalized || `${issue.repo} ${issue.title} ${issue.labels.join(" ")}`.toLowerCase().includes(normalized);
      return categoryMatch && queryMatch;
    });
    return [...filtered].sort(sort === "points"
      ? (left, right) => right.points - left.points
      : (left, right) => left.updatedMinutes - right.updatedMinutes);
  }, [category, query, sort]);

  function scanPullRequests() {
    setScanning(true);
    window.setTimeout(() => setScanning(false), 900);
  }

  if (!user) {
    return (
      <MarketingShell current="/explore">
        <section className="workspace-auth-state" aria-live="polite">
          <span />
          <p>{loading ? "Opening your contributor workspace…" : "Returning to GitBounty…"}</p>
        </section>
      </MarketingShell>
    );
  }

  return (
    <MarketingShell current="/explore">
      <section className="workspace-head">
        <div className="mp-shell workspace-head-grid">
          <div>
            <h1>Pick the work.<br />Build the record.</h1>
            <p>Signed in as <strong>@{login}</strong>. Browse open work and review the merged pull requests GitBounty found for you.</p>
            <div className="workspace-jumps" aria-label="Workspace shortcuts"><a href="#workspace-issues">Browse issues</a><a href="#workspace-prs">Review merged PRs</a></div>
          </div>
          <div className="workspace-ledger" aria-label="Demo account summary">
            <div><span>THIS WEEK</span><strong>185 points</strong></div>
            <div><span>MERGED WORK</span><strong>3 pull requests</strong></div>
            <div><span>MODE</span><strong>Hard-coded preview</strong></div>
          </div>
        </div>
      </section>

      <section className="workspace-main">
        <div className="mp-shell workspace-grid">
          <div className="issue-workspace" id="workspace-issues">
            <div className="workspace-section-head">
              <div><h2>Open issues</h2><p>Illustrative issues while the live GitHub feed is disconnected.</p></div>
              <label className="workspace-sort"><span>SORT</span><select value={sort} onChange={(event) => setSort(event.target.value as "points" | "recent")}><option value="points">Highest points</option><option value="recent">Recently updated</option></select></label>
            </div>

            <div className="workspace-search"><label><span>SEARCH</span><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Repository, issue, or label" /></label></div>
            <div className="workspace-filters" role="group" aria-label="Filter issues by category">
              {categories.map((item) => <button type="button" key={item} aria-pressed={category === item} onClick={() => setCategory(item)}>{item}</button>)}
            </div>

            <div className="issue-ledger" aria-live="polite">
              {visibleIssues.length ? visibleIssues.map((issue) => (
                <article className="workspace-issue" key={`${issue.repo}-${issue.number}`}>
                  <div className="workspace-issue-main"><span>{issue.repo} · #{issue.number}</span><h3>{issue.title}</h3><div>{issue.labels.map((label) => <small key={label}>{label}</small>)}</div></div>
                  <div className="workspace-issue-meta"><span>{issue.stars} stars</span><span>{issue.updated}</span><strong>+{issue.points}</strong></div>
                  <a href="https://github.com/issues?q=is%3Aopen+is%3Aissue+label%3A%22good+first+issue%22" target="_blank" rel="noreferrer">Find similar issues</a>
                </article>
              )) : <div className="workspace-empty"><strong>No matching issues.</strong><button type="button" onClick={() => { setCategory("All"); setQuery(""); }}>Clear filters</button></div>}
            </div>
          </div>

          <aside className="pr-workspace" id="workspace-prs">
            <div className="workspace-section-head workspace-section-head-pr"><div><h2>Your merged PRs</h2><p>Hard-coded finder results for @{login}.</p></div></div>
            <button className="pr-scan-button" type="button" onClick={scanPullRequests} disabled={scanning}>{scanning ? "Refreshing demo results…" : "Refresh demo results"}</button>
            <div className={`pr-scan-status${scanning ? " is-scanning" : ""}`}><span />{scanning ? "Refreshing saved demo records" : "Demo snapshot · 3 merged PRs"}</div>
            <div className="pr-ledger" aria-live="polite" aria-busy={scanning}>
              {pullRequests.map((pull) => (
                <article key={`${pull.repo}-${pull.number}`}>
                  <span>{pull.repo} · PR #{pull.number}</span>
                  <h3>{pull.title}</h3>
                  <div><small>{pull.category.toUpperCase()}</small><small>MERGED {pull.merged.toUpperCase()}</small><strong>+{pull.points}</strong></div>
                </article>
              ))}
            </div>
            <div className="pr-total"><span>RECORDED FROM THESE RESULTS</span><strong>135 points</strong></div>
          </aside>
        </div>
      </section>
    </MarketingShell>
  );
}
