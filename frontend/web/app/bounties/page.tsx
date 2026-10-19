"use client";

import { useApiResource } from "../lib/useApiResource";
import { formatUnits } from "viem";
import { MarketingShell } from "../components/MarketingShell";

type Bounty = { bounty_id: number; repo_full_name: string; issue_number: number; amount_units: string; funding_tx_hash: string | null; work_ends_at: string };

export default function Bounties() {
  const { resource, reload } = useApiResource<{ items: Bounty[] }>("/api/escrow/bounties");
  const items = resource.data?.items;
  const error = resource.error;
  return <MarketingShell current="/bounties"><div className="escrow-app"><header className="escrow-heading"><div><p className="escrow-eyebrow">Build something that matters</p><h1>Find your next reward.</h1><p className="escrow-muted">Public GitHub work. Clear deadlines. Rewards you can inspect.</p></div><a className="escrow-button" href="/maintainers">+ Create a bounty</a></header>
    <p className="escrow-gas">✦ Avalanche Fuji · Test USDC has no monetary value · SmoothSend-sponsored execution</p>
    {error && <div className="escrow-error" role="alert"><p>{error}</p><button className="escrow-button secondary" type="button" onClick={reload}>Try again</button></div>}
    {!items && !error && <p role="status">Loading bounties…</p>}
    {items?.length === 0 && <div className="escrow-empty"><h2>The next opportunity starts here.</h2><p>No escrow bounties have been published yet. Turn a useful issue into the first reward.</p><a className="escrow-button" href="/maintainers">Publish the first bounty →</a></div>}
    <ul className="escrow-reward-list">{items?.map(item => <li key={item.bounty_id}><a className="escrow-card" href={`/bounties/${item.bounty_id}`}><span className="escrow-eyebrow">{item.repo_full_name}</span><h2>Issue #{item.issue_number} ↗</h2><span className={`escrow-status ${item.funding_tx_hash ? "funded" : "unfunded"}`}>{item.funding_tx_hash ? "Funding verified · inspect current status" : "Awaiting funding"}</span><div className="escrow-amount">{formatUnits(BigInt(item.amount_units),6)}<span>test USDC</span></div><p className="escrow-muted">Work ends {new Date(item.work_ends_at).toLocaleString()}</p></a></li>)}</ul>
  </div></MarketingShell>;
}
