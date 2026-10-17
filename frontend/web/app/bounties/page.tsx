"use client";

import { useEffect, useState } from "react";
import { api } from "../lib/api";

type Bounty = { bounty_id: number; repo_full_name: string; issue_number: number; amount_units: string; funding_tx_hash: string | null; work_ends_at: string };

export default function Bounties() {
  const [items, setItems] = useState<Bounty[] | null>(null);
  const [error, setError] = useState("");
  useEffect(() => { api<{ items: Bounty[] }>("/api/escrow/bounties").then(result => setItems(result.items)).catch(error => setError(error.message)); }, []);
  return <main className="mp-shell"><p><a href="/">GitBounty</a> / Fuji bounties</p><h1>Funded work on Avalanche Fuji</h1>
    <p>USDC test tokens have no monetary value. Inspect funding and deadlines before contributing.</p>
    {error && <p role="alert">{error}</p>}
    {!items && !error && <p role="status">Loading bounties…</p>}
    {items?.length === 0 && <p>No escrow bounties have been published yet.</p>}
    <ul>{items?.map(item => <li key={item.bounty_id}><a href={`/bounties/${item.bounty_id}`}>{item.repo_full_name} #{item.issue_number}</a> — {Number(item.amount_units) / 1e6} test USDC · {item.funding_tx_hash ? "Funding verified" : "Awaiting funding"} · Work ends {new Date(item.work_ends_at).toLocaleString()}</li>)}</ul>
  </main>;
}
