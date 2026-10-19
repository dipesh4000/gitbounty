"use client";

import { useEffect, useRef, useState } from "react";
import { formatUnits } from "viem";
import { useApiResource } from "../lib/useApiResource";
import { useAuth } from "./AuthProvider";

export type AppWallet = { address: string; balance_units: string; chain_id: number };
type Operation = { id: number; bounty_id: number; kind: "fund" | "settle" | "refund"; status: string; tx_hash: string | null };
const labels = { fund: "Bounty funding", settle: "Reward claim", refund: "Bounty refund" };
const statuses: Record<string, string> = { signed: "Saved · awaiting submission", submitted: "Submitted · awaiting confirmation", confirmed: "Onchain · verifying reward evidence", verified: "Confirmed · evidence verified", failed: "Failed · inspect bounty for recovery" };

export function refreshWalletActivity() {
  window.dispatchEvent(new Event("gitbounty:wallet-updated"));
}

export function RecentWalletActivity() {
  const { user } = useAuth();
  const { resource, reload } = useApiResource<{ items: Operation[] }>(user ? "/api/sponsored/operations" : null);
  useEffect(() => {
    const refresh = () => { if (document.visibilityState === "visible") reload(); };
    const timer = window.setInterval(refresh, 30000);
    window.addEventListener("focus", refresh);
    window.addEventListener("gitbounty:wallet-updated", reload);
    return () => { clearInterval(timer); window.removeEventListener("focus", refresh); window.removeEventListener("gitbounty:wallet-updated", reload); };
  }, [reload]);
  return <section className="wallet-activity" aria-label="Recent onchain activity">
    <div className="wallet-activity-heading"><strong>Onchain activity</strong><span>Avalanche Fuji</span></div>
    {resource.status === "loading" ? <p role="status">Loading recent transactions…</p> : resource.error ? <div><p role="status">Activity unavailable. {resource.error}</p><button type="button" onClick={reload}>Retry activity</button></div> : !resource.data?.items.length ? <p>No transactions yet. Fund, claim or refund a bounty to see its progress here.</p> : <ul>{resource.data?.items.map(op => <li key={op.id} className={op.status === "verified" ? "is-verified" : op.status === "failed" ? "is-failed" : ""}>
      <strong>{labels[op.kind]} <span>#{op.bounty_id}</span></strong>
      <p>{statuses[op.status] ?? "Status unavailable"} · Gas sponsored</p>
      <div><a href={`/bounties/${op.bounty_id}`}>Open bounty ↗</a>{op.tx_hash && /^0x[0-9a-fA-F]{64}$/.test(op.tx_hash) && <a href={`https://testnet.snowtrace.io/tx/${op.tx_hash}`} target="_blank" rel="noreferrer">View transaction ↗</a>}</div>
    </li>)}</ul>}
    <small>Powered by SmoothSend · Latest saved reward operations</small>
  </section>;
}

export function WalletActivity() {
  const { user } = useAuth();
  const { resource, reload } = useApiResource<AppWallet | null>(user ? "/api/sponsored/wallet" : null);
  const details = useRef<HTMLDetailsElement>(null);
  const [open, setOpen] = useState(false);
  useEffect(() => {
    const refresh = () => { if (document.visibilityState === "visible") reload(); };
    const escape = (event: KeyboardEvent) => { if (event.key === "Escape" && details.current?.open) { details.current.open = false; details.current.querySelector("summary")?.focus(); } };
    const outside = (event: PointerEvent) => { if (event.target instanceof Node && details.current && !details.current.contains(event.target)) details.current.open = false; };
    const timer = window.setInterval(refresh, 30000);
    window.addEventListener("focus", refresh);
    window.addEventListener("gitbounty:wallet-updated", reload);
    document.addEventListener("keydown", escape);
    document.addEventListener("pointerdown", outside);
    return () => { clearInterval(timer); window.removeEventListener("focus", refresh); window.removeEventListener("gitbounty:wallet-updated", reload); document.removeEventListener("keydown", escape); document.removeEventListener("pointerdown", outside); };
  }, [reload]);
  if (!user) return null;
  const wallet = resource.data;
  return <details className="wallet-menu" ref={details} onToggle={event => { setOpen(event.currentTarget.open); if (event.currentTarget.open) reload(); }}>
    <summary><span className={`wallet-indicator ${wallet ? "is-ready" : ""}`} aria-hidden="true"/><span>{wallet ? `${formatUnits(BigInt(wallet.balance_units), 6)} USDC` : resource.error ? "Wallet unavailable" : resource.status === "loading" ? "Checking wallet…" : "App wallet"}</span><span aria-hidden="true">⌄</span></summary>
    <div className="wallet-menu-panel">
      <div className="wallet-menu-account"><strong>{wallet ? "App wallet ready" : "Your GitBounty wallet"}</strong><span>Custodial · Fuji test USDC</span>{wallet && <code>{wallet.address}</code>}{resource.error && <p role="status">{resource.error}</p>}<a href="/wallet">{wallet ? "Deposit & manage wallet" : "Open app wallet"} →</a></div>
      {open && <RecentWalletActivity />}
    </div>
  </details>;
}
