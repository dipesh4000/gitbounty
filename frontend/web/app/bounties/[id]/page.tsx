"use client";
import { use, useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { formatUnits } from "viem";
import { api, apiWrite } from "../../lib/api";
import { useAuth } from "../../components/AuthProvider";
import { refreshWalletActivity } from "../../components/WalletActivity";
import { MarketingShell } from "../../components/MarketingShell";
import { Octicon } from "../../components/primer/Octicon";

type Bounty = {
  bounty_id: number;
  repo_full_name: string;
  issue_number: number;
  points: number;
  amount_units: string;
  payer_github_id: number;
  contract_address: string;
  escrow_state: string;
  work_ends_at: string;
  claim_until: string;
  funding_tx_hash: string | null;
  settlement_tx_hash: string | null;
  author_github_id: number | null;
};
type Operation = { id: number; status: string; tx_hash?: string };
type Kind = "fund" | "settle" | "refund";
type Wallet = { address: string; balance_units: string };
const explorer = "https://testnet.snowtrace.io";
const labels: Record<Kind, string> = {
  fund: "Fund reward",
  settle: "Claim reward",
  refund: "Refund expired reward",
};

export default function BountyPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const { user, signIn } = useAuth();
  const [bounty, setBounty] = useState<Bounty | null>(null);
  const [wallet, setWallet] = useState<Wallet | null>(null);
  const [op, setOp] = useState<Operation | null>(null);
  const [review, setReview] = useState<Kind | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [now, setNow] = useState(() => Date.now());

  const load = useCallback(async () => setBounty(await api<Bounty>(`/api/escrow/bounties/${id}`)), [id]);

  useEffect(() => {
    let active = true;
    api<Bounty>(`/api/escrow/bounties/${id}`)
      .then((data) => {
        if (active) setBounty(data);
      })
      .catch((e) => {
        if (active) setError(e.message);
      });
    const timer = setInterval(() => setNow(Date.now()), 30000);
    return () => {
      active = false;
      clearInterval(timer);
    };
  }, [id]);

  useEffect(() => {
    if (user) {
      api<{ items: Operation[] }>(`/api/sponsored/operations?bounty_id=${id}`)
        .then((data) => setOp(data.items[0] ?? null))
        .catch((e) => setError(e.message));
    }
  }, [id, user]);

  async function action(work: () => Promise<void>) {
    setBusy(true);
    setError("");
    setMessage("");
    try {
      await work();
      await load();
      refreshWalletActivity();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Retry verification.");
    } finally {
      setBusy(false);
    }
  }

  async function check(operation: Operation) {
    const result = await apiWrite<Operation>(`/api/sponsored/operations/${operation.id}/verify`);
    setOp(result);
    setMessage(
      result.status === "verified"
        ? "Transfer verified. Your receipt is ready."
        : result.status === "failed"
        ? "Transaction failed. No successful reward transfer recorded."
        : "Submitted to Avalanche. Check confirmation shortly; your operation is saved."
    );
  }

  const pending = op && !["verified", "failed"].includes(op.status);
  const payer = Boolean(user && user.github_id === bounty?.payer_github_id);
  const claimant = Boolean(user && user.github_id === bounty?.author_github_id);
  const amount = bounty ? formatUnits(BigInt(bounty.amount_units), 6) : "";
  const date = (value: string) =>
    new Date(value).toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" });

  return (
    <MarketingShell current="/bounties">
      <div className="escrow-app">
        <Link className="escrow-back" href="/bounties">
          <Octicon name="chevron-down" size={12} style={{ transform: "rotate(90deg)" }} />
          <span>← All rewards</span>
        </Link>

        {error && (
          <div className="escrow-alert" role="alert">
            <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
              <Octicon name="alert" size={16} />
              <strong>Action needs attention</strong>
            </div>
            <p>{error}</p>
            <button className="escrow-button secondary" disabled={busy} onClick={() => void action(load)}>
              Retry refresh
            </button>
          </div>
        )}

        {!bounty && !error && (
          <div className="escrow-empty" role="status">
            Loading reward details…
          </div>
        )}

        {bounty && (
          <>
            <header className="escrow-heading">
              <div>
                <p className="escrow-eyebrow" style={{ display: "inline-flex", alignItems: "center", gap: "6px" }}>
                  <Octicon name="repo" size={14} />
                  <span>{bounty.repo_full_name}</span>
                </p>
                <h1>A contribution worth rewarding.</h1>
                <a
                  href={`https://github.com/${bounty.repo_full_name}/issues/${bounty.issue_number}`}
                  target="_blank"
                  rel="noreferrer"
                  style={{ display: "inline-flex", alignItems: "center", gap: "6px", fontSize: "14px" }}
                >
                  <Octicon name="issue-opened" size={16} style={{ color: "#3fb950" }} />
                  <span>Issue #{bounty.issue_number} · Read acceptance criteria ↗</span>
                </a>
              </div>
              <span className={`escrow-status ${bounty.escrow_state}`}>
                <Octicon name={bounty.escrow_state === "funded" ? "check-circle-fill" : bounty.escrow_state === "settled" ? "git-merge" : "clock"} size={14} />
                <span>{bounty.escrow_state === "unfunded" ? "Awaiting funding" : bounty.escrow_state}</span>
              </span>
            </header>

            <div className="escrow-grid">
              <section className="escrow-card reward-summary">
                <span className="escrow-eyebrow" style={{ display: "inline-flex", alignItems: "center", gap: "6px" }}>
                  <Octicon name="zap" size={14} style={{ color: "#2f81f7" }} />
                  <span>Reward on Avalanche Fuji</span>
                </span>
                <div className="escrow-amount">
                  {amount}
                  <span>test USDC</span>
                </div>
                <p className="escrow-muted">Test tokens have no monetary value.</p>
                <div className="escrow-points">
                  <strong>{bounty.points} points</strong>
                  <span>+ 5 baseline when eligible</span>
                </div>
                <div className="escrow-deadlines">
                  <div>
                    <span>Merge before</span>
                    <strong>{date(bounty.work_ends_at)}</strong>
                  </div>
                  <div>
                    <span>Claim before</span>
                    <strong>{date(bounty.claim_until)}</strong>
                  </div>
                </div>
                <p className="escrow-muted" style={{ fontSize: "12px", marginTop: "12px" }}>
                  After the claim deadline, unclaimed funds can return to the payer—even if points were awarded.
                </p>
              </section>

              <aside className="escrow-card">
                <p className="escrow-eyebrow">Your next step</p>
                <h2>
                  {pending
                    ? "Your transaction is saved."
                    : bounty.escrow_state === "settled"
                    ? "Good work. Reward delivered."
                    : payer && bounty.escrow_state === "unfunded"
                    ? "Make this reward real."
                    : claimant
                    ? "Your contribution counts."
                    : "Start with the issue."}
                </h2>
                <p className="escrow-muted">
                  {payer
                    ? "You provide the reward USDC. SmoothSend sponsors the network gas."
                    : "GitBounty verifies the merged PR author. Eligible rewards can be claimed here."}
                </p>

                {!user ? (
                  <button className="escrow-button" onClick={() => signIn()}>
                    <Octicon name="mark-github" size={16} />
                    <span>Continue with GitHub →</span>
                  </button>
                ) : (
                  <>
                    {!wallet ? (
                      <button
                        className="escrow-button secondary"
                        disabled={busy}
                        onClick={() =>
                          void action(async () => {
                            setWallet(await apiWrite<Wallet>("/api/sponsored/wallet"));
                          })
                        }
                      >
                        <Octicon name="wallet" size={16} />
                        <span>Open app wallet</span>
                      </button>
                    ) : (
                      <div className="escrow-wallet">
                        <span>App-managed wallet</span>
                        <strong>{formatUnits(BigInt(wallet.balance_units), 6)} test USDC</strong>
                        <code>{wallet.address}</code>
                        <p>Deposit Fuji test USDC here to fund rewards. GitBounty holds the signing keys.</p>
                        <button
                          className="escrow-button secondary"
                          style={{ width: "100%", marginTop: "8px" }}
                          onClick={() =>
                            void navigator.clipboard
                              .writeText(wallet.address)
                              .then(() => setMessage("Wallet address copied."))
                              .catch(() => setError("Select and copy the address manually."))
                          }
                        >
                          Copy address
                        </button>
                      </div>
                    )}

                    {pending ? (
                      <button className="escrow-button" disabled={busy} onClick={() => void action(() => check(op!))}>
                        Check confirmation / retry saved operation
                      </button>
                    ) : (
                      <>
                        {payer && bounty.escrow_state === "unfunded" && (
                          <button className="escrow-button" disabled={busy} onClick={() => setReview("fund")}>
                            Review & fund {amount} USDC
                          </button>
                        )}
                        {claimant && bounty.escrow_state === "funded" && (
                          <button
                            className="escrow-button"
                            disabled={busy || now >= Date.parse(bounty.claim_until)}
                            onClick={() => setReview("settle")}
                          >
                            Review & claim reward →
                          </button>
                        )}
                        {payer && bounty.escrow_state === "funded" && now >= Date.parse(bounty.claim_until) && (
                          <button className="escrow-button secondary" disabled={busy} onClick={() => setReview("refund")}>
                            Review refund
                          </button>
                        )}
                      </>
                    )}
                  </>
                )}

                <div className="escrow-gas">
                  <span aria-hidden="true">✦</span>
                  <div>
                    <strong>Gas sponsored by SmoothSend</strong>
                    <p>No AVAX or USDC gas fee charged on the sponsored path.</p>
                  </div>
                </div>
              </aside>
            </div>

            {review && (
              <section className="escrow-card escrow-review" aria-labelledby="review-title">
                <h2 id="review-title">
                  {labels[review]} · {amount} test USDC
                </h2>
                <p>
                  Avalanche Fuji ·{" "}
                  {review === "fund"
                    ? "Exact token approval and deposit in one sponsored operation."
                    : review === "settle"
                    ? "Payment goes to your permanently linked receiving wallet."
                    : "Funds return to the recorded payer smart account."}
                </p>
                <p className="escrow-muted">
                  GitBounty signs this action with your app-managed wallet. Gas is sponsored; funding uses your USDC balance.
                </p>
                <div className="escrow-actions">
                  <button
                    className="escrow-button"
                    disabled={busy}
                    onClick={() =>
                      void action(async () => {
                        const result = await apiWrite<Operation>(`/api/sponsored/bounties/${id}`, {
                          body: { kind: review },
                        });
                        setOp(result);
                        setReview(null);
                        await check(result);
                      })
                    }
                  >
                    {busy ? "Preparing sponsored transaction…" : `Confirm ${labels[review].toLowerCase()}`}
                  </button>
                  <button className="escrow-button secondary" disabled={busy} onClick={() => setReview(null)}>
                    Cancel
                  </button>
                </div>
              </section>
            )}

            <section className="escrow-card escrow-evidence">
              <h2>Proof you can inspect.</h2>
              <p className="escrow-muted">GitBounty attests GitHub eligibility. The contract enforces the authorized transfer.</p>
              <div className="escrow-actions">
                <a href={`${explorer}/address/${bounty.contract_address}`} target="_blank" rel="noreferrer">
                  <Octicon name="shield" size={14} />
                  <span>Escrow contract ↗</span>
                </a>
                {bounty.funding_tx_hash && (
                  <a href={`${explorer}/tx/${bounty.funding_tx_hash}`} target="_blank" rel="noreferrer">
                    <Octicon name="check" size={14} />
                    <span>Funding receipt ↗</span>
                  </a>
                )}
                {bounty.settlement_tx_hash && (
                  <a href={`${explorer}/tx/${bounty.settlement_tx_hash}`} target="_blank" rel="noreferrer">
                    <Octicon name="git-merge" size={14} />
                    <span>Settlement receipt ↗</span>
                  </a>
                )}
              </div>
              {user && (
                <button
                  className="escrow-button secondary"
                  disabled={busy}
                  onClick={() =>
                    void action(async () => {
                      await apiWrite("/api/escrow/process-delivery");
                      await apiWrite("/api/escrow/reconcile");
                      setMessage("Contribution and chain recovery refreshed.");
                    })
                  }
                >
                  Refresh contribution & evidence
                </button>
              )}
            </section>
          </>
        )}

        <p role="status" aria-live="polite" className="escrow-message">
          {busy ? "Working on your request…" : message}
        </p>
      </div>
    </MarketingShell>
  );
}
