"use client";

import { useState } from "react";
import { formatUnits } from "viem";
import { useApiResource } from "../lib/useApiResource";
import { formatPoints, type IssueList } from "../lib/api";

type EscrowBounty = { bounty_id: number; repo_full_name: string; issue_number: number; amount_units: string; funding_tx_hash: string | null; work_ends_at: string; claim_until: string };

export function LandingBounties() {
  const [search, setSearch] = useState("");
  const [beginner, setBeginner] = useState(false);
  const params = new URLSearchParams({ per_page: "6", sort: "updated" });
  if (search.trim()) params.set("q", search.trim());
  if (beginner) params.set("beginner", "true");
  const { resource, reload } = useApiResource<IssueList>(`/api/issues?${params}`, 250);
  const { resource: escrow, reload: reloadEscrow } = useApiResource<{ items: EscrowBounty[] }>("/api/escrow/bounties");
  return <section className="section bounty-discovery" id="published" aria-labelledby="published-heading"><div className="wrap">
    <div className="section-head"><div><p className="eyebrow">Real issues. Clear terms.</p><h2 id="published-heading">Find your next contribution.</h2></div><a className="btn" href="/bounties">View Fuji escrow bounties ↗</a></div>
    <p className="discovery-intro">Browse without signing in. Read the issue first; sign in when you’re ready to publish or claim.</p>
    <div className="discovery-controls"><label>Search issue titles<input type="search" placeholder="Try accessibility, docs, tests…" value={search} onChange={event => setSearch(event.target.value)} /></label>
      <label className="beginner-toggle"><input type="checkbox" checked={beginner} onChange={event => setBeginner(event.target.checked)} />Good first issues</label></div>
    <div aria-live="polite" aria-busy={resource.status === "loading"}>
      {resource.status === "loading" && <p className="api-notice">Loading published bounties…</p>}
      {resource.error && <div className="api-notice"><p>Published bounties didn’t load. {resource.error}</p><button className="btn" onClick={reload}>Retry</button></div>}
      {resource.status === "ready" && !resource.data.items.length && <div className="api-notice"><p>{search || beginner ? "No issues match these filters." : "No bounties have been published yet."}</p>{search || beginner ? <button className="btn" onClick={() => { setSearch(""); setBeginner(false); }}>Clear filters</button> : <a className="btn" href="/maintainers">Publish the first bounty</a>}</div>}
      <ul className="published-list">{resource.data?.items.map(issue => <li key={issue.id}><a href={issue.html_url}><div><b>{issue.title}</b><small>{issue.repository} #{issue.number} · {issue.language || issue.category}</small></div><strong>+{formatPoints(issue.points)}<small>points</small></strong></a></li>)}</ul>
    </div>
    <div className="escrow-preview"><h3>Fuji USDC rewards</h3><p>Test USDC has no monetary value. A published reward is funded only after its deposit is verified.</p>
      {escrow.status === "loading" && <p role="status">Loading escrow rewards…</p>}
      {escrow.error && <p>Escrow rewards could not load. <button className="btn" onClick={reloadEscrow}>Retry escrow rewards</button></p>}
      {escrow.status === "ready" && !escrow.data.items.length && <p>No escrow rewards published yet. Maintainers can publish a fresh issue with USDC and a work deadline.</p>}
      <ul className="published-list">{escrow.data?.items.slice(0, 3).map(item => <li key={item.bounty_id}><a href={`/bounties/${item.bounty_id}`}><div><b>{item.repo_full_name} #{item.issue_number}</b><small>{item.funding_tx_hash ? "Funding verified · inspect current claim status" : "Awaiting funding"} · Work ends {new Date(item.work_ends_at).toLocaleDateString()}</small></div><strong>{formatUnits(BigInt(item.amount_units), 6)}<small>test USDC</small></strong></a></li>)}</ul>
    </div>
  </div></section>;
}
