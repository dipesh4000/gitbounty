"use client";

import { useEffect, useState } from "react";
import {
  API_BASE,
  ApiError,
  api,
  formatStars,
  timeAgo,
  type CategoryCounts,
  type Issue,
  type IssueList,
} from "../lib/api";

const FILTERS = [
  { value: "all", label: "All" },
  { value: "frontend", label: "Frontend" },
  { value: "backend", label: "Backend" },
  { value: "fullstack", label: "Full-stack" },
  { value: "docs", label: "Docs" },
];

type SortOrder = "updated" | "stars";

function IssueCard({ issue }: { issue: Issue }) {
  return (
    <li className="bounty-card">
      <div className="bounty-top">
        <span className="bounty-repo">{issue.repository}</span>
        <span className="bounty-amount">★ {formatStars(issue.stars)}</span>
      </div>
      <p className="bounty-title">{issue.title}</p>
      <div className="bounty-labels">
        <span className="tag">{issue.category}</span>
        {(issue.labels || []).slice(0, 3).map((label, index) => (
          <span className="tag" key={`${label}-${index}`}>{label}</span>
        ))}
      </div>
      <div className="bounty-bottom">
        <span className="bounty-age">{timeAgo(issue.issue_updated_at)}</span>
        <a href={issue.html_url} target="_blank" rel="noopener" className="bounty-link">View issue →</a>
      </div>
    </li>
  );
}

export function BountyBoard() {
  const [activeFilter, setActiveFilter] = useState("all");
  const [searchInput, setSearchInput] = useState("");
  const [searchQuery, setSearchQuery] = useState("");
  const [sortOrder, setSortOrder] = useState<SortOrder>("updated");
  const [page, setPage] = useState(1);
  const [items, setItems] = useState<Issue[]>([]);
  const [hasMore, setHasMore] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [counts, setCounts] = useState<CategoryCounts | null>(null);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      setLoading(true);
      setError(null);
      setSearchQuery(searchInput);
    }, 300);
    return () => window.clearTimeout(timer);
  }, [searchInput]);

  useEffect(() => {
    let active = true;
    const params = new URLSearchParams({
      sort: sortOrder,
      page: String(page),
      per_page: "24",
    });
    if (activeFilter !== "all") params.set("category", activeFilter);
    if (searchQuery.trim()) params.set("q", searchQuery.trim());

    api<IssueList>(`/api/issues?${params.toString()}`)
      .then((data) => {
        if (!active) return;
        setItems((current) => page > 1 ? current.concat(data.items) : data.items);
        setHasMore(data.has_more);
      })
      .catch((caught: unknown) => {
        if (!active) return;
        setItems([]);
        setHasMore(false);
        setError(caught instanceof ApiError
          ? caught.message
          : `Can't reach the backend. Is it running on ${API_BASE}?`);
      })
      .finally(() => {
        if (active) setLoading(false);
      });

    return () => { active = false; };
  }, [activeFilter, page, searchQuery, sortOrder]);

  useEffect(() => {
    let active = true;
    api<CategoryCounts>("/api/issues/categories")
      .then((data) => { if (active) setCounts(data); })
      .catch(() => { if (active) setCounts(null); });
    return () => { active = false; };
  }, [items]);

  const resetPage = () => setPage(1);
  const total = counts ? Object.values(counts).reduce((sum, count) => sum + count, 0) : 0;
  const breakdown = counts
    ? Object.entries(counts).filter(([, count]) => count).map(([category, count]) => `${count} ${category}`).join(" · ")
    : "";

  return (
    <section className="section" id="bounties">
      <div className="wrap">
        <div className="section-head">
          <h2>Open issues</h2>
          <p>Unassigned &quot;good first issue&quot; tickets from across GitHub, sorted by the area you work in. Solve one and earn points; where a maintainer has funded the issue, earn the bounty too.</p>
        </div>

        <div className="board-controls">
          <div className="search-field">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden="true">
              <circle cx="11" cy="11" r="7" stroke="currentColor" strokeWidth="2" />
              <path d="M21 21l-4.3-4.3" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
            </svg>
            <input
              type="text"
              placeholder="Search by repo or title"
              aria-label="Search bounties"
              value={searchInput}
              onChange={(event) => { setSearchInput(event.target.value); resetPage(); }}
            />
          </div>

          <div className="filter-pills" role="group" aria-label="Filter by category">
            {FILTERS.map((filter) => (
              <button
                key={filter.value}
                className={`pill${activeFilter === filter.value ? " is-active" : ""}`}
                type="button"
                onClick={() => {
                  setLoading(true);
                  setError(null);
                  setActiveFilter(filter.value);
                  resetPage();
                }}
              >
                {filter.label}
              </button>
            ))}
          </div>

          <label className="sort-field">
            <span>Sort</span>
            <select value={sortOrder} onChange={(event) => {
              setLoading(true);
              setError(null);
              setSortOrder(event.target.value as SortOrder);
              resetPage();
            }}>
              <option value="updated">Recently updated</option>
              <option value="stars">Most stars</option>
            </select>
          </label>
        </div>

        <ul className="bounty-grid" aria-live="polite">
          {loading && page === 1 ? (
            <li className="empty-state"><p>Loading issues…</p></li>
          ) : error ? (
            <li className="empty-state"><p>{error}</p></li>
          ) : items.length === 0 ? (
            <li className="empty-state"><p>No issues match your filters.</p></li>
          ) : (
            items.map((issue) => <IssueCard issue={issue} key={issue.id} />)
          )}
        </ul>

        {hasMore ? (
          <button
            className="btn btn-outline"
            type="button"
            style={{ display: "block", margin: "24px auto 0" }}
            onClick={() => {
              setLoading(true);
              setError(null);
              setPage((current) => current + 1);
            }}
            disabled={loading}
          >
            {loading ? "Loading…" : "Load more"}
          </button>
        ) : null}

        <p className="board-footnote">
          {counts ? `${total} open issues synced from GitHub · ${breakdown}` : "Backend unavailable — start the API to load issues."}
        </p>
      </div>
    </section>
  );
}
