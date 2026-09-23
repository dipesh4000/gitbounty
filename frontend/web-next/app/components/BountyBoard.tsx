"use client";

import { useMemo, useState } from "react";
import { BOUNTIES, labelDisplay } from "../lib/bounties";

const FILTERS = [
  { value: "all", label: "All" },
  { value: "enhancement", label: "Enhancement" },
  { value: "bug", label: "Bug" },
  { value: "docs", label: "Docs" },
  { value: "good-first-issue", label: "Good first issue" },
];

type SortOrder = "amount-desc" | "amount-asc" | "newest";

/* The bounty board: search, label pills and sort, all over the sample data, exactly as the static site did it. */
export function BountyBoard() {
  const [activeFilter, setActiveFilter] = useState("all");
  const [searchQuery, setSearchQuery] = useState("");
  const [sortOrder, setSortOrder] = useState<SortOrder>("amount-desc");

  const visible = useMemo(() => {
    const query = searchQuery.toLowerCase();

    const list = BOUNTIES.filter((bounty) => {
      const matchesFilter = activeFilter === "all" || bounty.label === activeFilter;
      const matchesSearch =
        !query ||
        bounty.title.toLowerCase().includes(query) ||
        bounty.repo.toLowerCase().includes(query);
      return matchesFilter && matchesSearch;
    });

    if (sortOrder === "amount-desc") list.sort((a, b) => b.amount - a.amount);
    else if (sortOrder === "amount-asc") list.sort((a, b) => a.amount - b.amount);
    else list.sort((a, b) => a.id - b.id);

    return list;
  }, [activeFilter, searchQuery, sortOrder]);

  return (
    <section className="section" id="bounties">
      <div className="wrap">
        <div className="section-head">
          <h2>Open bounties</h2>
          <p>A live board of funded issues across every connected repo.</p>
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
              value={searchQuery}
              onChange={(event) => setSearchQuery(event.target.value)}
            />
          </div>

          <div className="filter-pills" role="group" aria-label="Filter by label">
            {FILTERS.map((filter) => (
              <button
                key={filter.value}
                className={`pill${activeFilter === filter.value ? " is-active" : ""}`}
                type="button"
                onClick={() => setActiveFilter(filter.value)}
              >
                {filter.label}
              </button>
            ))}
          </div>

          <label className="sort-field">
            <span>Sort</span>
            <select value={sortOrder} onChange={(event) => setSortOrder(event.target.value as SortOrder)}>
              <option value="amount-desc">Highest bounty</option>
              <option value="amount-asc">Lowest bounty</option>
              <option value="newest">Newest</option>
            </select>
          </label>
        </div>

        <ul className="bounty-grid" aria-live="polite">
          {visible.length === 0 ? (
            <li className="empty-state"><p>No bounties match your filters.</p></li>
          ) : (
            visible.map((bounty) => (
              <li className="bounty-card" key={bounty.id}>
                <div className="bounty-top">
                  <span className="bounty-repo">{bounty.repo}</span>
                  <span className="bounty-amount">${bounty.amount} {bounty.currency}</span>
                </div>
                <p className="bounty-title">{bounty.title}</p>
                <div className="bounty-labels">
                  <span className="tag">{labelDisplay(bounty.label)}</span>
                </div>
                <div className="bounty-bottom">
                  <span className="bounty-age">{bounty.age}</span>
                  <a
                    href={`https://github.com/${bounty.repo}/issues`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="bounty-link"
                  >
                    View issue →
                  </a>
                </div>
              </li>
            ))
          )}
        </ul>

        <p className="board-footnote">
          Showing sample bounties for demonstration. Connect a repo to list real ones.
        </p>
      </div>
    </section>
  );
}
