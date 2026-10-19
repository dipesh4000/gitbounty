"use client";
import { AvaxRewards } from "./AvaxRewards";
import { useApiResource } from "../lib/useApiResource";

export function RewardPayments(){
  const {resource}=useApiResource<{execution_mode:string}>("/api/escrow/config");
  if(resource.data?.execution_mode!=="sponsored")return <AvaxRewards/>;
  return <section className="escrow-card"><p className="escrow-eyebrow">Your contribution, rewarded</p><h2>Everything starts with your app wallet.</h2><p className="escrow-muted">Your GitHub account owns your reward record. Open your managed wallet to check funding, or inspect an escrow bounty to fund, claim or refund. Supported transactions use SmoothSend sponsorship.</p><div className="escrow-actions"><a className="escrow-button" href="/wallet">Open app wallet →</a><a className="escrow-button secondary" href="/bounties">View escrow rewards ↗</a></div></section>;
}
