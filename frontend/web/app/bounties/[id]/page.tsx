"use client";

import { use, useCallback, useEffect, useState } from "react";
import { createPublicClient, http, formatUnits, type Address, type Hex } from "viem";
import { avalancheFuji } from "viem/chains";
import { api, apiWrite } from "../../lib/api";
import { browserWallet } from "../../lib/wallet";
import { useAuth } from "../../components/AuthProvider";

type Transaction = { to: Address; data: Hex; value: string };
type Bounty = { bounty_id: number; repo_full_name: string; issue_number: number; points: number; amount_units: string;
  payer_address: string; payer_github_id: number; token_address: string; contract_address: string; escrow_state: string;
  work_ends_at: string; claim_until: string; funding_tx_hash: string | null; settlement_tx_hash: string | null;
  allocation_id: number | null; author_github_id: number | null };
const explorer = "https://testnet.snowtrace.io";

export default function BountyPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const { user } = useAuth();
  const [bounty, setBounty] = useState<Bounty | null>(null);
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const [hash, setHash] = useState("");
  const [kind, setKind] = useState<"funding" | "settlement">("funding");
  const [now, setNow] = useState(0);
  const load = useCallback(async () => setBounty(await api<Bounty>(`/api/escrow/bounties/${id}`)), [id]);
  useEffect(() => {
    let active = true;
    api<Bounty>(`/api/escrow/bounties/${id}`).then(result => { if (active) setBounty(result); }).catch(error => { if (active) setMessage(error.message); });
    const timer = window.setInterval(() => setNow(Date.now()), 1000);
    return () => { active = false; window.clearInterval(timer); };
  }, [id]);
  useEffect(() => {
    const timer = window.setTimeout(() => {
      const saved = localStorage.getItem(`escrow:${id}`);
      if (saved) { try { const pending = JSON.parse(saved); setHash(pending.hash); setKind(pending.kind); } catch { /* Ignore invalid local hints. */ } }
    }, 0);
    return () => window.clearTimeout(timer);
  }, [id]);
  async function action(work: () => Promise<void>) {
    setBusy(true); setMessage("");
    try { await work(); await load(); } catch (error) { setMessage(error instanceof Error ? error.message : "Request failed. Refresh before retrying."); }
    finally { setBusy(false); }
  }
  async function send(transaction: Transaction, expected: string, stage: "approval" | "funding" | "settlement" | "refund") {
    const { client, account } = await browserWallet(avalancheFuji.id);
    if (account.toLowerCase() !== expected.toLowerCase()) throw new Error(`Select the permanently linked wallet ${expected}.`);
    await client.switchChain({ id: avalancheFuji.id });
    if (await client.getChainId() !== avalancheFuji.id) throw new Error("Select Avalanche Fuji in your wallet.");
    const read = createPublicClient({ chain: avalancheFuji, transport: http() });
    await read.call({ account, to: transaction.to, data: transaction.data, value: BigInt(transaction.value) });
    const tx = await client.sendTransaction({ account, to: transaction.to, data: transaction.data, value: BigInt(transaction.value) });
    if (stage === "funding" || stage === "settlement") {
      localStorage.setItem(`escrow:${id}`, JSON.stringify({ hash: tx, kind: stage })); setHash(tx); setKind(stage);
    }
    setMessage(`Transaction submitted: ${tx}. Waiting for confirmation…`);
    const receipt = await read.waitForTransactionReceipt({ hash: tx });
    if (receipt.status !== "success") throw new Error("Transaction reverted. No successful transfer was recorded.");
    return tx;
  }
  async function verify(tx = hash, stage = kind) {
    if (!bounty) return;
    const path = stage === "funding" ? `/api/escrow/bounties/${id}/funding/verify` : `/api/escrow/claims/${bounty.allocation_id}/settlement/verify`;
    await apiWrite(path, { body: { tx_hash: tx } });
    localStorage.removeItem(`escrow:${id}`); setHash(""); setMessage("Transfer verified on Avalanche Fuji.");
  }
  if (!bounty) return <main className="mp-shell"><p role="status">{message || "Loading bounty…"}</p><a href="/bounties">All bounties</a></main>;
  const payer = user?.github_id === bounty.payer_github_id;
  const claimant = user?.github_id === bounty.author_github_id;
  return <main className="mp-shell"><p><a href="/bounties">Fuji bounties</a></p>
    <h1>{bounty.repo_full_name} #{bounty.issue_number}</h1>
    <p><a href={`https://github.com/${bounty.repo_full_name}/issues/${bounty.issue_number}`}>Read acceptance criteria on GitHub ↗</a></p>
    <h2>{formatUnits(BigInt(bounty.amount_units), 6)} test USDC · {bounty.escrow_state}</h2>
    <p>{bounty.points} bounty points + 5 eligible baseline points. Points remain separate from settlement.</p>
    <dl><dt>Work must merge before</dt><dd>{new Date(bounty.work_ends_at).toLocaleString()}</dd><dt>Claim must settle before</dt><dd>{new Date(bounty.claim_until).toLocaleString()}</dd><dt>Network</dt><dd>Avalanche Fuji · 43113</dd><dt>Escrow</dt><dd><a href={`${explorer}/address/${bounty.contract_address}`}>{bounty.contract_address}</a></dd><dt>Token</dt><dd>{bounty.token_address}</dd></dl>
    <p>Funding and claiming require test AVAX for gas. After the claim deadline, unclaimed funds return to the payer even if points were awarded. GitBounty’s signer verifies GitHub eligibility.</p>
    {bounty.funding_tx_hash && <p><a href={`${explorer}/tx/${bounty.funding_tx_hash}`}>Verified funding ↗</a></p>}
    {bounty.settlement_tx_hash && <p><a href={`${explorer}/tx/${bounty.settlement_tx_hash}`}>Verified settlement ↗</a></p>}
    {!user && <p><a href="/login">Sign in with GitHub</a> to fund or claim.</p>}
    {user && <button disabled={busy} onClick={() => void action(async () => {
      const { client, account } = await browserWallet(43113);
      const { message } = await apiWrite<{ message: string }>("/api/avax/wallet/challenge");
      if (!window.confirm(`Permanently link receiving wallet ${account}? Preserve access to this address; a different wallet cannot replace it.`)) return;
      const signature = await client.signMessage({ account, message });
      await apiWrite("/api/avax/wallet", { body: { signature } }); setMessage(`Wallet linked: ${account}`);
    })}>Link receiving wallet</button>}
    {payer && bounty.escrow_state === "unfunded" && <>
      <button disabled={busy || Boolean(hash)} onClick={() => void action(async () => {
        const instructions = await api<{ approval: Transaction; payer: string }>(`/api/escrow/bounties/${id}/funding`);
        await send(instructions.approval, instructions.payer, "approval"); setMessage("Exact USDC allowance approved. Submit funding next.");
      })}>1. Approve exact USDC amount</button>
      <button disabled={busy || Boolean(hash)} onClick={() => void action(async () => {
        const instructions = await api<{ fund: Transaction; payer: string }>(`/api/escrow/bounties/${id}/funding`);
        const tx = await send(instructions.fund, instructions.payer, "funding"); await verify(tx, "funding");
      })}>2. Fund escrow</button></>}
    {claimant && bounty.allocation_id && bounty.escrow_state === "funded" && <button disabled={busy || Boolean(hash)} onClick={() => void action(async () => {
      const voucher = await apiWrite<{ settle: Transaction; typed_data: { message: { recipient: string } } }>(`/api/escrow/claims/${bounty.allocation_id}/voucher`);
      const tx = await send(voucher.settle, voucher.typed_data.message.recipient, "settlement"); await verify(tx, "settlement");
    })}>Claim escrowed USDC</button>}
    {payer && bounty.escrow_state === "funded" && now >= Date.parse(bounty.claim_until) && <button disabled={busy} onClick={() => void action(async () => {
      const result = await api<{ transaction: Transaction }>(`/api/escrow/bounties/${id}/refund`);
      const tx = await send(result.transaction, bounty.payer_address, "refund");
      await apiWrite(`/api/escrow/bounties/${id}/refund/verify`, { body: { tx_hash: tx } });
      setMessage("Refund verified.");
    })}>Refund expired bounty</button>}
    {user && <fieldset disabled={busy}><legend>Recover a broadcast transaction</legend>
      <label>Action <select value={kind} onChange={event => setKind(event.target.value as typeof kind)}><option value="funding">Funding</option><option value="settlement">Settlement</option></select></label>
      <label>Transaction hash <input value={hash} onChange={event => setHash(event.target.value)} /></label>
      <button disabled={!/^0x[0-9a-fA-F]{64}$/.test(hash)} onClick={() => void action(() => verify())}>Verify existing transaction</button>
    </fieldset>}
    <p role="status" aria-live="polite">{message}</p>
    {user && <button disabled={busy} onClick={() => void action(async () => {
      await apiWrite("/api/escrow/process-delivery");
      const result = await apiWrite<{ caught_up: boolean }>("/api/escrow/reconcile");
      setMessage(result.caught_up ? "GitHub delivery and chain evidence refreshed." : "Recovery advanced 1,000 blocks. Refresh again to continue.");
    })}>Refresh GitHub delivery and chain evidence</button>}
  </main>;
}
