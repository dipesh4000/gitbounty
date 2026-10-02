"use client";

import Image from "next/image";
import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ApiError,
  CATEGORIES,
  api,
  apiWrite,
  categoryLabel,
  formatPoints,
  timeAgo,
  type BountyCategory,
  type Issue,
  type IssueList,
  type LeaderboardPeriod,
  type LeaderboardResponse,
  PR_STATES,
  PR_STATE_LABELS,
  type PullRequestList,
  type PullRequestState,
  type TrackedPullRequest,
  type MyPointsResponse,
  type PointsHistoryResponse,
  type SyncStatus,
} from "../lib/api";
import { useApiResource } from "../lib/useApiResource";
import { MaintainerWorkspace, Pager } from "./MaintainerWorkspace";
import { useAuth } from "./AuthProvider";

/*
  The signed-in application. Deliberately not a copy of the marketing page: a compact operations shell with
  one task surface at a time.

  Everything shown here comes from the API. Where the API has nothing yet, the state says which kind of
  nothing it is -- never synced, syncing, synced and empty, or failed -- because those are four different
  situations and an empty table is not an answer to any of them.
*/

type View = "issues" | "maintain" | "pulls" | "history" | "leaderboard";

const VIEWS: Array<{ id: View; label: string; title: string; lede: string }> = [
  { id: "issues", label: "Opportunities", title: "Opportunities", lede: "Bounties published by repository maintainers." },
  { id: "maintain", label: "My repositories", title: "Maintainer workspace", lede: "Publish bounties on repositories you manage, and look after the ones you have published." },
  { id: "pulls", label: "My PRs", title: "My pull requests", lede: "Every pull request you have authored, what state it is in, and what it has earned or stands to earn." },
  { id: "history", label: "Points", title: "Points history", lede: "Every entry behind your total, with where it came from." },
  { id: "leaderboard", label: "Leaderboard", title: "Leaderboard", lede: "Points earned from merged open-source work." },
];

function message(error: unknown) {
  if (error instanceof ApiError) return error.message;
  return error instanceof Error ? error.message : "Something went wrong.";
}

export function ContributorWorkspace() {
  const { user, status: authStatus, error: authError, signOut } = useAuth();
  const [view, setView] = useState<View>("issues");
  const [points, setPoints] = useState<MyPointsResponse | null>(null);
  const [pointsLoading, setPointsLoading] = useState(true);

  /* The header's points figure. A failure here degrades to an em dash rather than taking over the page:
     every view that needs this data reports its own failure in its own place. */
  const loadPoints = useCallback(async () => {
    try {
      setPoints(await api<MyPointsResponse>("/api/me/points"));
    } catch {
      setPoints(null);
    } finally {
      setPointsLoading(false);
    }
  }, []);

  /* Only an actual 401 sends someone back to the landing page. When the API is unreachable or
     unconfigured we stay here and say so, because bouncing to a page that cannot load either just
     looks like the sign-in failed. */
  useEffect(() => {
    if (authStatus === "signed-out") window.location.replace("/");
  }, [authStatus]);

  useEffect(() => {
    if (!user) return;
    let active = true;
    api<MyPointsResponse>("/api/me/points")
      .then((result) => { if (active) setPoints(result); })
      .catch(() => { if (active) setPoints(null); })
      .finally(() => { if (active) setPointsLoading(false); });
    return () => { active = false; };
  }, [user]);

  if (!user) {
    if (authStatus === "unavailable") {
      return (
        <main className="app-loading" aria-live="polite">
          <div className="app-empty">
            <strong>GitBounty can’t reach its API.</strong>
            <span>{authError}</span>
            <Link href="/">Back to the landing page</Link>
          </div>
        </main>
      );
    }
    return (
      <main className="app-loading" aria-live="polite">
        {authStatus === "loading" ? "Checking your GitHub session…" : "Returning to sign in…"}
      </main>
    );
  }

  const current = VIEWS.find((item) => item.id === view) ?? VIEWS[0];

  return (
    <div className="app-shell">
      <header className="app-header">
        <div className="app-header-main">
          <Link className="app-brand" href="/" aria-label="GitBounty home">
            <Image src="/assets/favicon.png" alt="" width={28} height={28} priority />
            <span>GitBounty</span>
          </Link>
          <nav className="app-nav" aria-label="Dashboard">
            {VIEWS.map((item) => (
              <button
                type="button"
                key={item.id}
                aria-current={view === item.id ? "page" : undefined}
                onClick={() => setView(item.id)}
              >
                {item.label}
              </button>
            ))}
          </nav>
          <div className="app-header-meta">
            <span
              className="app-nav-points"
              aria-label={points ? `${points.total_points} points earned` : "Points not loaded"}
            >
              <strong>{pointsLoading ? "…" : points ? formatPoints(points.total_points) : "—"}</strong> points
            </span>
            <div className="app-account-group">
              <span className="app-account">@{user.github_login}</span>
              <button className="app-signout" type="button" onClick={signOut}>Sign out</button>
            </div>
          </div>
        </div>
      </header>

      <main className="app-main">
        <div className="app-page-heading">
          <div><h1>{current.title}</h1><p>{current.lede}</p></div>
          {view === "issues" && (
            <button className="app-add-issues" type="button" onClick={() => setView("maintain")}>
              Publish a bounty
            </button>
          )}
        </div>

        {view === "issues" && <Opportunities onPublishClick={() => setView("maintain")} />}
        {view === "maintain" && <MaintainerWorkspace onPublished={() => void loadPoints()} />}
        {view === "pulls" && (
          <MyPullRequests
            points={points}
            pointsLoading={pointsLoading}
            onSynced={() => { void loadPoints(); }}
          />
        )}
        {view === "history" && <PointsHistory />}
        {view === "leaderboard" && <Leaderboard login={user.github_login} />}
      </main>
    </div>
  );
}

// --- the public opportunity explorer --------------------------------------

function Opportunities({ onPublishClick }: { onPublishClick: () => void }) {
  const [category, setCategory] = useState<BountyCategory | "all">("all");
  const [query, setQuery] = useState("");
  const [page, setPage] = useState(1);

  const params = new URLSearchParams({ page: String(page), per_page: "25", sort: "updated" });
  if (category !== "all") params.set("category", category);
  if (query.trim()) params.set("q", query.trim());
  const { resource, reload } = useApiResource<IssueList>(`/api/issues?${params}`);
  const result = resource.data;
  const loading = resource.status === "loading";
  const error = resource.error;

  const issues: Issue[] = result?.items ?? [];

  return (
    <section aria-label="Published bounties">
      <div className="app-toolbar">
        <label className="app-search">
          <span className="sr-only">Search published bounties</span>
          <input
            value={query}
            placeholder="Search issue titles"
            onChange={(event) => { setPage(1); setQuery(event.target.value); }}
          />
        </label>
        <label className="app-select">
          <span>Category</span>
          <select
            value={category}
            onChange={(event) => { setPage(1); setCategory(event.target.value as BountyCategory | "all"); }}
          >
            <option value="all">All</option>
            {CATEGORIES.map((value) => <option value={value} key={value}>{categoryLabel(value)}</option>)}
          </select>
        </label>
      </div>

      <div className="app-table app-issues-table">
        <div className="app-table-head">
          <span>Issue</span><span>Published by</span><span>Repository</span><span>Category</span><span>Points</span>
        </div>
        {loading && <div className="app-empty" aria-live="polite"><strong>Loading published bounties…</strong></div>}
        {!loading && error && (
          <div className="app-empty">
            <strong>Couldn’t load published bounties.</strong>
            <span>{error}</span>
            <button type="button" onClick={reload}>Try again</button>
          </div>
        )}
        {!loading && !error && issues.map((issue) => (
          <div className="app-table-row" key={issue.id}>
            <div className="app-primary-cell">
              <small>#{issue.number}</small>
              <a href={issue.html_url} target="_blank" rel="noreferrer">{issue.title}</a>
            </div>
            <div data-label="Published by">{issue.posted_by ? `@${issue.posted_by}` : "Maintainer"}</div>
            <div className="app-repo" data-label="Repository">github.com/{issue.repository}</div>
            <div data-label="Category"><span className="app-category">{categoryLabel(issue.category)}</span></div>
            <div className="app-points" data-label="Points">+{formatPoints(issue.points)}</div>
          </div>
        ))}
        {!loading && !error && issues.length === 0 && (
          <div className="app-empty">
            <strong>
              {query || category !== "all"
                ? "No published bounty matches those filters."
                : "No bounties have been published yet."}
            </strong>
            <span>
              {query || category !== "all"
                ? "Try another category, or clear the search."
                : "Be the first: choose an open issue from a repository you maintain and give it a value."}
            </span>
            {query || category !== "all"
              ? <button type="button" onClick={() => { setQuery(""); setCategory("all"); setPage(1); }}>Clear filters</button>
              : <button type="button" onClick={onPublishClick}>Publish your first bounty</button>}
          </div>
        )}
      </div>

      {result && (result.has_more || page > 1) && (
        <nav className="app-pager" aria-label="Pages">
          <button type="button" disabled={page <= 1} onClick={() => setPage(page - 1)}>Previous</button>
          <span>Page {page}</span>
          <button type="button" disabled={!result.has_more} onClick={() => setPage(page + 1)}>Next</button>
        </nav>
      )}
    </section>
  );
}

// --- my pull requests -----------------------------------------------------

/*
  My pull requests.

  Every state GitHub gives us evidence for, not only merged work. The two point figures are deliberately
  separate: `expected_points` is what this would earn if merged as it stands, and `awarded_points` is what
  the ledger has actually credited. An open pull request has the first and not the second, and conflating
  them would promise something GitBounty cannot promise -- a bounty is awarded once, to one person.
*/

const STATE_CLASS: Record<PullRequestState, string> = {
  draft: "is-draft",
  open: "is-open",
  in_review: "is-in-review",
  changes_requested: "is-changes-requested",
  approved: "is-approved",
  merged: "is-merged",
  closed_unmerged: "is-closed",
};

/** The filter chips, in the order work moves through them. */
const STATE_FILTERS: Array<{ id: PullRequestState | "all"; label: string }> = [
  { id: "all", label: "All" },
  ...PR_STATES.map((state) => ({ id: state, label: PR_STATE_LABELS[state] })),
];

function whenLabel(pull: TrackedPullRequest): string {
  if (pull.merged_at) return `merged ${timeAgo(pull.merged_at)}`;
  if (pull.closed_at) return `closed ${timeAgo(pull.closed_at)}`;
  if (pull.pr_updated_at) return `updated ${timeAgo(pull.pr_updated_at)}`;
  return pull.pr_created_at ? `opened ${timeAgo(pull.pr_created_at)}` : "";
}

/** The one-line explanation under the title. Never a guess: it reports what the API said. */
function detailFor(pull: TrackedPullRequest): string {
  if (!pull.eligible) return pull.ineligible_reason ?? "Not eligible for points.";
  if (pull.bounty_issue_number !== null) {
    const bounty = `${pull.bounty_repo_full_name}#${pull.bounty_issue_number}`;
    return pull.state === "merged"
      ? `Closed the bounty on ${bounty}.`
      : `Closes the bounty on ${bounty} — worth ${formatPoints(pull.bounty_points ?? 0)} if this merges.`;
  }
  return pull.state === "merged"
    ? "Merged in a participating repository, with no bounty on the issue it closed."
    : "No bounty on the issue this closes; the baseline applies if it merges.";
}

function MyPullRequests({
  points,
  pointsLoading,
  onSynced,
}: {
  points: MyPointsResponse | null;
  pointsLoading: boolean;
  onSynced: () => void;
}) {
  const [state, setState] = useState<PullRequestState | "all">("all");
  const [page, setPage] = useState(1);

  const params = new URLSearchParams({ page: String(page), per_page: "25" });
  if (state !== "all") params.set("state", state);
  const { resource, reload } = useApiResource<PullRequestList>(`/api/me/pull-requests?${params}`);
  const result = resource.data;
  const loading = resource.status === "loading";
  const error = resource.error;

  const refresh = useCallback(() => { reload(); onSynced(); }, [onSynced, reload]);
  const counts = result?.counts ?? {};

  return (
    <section aria-label="My pull requests">
      <SyncBar sync={result?.sync ?? points?.sync ?? null} loading={loading && !result} onDone={refresh} />

      <div className="app-summary-line">
        <span><strong>{result ? result.total : "…"}</strong> pull requests</span>
        <span><strong>{counts.merged ?? 0}</strong> merged</span>
        <span>
          <strong>{pointsLoading ? "…" : points ? formatPoints(points.total_points) : "—"}</strong> points earned
        </span>
      </div>

      <div className="app-category-filter" role="group" aria-label="Filter by state">
        {STATE_FILTERS.map((item) => (
          <button
            type="button"
            key={item.id}
            aria-pressed={state === item.id}
            onClick={() => { setPage(1); setState(item.id); }}
          >
            {item.label}
            {item.id !== "all" && counts[item.id as PullRequestState]
              ? ` ${counts[item.id as PullRequestState]}`
              : ""}
          </button>
        ))}
      </div>

      <div className="app-table app-pulls-table">
        <div className="app-table-head">
          <span>Pull request</span><span>Repository</span><span>Category</span><span>Status</span><span>Points</span>
        </div>
        {loading && <div className="app-empty" aria-live="polite"><strong>Loading your pull requests…</strong></div>}
        {!loading && error && (
          <div className="app-empty">
            <strong>Couldn’t load your pull requests.</strong>
            <span>{error}</span>
            <button type="button" onClick={reload}>Try again</button>
          </div>
        )}
        {!loading && !error && result?.items.map((pull) => (
          <div className="app-table-row" key={pull.github_pr_id}>
            <div className="app-primary-cell">
              <small>#{pull.number} · {whenLabel(pull)}</small>
              <a href={pull.url} target="_blank" rel="noreferrer">{pull.title}</a>
              <span>{detailFor(pull)}</span>
            </div>
            <div className="app-repo" data-label="Repository">github.com/{pull.repo_full_name}</div>
            <div data-label="Category"><span className="app-category">{categoryLabel(pull.category)}</span></div>
            <div data-label="Status">
              <span className={`app-status ${STATE_CLASS[pull.state]}`}>{PR_STATE_LABELS[pull.state]}</span>
            </div>
            <div className="app-points" data-label="Points">
              {pull.awarded_points > 0
                ? <><strong>+{formatPoints(pull.awarded_points)}</strong><small>awarded</small></>
                : pull.expected_points > 0
                  ? <><span className="app-points-expected">+{formatPoints(pull.expected_points)}</span><small>if merged</small></>
                  : <span className="app-points-none">—</span>}
            </div>
          </div>
        ))}
        {!loading && !error && result && result.items.length === 0 && (
          <EmptyPullRequests sync={result.sync} filtered={state !== "all"} onClear={() => setState("all")} />
        )}
      </div>

      {result && result.total > result.per_page && (
        <Pager page={result.page} perPage={result.per_page} total={result.total} onPage={setPage} />
      )}
    </section>
  );
}

/** Five different kinds of nothing, told apart. */
function EmptyPullRequests({
  sync,
  filtered,
  onClear,
}: {
  sync: SyncStatus | null;
  filtered: boolean;
  onClear: () => void;
}) {
  if (filtered) {
    return (
      <div className="app-empty">
        <strong>No pull requests in that state.</strong>
        <span>Your other pull requests are still there.</span>
        <button type="button" onClick={onClear}>Show all</button>
      </div>
    );
  }
  if (!sync || sync.state === "never") {
    return (
      <div className="app-empty">
        <strong>GitBounty hasn’t looked at your GitHub activity yet.</strong>
        <span>Use Sync GitHub above to read the pull requests you have authored.</span>
      </div>
    );
  }
  if (sync.state === "running") {
    return (
      <div className="app-empty" aria-live="polite">
        <strong>Reading your pull requests from GitHub…</strong>
        <span>This can take a moment the first time.</span>
      </div>
    );
  }
  if (sync.state === "failed") {
    return (
      <div className="app-empty">
        <strong>The last sync didn’t finish.</strong>
        <span>{sync.error}</span>
      </div>
    );
  }
  return (
    <div className="app-empty">
      <strong>No pull requests found.</strong>
      <span>
        GitBounty lists pull requests you authored. Open one against a repository with a published bounty
        and sync again.
      </span>
    </div>
  );
}

/** The visible Sync GitHub control, with progress and the last-synced time. */
function SyncBar({
  sync,
  loading,
  onDone,
}: {
  sync: SyncStatus | null;
  loading: boolean;
  onDone: () => void;
}) {
  const [starting, setStarting] = useState(false);
  const [error, setError] = useState("");
  const polling = useRef<number | null>(null);

  const running = sync?.state === "running" || starting;

  /* While a sync is running, ask again every few seconds until it is not. Cleared on unmount so a poll
     never outlives the view. */
  useEffect(() => {
    if (sync?.state !== "running") {
      if (polling.current !== null) { window.clearTimeout(polling.current); polling.current = null; }
      return;
    }
    polling.current = window.setTimeout(onDone, 3000);
    return () => { if (polling.current !== null) window.clearTimeout(polling.current); };
  }, [onDone, sync?.state]);

  async function start(full: boolean) {
    setStarting(true);
    setError("");
    try {
      await apiWrite(`/api/me/sync${full ? "?full=true" : ""}`);
      onDone();
    } catch (caught) {
      setError(message(caught));
    } finally {
      setStarting(false);
    }
  }

  return (
    <div className="bounty-source-bar app-sync-bar">
      <div>
        <strong>GitHub sync</strong>
        <span>
          {loading && !sync ? "Checking…" : <SyncSummary sync={sync} />}
        </span>
        {error && <span role="alert">{error}</span>}
        {sync?.state === "failed" && sync.retry_after_seconds && (
          <span>GitHub asked us to wait about {sync.retry_after_seconds} seconds.</span>
        )}
      </div>
      <div className="bounty-row-actions">
        <button type="button" disabled={running} onClick={() => void start(false)}>
          {running ? "Syncing…" : "Sync GitHub"}
        </button>
        <button
          type="button"
          disabled={running}
          title="Re-read your whole history instead of continuing from the last sync."
          onClick={() => void start(true)}
        >
          Full re-sync
        </button>
      </div>
    </div>
  );
}

function SyncSummary({ sync }: { sync: SyncStatus | null }) {
  if (!sync || sync.state === "never") return <>Never synced.</>;
  if (sync.state === "running") return <>Running, started {timeAgo(sync.started_at)}.</>;
  if (sync.state === "failed") return <>Last attempt failed {timeAgo(sync.finished_at)}: {sync.error}</>;
  return (
    <>
      Last synced {timeAgo(sync.finished_at)} · {sync.prs_seen} pull{" "}
      {sync.prs_seen === 1 ? "request" : "requests"} seen · {sync.newly_counted} new ·{" "}
      {formatPoints(sync.points_awarded)} points awarded
      {sync.self_merges_skipped > 0 && ` · ${sync.self_merges_skipped} self-merge${sync.self_merges_skipped === 1 ? "" : "s"} skipped`}
    </>
  );
}

// --- points history -------------------------------------------------------

const KIND_LABELS: Record<string, string> = {
  bounty_award: "Bounty",
  baseline_award: "Baseline",
  adjustment: "Adjustment",
  void: "Withdrawn",
};

function PointsHistory() {
  const [page, setPage] = useState(1);
  const { resource, reload } = useApiResource<PointsHistoryResponse>(
    `/api/me/points/history?page=${page}&per_page=25`
  );
  const result = resource.data;
  const loading = resource.status === "loading";
  const error = resource.error;

  return (
    <section aria-label="Points history">
      {result && (
        <div className="app-summary-line">
          <span><strong>{formatPoints(result.total_points)}</strong> points</span>
          <span><strong>{result.total}</strong> entries</span>
          <span>
            Rules {result.rules.rule_version} · baseline {result.rules.baseline_per_merge} ·
            bounty {result.rules.min_bounty_points}–{formatPoints(result.rules.max_bounty_points)}
          </span>
        </div>
      )}

      <div className="app-table app-history-table">
        <div className="app-table-head">
          <span>Entry</span><span>Source</span><span>Category</span><span>When</span><span>Points</span>
        </div>
        {loading && <div className="app-empty" aria-live="polite"><strong>Loading your points history…</strong></div>}
        {!loading && error && (
          <div className="app-empty">
            <strong>Couldn’t load your points history.</strong>
            <span>{error}</span>
            <button type="button" onClick={reload}>Try again</button>
          </div>
        )}
        {!loading && !error && result?.entries.map((entry) => (
          <div className="app-table-row" key={entry.id}>
            <div className="app-primary-cell">
              <small>{KIND_LABELS[entry.kind] ?? entry.kind}</small>
              {entry.pr_url && entry.pr_number !== null
                ? <a href={entry.pr_url} target="_blank" rel="noreferrer">
                    {entry.pr_repo_full_name}#{entry.pr_number}
                  </a>
                : <span>{entry.reason || "Adjustment"}</span>}
              {entry.pr_url && entry.reason && <span>{entry.reason}</span>}
            </div>
            <div data-label="Source">
              {entry.bounty_issue_number !== null
                ? `${entry.bounty_repo_full_name}#${entry.bounty_issue_number} · worth ${entry.bounty_points_at_award} at the time`
                : entry.kind === "baseline_award" ? "Flat per-merge award" : "Manual correction"}
            </div>
            <div data-label="Category">
              <span className="app-category">{categoryLabel(entry.category)}</span>
              {entry.category_source === "maintainer" && <small> maintainer</small>}
            </div>
            <div data-label="When">{timeAgo(entry.merged_at ?? entry.created_at)}</div>
            <div className="app-points" data-label="Points">
              {entry.points > 0 ? `+${formatPoints(entry.points)}` : formatPoints(entry.points)}
            </div>
          </div>
        ))}
        {!loading && !error && result && result.entries.length === 0 && (
          <div className="app-empty">
            <strong>No points yet.</strong>
            <span>Every award and every correction will appear here, with where it came from and why.</span>
          </div>
        )}
      </div>

      {result && result.total > result.per_page && (
        <Pager page={result.page} perPage={result.per_page} total={result.total} onPage={setPage} />
      )}
    </section>
  );
}

// --- leaderboard ----------------------------------------------------------

const PERIODS: Array<{ id: LeaderboardPeriod; label: string }> = [
  { id: "week", label: "This week" },
  { id: "month", label: "This month" },
  { id: "all", label: "All time" },
];

function Leaderboard({ login }: { login: string }) {
  const [period, setPeriod] = useState<LeaderboardPeriod>("all");
  const [category, setCategory] = useState<BountyCategory | "all">("all");
  const [page, setPage] = useState(1);

  const params = new URLSearchParams({ period, page: String(page), per_page: "25" });
  if (category !== "all") params.set("category", category);
  const { resource } = useApiResource<LeaderboardResponse>(`/api/leaderboard?${params}`);
  const result = resource.data;
  const loading = resource.status === "loading";
  const error = resource.error;

  const onThisPage = useMemo(
    () => (result?.entries ?? []).some((entry) => entry.github_login === login),
    [login, result],
  );

  return (
    <section aria-label="Leaderboard">
      <div className="app-category-filter" role="group" aria-label="Time window">
        {PERIODS.map((item) => (
          <button
            type="button"
            key={item.id}
            aria-pressed={period === item.id}
            onClick={() => { setPage(1); setPeriod(item.id); }}
          >
            {item.label}
          </button>
        ))}
      </div>

      <div className="app-category-filter" role="group" aria-label="Category">
        <button type="button" aria-pressed={category === "all"} onClick={() => { setPage(1); setCategory("all"); }}>
          All
        </button>
        {CATEGORIES.map((value) => (
          <button
            type="button"
            key={value}
            aria-pressed={category === value}
            onClick={() => { setPage(1); setCategory(value); }}
          >
            {categoryLabel(value)}
          </button>
        ))}
      </div>

      <div className="app-table app-leaderboard-table">
        <div className="app-table-head">
          <span>Rank</span><span>Contributor</span><span>Merged PRs</span><span>Points</span>
        </div>
        {loading && <div className="app-empty" aria-live="polite"><strong>Loading leaderboard…</strong></div>}
        {!loading && error && (
          <div className="app-empty"><strong>Couldn’t load the leaderboard.</strong><span>{error}</span></div>
        )}
        {!loading && !error && result?.entries.map((entry) => (
          <div
            className={`app-table-row${entry.github_login === login ? " is-current-user" : ""}`}
            key={entry.github_login}
          >
            <div className="app-rank" data-label="Rank">{String(entry.rank).padStart(2, "0")}</div>
            <div className="app-user" data-label="Contributor">
              <span>{entry.github_login.slice(0, 2).toUpperCase()}</span>
              <strong>@{entry.github_login}</strong>
              {entry.github_login === login && <small>You</small>}
            </div>
            <div data-label="Merged PRs">{entry.merges}</div>
            <div className="app-points" data-label="Points">{formatPoints(entry.points)}</div>
          </div>
        ))}
        {!loading && !error && result && result.entries.length === 0 && (
          <div className="app-empty">
            <strong>
              No ranked contributors{category === "all" ? "" : ` in ${categoryLabel(category)}`}
              {period === "all" ? "" : period === "week" ? " this week" : " this month"} yet.
            </strong>
            <span>Contributors appear here once a merged pull request has earned points.</span>
            {(category !== "all" || period !== "all") && (
              <button type="button" onClick={() => { setCategory("all"); setPeriod("all"); setPage(1); }}>
                View all time, all categories
              </button>
            )}
          </div>
        )}
      </div>

      {/* Your own position, even when it is far past the last page. */}
      {result?.me && !onThisPage && (
        <div className="app-table app-leaderboard-table app-your-position">
          <div className="app-table-row is-current-user">
            <div className="app-rank" data-label="Rank">{String(result.me.rank).padStart(2, "0")}</div>
            <div className="app-user" data-label="Contributor">
              <span>{result.me.github_login.slice(0, 2).toUpperCase()}</span>
              <strong>@{result.me.github_login}</strong><small>You</small>
            </div>
            <div data-label="Merged PRs">{result.me.merges}</div>
            <div className="app-points" data-label="Points">{formatPoints(result.me.points)}</div>
          </div>
        </div>
      )}

      {result && result.total > result.per_page && (
        <Pager page={result.page} perPage={result.per_page} total={result.total} onPage={setPage} />
      )}
    </section>
  );
}
