"use client";
import { useState } from "react";
import { formatUnits } from "viem";
import { apiWrite } from "../lib/api";
import { useAuth } from "../components/AuthProvider";
import { MarketingShell } from "../components/MarketingShell";

type Wallet={address:string;balance_units:string};
export default function WalletPage(){
  const {user,status,signIn}=useAuth();
  const [wallet,setWallet]=useState<Wallet|null>(null);
  const [busy,setBusy]=useState(false);
  const [error,setError]=useState("");
  const [message,setMessage]=useState("");
  async function open(){setBusy(true);setError("");try{setWallet(await apiWrite<Wallet>("/api/sponsored/wallet"));}catch(e){setError(e instanceof Error?e.message:"Wallet is unavailable. Please retry.");}finally{setBusy(false);}}
  return <MarketingShell current="/wallet"><div className="escrow-app"><header className="escrow-heading"><div><p className="escrow-eyebrow">Your GitBounty account</p><h1>One wallet. Less friction.</h1><p className="escrow-muted">Sign in with GitHub. Manage reward funds here. SmoothSend sponsors supported transactions.</p></div><span className="escrow-status">Fuji testnet</span></header>
    <div className="escrow-grid"><section className="escrow-card reward-summary"><p className="escrow-eyebrow">Available balance</p><div className="escrow-amount">{wallet?formatUnits(BigInt(wallet.balance_units),6):"—"}<span>test USDC</span></div><p className="escrow-muted">Test tokens have no monetary value. A dash means the balance hasn’t been checked.</p>
      {status==="loading"?<p role="status">Checking your session…</p>:!user?<button className="escrow-button" onClick={()=>signIn()}>Continue with GitHub →</button>:<button className="escrow-button" disabled={busy} onClick={()=>void open()}>{busy?"Opening your wallet…":wallet?"Refresh balance":"Open my app wallet"}</button>}
      {error&&<p className="escrow-alert" role="alert">{error}</p>}
      {wallet&&<div className="escrow-wallet"><span>Your funding & refund address</span><code>{wallet.address}</code><p>Send only official Fuji test USDC to this address. Reward funding uses this smart account; claim receiving addresses remain fixed by your reward terms.</p><button className="escrow-button secondary" onClick={()=>void navigator.clipboard.writeText(wallet.address).then(()=>setMessage("Address copied.")).catch(()=>setError("Copy the address manually."))}>Copy deposit address</button></div>}
      <p role="status" className="escrow-message">{message}</p></section>
    <aside className="escrow-card"><p className="escrow-eyebrow">Made for contribution</p><h2>Gas stays out of your way.</h2><div className="escrow-gas"><span>✦</span><div><strong>SmoothSend developer sponsorship</strong><p>You supply bounty USDC. Your app sponsors network gas through SmoothSend credits.</p></div></div><h2>Your wallet stays in the app.</h2><p className="escrow-muted">GitBounty stores encrypted signing keys and signs only the reward actions you confirm. This is a custodial wallet: access depends on your GitHub account and GitBounty’s key service.</p><a className="escrow-button secondary" href="/bounties">Explore rewards ↗</a></aside></div>
  </div></MarketingShell>;
}
