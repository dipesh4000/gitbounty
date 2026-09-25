"use client";

import Image from "next/image";
import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { api, type Issue, type IssueList } from "../lib/api";
import { BountyManager } from "./BountyManager";
import { useAuth } from "./AuthProvider";

type View = "issues" | "add-issues" | "pulls" | "leaderboard";
type PullStatus = "Submitted" | "In review" | "Merged";

/*
  FORM: compact contributor operations table with one task surface at a time.
  FORM_SEED: simple-issues-prs-leaderboard-20260925.
  CORROBORATION: the user pinned a separate logged-in shell containing only Issues, My PRs, Leaderboard, and account controls.
*/

const pullRequests: Array<{ id: number; title: string; repo: string; category: string; status: PullStatus; points: number | null; updated: string }> = [
  { id: 1910, title: "Trap focus and loop arrow keys", repo: "openframe/core", category: "Frontend", status: "Merged", points: 45, updated: "Today" },
  { id: 742, title: "Preserve filters when returning to the issue list", repo: "openframe/core", category: "Frontend", status: "Submitted", points: null, updated: "Just now" },
  { id: 724, title: "Handle worker retry ceilings", repo: "relaylabs/queue", category: "Backend", status: "In review", points: null, updated: "2h ago" },
  { id: 101, title: "Add streaming response examples", repo: "halyard/docs", category: "Docs", status: "Merged", points: 25, updated: "4d ago" },
  { id: 2284, title: "Cover composite-key migration output", repo: "marrow/orm", category: "Full-stack", status: "In review", points: null, updated: "1d ago" },
];

const leaders = [
  { rank: 1, user: "maya-dev", focus: "Frontend", merges: 12, points: 420 },
  { rank: 2, user: "aasha-malik", focus: "Full-stack", merges: 7, points: 185 },
  { rank: 3, user: "nolan-s", focus: "Backend", merges: 6, points: 160 },
  { rank: 4, user: "sam-docs", focus: "Docs", merges: 9, points: 145 },
  { rank: 5, user: "liam-rs", focus: "Testing", merges: 5, points: 120 },
];

const categories = ["All", "Frontend", "Backend", "Full-stack", "Docs", "Testing", "DevOps", "Design", "Mobile", "Other"];
const categoryLabel = (value: string) => value === "fullstack" ? "Full-stack" : value === "devops" ? "DevOps" : value.charAt(0).toUpperCase() + value.slice(1);

export function ContributorWorkspace() {
  const { user, loading, connect } = useAuth();
  const [view, setView] = useState<View>("issues");
  const [category, setCategory] = useState("All");
  const [query, setQuery] = useState("");
  const [pullStatus, setPullStatus] = useState<"All" | PullStatus>("All");
  const [issues, setIssues] = useState<Issue[]>([]);
  const [issuesLoading, setIssuesLoading] = useState(true);
  const [issuesError, setIssuesError] = useState("");

  const loadIssues = useCallback(() => {
    setIssuesLoading(true);
    setIssuesError("");
    api<IssueList>("/api/issues?per_page=100")
      .then((result) => setIssues(result.items))
      .catch((error: unknown) => setIssuesError(error instanceof Error ? error.message : "Could not load published issues."))
      .finally(() => setIssuesLoading(false));
  }, []);

  useEffect(() => {
    if (!loading && !user) window.location.replace("/");
  }, [loading, user]);

  useEffect(() => {
    if (!user) return;
    let active = true;
    api<IssueList>("/api/issues?per_page=100")
      .then((result) => { if (active) setIssues(result.items); })
      .catch((error: unknown) => { if (active) setIssuesError(error instanceof Error ? error.message : "Could not load published issues."); })
      .finally(() => { if (active) setIssuesLoading(false); });
    return () => { active = false; };
  }, [user]);

  const filteredIssues = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return issues.filter((issue) => {
      const inCategory = category === "All" || categoryLabel(issue.category) === category;
      const inSearch = !needle || `${issue.title} ${issue.posted_by || ""} ${issue.repository}`.toLowerCase().includes(needle);
      return inCategory && inSearch;
    });
  }, [category, issues, query]);

  const filteredPulls = useMemo(
    () => pullRequests.filter((pull) => pullStatus === "All" || pull.status === pullStatus),
    [pullStatus],
  );

  if (!user) {
    return <main className="app-loading" aria-live="polite">{loading ? "Opening GitBounty…" : "Returning to sign in…"}</main>;
  }

  const title = view === "issues" ? "Issues" : view === "add-issues" ? "Add issues" : view === "pulls" ? "My pull requests" : "Leaderboard";

  return (
    <div className="app-shell">
      <header className="app-header">
        <div className="app-header-main">
          <Link className="app-brand" href="/" aria-label="GitBounty home">
            <Image src="/assets/favicon.png" alt="" width={28} height={28} priority />
            <span>GitBounty</span>
          </Link>
          <nav className="app-nav" aria-label="Dashboard">
            <button type="button" aria-current={view === "issues" ? "page" : undefined} onClick={() => setView("issues")}>Issues</button>
            <button type="button" aria-current={view === "pulls" ? "page" : undefined} onClick={() => setView("pulls")}>My PRs</button>
            <button type="button" aria-current={view === "leaderboard" ? "page" : undefined} onClick={() => setView("leaderboard")}>Leaderboard</button>
          </nav>
          <div className="app-account-group"><span className="app-account">@{user.github_login}</span><button className="app-signout" type="button" onClick={() => connect("nav")}>Sign out</button></div>
        </div>
      </header>

      <main className="app-main">
        <div className="app-page-heading">
          <div><h1>{title}</h1><p>{view === "issues" ? "Bounties published by repository maintainers." : view === "add-issues" ? "Choose open issues from repositories owned by your GitHub account." : view === "pulls" ? "Track the work you have submitted." : "Points earned from merged open-source work."}</p></div>
          {view === "issues" && <button className="app-add-issues" type="button" onClick={() => setView("add-issues")}>Add issues</button>}
          {view === "add-issues" && <button className="app-back-action" type="button" onClick={() => setView("issues")}>Back to issues</button>}
          {(view === "pulls" || view === "leaderboard") && <span>Demo data</span>}
        </div>

        {view === "issues" && (
          <section aria-label="Open issues">
            <div className="app-toolbar">
              <label className="app-search"><span className="sr-only">Search issues</span><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search issues, users, or repositories" /></label>
              <label className="app-select"><span>Category</span><select value={category} onChange={(event) => setCategory(event.target.value)}>{categories.map((item) => <option key={item}>{item}</option>)}</select></label>
            </div>
            <div className="app-table app-issues-table">
              <div className="app-table-head"><span>Issue</span><span>Posted by</span><span>Repository</span><span>Category</span><span>Points</span></div>
              {issuesLoading && <div className="app-empty"><strong>Loading published issues…</strong></div>}
              {!issuesLoading && issuesError && <div className="app-empty"><strong>Couldn’t load published issues.</strong><span>{issuesError}</span><button type="button" onClick={loadIssues}>Try again</button></div>}
              {!issuesLoading && !issuesError && filteredIssues.map((issue) => (
                <div className="app-table-row" key={issue.id}>
                  <div className="app-primary-cell"><small>#{issue.number}</small><a href={issue.html_url} target="_blank" rel="noreferrer">{issue.title}</a></div>
                  <div data-label="Posted by">{issue.posted_by ? `@${issue.posted_by}` : "Maintainer"}</div>
                  <div className="app-repo" data-label="Repository">github.com/{issue.repository}</div>
                  <div data-label="Category"><span className="app-category">{categoryLabel(issue.category)}</span></div>
                  <div className="app-points" data-label="Points">+{issue.points}</div>
                </div>
              ))}
              {!issuesLoading && !issuesError && !filteredIssues.length && <div className="app-empty"><strong>{issues.length ? "No issues match those filters." : "No bounties have been published yet."}</strong><span>{issues.length ? "Try another repository, user, or category." : "Choose an open issue from one of your GitHub repositories."}</span>{issues.length ? <button type="button" onClick={() => { setQuery(""); setCategory("All"); }}>Clear filters</button> : <button type="button" onClick={() => setView("add-issues")}>Add issues</button>}</div>}
            </div>
          </section>
        )}

        {view === "add-issues" && <BountyManager onPublished={loadIssues} />}

        {view === "pulls" && (
          <section aria-label="My pull requests">
            <div className="app-summary-line"><span><strong>5</strong> total</span><span><strong>1</strong> submitted</span><span><strong>2</strong> in review</span><span><strong>2</strong> merged</span><span><strong>70</strong> points earned</span></div>
            <div className="app-tabs" role="group" aria-label="Filter pull requests by status">
              {(["All", "Submitted", "In review", "Merged"] as const).map((status) => <button type="button" key={status} aria-pressed={pullStatus === status} onClick={() => setPullStatus(status)}>{status}</button>)}
            </div>
            <div className="app-table app-pulls-table">
              <div className="app-table-head"><span>Pull request</span><span>Repository</span><span>Category</span><span>Status</span><span>Points</span></div>
              {filteredPulls.map((pull) => (
                <div className="app-table-row" key={pull.id}>
                  <div className="app-primary-cell"><small>#{pull.id} · {pull.updated}</small><strong>{pull.title}</strong></div>
                  <div className="app-repo" data-label="Repository">github.com/{pull.repo}</div>
                  <div data-label="Category"><span className="app-category">{pull.category}</span></div>
                  <div data-label="Status"><span className={`app-status ${pull.status === "Merged" ? "is-merged" : ""}`}>{pull.status}</span></div>
                  <div className="app-points" data-label="Points">{pull.points ? `+${pull.points}` : "—"}</div>
                </div>
              ))}
            </div>
          </section>
        )}

        {view === "leaderboard" && (
          <section aria-label="Leaderboard">
            <div className="app-table app-leaderboard-table">
              <div className="app-table-head"><span>Rank</span><span>Contributor</span><span>Top category</span><span>Merged PRs</span><span>Points</span></div>
              {leaders.map((leader) => (
                <div className={`app-table-row${leader.user === user.github_login ? " is-current-user" : ""}`} key={leader.user}>
                  <div className="app-rank" data-label="Rank">{leader.rank.toString().padStart(2, "0")}</div>
                  <div className="app-user" data-label="Contributor"><span>{leader.user.slice(0, 2).toUpperCase()}</span><strong>@{leader.user}</strong>{leader.user === user.github_login && <small>You</small>}</div>
                  <div data-label="Top category"><span className="app-category">{leader.focus}</span></div>
                  <div data-label="Merged PRs">{leader.merges}</div>
                  <div className="app-points" data-label="Points">{leader.points}</div>
                </div>
              ))}
            </div>
          </section>
        )}
      </main>
    </div>
  );
}
