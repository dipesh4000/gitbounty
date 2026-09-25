"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { api, type BountyCategory, type OwnedIssuesResponse, type OwnedRepositoryIssue, type PublishBountiesResponse } from "../lib/api";

const categories: Array<{ value: BountyCategory; label: string }> = [
  { value: "frontend", label: "Frontend" },
  { value: "backend", label: "Backend" },
  { value: "fullstack", label: "Full-stack" },
  { value: "docs", label: "Docs" },
  { value: "testing", label: "Testing" },
  { value: "devops", label: "DevOps" },
  { value: "design", label: "Design" },
  { value: "mobile", label: "Mobile" },
  { value: "other", label: "Other" },
];

type IssueDraft = { selected: boolean; points: string; category: BountyCategory };

function errorMessage(error: unknown) {
  return error instanceof Error ? error.message : "Something went wrong. Try again.";
}

function issueKey(issue: Pick<OwnedRepositoryIssue, "repository" | "number">) {
  return `${issue.repository}#${issue.number}`;
}

export function BountyManager({ onPublished }: { onPublished: () => void }) {
  const [result, setResult] = useState<OwnedIssuesResponse | null>(null);
  const [drafts, setDrafts] = useState<Record<string, IssueDraft>>({});
  const [loading, setLoading] = useState(true);
  const [publishing, setPublishing] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  const selectedCount = useMemo(
    () => Object.values(drafts).filter((draft) => draft.selected).length,
    [drafts],
  );

  const loadOwnedIssues = useCallback(async () => {
    setLoading(true);
    setError("");
    setSuccess("");
    try {
      const next = await api<OwnedIssuesResponse>("/api/maintainer/issues");
      setResult(next);
      setDrafts(Object.fromEntries(next.items.map((issue) => [
        issueKey(issue),
        { selected: false, points: "", category: issue.suggested_category },
      ])));
    } catch (caught) {
      setResult(null);
      setDrafts({});
      setError(errorMessage(caught));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    let active = true;
    api<OwnedIssuesResponse>("/api/maintainer/issues")
      .then((next) => {
        if (!active) return;
        setResult(next);
        setDrafts(Object.fromEntries(next.items.map((issue) => [
          issueKey(issue),
          { selected: false, points: "", category: issue.suggested_category },
        ])));
      })
      .catch((caught: unknown) => {
        if (!active) return;
        setResult(null);
        setDrafts({});
        setError(errorMessage(caught));
      })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, []);

  function updateDraft(issue: OwnedRepositoryIssue, patch: Partial<IssueDraft>) {
    const key = issueKey(issue);
    setDrafts((current) => ({ ...current, [key]: { ...current[key], ...patch } }));
  }

  async function publish() {
    if (!result) return;
    const chosen = result.items
      .filter((issue) => drafts[issueKey(issue)]?.selected)
      .map((issue) => ({
        repository: issue.repository,
        number: issue.number,
        points: Number(drafts[issueKey(issue)].points),
        category: drafts[issueKey(issue)].category,
      }));
    if (chosen.some((issue) => !Number.isInteger(issue.points) || issue.points <= 0)) {
      setError("Every selected issue needs a positive whole-number bounty.");
      return;
    }
    setPublishing(true);
    setError("");
    setSuccess("");
    try {
      const published = await api<PublishBountiesResponse>("/api/maintainer/bounties", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ issues: chosen }),
      });
      setSuccess(`${published.published} ${published.published === 1 ? "issue is" : "issues are"} now published on GitBounty.`);
      setDrafts((current) => Object.fromEntries(Object.entries(current).map(([key, draft]) => [key, { ...draft, selected: false }])));
      onPublished();
    } catch (caught) {
      setError(errorMessage(caught));
    } finally {
      setPublishing(false);
    }
  }

  return (
    <section className="bounty-manager" aria-label="Add issues from your repositories">
      <div className="bounty-source-bar">
        <div><strong>Your GitHub issues</strong><span>Open issues from public repositories owned by your account.</span></div>
        <button type="button" disabled={loading} onClick={() => void loadOwnedIssues()}>{loading ? "Loading…" : "Refresh"}</button>
      </div>

      {error && <div className="bounty-message is-error" role="alert"><strong>Couldn’t continue.</strong><span>{error}</span></div>}
      {success && <div className="bounty-message is-success" role="status"><strong>Published.</strong><span>{success}</span></div>}
      {loading && <div className="app-empty bounty-loading" aria-live="polite"><strong>Loading your open GitHub issues…</strong><span>This can take a moment if you own several repositories.</span></div>}

      {!loading && result && (
        <div className="bounty-selection">
          <div className="bounty-publish-bar">
            <span><strong>{selectedCount}</strong> selected</span>
            <span>{result.items.length} open issues across {result.repository_count} {result.repository_count === 1 ? "repository" : "repositories"}. Only selected issues will be published.</span>
            <button type="button" disabled={!selectedCount || publishing} onClick={publish}>
              {publishing ? "Publishing…" : `Publish ${selectedCount || ""} ${selectedCount === 1 ? "bounty" : "bounties"}`.replace("  ", " ")}
            </button>
          </div>

          <div className="app-table bounty-table">
            <div className="app-table-head"><span>Select</span><span>Issue</span><span>Repository</span><span>Category</span><span>Points</span></div>
            {result.items.map((issue) => {
              const key = issueKey(issue);
              const draft = drafts[key];
              return (
                <div className={`app-table-row${draft?.selected ? " is-selected" : ""}`} key={key}>
                  <label className="bounty-check" data-label="Select">
                    <input type="checkbox" checked={draft?.selected || false} onChange={(event) => updateDraft(issue, { selected: event.target.checked })} />
                    <span className="sr-only">Select {issue.repository} issue #{issue.number}</span>
                  </label>
                  <div className="app-primary-cell"><small>#{issue.number}</small><a href={issue.html_url} target="_blank" rel="noreferrer">{issue.title}</a>{issue.labels.length > 0 && <span>{issue.labels.slice(0, 3).join(" · ")}</span>}</div>
                  <div className="app-repo" data-label="Repository">github.com/{issue.repository}</div>
                  <label className="bounty-field" data-label="Category"><span className="sr-only">Category for {issue.repository} issue #{issue.number}</span><select value={draft?.category || issue.suggested_category} disabled={!draft?.selected} onChange={(event) => updateDraft(issue, { category: event.target.value as BountyCategory })}>{categories.map((category) => <option value={category.value} key={category.value}>{category.label}</option>)}</select></label>
                  <label className="bounty-field" data-label="Points"><span className="sr-only">Points for {issue.repository} issue #{issue.number}</span><input type="number" min="1" step="1" inputMode="numeric" value={draft?.points || ""} disabled={!draft?.selected} placeholder="40" onChange={(event) => updateDraft(issue, { points: event.target.value })} /></label>
                </div>
              );
            })}
            {!result.items.length && <div className="app-empty"><strong>No open issues found in your repositories.</strong><span>Create an issue in one of your public GitHub repositories, then refresh this page.</span><button type="button" onClick={() => void loadOwnedIssues()}>Refresh issues</button></div>}
          </div>
          {result.truncated && <p className="bounty-footnote">GitHub returned a large account. Showing up to 500 repositories and 500 issues per repository.</p>}
        </div>
      )}
    </section>
  );
}
