"use client";

import Link from "next/link";
import { useApiResource } from "../lib/useApiResource";
import { formatUnits } from "viem";
import { MarketingShell } from "../components/MarketingShell";
import { Octicon } from "../components/primer/Octicon";

type Bounty = {
  bounty_id: number;
  repo_full_name: string;
  issue_number: number;
  amount_units: string;
  funding_tx_hash: string | null;
  work_ends_at: string;
};

export default function Bounties() {
  const { resource, reload } = useApiResource<{ items: Bounty[] }>("/api/escrow/bounties");
  const items = resource.data?.items;
  const error = resource.error;

  return (
    <MarketingShell current="/bounties">
      <div className="escrow-app">
        <header className="escrow-heading">
          <div>
            <p className="escrow-eyebrow">Build something that matters</p>
            <h1>Find your next reward.</h1>
            <p className="escrow-muted">Public GitHub work. Clear deadlines. Rewards you can inspect.</p>
          </div>
          <Link className="escrow-button" href="/maintainers">
            <Octicon name="issue-opened" size={16} />
            <span>+ Create a bounty</span>
          </Link>
        </header>

        <p className="escrow-gas">
          <span aria-hidden="true">✦</span>
          <span>Avalanche Fuji · Test USDC has no monetary value · SmoothSend-sponsored execution</span>
        </p>

        {error && (
          <div className="escrow-error" role="alert">
            <p>{error}</p>
            <button className="escrow-button secondary" type="button" onClick={reload}>
              Try again
            </button>
          </div>
        )}

        {!items && !error && <p role="status">Loading bounties…</p>}

        {items?.length === 0 && (
          <div className="escrow-empty">
            <h2>The next opportunity starts here.</h2>
            <p>No escrow bounties have been published yet. Turn a useful issue into the first reward.</p>
            <Link className="escrow-button" href="/maintainers">
              Publish the first bounty →
            </Link>
          </div>
        )}

        <ul className="escrow-reward-list">
          {items?.map((item) => (
            <li key={item.bounty_id}>
              <Link className="escrow-card" href={`/bounties/${item.bounty_id}`} prefetch={true}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
                  <span className="escrow-eyebrow" style={{ display: "inline-flex", alignItems: "center", gap: "6px" }}>
                    <Octicon name="repo" size={14} />
                    {item.repo_full_name}
                  </span>
                  <span className={`escrow-status ${item.funding_tx_hash ? "funded" : "unfunded"}`}>
                    <Octicon name={item.funding_tx_hash ? "check-circle-fill" : "clock"} size={12} />
                    {item.funding_tx_hash ? "Funding verified · inspect current status" : "Awaiting funding"}
                  </span>
                </div>

                <h2 style={{ display: "flex", alignItems: "center", gap: "8px", margin: "14px 0" }}>
                  <Octicon name="issue-opened" size={20} style={{ color: "#3fb950" }} />
                  <span>Issue #{item.issue_number} ↗</span>
                </h2>

                <div className="escrow-amount">
                  {formatUnits(BigInt(item.amount_units), 6)}
                  <span>test USDC</span>
                </div>

                <p className="escrow-muted" style={{ display: "flex", alignItems: "center", gap: "6px", marginTop: "12px" }}>
                  <Octicon name="clock" size={14} />
                  <span>Work ends {new Date(item.work_ends_at).toLocaleString()}</span>
                </p>
              </Link>
            </li>
          ))}
        </ul>
      </div>
    </MarketingShell>
  );
}
