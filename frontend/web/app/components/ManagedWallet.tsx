"use client";

import { useState } from "react";
import { formatUnits } from "viem";
import { apiWrite } from "../lib/api";
import { useApiResource } from "../lib/useApiResource";
import { useAuth } from "./AuthProvider";
import { refreshWalletActivity, type AppWallet } from "./WalletActivity";

export function ManagedWallet() {
  const { user, status, signIn } = useAuth();
  const { resource, reload } = useApiResource<AppWallet | null>(user ? "/api/sponsored/wallet" : null);
  const [opened, setOpened] = useState<AppWallet | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const wallet = resource.data ?? opened;
  async function open() {
    if (wallet) { setError(""); reload(); refreshWalletActivity(); return; }
    setBusy(true); setError(""); setMessage("");
    try { setOpened(await apiWrite<AppWallet>("/api/sponsored/wallet")); reload(); refreshWalletActivity(); }
    catch (e) { setError(e instanceof Error ? e.message : "Wallet is unavailable. Please retry."); }
    finally { setBusy(false); }
  }
  return <section className="escrow-card reward-summary" aria-label="App wallet">
    <div className="payment-card-heading"><p className="escrow-eyebrow">Your app wallet</p><span className="escrow-status">Avalanche Fuji</span></div>
    <div className="escrow-amount">{wallet ? formatUnits(BigInt(wallet.balance_units), 6) : "—"}<span>test USDC</span></div>
    <p className="escrow-muted">Test tokens have no monetary value. GitHub sign-in gives you access to your custodial wallet.</p>
    {status === "loading" ? <p role="status">Checking your session…</p> : !user ? <button className="escrow-button" onClick={() => signIn("/wallet")}>Continue with GitHub →</button> : <button className="escrow-button" disabled={busy} onClick={() => void open()}>{busy ? "Opening your wallet…" : wallet ? "Refresh balance" : "Open my app wallet"}</button>}
    {(error || resource.error) && <p className="escrow-alert" role="alert">{error || resource.error}</p>}
    {wallet && <div className="escrow-wallet"><span>Your funding & refund address</span><code>{wallet.address}</code><p>Deposit official Fuji test USDC from an external wallet on Avalanche Fuji (chain 43113). This smart account funds bounties and receives refunds. Existing reward receiving addresses remain fixed.</p><div className="escrow-actions"><button className="escrow-button secondary" onClick={() => void navigator.clipboard.writeText(wallet.address).then(() => setMessage("Address copied.")).catch(() => setError("Copy the address manually."))}>Copy deposit address</button><a href={`https://testnet.snowtrace.io/address/${wallet.address}`} target="_blank" rel="noreferrer">View on Snowtrace ↗</a></div></div>}
    {message && <p role="status" className="escrow-message">{message}</p>}
  </section>;
}
