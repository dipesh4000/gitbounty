"use client";

import Image from "next/image";
import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { api, timeAgo, type Issue, type IssueList, type LeaderboardEntry, type LeaderboardResponse, type MyPointsResponse } from "../lib/api";
import { BountyManager } from "./BountyManager";
import { useAuth } from "./AuthProvider";

type View = "issues" | "add-issues" | "pulls" | "leaderboard";

/*
  FORM: compact contributor operations table with one task surface at a time.
  FORM_SEED: simple-issues-prs-leaderboard-20260925.
  CORROBORATION: the user pinned a separate logged-in shell containing only Issues, My PRs, Leaderboard, and account controls.
*/

const categories = ["All", "Frontend", "Backend", "Full-stack", "Docs", "Testing", "DevOps", "Design", "Mobile", "Other"];
const categoryLabel = (value: string) => value === "fullstack" ? "Full-stack" : value === "devops" ? "DevOps" : value.charAt(0).toUpperCase() + value.slice(1);
const categoryValue = (value: string) => value.toLowerCase().replace("-", "");

export function ContributorWorkspace() {
  const { user, loading, connect } = useAuth();
  const [view, setView] = useState<View>("issues");
  const [category, setCategory] = useState("All");
  const [query, setQuery] = useState("");
  const [leaderboardCategory, setLeaderboardCategory] = useState("All");
  const [issues, setIssues] = useState<Issue[]>([]);
  const [issuesLoading, setIssuesLoading] = useState(true);
  const [issuesError, setIssuesError] = useState("");
  const [points, setPoints] = useState<MyPointsResponse | null>(null);
  const [pointsLoading, setPointsLoading] = useState(true);
  const [pointsError, setPointsError] = useState("");
  const [leaderboard, setLeaderboard] = useState<LeaderboardEntry[]>([]);
  const [leaderboardLoading, setLeaderboardLoading] = useState(true);
  const [leaderboardError, setLeaderboardError] = useState("");

  const loadIssues = useCallback(() => {
    setIssuesLoading(true);
    setIssuesError("");
    api<IssueList>("/api/issues?per_page=100")
      .then((result) => setIssues(result.items))
      .catch((error: unknown) => setIssuesError(error instanceof Error ? error.message : "Could not load published issues."))
      .finally(() => setIssuesLoading(false));
  }, []);

  const loadPoints = useCallback(() => {
    setPointsLoading(true);
    setPointsError("");
    api<MyPointsResponse>("/api/me/points")
      .then(setPoints)
      .catch((error: unknown) => setPointsError(error instanceof Error ? error.message : "Could not load your contribution history."))
      .finally(() => setPointsLoading(false));
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

  useEffect(() => {
    if (!user) return;
    let active = true;
    api<MyPointsResponse>("/api/me/points")
      .then((result) => { if (active) setPoints(result); })
      .catch((error: unknown) => { if (active) setPointsError(error instanceof Error ? error.message : "Could not load your contribution history."); })
      .finally(() => { if (active) setPointsLoading(false); });
    return () => { active = false; };
  }, [user]);

  useEffect(() => {
    if (!user) return;
    let active = true;
    const categoryQuery = leaderboardCategory === "All" ? "" : `&category=${encodeURIComponent(categoryValue(leaderboardCategory))}`;
    api<LeaderboardResponse>(`/api/leaderboard?period=all&limit=100${categoryQuery}`)
      .then((result) => { if (active) setLeaderboard(result.entries); })
      .catch((error: unknown) => { if (active) setLeaderboardError(error instanceof Error ? error.message : "Could not load the leaderboard."); })
      .finally(() => { if (active) setLeaderboardLoading(false); });
    return () => { active = false; };
  }, [leaderboardCategory, user]);

  const filteredIssues = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return issues.filter((issue) => {
      const inCategory = category === "All" || categoryLabel(issue.category) === category;
      const inSearch = !needle || `${issue.title} ${issue.posted_by || ""} ${issue.repository}`.toLowerCase().includes(needle);
      return inCategory && inSearch;
    });
  }, [category, issues, query]);

  const issuesNeedFirstPublish = issuesError.toLowerCase().includes("migration 0004");
  const selectLeaderboardCategory = (nextCategory: string) => {
    if (nextCategory === leaderboardCategory) return;
    setLeaderboardLoading(true);
    setLeaderboardError("");
    setLeaderboardCategory(nextCategory);
  };

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
          <div className="app-header-meta">
            <span className="app-nav-points" aria-label={points ? `${points.total_points} points earned` : "Points unavailable"}><strong>{pointsLoading ? "…" : points?.total_points ?? "—"}</strong> points</span>
            <div className="app-account-group"><span className="app-account">@{user.github_login}</span><button className="app-signout" type="button" onClick={() => connect("nav")}>Sign out</button></div>
          </div>
        </div>
      </header>

      <main className="app-main">
        <div className="app-page-heading">
          <div><h1>{title}</h1><p>{view === "issues" ? "Bounties published by repository maintainers." : view === "add-issues" ? "Choose open issues from repositories owned by your GitHub account." : view === "pulls" ? "Track the work you have submitted." : "Points earned from merged open-source work."}</p></div>
          {view === "issues" && <button className="app-add-issues" type="button" onClick={() => setView("add-issues")}>Add issues</button>}
          {view === "add-issues" && <button className="app-back-action" type="button" onClick={() => setView("issues")}>Back to issues</button>}
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
              {!issuesLoading && issuesError && (issuesNeedFirstPublish
                ? <div className="app-empty"><strong>No issues published yet.</strong><span>Add an issue from one of your GitHub repositories and set its bounty.</span><button type="button" onClick={() => setView("add-issues")}>Add your first issue</button></div>
                : <div className="app-empty"><strong>Couldn’t load published issues.</strong><span>{issuesError}</span><button type="button" onClick={loadIssues}>Try again</button></div>)}
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
            <div className="app-summary-line"><span><strong>{pointsLoading ? "…" : points?.total_merges ?? "—"}</strong> merged</span><span><strong>{pointsLoading ? "…" : points?.total_points ?? "—"}</strong> points earned</span></div>
            <div className="app-table app-pulls-table">
              <div className="app-table-head"><span>Pull request</span><span>Repository</span><span>Category</span><span>Status</span><span>Points</span></div>
              {pointsLoading && <div className="app-empty"><strong>Loading your pull requests…</strong></div>}
              {!pointsLoading && pointsError && <div className="app-empty"><strong>Couldn’t load your pull requests.</strong><span>{pointsError}</span><button type="button" onClick={loadPoints}>Try again</button></div>}
              {!pointsLoading && !pointsError && points?.recent_merges.map((pull) => (
                <div className="app-table-row" key={`${pull.repo_full_name}#${pull.number}`}>
                  <div className="app-primary-cell"><small>#{pull.number} · {timeAgo(pull.merged_at)}</small><a href={pull.url} target="_blank" rel="noreferrer">{pull.title}</a></div>
                  <div className="app-repo" data-label="Repository">github.com/{pull.repo_full_name}</div>
                  <div data-label="Category"><span className="app-category">{categoryLabel(pull.category)}</span></div>
                  <div data-label="Status"><span className="app-status is-merged">Merged</span></div>
                  <div className="app-points" data-label="Points">+{pull.points}</div>
                </div>
              ))}
              {!pointsLoading && !pointsError && !points?.recent_merges.length && <div className="app-empty"><strong>No merged pull requests yet.</strong><span>Your verified merged contributions will appear here after GitBounty syncs them.</span></div>}
            </div>
          </section>
        )}

        {view === "leaderboard" && (
          <section aria-label="Leaderboard">
            <div className="app-category-filter" role="group" aria-label="Filter leaderboard by category">
              {categories.map((item) => <button type="button" key={item} aria-pressed={leaderboardCategory === item} onClick={() => selectLeaderboardCategory(item)}>{item}</button>)}
            </div>
            <div className="app-table app-leaderboard-table">
              <div className="app-table-head"><span>Rank</span><span>Contributor</span><span>Merged PRs</span><span>Points</span></div>
              {leaderboardLoading && <div className="app-empty"><strong>Loading leaderboard…</strong></div>}
              {!leaderboardLoading && leaderboardError && <div className="app-empty"><strong>Couldn’t load the leaderboard.</strong><span>{leaderboardError}</span></div>}
              {!leaderboardLoading && !leaderboardError && leaderboard.map((leader) => (
                <div className={`app-table-row${leader.github_login === user.github_login ? " is-current-user" : ""}`} key={leader.github_login}>
                  <div className="app-rank" data-label="Rank">{leader.rank.toString().padStart(2, "0")}</div>
                  <div className="app-user" data-label="Contributor"><span>{leader.github_login.slice(0, 2).toUpperCase()}</span><strong>@{leader.github_login}</strong>{leader.github_login === user.github_login && <small>You</small>}</div>
                  <div data-label="Merged PRs">{leader.merges}</div>
                  <div className="app-points" data-label="Points">{leader.points}</div>
                </div>
              ))}
              {!leaderboardLoading && !leaderboardError && !leaderboard.length && <div className="app-empty"><strong>No {leaderboardCategory === "All" ? "ranked" : leaderboardCategory} contributors yet.</strong><span>Contributors will appear here after earning points{leaderboardCategory === "All" ? "." : ` in ${leaderboardCategory}.`}</span>{leaderboardCategory !== "All" && <button type="button" onClick={() => selectLeaderboardCategory("All")}>View all contributors</button>}</div>}
            </div>
          </section>
        )}
      </main>
    </div>
  );
}
