"use client";

import { useState, useRef, useEffect } from "react";
import { apiWrite } from "../lib/api";
import { useApiResource } from "../lib/useApiResource";
import type { SmoothPayment } from "../lib/wallet";
import type { PaymentConfig } from "../lib/payments";
import { discoverWallets, selectWallet, walletProvider, walletError, type WalletOption } from "../lib/walletProviders";

type Reward = PaymentConfig & { id: number; github_id: number; contributor_login: string | null; payer_login: string | null;
  is_payer: boolean; repository: string; issue_number: number; reward_amount: string; claimed_at: string | null;
  receiving_wallet: string | null; review_status: string; status: string | null; tx_hash: string | null; userop_hash: string | null };
type OwnerPromise = PaymentConfig & { repository: string; issue_number: number; bounty_status: string; reward_amount: string };
type Rewards = { enabled: boolean; wallet: string | null; items: Reward[]; owner_promises?: OwnerPromise[]; has_more: boolean; payment_config: PaymentConfig };


function statusLabel(reward: Reward) {
  if (reward.review_status === "under_review") return "Under review";
  if (reward.status === "paid") return "Paid and verified";
  if (reward.status === "submitted") return "Submitted · verification pending";
  if (reward.status === "failed") return "Transaction reverted";
  return reward.claimed_at ? reward.is_payer ? "Ready to pay" : "Claimed · awaiting owner payment" : reward.is_payer ? "Waiting for contributor claim" : "Ready to claim";
}

function nextStep(reward: Reward) {
  if (reward.status === "paid") return "Payment complete. The transfer has been verified on chain.";
  if (reward.review_status !== "clear") return "Payment is paused for review. No wallet action is needed right now.";
  if (reward.status === "submitted") return reward.is_payer ? "Next: verify the submitted payment. Do not send a second payment." : "The owner submitted a payment. Awaiting on-chain verification; it is not paid yet.";
  if (reward.status === "failed") return reward.is_payer ? "The previous operation failed. Review a new attempt before signing." : "The payment failed. The owner needs to retry; your claim is still recorded.";
  if (!reward.claimed_at) return reward.is_payer ? `Next: wait for ${reward.contributor_login ? `@${reward.contributor_login}` : "the contributor"} to link a receiving wallet and claim in Payments.` : "Next: claim this reward using your linked receiving wallet. Claiming does not transfer funds.";
  return reward.is_payer ? "Next: review the recipient and funding address, then sign the SmoothSend payment." : "Your claim is recorded. Waiting for the owner to pay; no further action is needed from you.";
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
  const [view, setView] = useState<"all" | "pay" | "collect">("all");
  const [confirmedWallet, setConfirmedWallet] = useState<string | null>(null);
  const linkedWallet = resource.data?.wallet ?? confirmedWallet;
  const [browserAccount, setBrowserAccount] = useState<string | null>(null);
  const [connectionChecked, setConnectionChecked] = useState(false);
  const [checkingWallet, setCheckingWallet] = useState(false);
  const visibleRewards = resource.data?.items.filter(reward => view === "all" || (view === "pay" ? reward.is_payer : !reward.is_payer)) ?? [];
  useEffect(() => discoverWallets(setWallets), []);

  useEffect(() => {
    const provider = walletProvider();
    const changed = () => { setBrowserAccount(null); setConnectionChecked(false); };
    provider?.on?.("accountsChanged", changed);
    return () => { provider?.removeListener?.("accountsChanged", changed); };
  }, [selectedWallet, wallets]);

  async function checkConnection() {
    setCheckingWallet(true); setNotice("");
    try {
      const provider = walletProvider();
      const accounts = provider ? await provider.request({ method: "eth_accounts" }) : [];
      setBrowserAccount(accounts[0] ?? null); setConnectionChecked(true);
    } catch (error) { setNotice(walletError(error)); setConnectionChecked(false); }
    finally { setCheckingWallet(false); }
  }

  async function setupWallet() {
    setBusy(0); setNotice("");
    try {
      const result = await (await import("../lib/wallet")).connectRewardWallet();
      setConfirmedWallet(result.address); setBrowserAccount(result.address); setConnectionChecked(true);
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
        <h3>{config ? `${config.symbol} on ${config.network}` : "Loading payment network…"}</h3>
        <p>Payouts via SmoothSend · owners pay fees in USDC.</p></div>
      <button type="button" onClick={reload} disabled={busy !== null}>Refresh rewards</button>
    </div>
    <details className="payment-help"><summary>How rewards and payments work</summary><p>GitBounty does not fund or guarantee payment. Contributors receive funds directly in their external wallets; there is no internal balance or withdrawal. Owners fund a separate SmoothSend smart account during payment review.</p><ol className="workflow-steps" aria-label="Payment workflow">
      <li><span>01</span><strong>Merge verified</strong><p>The reward is reserved for the PR author.</p></li>
      <li><span>02</span><strong>Contributor claims</strong><p>Link a receiving wallet with a signature. No transfer or gas.</p></li>
      <li><span>03</span><strong>Owner pays via SmoothSend</strong><p>Review the reward and fee, then sign. The owner pays gas fees in USDC.</p></li>
      <li><span>04</span><strong>Receipt verified</strong><p>The payment is complete once the transfer is confirmed.</p></li>
    </ol></details>
    <section className="payment-wallet-panel" aria-label="Wallet connection">
      <div className="payment-card-heading"><h3>Your wallet</h3><span className={`payment-badge ${linkedWallet ? "is-paid" : ""}`}>{linkedWallet ? "Wallet linked to GitHub" : resource.status === "loading" ? "Checking linked wallet…" : resource.error ? "Wallet status unavailable" : "No wallet linked"}</span></div>
      {linkedWallet ? <><p className="wallet-address"><code>{linkedWallet}</code></p><p>This is your permanent receiving and signing address.</p></> : <p>Connect your external wallet once to claim rewards or sign owner payouts.</p>}
      <div className="wallet-browser-state" role="status"><strong>Browser connection: </strong>{!connectionChecked ? "Not checked" : !browserAccount ? "Disconnected or locked" : linkedWallet && browserAccount.toLowerCase() !== linkedWallet.toLowerCase() ? "Different account selected — switch to your linked wallet" : linkedWallet ? "Connected · matches linked wallet" : "Connected · not yet linked to GitHub"}
        {browserAccount && <code>{browserAccount}</code>}</div>
      <div className="wallet-controls">
      {wallets.length > 0 ? <label>Browser wallet<select value={selectedWallet} onChange={event => {
        setSelectedWallet(event.target.value);
        setBrowserAccount(null); setConnectionChecked(false);
        const wallet = wallets.find(item => item.id === event.target.value);
        selectWallet(wallet?.provider);
      }}><option value="">Browser default wallet</option>{wallets.map(wallet => <option key={wallet.id} value={wallet.id}>{wallet.name}</option>)}</select></label>
        : <p>No browser wallet detected. Install or enable an Avalanche-compatible wallet, finish setup, unlock it, and reload this page.</p>}
      <button type="button" disabled={checkingWallet || busy !== null} onClick={() => void checkConnection()}>{checkingWallet ? "Checking connection…" : "Check browser connection"}</button>
      {resource.data && !linkedWallet && <button className="payment-primary" type="button" disabled={!wallets.length || busy !== null || !resource.data.enabled} onClick={() => void setupWallet()}>{busy === 0 ? "Waiting for wallet signature…" : "Connect & link wallet"}</button>}
      </div>
      <details><summary>Wallet setup & safety</summary><p>One permanent wallet per GitHub account. Linking requires a signature, not a transfer. Never share your recovery phrase. If you forgot a wallet password, follow that wallet’s recovery instructions; resetting without the recovery phrase can lose access to funds.</p></details>
    </section>
    {resource.data && !resource.data.enabled && <p className="bounty-message" role="status">{config?.configuration_message ?? "SmoothSend is awaiting server configuration. Claiming and paying are disabled."}</p>}
    <p role="status" className="payment-notice">{notice || resource.error || (resource.status === "loading" ? "Loading rewards…" : "")}</p>
    <div className="app-tabs payment-tabs" role="group" aria-label="Payment views">{([["all", "All activity"], ["pay", "Owner payouts"], ["collect", "Contributor rewards"]] as const).map(([id, label]) => <button type="button" key={id} aria-pressed={view === id} onClick={() => setView(id)}>{label}</button>)}</div>
    {view !== "collect" && Boolean(resource.data?.owner_promises?.length) && <section aria-label="Your payment promises"><h3>Awaiting contribution verification</h3>
      <ul className="payment-list">{resource.data?.owner_promises?.map(promise => <li key={`${promise.repository}#${promise.issue_number}`}>
        <div className="payment-card-heading"><a href={`https://github.com/${promise.repository}/issues/${promise.issue_number}`} target="_blank" rel="noreferrer">{promise.repository} #{promise.issue_number} ↗</a><span className="payment-badge">Merge not verified</span></div>
        <strong>You promised {promise.reward_amount} {promise.symbol} · {promise.network}</strong>
        <p>Next: verify a merged PR that closes this issue. No eligible contribution is recorded yet.</p>
        {promise.bounty_status !== "published" && <p>This bounty is {promise.bounty_status}; it is not currently offered.</p>}
        <button type="button" disabled title="A verified contribution and contributor claim are required before payment">Pay contributor — awaiting verification</button>
        <details><summary>Why can’t I pay yet?</summary><p>Closing the issue alone does not create a payment. The merged PR needs a closing reference. Ask the contributor to use My PRs → Sync GitHub if it was missed. After verification, the contributor links a wallet and claims; you then review and sign the payout.</p></details>
      </li>)}</ul>
    </section>}
    {resource.data?.items.length === 0 && <div className="app-empty"><strong>No verified payouts or earned rewards yet</strong><span>Your published payment promises appear above while awaiting contribution verification. Points-only contributions have no cash payment attached.</span><a href="/maintainers">Manage your bounties →</a></div>}
    {Boolean(visibleRewards.length) && <h3>{view === "pay" ? "Your contributor payouts" : view === "collect" ? "Your earned rewards" : "Verified payouts & earned rewards"}</h3>}
    {resource.data && resource.data.items.length > 0 && !visibleRewards.length && <p>No {view === "pay" ? "owner payouts" : "contributor rewards"} on this page. Check the next page or choose All activity.</p>}
    <ul className="payment-list">{visibleRewards.map(reward => {
      const verifying = reward.status === "submitted" || Boolean(hashes[reward.id]);
      const wrongNetwork = Boolean(config && reward.chain_id !== config.chain_id);
      return <li key={reward.id}>
        <div className="payment-card-heading"><div><span className="workspace-eyebrow">{reward.is_payer ? "YOU ARE THE PAYER" : "YOUR REWARD"} · {reward.testnet ? "TESTNET" : "MAINNET"}</span>
          <a href={`https://github.com/${reward.repository}/issues/${reward.issue_number}`} target="_blank" rel="noreferrer">{reward.repository} #{reward.issue_number} ↗</a></div>
          <span className={`payment-badge ${reward.status === "paid" ? "is-paid" : ""}`}>{statusLabel(reward)}</span></div>
        <ol className="reward-progress" aria-label="Reward progress">{["Merge verified", "Wallet claimed", "Payment verified"].map((label, index) => <li key={label} className={index === 0 || (index === 1 && reward.claimed_at) || reward.status === "paid" ? "is-complete" : ""}><span aria-hidden="true">{index === 0 || (index === 1 && reward.claimed_at) || reward.status === "paid" ? "✓" : "○"}</span> {label}</li>)}</ol>
        <div className="payment-card-body"><div className="payment-amount">{reward.reward_amount} <span>{reward.symbol}</span><small>{reward.network}</small></div>
          <div><strong>{reward.is_payer ? `Pay ${reward.contributor_login ? `@${reward.contributor_login}` : `GitHub ID ${reward.github_id}`}` : `Promised by ${reward.payer_login ? `@${reward.payer_login}` : "the bounty owner"}`}</strong>
            <p>{nextStep(reward)}</p></div></div>
        {reward.tx_hash && <a href={`${reward.explorer}/tx/${reward.tx_hash}`} target="_blank" rel="noreferrer">View confirmed/submitted transaction ↗</a>}
        {wrongNetwork && <p>This promise belongs to {reward.network}. Payments are currently configured for {config?.network}; the original terms are preserved.</p>}
        {reward.status !== "paid" && reward.review_status === "clear" && <div className="payment-card-actions">
          <button className="payment-primary" type="button" disabled={wrongNetwork || !resource.data?.enabled || busy !== null || (reward.is_payer ? !reward.claimed_at : Boolean(reward.claimed_at))}
            onClick={() => reward.is_payer && !verifying ? void beginReview(reward) : void act(reward, reward.is_payer && verifying)}>
            {busy === reward.id ? "Waiting for confirmation…" : reward.is_payer ? verifying ? "Verify payment" : !reward.claimed_at ? "Waiting for contributor" : "Review payment" : reward.claimed_at ? "Claim recorded" : linkedWallet ? "Claim reward" : "Connect wallet and claim"}
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
