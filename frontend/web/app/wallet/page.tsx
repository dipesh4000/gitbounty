"use client";
import { useAuth } from "../components/AuthProvider";
import { MarketingShell } from "../components/MarketingShell";
import { ManagedWallet } from "../components/ManagedWallet";
import { RecentWalletActivity } from "../components/WalletActivity";

export default function WalletPage() {
  const { user } = useAuth();
  return <MarketingShell current="/wallet"><div className="escrow-app"><header className="escrow-heading"><div><p className="escrow-eyebrow">Your GitBounty account</p><h1>One wallet. Less friction.</h1><p className="escrow-muted">Sign in with GitHub. Deposit USDC, fund rewards and track every supported transaction here.</p></div><span className="escrow-status">Fuji testnet</span></header>
    <div className="escrow-grid"><ManagedWallet /><aside className="escrow-card"><p className="escrow-eyebrow">Made for contribution</p><h2>Gas stays out of your way.</h2><div className="escrow-gas"><span aria-hidden="true">✦</span><div><strong>SmoothSend developer sponsorship</strong><p>You supply bounty USDC. GitBounty sponsors supported network gas through SmoothSend credits.</p></div></div><h2>Your wallet stays in the app.</h2><p className="escrow-muted">GitBounty stores encrypted signing keys and signs only the reward actions you confirm. This is a custodial wallet: access depends on your GitHub account and GitBounty’s key service.</p><a className="escrow-button secondary" href="/bounties">Explore rewards ↗</a></aside></div>
    {user && <RecentWalletActivity />}
  </div></MarketingShell>;
}
