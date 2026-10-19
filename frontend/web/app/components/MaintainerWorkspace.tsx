"use client";

import { useMemo, useState } from "react";
import {
  API_BASE,
  ApiError,
  CATEGORIES,
  api,
  apiWrite,
  categoryLabel,
  formatPoints,
  type BountyCategory,
  type GitHubAppStatus,
  type BountyHistoryResponse,
  type BountyList,
  type BountyStatus,
  type MaintainerRepository,
  type MaintainerRepositoryList,
  type PublishedBounty,
  type RepositoryIssue,
  type RepositoryIssueList,
} from "../lib/api";
import { promisedReward, type PaymentConfig } from "../lib/payments";
import { useApiResource } from "../lib/useApiResource";

/*
  The maintainer workspace: pick a repository you are authorised to manage, choose open issues from it,
  set a value and a category, review the selection, publish. Then manage what you published.

  No URL pasting: repositories come from GitHub via the backend, which also decides -- per request, against
  GitHub's own `permissions` -- which ones this person may publish on. The client never asserts ownership.
*/

type Tab = "publish" | "published";
type Draft = { selected: boolean; points: string; category: BountyCategory; rewardAvax: string; workEnds?: string };

const MIN_POINTS = 1;
/** Only reached if an issue vanishes from the list mid-edit; "other" is the safe category to fall back on. */
const BLANK_DRAFT: Draft = { selected: false, points: "", category: "other", rewardAvax: "" };
const MAX_POINTS = 1000;

function validAvax(value: string, decimals = 18) {
  return new RegExp(`^(?:0|[1-9][0-9]{0,59})(?:\\.[0-9]{1,${decimals}})?$`).test(value) && /[1-9]/.test(value);
}

function message(error: unknown) {
  if (error instanceof ApiError) return error.message;
  return error instanceof Error ? error.message : "Something went wrong. Try again.";
}

function draftFor(issue: RepositoryIssue): Draft {
  return {
    selected: false,
    rewardAvax: issue.existing?.reward_usdc ?? issue.existing?.reward_avax ?? "",
    // A `gitbounty:N` label on the issue pre-fills the field. It is a suggestion: a label awards nothing
    // on its own, and the maintainer publishing this is the person who decides.
    points: issue.suggested_points ? String(issue.suggested_points) : "",
    category: issue.existing?.category ?? issue.suggested_category,
  };
}

export function MaintainerWorkspace({ onPublished }: { onPublished: () => void }) {
  const [tab, setTab] = useState<Tab>("publish");
  return (
    <section className="bounty-manager" aria-label="Maintainer workspace">
      <div className="app-tabs" role="tablist" aria-label="Maintainer views">
        <button type="button" role="tab" aria-selected={tab === "publish"} onClick={() => setTab("publish")}>
          Publish bounties
        </button>
        <button type="button" role="tab" aria-selected={tab === "published"} onClick={() => setTab("published")}>
          My published bounties
        </button>
      </div>
      <p className="bounty-footnote">Before publishing, install the GitHub App for the repository and connect automatic rewards below. If the connection is not confirmed, contributors must use Sync GitHub after merging; automatic processing is not ready.</p>
      {tab === "publish"
        ? <PublishFlow onPublished={onPublished} />
        : <PublishedBounties onChanged={onPublished} />}
    </section>
  );
}

// --- publishing -----------------------------------------------------------

function PublishFlow({ onPublished }: { onPublished: () => void }) {
  const [repository, setRepository] = useState<MaintainerRepository | null>(null);
  return repository === null ? <><PublishingSteps step={1} /><RepositoryPicker onPick={setRepository} /></> : <IssuePicker repository={repository} onBack={() => setRepository(null)} onPublished={onPublished} />;
}

function PublishingSteps({ step }: { step: number }) {
  return <ol className="publish-progress" aria-label="Publishing steps">{["Choose repository", "Select issues & rewards", "Review & publish"].map((label, index) => <li key={label} aria-current={step === index + 1 ? "step" : undefined}><span>{index + 1}</span>{label}</li>)}</ol>;
}

function RepositoryPicker({ onPick }: { onPick: (repository: MaintainerRepository) => void }) {
  const { resource: app, reload: reloadApp } = useApiResource<GitHubAppStatus>("/api/github-app");
  const [connecting, setConnecting] = useState("");
  const [connectionNotice, setConnectionNotice] = useState("");
  async function connect(fullName: string) {
    setConnecting(fullName);
    setConnectionNotice("");
    try {
      await apiWrite(`/api/maintainer/repositories/${fullName}/connect`);
      setConnectionNotice(`${fullName} connected for automatic rewards.`);
      reloadApp();
    } catch (error) { setConnectionNotice(message(error)); }
    finally { setConnecting(""); }
  }
  const [query, setQuery] = useState("");
  const [page, setPage] = useState(1);

  const params = new URLSearchParams({ page: String(page), per_page: "30" });
  if (query.trim()) params.set("q", query.trim());
  const { resource, reload } = useApiResource<MaintainerRepositoryList>(
    `/api/maintainer/repositories?${params}`, query ? 250 : 0
  );
  const result = resource.data;
  const loading = resource.status === "loading";
  const error = resource.error;

  return (
    <>
      <div className="app-summary-line">
        {app.data?.install_url
          ? <a href={app.data.install_url} target="_blank" rel="noreferrer">Install GitHub App / select repositories</a>
          : <span>{app.error || (app.status === "loading" ? "Checking GitHub App..." : "GitHub App is not configured. Contributors can still sync after signing in.")}</span>}
        <span role="status">{connectionNotice}</span>
      </div>
      <div className="bounty-source-bar">
        <div>
          <strong>Choose a repository</strong>
          <span>Repositories GitHub says you administer or maintain, personal or organisation.</span>
        </div>
        <button type="button" disabled={loading} onClick={reload}>
          {loading ? "Loading…" : "Refresh"}
        </button>
      </div>

      <div className="app-toolbar">
        <label className="app-search">
          <span className="sr-only">Search your repositories</span>
          <input
            value={query}
            placeholder="Search repositories"
            onChange={(event) => { setPage(1); setQuery(event.target.value); }}
          />
        </label>
      </div>

      {error && <ErrorBox message={error} onRetry={reload} />}

      {!error && <div className="app-table bounty-repo-table">
        <div className="app-table-head">
          <span>Repository</span><span>Permission</span><span>Open issues</span><span></span>
        </div>
        {loading && <div className="app-empty" aria-live="polite"><strong>Reading your repositories from GitHub…</strong></div>}
        {!loading && !error && result?.items.map((repository) => (
          <div className="app-table-row" key={repository.full_name}>
            <div className="app-primary-cell">
              <small>{repository.owner_type === "Organization" ? "Organisation" : "Personal"}</small>
              <a href={`https://github.com/${repository.full_name}`} target="_blank" rel="noreferrer">
                {repository.full_name}
              </a>
              {repository.description && <span>{repository.description}</span>}
            </div>
            <div data-label="Permission"><span className="app-category">{repository.permission}</span></div>
            <div data-label="Open issues">{repository.open_issues_count}</div>
            <div data-label="">
              {app.data?.configured && !repository.private && (
                app.data.repositories.some((item) => item.active && item.full_name.toLowerCase() === repository.full_name.toLowerCase())
                  ? <span className="bounty-footnote">Automatic rewards connected</span>
                  : <button type="button" disabled={!!connecting} onClick={() => connect(repository.full_name)}>
                      {connecting === repository.full_name ? "Connecting..." : "Connect automatic rewards"}
                    </button>
              )}
              {repository.publishable
                ? <button type="button" className="app-add-issues" onClick={() => onPick(repository)}>Choose issues</button>
                : <span className="bounty-footnote">{repository.blocked_reason}</span>}
            </div>
          </div>
        ))}
        {!loading && !error && result && result.items.length === 0 && (
          <div className="app-empty">
            <strong>{query ? "No repository matches that search." : "No repositories you can publish on."}</strong>
            <span>
              {query
                ? "Try part of the name or the owner."
                : "You need admin or maintain permission on a public repository with at least one open issue."}
            </span>
            {query && <button type="button" onClick={() => setQuery("")}>Clear search</button>}
          </div>
        )}
      </div>}

      {result && result.total > result.per_page && (
        <Pager page={result.page} perPage={result.per_page} total={result.total} onPage={setPage} />
      )}
    </>
  );
}

function IssuePicker({
  repository,
  onBack,
  onPublished,
}: {
  repository: MaintainerRepository;
  onBack: () => void;
  onPublished: () => void;
}) {
  const [query, setQuery] = useState("");
  const [page, setPage] = useState(1);
  const [drafts, setDrafts] = useState<Record<number, Draft>>({});
  const { resource: paymentMode } = useApiResource<PaymentConfig>("/api/avax/config");
  const { resource: escrowConfig } = useApiResource<{ enabled: boolean; execution_mode: string }>("/api/escrow/config");
  const sponsored = escrowConfig.data?.execution_mode === "sponsored";
  const payment: PaymentConfig | null = sponsored ? { enabled: true, chain_id: 43113, symbol: "USDC", network: "Avalanche Fuji", testnet: true, token_address: null, decimals: 6, explorer: "https://testnet.snowtrace.io" } : paymentMode.data;
  const [publishError, setPublishError] = useState("");
  const [success, setSuccess] = useState("");
  const [reviewing, setReviewing] = useState(false);
  const [publishing, setPublishing] = useState(false);

  const params = new URLSearchParams({ page: String(page), per_page: "30" });
  if (query.trim()) params.set("q", query.trim());
  const { resource, reload } = useApiResource<RepositoryIssueList>(
    `/api/maintainer/repositories/${repository.full_name}/issues?${params}`
  );
  const result = resource.data;
  const loading = resource.status === "loading";
  const error = publishError || resource.error;

  /* A draft is created on first sight of an issue and kept while it stays on screen, so switching pages
     and coming back does not silently discard a value the maintainer typed. */
  function draft(issue: RepositoryIssue): Draft {
    return drafts[issue.number] ?? draftFor(issue);
  }

  const selected = useMemo(
    () => (result?.items ?? []).filter((issue) => drafts[issue.number]?.selected),
    [drafts, result],
  );

  const invalid = useMemo(() => selected.filter((issue) => {
    const points = Number(drafts[issue.number]?.points);
    const avax = drafts[issue.number]?.rewardAvax;
    return !Number.isInteger(points) || points < MIN_POINTS || points > MAX_POINTS || Boolean(avax && !validAvax(avax, issue.existing?.reward_usdc ? 6 : issue.existing?.reward_avax ? 18 : payment?.decimals ?? 18)) || Boolean(sponsored && avax && !issue.existing && !drafts[issue.number]?.workEnds);
  }), [drafts, selected, payment?.decimals, sponsored]);

  /*
    Seed from draftFor() when there is no stored draft yet.

    `draft()` above *reads* through to draftFor() without storing, so the first edit to an issue used to
    spread `...undefined` and produce a draft holding only the field that was touched. Ticking the
    checkbox therefore gave `{ selected: true }` with no category, and the publish payload carried
    `category: undefined`, which JSON.stringify drops -- so the API rejected the request as invalid for
    every maintainer who did not happen to open the category dropdown.
  */
  function update(number: number, patch: Partial<Draft>) {
    const issue = result?.items.find((candidate) => candidate.number === number);
    setDrafts((current) => ({
      ...current,
      [number]: { ...(current[number] ?? (issue ? draftFor(issue) : BLANK_DRAFT)), ...patch },
    }));
  }

  async function publish() {
    setPublishing(true);
    setPublishError("");
    try {
      const response = await apiWrite<{ published: number }>("/api/maintainer/bounties", {
        body: {
          issues: selected.map((issue) => ({
            repository: issue.repository,
            number: issue.number,
            points: Number(drafts[issue.number].points),
            category: drafts[issue.number].category,
            ...(!issue.existing && drafts[issue.number].rewardAvax && payment ? { [payment.testnet ? "reward_usdc" : "reward_avax"]: drafts[issue.number].rewardAvax } : {}),
            ...(!issue.existing && drafts[issue.number].rewardAvax && drafts[issue.number].workEnds ? { escrow_work_ends_at: new Date(drafts[issue.number].workEnds!).toISOString() } : {}),
          })),
        },
      });
      setSuccess(
        `${response.published} ${response.published === 1 ? "bounty is" : "bounties are"} now published and visible in the opportunity explorer.`
      );
      setReviewing(false);
      setDrafts({});
      reload();
      onPublished();
    } catch (caught) {
      setPublishError(message(caught));
    } finally {
      setPublishing(false);
    }
  }

  return (
    <>
      <PublishingSteps step={reviewing ? 3 : 2} />
      <div className="bounty-source-bar">
        <div>
          <strong>{repository.full_name}</strong>
          <span>Open issues on GitHub. Choose the ones to publish as bounties.</span>
          <span>Optional payment rewards are your promise, fixed at first publication. GitBounty does not fund or guarantee them.</span>
        </div>
        <button type="button" className="app-back-action" onClick={onBack}>Change repository</button>
      </div>

      {error && <ErrorBox message={error} onRetry={reload} />}
      {success && (
        <div className="bounty-message is-success" role="status">
          <strong>Published.</strong><span>{success}</span>
        </div>
      )}

      <div className="app-toolbar">
        <label className="app-search">
          <span className="sr-only">Search open issues</span>
          <input
            value={query}
            placeholder="Search by title, #number or label"
            onChange={(event) => { setPage(1); setQuery(event.target.value); }}
          />
        </label>
        <button type="button" disabled={loading} onClick={reload}>
          {loading ? "Refreshing…" : "Refresh from GitHub"}
        </button>
      </div>

      <p className="bounty-payment-note">{payment ? `${payment.network} · ${payment.symbol}${payment.testnet ? " test tokens with no monetary value" : " real-money payments"}. ${sponsored ? "Set a reward and work deadline before first publication. Fund it from your app wallet afterwards; SmoothSend sponsors gas." : "Set the optional promise before first publication; it cannot change."} Points are separate.` : "Payment configuration is loading or unavailable. You can still publish a points-only bounty."} {sponsored && <a href="/wallet">Open app wallet →</a>}</p>
      {reviewing ? (
        <div className="bounty-review" aria-label="Review before publishing">
          <h3>Review {selected.length} {selected.length === 1 ? "bounty" : "bounties"}</h3>
          <ul>
            {selected.map((issue) => (
              <li key={issue.number}>
                <strong>#{issue.number}</strong> {issue.title}
                <span>
                  {formatPoints(Number(drafts[issue.number].points))} points ·{" "}
                  {drafts[issue.number].rewardAvax && `${drafts[issue.number].rewardAvax} ${issue.existing?.reward_usdc ? "USDC · Fuji testnet" : issue.existing?.reward_avax ? "AVAX · Mainnet" : `${payment?.symbol} · ${payment?.network}`} promised by you · `}
                  {categoryLabel(drafts[issue.number].category)}
                  {issue.existing && ` · replaces an existing ${issue.existing.points}-point bounty`}
                </span>
              </li>
            ))}
          </ul>
          <div className="bounty-review-actions">
            <button type="button" onClick={() => setReviewing(false)} disabled={publishing}>Back to selection</button>
            <button type="button" className="app-add-issues" onClick={() => void publish()} disabled={publishing}>
              {publishing ? "Publishing…" : "Publish these bounties"}
            </button>
          </div>
        </div>
      ) : (
        <div className="bounty-publish-bar">
          <span><strong>{selected.length}</strong> selected</span>
          <span>
            {result ? `${result.total} open ${result.total === 1 ? "issue" : "issues"}.` : ""}{" "}
            A bounty is {MIN_POINTS}–{formatPoints(MAX_POINTS)} points. Only selected issues are published.
          </span>
          <button
            type="button"
            disabled={!selected.length || invalid.length > 0}
            title={invalid.length ? `Set a value between ${MIN_POINTS} and ${MAX_POINTS} for every selected issue.` : undefined}
            onClick={() => setReviewing(true)}
          >
            Review {selected.length || ""} {selected.length === 1 ? "bounty" : "bounties"}
          </button>
        </div>
      )}

      {invalid.length > 0 && !reviewing && (
        <p className="bounty-footnote" role="alert">
          {invalid.length} selected {invalid.length === 1 ? "issue needs" : "issues need"} a whole-number
          value between {MIN_POINTS} and {formatPoints(MAX_POINTS)}, and any payment promise must be positive with at most {payment?.decimals ?? 18} decimals.
          {sponsored && " USDC rewards also require a work deadline."}
        </p>
      )}

      <div className="app-table bounty-table">
        <div className="app-table-head">
          <span>Select</span><span>Issue</span><span>Status</span><span>Category</span><span>Points</span>
        </div>
        {loading && <div className="app-empty" aria-live="polite"><strong>Reading open issues from GitHub…</strong></div>}
        {!loading && !error && result?.items.map((issue) => {
          const current = draft(issue);
          return (
            <div className={`app-table-row${current.selected ? " is-selected" : ""}`} key={issue.number}>
              <label className="bounty-check" data-label="Select">
                <input
                  type="checkbox"
                  checked={current.selected}
                  onChange={(event) => update(issue.number, { selected: event.target.checked })}
                />
                <span className="sr-only">Select issue #{issue.number}, {issue.title}</span>
              </label>
              <div className="app-primary-cell">
                <small>#{issue.number}</small>
                <a href={issue.html_url} target="_blank" rel="noreferrer">{issue.title}</a>
                {issue.labels.length > 0 && <span>{issue.labels.slice(0, 4).join(" · ")}</span>}
              </div>
              <div data-label="Status">
                {issue.existing
                  ? <span className={`app-status is-${issue.existing.status}`}>
                      {issue.existing.status === "published" ? `${issue.existing.points} pts published` : issue.existing.status}
                    </span>
                  : <span className="bounty-footnote">Not published</span>}
              </div>
              <label className="bounty-field" data-label="Category">
                <span className="sr-only">Category for issue #{issue.number}</span>
                <select
                  value={current.category}
                  disabled={!current.selected}
                  onChange={(event) => update(issue.number, { category: event.target.value as BountyCategory })}
                >
                  {CATEGORIES.map((value) => <option value={value} key={value}>{categoryLabel(value)}</option>)}
                </select>
              </label>
              <div className="bounty-field" data-label="Reward">
              <label>
                <span className="sr-only">Points for issue #{issue.number}</span>
                <input
                  type="number"
                  min={MIN_POINTS}
                  max={MAX_POINTS}
                  step="1"
                  inputMode="numeric"
                  value={current.points}
                  disabled={!current.selected}
                  placeholder="40"
                  onChange={(event) => update(issue.number, { points: event.target.value })}
                />
              </label>
              <label>
                <span>{payment?.symbol ?? "Payment"} {sponsored ? "reward" : "promise"} (optional)</span>
                <input type="text" inputMode="decimal" value={current.rewardAvax}
                  aria-label={`${payment?.symbol ?? "Payment"} promise for issue #${issue.number}`}
                  disabled={!payment || !current.selected || Boolean(issue.existing)} placeholder={payment?.testnet ? "e.g. 1.25" : "e.g. 0.1"}
                  onChange={event => update(issue.number, { rewardAvax: event.target.value })} />
              </label>
                {escrowConfig.data?.enabled && payment?.testnet && !issue.existing && <label>
                  <span>Escrow work deadline ({sponsored ? "required for USDC" : "optional"}; local time)</span>
                  <input type="datetime-local" value={current.workEnds ?? ""} disabled={!current.selected}
                    onChange={event => update(issue.number, { workEnds: event.target.value })} />
                  <small>{sponsored ? "Your app wallet funds the reward; SmoothSend pays gas. No external wallet connection needed." : "Set this to escrow the USDC reward. Link your wallet first."} Claims expire seven days later; funding follows publication.</small>
                </label>}
              </div>
            </div>
          );
        })}
        {!loading && !error && result && result.items.length === 0 && (
          <div className="app-empty">
            <strong>{query ? "No open issue matches that search." : "No open issues in this repository."}</strong>
            <span>
              {query
                ? "Try part of the title, the issue number, or a label."
                : "Open an issue on GitHub describing the work, then refresh."}
            </span>
            <button type="button" onClick={() => (query ? setQuery("") : reload())}>
              {query ? "Clear search" : "Refresh from GitHub"}
            </button>
          </div>
        )}
      </div>

      {result && result.total > result.per_page && (
        <Pager page={result.page} perPage={result.per_page} total={result.total} onPage={setPage} />
      )}
    </>
  );
}

// --- managing what was published ------------------------------------------

function PublishedBounties({ onChanged }: { onChanged: () => void }) {
  const [status, setStatus] = useState<BountyStatus | "all">("all");
  const [page, setPage] = useState(1);
  const [writeError, setWriteError] = useState("");
  const [editing, setEditing] = useState<PublishedBounty | null>(null);
  const [history, setHistory] = useState<BountyHistoryResponse | null>(null);

  const params = new URLSearchParams({ page: String(page), per_page: "25" });
  if (status !== "all") params.set("status", status);
  const { resource, reload: refresh } = useApiResource<BountyList>(`/api/maintainer/bounties?${params}`);
  const result = resource.data;
  const loading = resource.status === "loading";
  const error = writeError || resource.error;

  async function change(bounty: PublishedBounty, patch: Record<string, unknown>) {
    setWriteError("");
    try {
      await apiWrite<PublishedBounty>(
        `/api/maintainer/bounties/${bounty.repository}/${bounty.issue_number}`,
        { method: "PATCH", body: patch },
      );
      setEditing(null);
      refresh();
      onChanged();
    } catch (caught) {
      setWriteError(message(caught));
    }
  }

  async function showHistory(bounty: PublishedBounty) {
    setWriteError("");
    try {
      setHistory(await api<BountyHistoryResponse>(
        `/api/maintainer/bounties/${bounty.repository}/${bounty.issue_number}/history`,
      ));
    } catch (caught) {
      setWriteError(message(caught));
    }
  }

  return (
    <>
      <div className="bounty-source-bar">
        <div>
          <strong>Bounties you have published</strong>
          <span>Edit a value, change a category, unpublish or archive. Nothing is deleted.</span>
        </div>
        <button type="button" disabled={loading} onClick={refresh}>{loading ? "Loading…" : "Refresh"}</button>
      </div>

      {error && <ErrorBox message={error} onRetry={refresh} />}

      <div className="app-category-filter" role="group" aria-label="Filter by status">
        {(["all", "published", "unpublished", "archived"] as const).map((value) => (
          <button
            type="button"
            key={value}
            aria-pressed={status === value}
            onClick={() => { setPage(1); setStatus(value); }}
          >
            {value === "all" ? "All" : value.charAt(0).toUpperCase() + value.slice(1)}
          </button>
        ))}
      </div>

      <div className="app-table bounty-published-table">
        <div className="app-table-head">
          <span>Issue</span><span>Repository</span><span>Category</span><span>Status</span><span>Points</span><span></span>
        </div>
        {loading && <div className="app-empty" aria-live="polite"><strong>Loading your bounties…</strong></div>}
        {!loading && !error && result?.items.map((bounty) => (
          <div className="app-table-row" key={`${bounty.repository}#${bounty.issue_number}`}>
            <div className="app-primary-cell">
              <small>#{bounty.issue_number}</small>
              {bounty.issue_url
                ? <a href={bounty.issue_url} target="_blank" rel="noreferrer">{bounty.issue_title || "View on GitHub"}</a>
                : <span>{bounty.issue_title || "Issue"}</span>}
              {bounty.awarded && <span>Already awarded — the award keeps the value it had at the time.</span>}
              {promisedReward(bounty) && <span>{promisedReward(bounty)} · owner-promised</span>}
            </div>
            <div className="app-repo" data-label="Repository">github.com/{bounty.repository}</div>
            <div data-label="Category"><span className="app-category">{categoryLabel(bounty.category)}</span></div>
            <div data-label="Status"><span className={`app-status is-${bounty.status}`}>{bounty.status}</span></div>
            <div className="app-points" data-label="Points">{formatPoints(bounty.points)}</div>
            <div data-label="" className="bounty-row-actions">
              <button type="button" onClick={() => setEditing(bounty)}>Edit</button>
              <button type="button" onClick={() => void showHistory(bounty)}>History</button>
              {bounty.status === "published"
                ? <button type="button" onClick={() => void change(bounty, { status: "unpublished", reason: "Unpublished by the maintainer." })}>Unpublish</button>
                : <button type="button" onClick={() => void change(bounty, { status: "published", reason: "Republished by the maintainer." })}>Republish</button>}
            </div>
          </div>
        ))}
        {!loading && !error && result && result.items.length === 0 && (
          <div className="app-empty">
            <strong>You haven’t published any {status === "all" ? "" : status} bounties yet.</strong>
            <span>Choose a repository on the Publish bounties tab and pick an open issue.</span>
          </div>
        )}
      </div>

      {result && result.total > result.per_page && (
        <Pager page={result.page} perPage={result.per_page} total={result.total} onPage={setPage} />
      )}

      {editing && <EditBounty bounty={editing} onCancel={() => setEditing(null)} onSave={change} />}
      {history && <BountyHistory history={history} onClose={() => setHistory(null)} />}
    </>
  );
}

function EditBounty({
  bounty,
  onCancel,
  onSave,
}: {
  bounty: PublishedBounty;
  onCancel: () => void;
  onSave: (bounty: PublishedBounty, patch: Record<string, unknown>) => Promise<void>;
}) {
  const [points, setPoints] = useState(String(bounty.points));
  const [category, setCategory] = useState<BountyCategory>(bounty.category);
  const [reason, setReason] = useState("");
  const [saving, setSaving] = useState(false);

  const value = Number(points);
  const valid = Number.isInteger(value) && value >= MIN_POINTS && value <= MAX_POINTS;
  const changed = value !== bounty.points || category !== bounty.category;

  return (
    <div className="bounty-review" role="dialog" aria-label={`Edit the bounty on ${bounty.repository} #${bounty.issue_number}`}>
      <h3>{bounty.repository} #{bounty.issue_number}</h3>
      {bounty.awarded && (
        <p className="bounty-footnote">
          This bounty has already been awarded. Changing it does not change what was awarded — the ledger
          keeps the value the bounty had at the time.
        </p>
      )}
      <div className="app-toolbar">
        <label className="bounty-field">
          <span>Points ({MIN_POINTS}–{formatPoints(MAX_POINTS)})</span>
          <input
            type="number" min={MIN_POINTS} max={MAX_POINTS} step="1" inputMode="numeric"
            value={points} onChange={(event) => setPoints(event.target.value)}
          />
        </label>
        <label className="bounty-field">
          <span>Category</span>
          <select value={category} onChange={(event) => setCategory(event.target.value as BountyCategory)}>
            {CATEGORIES.map((item) => <option value={item} key={item}>{categoryLabel(item)}</option>)}
          </select>
        </label>
        <label className="app-search">
          <span className="sr-only">Why</span>
          <input value={reason} placeholder="Why (recorded in the history)" onChange={(event) => setReason(event.target.value)} />
        </label>
      </div>
      <div className="bounty-review-actions">
        <button type="button" onClick={onCancel} disabled={saving}>Cancel</button>
        <button
          type="button"
          className="app-add-issues"
          disabled={!valid || !changed || saving}
          onClick={async () => {
            setSaving(true);
            await onSave(bounty, { points: value, category, reason });
            setSaving(false);
          }}
        >
          {saving ? "Saving…" : "Save changes"}
        </button>
        <button
          type="button"
          disabled={saving || bounty.status === "archived"}
          onClick={() => void onSave(bounty, { status: "archived", reason: reason || "Archived by the maintainer." })}
        >
          Archive
        </button>
      </div>
      {!valid && <p className="bounty-footnote" role="alert">A bounty is between {MIN_POINTS} and {formatPoints(MAX_POINTS)} points.</p>}
    </div>
  );
}

function BountyHistory({ history, onClose }: { history: BountyHistoryResponse; onClose: () => void }) {
  return (
    <div className="bounty-review" role="dialog" aria-label={`History for ${history.repository} #${history.issue_number}`}>
      <h3>History · {history.repository} #{history.issue_number}</h3>
      {history.entries.length === 0 ? (
        <p className="bounty-footnote">No recorded changes.</p>
      ) : (
        <ul>
          {history.entries.map((entry, index) => (
            <li key={`${entry.created_at}-${index}`}>
              <strong>{entry.action}</strong>
              <span>
                {entry.points_before !== null && entry.points_after !== null && entry.points_before !== entry.points_after
                  ? `${entry.points_before} → ${entry.points_after} points · `
                  : entry.points_after !== null ? `${entry.points_after} points · ` : ""}
                @{entry.actor_login} · {new Date(entry.created_at).toLocaleString()}
                {entry.reason && ` · ${entry.reason}`}
              </span>
            </li>
          ))}
        </ul>
      )}
      <div className="bounty-review-actions">
        <button type="button" onClick={onClose}>Close</button>
      </div>
    </div>
  );
}

// --- shared bits ----------------------------------------------------------

function ErrorBox({ message: text, onRetry }: { message: string; onRetry: () => void }) {
  const reconnect = text === "Sign in with GitHub again.";
  return (
    <div className="bounty-message is-error" role="alert">
      <strong>{reconnect ? "Reconnect GitHub" : "Couldn’t continue."}</strong>
      <span>{reconnect ? "Your GitHub authorization is no longer valid. Reconnect to load your repositories and continue publishing." : text}</span>
      {reconnect
        ? <a href={`${API_BASE}/auth/github?next=%2Fmaintainers`}>Reconnect GitHub</a>
        : <button type="button" onClick={onRetry}>Try again</button>}
    </div>
  );
}

export function Pager({
  page,
  perPage,
  total,
  onPage,
}: {
  page: number;
  perPage: number;
  total: number;
  onPage: (page: number) => void;
}) {
  const pages = Math.max(1, Math.ceil(total / perPage));
  return (
    <nav className="app-pager" aria-label="Pages">
      <button type="button" disabled={page <= 1} onClick={() => onPage(page - 1)}>Previous</button>
      <span>Page {page} of {pages} · {formatPoints(total)} total</span>
      <button type="button" disabled={page >= pages} onClick={() => onPage(page + 1)}>Next</button>
    </nav>
  );
}
