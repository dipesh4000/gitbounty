"use client";
import { ManagedWallet } from "./ManagedWallet";
import { RecentWalletActivity } from "./WalletActivity";
import { useApiResource } from "../lib/useApiResource";

export function RewardPayments(){
  const {resource,reload}=useApiResource<{enabled:boolean;execution_mode:string}>("/api/escrow/config");
  return <div className="managed-payments">
    {resource.status === "loading" ? <p role="status">Checking sponsored payments…</p> : resource.error ? <div className="escrow-alert" role="alert"><p>{resource.error}</p><button className="escrow-button secondary" onClick={reload}>Retry configuration</button></div> : (resource.status === "ready" && (!resource.data.enabled || resource.data.execution_mode !== "sponsored")) && <div className="escrow-alert" role="status">Sponsored payments are not enabled on this deployment. Your app wallet is the payment method; contact the operator to finish activation.</div>}
    <div className="escrow-grid"><ManagedWallet/><section className="escrow-card"><p className="escrow-eyebrow">From contribution to reward</p><h2>Fund. Build. Get rewarded.</h2><p className="escrow-muted">Deposit Fuji test USDC into your app wallet, then open a bounty to review funding, claim or refund details. GitBounty signs the action you confirm; SmoothSend sponsors supported network gas.</p><div className="escrow-actions"><a className="escrow-button" href="/bounties">View escrow rewards →</a><a className="escrow-button secondary" href="/wallet">Manage wallet</a></div><p className="escrow-muted">Points and historical owner promises are separate from funded escrow USDC. An old promise is not automatically funded by this wallet.</p></section></div>
    <RecentWalletActivity/>
  </div>;
}
