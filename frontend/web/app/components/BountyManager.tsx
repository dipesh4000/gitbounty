"use client";

import { FormEvent, useMemo, useState } from "react";
import { api, type BountyCategory, type PublishBountiesResponse, type RepositoryInspection } from "../lib/api";

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

export function BountyManager({ onPublished }: { onPublished: () => void }) {
  const [repository, setRepository] = useState("");
  const [inspection, setInspection] = useState<RepositoryInspection | null>(null);
  const [drafts, setDrafts] = useState<Record<number, IssueDraft>>({});
  const [loading, setLoading] = useState(false);
  const [publishing, setPublishing] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  const selectedCount = useMemo(
    () => Object.values(drafts).filter((draft) => draft.selected).length,
    [drafts],
  );

  async function inspect(event: FormEvent) {
    event.preventDefault();
    setLoading(true);
    setError("");
    setSuccess("");
    try {
      const result = await api<RepositoryInspection>("/api/maintainer/repositories/inspect", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ repository }),
      });
      setInspection(result);
      setRepository(result.full_name);
      setDrafts(Object.fromEntries(result.open_issues.map((issue) => [
        issue.number,
        { selected: false, points: "", category: issue.suggested_category },
      ])));
    } catch (caught) {
      setInspection(null);
      setDrafts({});
      setError(errorMessage(caught));
    } finally {
      setLoading(false);
    }
  }

  function updateDraft(number: number, patch: Partial<IssueDraft>) {
    setDrafts((current) => ({ ...current, [number]: { ...current[number], ...patch } }));
  }

  async function publish() {
    if (!inspection) return;
    const chosen = inspection.open_issues
      .filter((issue) => drafts[issue.number]?.selected)
      .map((issue) => ({
        number: issue.number,
        points: Number(drafts[issue.number].points),
        category: drafts[issue.number].category,
      }));
    if (chosen.some((issue) => !Number.isInteger(issue.points) || issue.points <= 0)) {
      setError("Every selected issue needs a positive whole-number bounty.");
      return;
    }
    setPublishing(true);
    setError("");
    setSuccess("");
    try {
      const result = await api<PublishBountiesResponse>("/api/maintainer/bounties", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ repository: inspection.full_name, issues: chosen }),
      });
      setSuccess(`${result.published} ${result.published === 1 ? "issue is" : "issues are"} now published on GitBounty.`);
      setDrafts((current) => Object.fromEntries(Object.entries(current).map(([number, draft]) => [number, { ...draft, selected: false }])));
      onPublished();
    } catch (caught) {
      setError(errorMessage(caught));
    } finally {
      setPublishing(false);
    }
  }

  return (
    <section className="bounty-manager" aria-label="Manage repository bounties">
      <form className="bounty-repository-form" onSubmit={inspect}>
        <label htmlFor="repository-url">GitHub repository</label>
        <div>
          <input
            id="repository-url"
            value={repository}
            onChange={(event) => setRepository(event.target.value)}
            placeholder="https://github.com/owner/repository"
            autoComplete="url"
            required
          />
          <button type="submit" disabled={loading}>{loading ? "Loading…" : "Load issues"}</button>
        </div>
        <p>Public personal repositories and organization repositories you can manage are supported.</p>
      </form>

      {error && <div className="bounty-message is-error" role="alert"><strong>Couldn’t continue.</strong><span>{error}</span></div>}
      {success && <div className="bounty-message is-success" role="status"><strong>Published.</strong><span>{success}</span></div>}

      {inspection && (
        <div className="bounty-selection">
          <div className="bounty-repository-summary">
            <div><strong>{inspection.full_name}</strong><span>{inspection.description || "No repository description"}</span></div>
            <span>{inspection.owner_type === "Organization" ? "Organization" : "Personal"} · {inspection.open_issues.length} open issues</span>
          </div>

          <div className="bounty-publish-bar">
            <span><strong>{selectedCount}</strong> selected</span>
            <span>Only selected issues will appear on GitBounty.</span>
            <button type="button" disabled={!selectedCount || publishing} onClick={publish}>
              {publishing ? "Publishing…" : `Publish ${selectedCount || ""} ${selectedCount === 1 ? "bounty" : "bounties"}`.replace("  ", " ")}
            </button>
          </div>

          <div className="app-table bounty-table">
            <div className="app-table-head"><span>Select</span><span>Issue</span><span>Category</span><span>Points</span></div>
            {inspection.open_issues.map((issue) => {
              const draft = drafts[issue.number];
              return (
                <div className={`app-table-row${draft?.selected ? " is-selected" : ""}`} key={issue.number}>
                  <label className="bounty-check" data-label="Select">
                    <input type="checkbox" checked={draft?.selected || false} onChange={(event) => updateDraft(issue.number, { selected: event.target.checked })} />
                    <span className="sr-only">Select issue #{issue.number}</span>
                  </label>
                  <div className="app-primary-cell"><small>#{issue.number}</small><a href={issue.html_url} target="_blank" rel="noreferrer">{issue.title}</a>{issue.labels.length > 0 && <span>{issue.labels.slice(0, 3).join(" · ")}</span>}</div>
                  <label className="bounty-field" data-label="Category"><span className="sr-only">Category for issue #{issue.number}</span><select value={draft?.category || issue.suggested_category} disabled={!draft?.selected} onChange={(event) => updateDraft(issue.number, { category: event.target.value as BountyCategory })}>{categories.map((category) => <option value={category.value} key={category.value}>{category.label}</option>)}</select></label>
                  <label className="bounty-field" data-label="Points"><span className="sr-only">Points for issue #{issue.number}</span><input type="number" min="1" step="1" inputMode="numeric" value={draft?.points || ""} disabled={!draft?.selected} placeholder="40" onChange={(event) => updateDraft(issue.number, { points: event.target.value })} /></label>
                </div>
              );
            })}
            {!inspection.open_issues.length && <div className="app-empty"><strong>This repository has no open issues.</strong><span>Create an issue on GitHub, then load the repository again.</span></div>}
          </div>
          {inspection.truncated && <p className="bounty-footnote">Showing the first 500 open issues.</p>}
        </div>
      )}
    </section>
  );
}
