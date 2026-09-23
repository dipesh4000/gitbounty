"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useEffect, useState } from "react";
import { apiGet } from "../lib/api";
import { CATEGORIES, type Category, type LeaderboardResponse, type Period } from "../lib/types";
import { Board } from "./Board";
import { ErrorState, Skeleton, State } from "./States";

const PERIODS: Array<{ value: Period; label: string }> = [
  { value: "all", label: "All time" },
  { value: "month", label: "This month" },
  { value: "week", label: "This week" },
];

export function LeaderboardContent() {
  const searchParams = useSearchParams();
  const initialPeriod = searchParams.get("period");
  const initialCategory = searchParams.get("category");
  const [period, setPeriod] = useState<Period>(
    initialPeriod === "week" || initialPeriod === "month" ? initialPeriod : "all"
  );
  const [category, setCategory] = useState<Category | null>(
    CATEGORIES.includes(initialCategory as Category) ? initialCategory as Category : null
  );
  const [data, setData] = useState<LeaderboardResponse | null>(null);
  const [error, setError] = useState<unknown>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let active = true;
    const urlQuery = new URLSearchParams();
    if (period !== "all") urlQuery.set("period", period);
    if (category) urlQuery.set("category", category);
    window.history.replaceState(null, "", urlQuery.size ? `?${urlQuery}` : window.location.pathname);

    const apiQuery = new URLSearchParams({ period });
    if (category) apiQuery.set("category", category);
    apiGet<LeaderboardResponse>(`/api/leaderboard?${apiQuery}`)
      .then((response) => {
        if (!active) return;
        setData(response);
        setError(null);
      })
      .catch((nextError) => {
        if (!active) return;
        setError(nextError);
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => { active = false; };
  }, [period, category]);

  function choosePeriod(value: Period) {
    setLoading(true);
    setPeriod(value);
  }

  function chooseCategory(value: Category | null) {
    setLoading(true);
    setCategory(value);
  }

  return (
    <main id="main" className="app-main">
      <div className="wrap app-wrap">
        <div className="page-head">
          <h1>Leaderboard</h1>
          <p>Points come from the issues people fix. A maintainer decides what an issue is worth, and whoever merges the fix earns it.</p>
        </div>

        <div className="controls">
          <div className="control-group">
            <span className="control-label" id="period-label">Time</span>
            <div className="segmented" role="group" aria-labelledby="period-label">
              {PERIODS.map((option) => (
                <button
                  type="button"
                  aria-pressed={period === option.value}
                  onClick={() => choosePeriod(option.value)}
                  key={option.value}
                >{option.label}</button>
              ))}
            </div>
          </div>
          <div className="control-group">
            <span className="control-label" id="category-label">Kind of work</span>
            <div className="filter-pills" role="group" aria-labelledby="category-label">
              <button type="button" className={`pill${category === null ? " is-active" : ""}`} onClick={() => chooseCategory(null)}>All work</button>
              {CATEGORIES.map((option) => (
                <button
                  type="button"
                  className={`pill${category === option ? " is-active" : ""}`}
                  onClick={() => chooseCategory(option)}
                  key={option}
                >{option}</button>
              ))}
            </div>
          </div>
        </div>

        <div aria-live="polite" aria-busy={loading}>
          {loading ? <Skeleton /> : error ? <ErrorState error={error} /> : data?.entries.length ? (
            <Board entries={data.entries} />
          ) : (
            <State
              title="Nothing here yet"
              message={category || period !== "all"
                ? "No merges match this filter. Try a wider time range or another kind of work."
                : "No merges have been counted yet. Sync your GitHub account to get on the board."}
            >
              <Link className="btn btn-primary" href="/points">Go to your points</Link>
            </State>
          )}</div>
      </div>
    </main>
  );
}
