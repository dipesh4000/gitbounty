"use client";

import { useCallback, useEffect, useState } from "react";
import { API_BASE, ApiError, apiGet, apiPost } from "../lib/api";
import type { MyPointsResponse, SyncResponse } from "../lib/types";
import { useSignedIn } from "../lib/useSignedIn";
import { useRouter } from "next/navigation";
import { ErrorState, Skeleton, State } from "./States";

function plural(count: number, word: string) {
  return `${count} ${word}${count === 1 ? "" : "s"}`;
}

function formatDate(iso: string) {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "";
  return date.toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" });
}

export function PointsContent() {
  const router = useRouter();
  const signedIn = useSignedIn();
  const [data, setData] = useState<MyPointsResponse | null>(null);
  const [error, setError] = useState<unknown>(null);
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [syncResult, setSyncResult] = useState("");
  const [syncError, setSyncError] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      setData(await apiGet<MyPointsResponse>("/api/me/points"));
    } catch (nextError) {
      setError(nextError);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!signedIn) {
      router.replace("/");
      return;
    }
    let active = true;
    apiGet<MyPointsResponse>("/api/me/points")
      .then((response) => {
        if (!active) return;
        setData(response);
        setError(null);
      })
      .catch((nextError) => {
        if (active) setError(nextError);
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => { active = false; };
  }, [router, signedIn]);

  async function sync() {
    setSyncing(true);
    setSyncError(false);
    setSyncResult("Asking GitHub for your merged pull requests…");
    try {
      const result = await apiPost<SyncResponse>("/api/me/sync");
      const parts = [`Counted ${plural(result.newly_counted, "new merge")}`];
      if (result.updated > 0) parts.push(`topped up ${plural(result.updated, "merge")}`);
      if (result.self_merges_skipped > 0) parts.push(`skipped ${plural(result.self_merges_skipped, "self-merge")}`);
      setSyncResult(`${parts.join(", ")}.`);
      await load();
    } catch (nextError) {
      setSyncError(true);
      setSyncResult(nextError instanceof ApiError && nextError.unreachable
        ? `Can't reach the API at ${API_BASE}. Is the backend running?`
        : nextError instanceof Error ? nextError.message : "Sync failed.");
    } finally {
      setSyncing(false);
    }
  }

  if (!signedIn) return <main id="main" className="app-main"><div className="wrap app-wrap"><Skeleton rows={3} /></div></main>;

  const categories = data ? Object.entries(data.points_by_category).sort((a, b) => b[1] - a[1]) : [];
  const highest = categories[0]?.[1] ?? 0;

  return (
    <main id="main" className="app-main">
      <div className="wrap app-wrap">
        <div className="page-head">
          <h1>Your points</h1>
          <p>Every merged pull request earns a little. One that closes an issue a maintainer put points on earns those too.</p>
        </div>

        <div className="sync-bar">
          <button className="btn btn-primary" type="button" aria-busy={syncing} disabled={syncing} onClick={sync}>Sync with GitHub</button>
          <span className={`sync-result${syncError ? " is-error" : ""}`} role="status" aria-live="polite">{syncResult}</span>
        </div>

        <div className="stub-note">
          <span><strong>Test login. </strong>Nobody has been authenticated. The backend treats every request as the user in DEV_GITHUB_LOGIN.</span>
        </div>

        <div aria-live="polite" aria-busy={loading}>
          {loading ? <Skeleton rows={3} /> : error ? <ErrorState error={error} /> : data ? (
            <>
              <div className="stat-row">
                <div className="stat-card is-headline"><span className="stat-num">{data.total_points}</span><span className="stat-label">points</span></div>
                <div className="stat-card"><span className="stat-num">{data.total_merges}</span><span className="stat-label">merged pull requests</span></div>
              </div>

              {data.total_merges === 0 ? (
                <State title="No merges counted yet" message="Sync with GitHub to look for pull requests you've had merged. Merging your own pull request into your own repository doesn't count." />
              ) : (
                <>
                  {categories.length ? (
                    <section className="app-section">
                      <h2>Where your points came from</h2>
                      <p className="app-section-note">Points by kind of work.</p>
                      <div className="cat-list">
                        {categories.map(([category, points]) => (
                          <div className="cat-row" key={category}>
                            <span className="cat-name">{category}</span>
                            <span className="cat-bar"><span className="cat-bar-fill" style={{ width: `${highest ? Math.max(4, points / highest * 100) : 0}%` }} /></span>
                            <span className="cat-points">{points}</span>
                          </div>
                        ))}
                      </div>
                    </section>
                  ) : null}

                  {data.recent_merges.length ? (
                    <section className="app-section">
                      <h2>Your merged pull requests</h2>
                      <p className="app-section-note">Newest first. A pull request that closed an issue with points on it earns those points too.</p>
                      <div className="merge-list">
                        {data.recent_merges.map((merge) => (
                          <div className="merge-item" key={`${merge.repo_full_name}-${merge.number}`}>
                            <div className="merge-main">
                              <span className="merge-repo">{merge.repo_full_name} #{merge.number}</span>
                              <a className="merge-title" href={merge.url} target="_blank" rel="noopener noreferrer">{merge.title}</a>
                              <div className="merge-meta"><span className="tag">{merge.category}</span><span className="merge-date">{formatDate(merge.merged_at)}</span></div>
                            </div>
                            <div className="merge-points">+{merge.points}<small>{merge.issue_points ? `${merge.issue_points} from the issue` : "no points on the issue"}</small></div>
                          </div>
                        ))}
                      </div>
                    </section>
                  ) : null}
                </>
              )}
            </>
          ) : null}
        </div>
      </div>
    </main>
  );
}
