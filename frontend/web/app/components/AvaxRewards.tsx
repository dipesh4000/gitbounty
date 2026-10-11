"use client";

import { useState, useRef, useEffect } from "react";
import { apiWrite } from "../lib/api";
import { useApiResource } from "../lib/useApiResource";
import type { SmoothPayment } from "../lib/wallet";
import type { PaymentConfig } from "../lib/payments";
import { discoverWallets, selectWallet, walletError, type WalletOption } from "../lib/walletProviders";

type Reward = PaymentConfig & { id: number; github_id: number; contributor_login: string | null; payer_login: string | null;
  is_payer: boolean; repository: string; issue_number: number; reward_amount: string; claimed_at: string | null;
  receiving_wallet: string | null; review_status: string; status: string | null; tx_hash: string | null; userop_hash: string | null };
type Rewards = { enabled: boolean; wallet: string | null; items: Reward[]; has_more: boolean; payment_config: PaymentConfig };


function statusLabel(reward: Reward) {
  if (reward.review_status === "under_review") return "Under review";
  if (reward.status === "paid") return "Paid and verified";
  if (reward.status === "submitted") return "Confirming on chain";
  if (reward.status === "failed") return "Transaction reverted";
  return reward.claimed_at ? "Ready for owner payment" : "Contributor action needed";
}

export function AvaxRewards() {
  const [page, setPage] = useState(1);
  const { resource, reload } = useApiResource<Rewards>(`/api/avax/rewards?page=${page}`);
  const [busy, setBusy] = useState<number | null>(null);
  const [notice, setNotice] = useState("");
  const [review, setReview] = useState<Reward | null>(null);
  const [prepared, setPrepared] = useState<SmoothPayment | null>(null);
  const [quotedFee, setQuotedFee] = useState<string | null>(null);
  const reviewHeading = useRef<HTMLHeadingElement>(null);
  useEffect(() => { if (review) reviewHeading.current?.focus(); }, [review]);
  const [hashes, setHashes] = useState<Record<number, string>>({});
  const config = resource.data?.payment_config;
  const [wallets, setWallets] = useState<WalletOption[]>([]);
  const [selectedWallet, setSelectedWallet] = useState("");
  useEffect(() => discoverWallets(setWallets), []);

  async function setupWallet() {
    setBusy(0); setNotice("");
    try {
      await (await import("../lib/wallet")).connectRewardWallet();
      setNotice("Wallet linked. Rewards will be received directly in this wallet."); reload();
    } catch (error) { setNotice(walletError(error)); }
    finally { setBusy(null); }
  }

  async function beginReview(reward: Reward) {
    setBusy(reward.id); setNotice(""); setPrepared(null); setQuotedFee(null); setReview(reward);
    try {
      const wallet = await import("../lib/wallet");
      if (!resource.data?.wallet) await wallet.connectRewardWallet();
      const payment = await apiWrite<SmoothPayment>(`/api/avax/rewards/${reward.id}/payment`);
      setPrepared(payment);
      setQuotedFee(await wallet.quoteReward(payment));
    } catch (error) { setNotice(walletError(error)); }
    finally { setBusy(null); }
  }

  async function act(reward: Reward, verifyOnly = false, resubmit = false) {
    setBusy(reward.id); setNotice("");
    try {
      if (!reward.is_payer) {
        if (!resource.data?.wallet) await (await import("../lib/wallet")).connectRewardWallet();
        await apiWrite(`/api/avax/rewards/${reward.id}/claim`);
        setNotice(`Claim recorded. The owner must pay the promised ${reward.symbol}.`);
      } else {
        let hash = reward.status === "failed" && !verifyOnly ? null : hashes[reward.id] || reward.userop_hash;
        if (!verifyOnly) {
          const wallet = await import("../lib/wallet");
          if (!resource.data?.wallet) await wallet.connectRewardWallet();
          const payment = await apiWrite<SmoothPayment>(`/api/avax/rewards/${reward.id}/payment`);
          if (payment.status === "paid") { setNotice("This reward is already paid."); reload(); return; }
          hash = hash || payment.userop_hash;
          if (!hash || resubmit) {
            hash = await wallet.sendReward(payment);
            setHashes(current => ({ ...current, [reward.id]: hash! }));
          }
        }
        if (!hash) throw new Error("Enter the SmoothSend operation hash to verify an existing payment.");
        const result = await apiWrite<{ status: string }>(`/api/avax/rewards/${reward.id}/payment/confirm`, { body: { userop_hash: hash } });
        if (result.status === "failed") setHashes(current => ({ ...current, [reward.id]: "" }));
        setNotice(result.status === "paid" ? `Payment verified on ${reward.network}.` :
          result.status === "failed" ? "The transaction reverted; no payment was recorded. You can retry." :
            "Transaction submitted. Use Verify payment until confirmed; do not send again.");
      }
      setReview(null); reload();
    } catch (error) { setNotice(walletError(error)); reload(); }
    finally { setBusy(null); }
  }

  return <section className="avax-rewards" aria-label="Payments">
    <div className={`payment-environment ${config?.testnet ? "is-testnet" : ""}`}>
      <div><span className="workspace-eyebrow">{config?.testnet ? "TEST MODE · NO REAL VALUE" : "PAYMENT NETWORK"}</span>
        <h2>{config ? `${config.symbol} on ${config.network}` : "Loading payment network…"}</h2>
        <p>Owners pay each reward from their own wallet. GitBounty does not fund or guarantee payment.</p></div>
      <button type="button" onClick={reload} disabled={busy !== null}>Refresh rewards</button>
    </div>
    <details><summary>How rewards and payments work</summary><ol className="workflow-steps" aria-label="Payment workflow">
      <li><span>01</span><strong>Merge verified</strong><p>The reward is reserved for the PR author.</p></li>
      <li><span>02</span><strong>Contributor claims</strong><p>Link a receiving wallet with a signature. No transfer or gas.</p></li>
      <li><span>03</span><strong>Owner pays via SmoothSend</strong><p>Review the reward and fee, then sign. The owner pays gas fees in USDC.</p></li>
      <li><span>04</span><strong>Receipt verified</strong><p>The payment is complete once the transfer is confirmed.</p></li>
    </ol></details>
    <div className="payment-wallet"><div><strong>Your linked wallet</strong><p>{resource.data?.wallet ? <code>{resource.data.wallet}</code> : "Not linked yet. Set up your external browser wallet before claiming or paying."}</p></div>
      <p>One permanent wallet per GitHub account. Use a different wallet for each of your two accounts.</p></div>
    <div className="payment-wallet">
      <p>GitBounty has no built-in wallet or withdrawal balance. Contributors receive payment directly in their external wallet. Owners fund a separate SmoothSend smart account shown during payment review.</p>
      {wallets.length > 0 ? <label>Browser wallet<select value={selectedWallet} onChange={event => {
        setSelectedWallet(event.target.value);
        const wallet = wallets.find(item => item.id === event.target.value);
        selectWallet(wallet?.provider);
      }}><option value="">Browser default wallet</option>{wallets.map(wallet => <option key={wallet.id} value={wallet.id}>{wallet.name}</option>)}</select></label>
        : <p>No browser wallet detected. Install or enable an Avalanche-compatible wallet, finish setup, unlock it, and reload this page.</p>}
      <p>Never share your recovery phrase. If you forgot a wallet password, follow that wallet’s recovery instructions; resetting without the recovery phrase can lose access to funds.</p>
      {resource.data && !resource.data.wallet && <button type="button" disabled={!wallets.length || busy !== null} onClick={() => void setupWallet()}>Connect receiving / payer wallet</button>}
    </div>
    {config?.testnet && <p className="payment-faucets">Fund your SmoothSend smart account: <a href="https://faucet.circle.com/" target="_blank" rel="noreferrer">Get test USDC ↗</a><span>The review screen shows the funding address. Gas fees are charged in test USDC.</span></p>}
    {resource.data && !resource.data.enabled && <p className="bounty-message" role="status">{config?.configuration_message ?? "SmoothSend is awaiting server configuration. Claiming and paying are disabled."}</p>}
    <p role="status" className="payment-notice">{notice || resource.error || (resource.status === "loading" ? "Loading rewards…" : "")}</p>
    {resource.data?.items.length === 0 && <div className="app-empty"><strong>No payment rewards yet</strong><span>Publish an issue with a payment promise, then merge a closing PR from a different GitHub account. Points-only bounties do not appear here.</span><a href="/maintainers">Publish a bounty →</a></div>}
    <ul className="payment-list">{resource.data?.items.map(reward => {
      const verifying = reward.status === "submitted" || Boolean(hashes[reward.id]);
      const wrongNetwork = Boolean(config && reward.chain_id !== config.chain_id);
      return <li key={reward.id}>
        <div className="payment-card-heading"><div><span className="workspace-eyebrow">{reward.is_payer ? "YOU ARE THE PAYER" : "YOUR REWARD"} · {reward.testnet ? "TESTNET" : "MAINNET"}</span>
          <a href={`https://github.com/${reward.repository}/issues/${reward.issue_number}`} target="_blank" rel="noreferrer">{reward.repository} #{reward.issue_number} ↗</a></div>
          <span className={`payment-badge ${reward.status === "paid" ? "is-paid" : ""}`}>{statusLabel(reward)}</span></div>
        <div className="payment-card-body"><div className="payment-amount">{reward.reward_amount} <span>{reward.symbol}</span><small>{reward.network}</small></div>
          <div><strong>{reward.is_payer ? `Pay ${reward.contributor_login ? `@${reward.contributor_login}` : `GitHub ID ${reward.github_id}`}` : `Promised by ${reward.payer_login ? `@${reward.payer_login}` : "the bounty owner"}`}</strong>
            <p>{reward.status === "paid" ? "Transfer confirmed. The recipient can use their browser wallet to send the received funds." : reward.is_payer ? reward.claimed_at ? "The contributor has claimed. Review the receiving address before signing." : "Waiting for the contributor to link a wallet and claim." : reward.claimed_at ? "Your claim is recorded. The owner must send the payment; this is not a wallet balance." : "Choose your receiving wallet and claim this reward."}</p></div></div>
        {reward.tx_hash && <a href={`${reward.explorer}/tx/${reward.tx_hash}`} target="_blank" rel="noreferrer">View confirmed/submitted transaction ↗</a>}
        {wrongNetwork && <p>This promise belongs to {reward.network}. Payments are currently configured for {config?.network}; the original terms are preserved.</p>}
        {reward.status !== "paid" && reward.review_status === "clear" && <div className="payment-card-actions">
          <button className="payment-primary" type="button" disabled={wrongNetwork || !resource.data?.enabled || busy !== null || (reward.is_payer ? !reward.claimed_at : Boolean(reward.claimed_at))}
            onClick={() => reward.is_payer && !verifying ? void beginReview(reward) : void act(reward, reward.is_payer && verifying)}>
            {busy === reward.id ? "Working…" : reward.is_payer ? verifying ? "Verify payment" : "Review payment" : reward.claimed_at ? "Claim recorded" : "Connect wallet and claim"}
          </button>
          {reward.is_payer && <details><summary>Already sent? Recover a payment</summary><p>Paste the SmoothSend UserOperation hash, which differs from the explorer transaction hash. Verification sends nothing. Resubmit uses the same saved signature and nonce.</p>
            <label>SmoothSend operation hash<input value={hashes[reward.id] ?? reward.userop_hash ?? ""} onChange={event => setHashes(current => ({ ...current, [reward.id]: event.target.value.trim() }))} placeholder="0x…" /></label>
            <button type="button" disabled={wrongNetwork || !resource.data?.enabled || busy !== null} onClick={() => void act(reward, true)}>Verify existing operation</button>
            {reward.status === "submitted" && <button type="button" disabled={wrongNetwork || !resource.data?.enabled || busy !== null} onClick={() => void act(reward, false, true)}>Resubmit same signed operation</button>}</details>}
        </div>}
      </li>;
    })}</ul>
    {review && <div className="payment-review" role="dialog" aria-modal="false" aria-label="Review payment before signing">
      <h2 ref={reviewHeading} tabIndex={-1}>Review your SmoothSend payment</h2><p>{review.testnet ? "Testnet transfer · tokens have no monetary value." : "Real-money transfer. Review all details in your wallet."}</p>
      <dl><div><dt>Amount</dt><dd>{review.reward_amount} {review.symbol}</dd></div><div><dt>Network</dt><dd>{review.network}</dd></div><div><dt>Receiving wallet</dt><dd><code>{review.receiving_wallet}</code></dd></div><div><dt>Funding address</dt><dd><code>{prepared?.smart_sender ?? "Preparing smart account…"}</code></dd></div><div><dt>Estimated fee</dt><dd>{quotedFee ? `${quotedFee} USDC` : "Not quoted yet. Fund the smart account, then retry review."}</dd></div><div><dt>Fee allowance limit</dt><dd>{prepared?.fee_limit_usdc ?? config?.fee_limit_usdc} USDC, paid by you</dd></div></dl>
      <p>Keep the reward plus the fee allowance in the funding address above. The owner wallet signs a SmoothSend UserOperation; the USDC reward reaches the contributor’s receiving wallet. SmoothSend is required; there is no direct-transfer fallback.</p>
      <button className="payment-primary" type="button" disabled={busy !== null || !quotedFee || !prepared} onClick={() => void act(review)}>Confirm in wallet</button>
      <button type="button" disabled={busy !== null} onClick={() => void beginReview(review)}>Refresh fee quote</button>
      <button type="button" disabled={busy !== null} onClick={() => setReview(null)}>Close review</button>
    </div>}
    <nav className="app-pager" aria-label="Reward pages"><button type="button" disabled={page === 1 || busy !== null} onClick={() => setPage(value => value - 1)}>Previous rewards</button><span>Page {page}</span><button type="button" disabled={!resource.data?.has_more || busy !== null} onClick={() => setPage(value => value + 1)}>Next rewards</button></nav>
  </section>;
}
