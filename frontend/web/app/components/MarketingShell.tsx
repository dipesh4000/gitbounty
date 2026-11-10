"use client";

import Link from "next/link";
import { useAuth, loginHref } from "./AuthProvider";
import { WalletActivity } from "./WalletActivity";
import { Octicon } from "./primer/Octicon";

const primaryLinks = [
  ["/bounties", "Fuji bounties"],
  ["/wallet", "Wallet"],
  ["/explore", "Explore"],
  ["/how-it-works", "How it works"],
  ["/leaderboard", "Leaderboard"],
  ["/maintainers", "Maintainers"],
] as const;

const footerGroups = [
  ["Product", [["/explore", "Explore issues"], ["/leaderboard", "Leaderboard"], ["/extension", "Extension"]]],
  ["Learn", [["/how-it-works", "How it works"], ["/contributors", "Contributors"], ["/docs", "Docs"]]],
  ["Project", [["/maintainers", "Maintainers"], ["/status", "Status"], ["https://github.com/dipesh4000/gitbounty", "GitHub repo ↗"]]],
  ["Legal", [["/privacy", "Privacy"], ["/terms", "Terms"]]],
] as const;

export function MarketingShell({ children, current }: { children: React.ReactNode; current?: string }) {
  const { user, signOut } = useAuth();
  const destination = (href: string) => !user && (href === "/explore" || href === "/maintainers" || href === "/leaderboard") ? loginHref(href) : href;
  const accountAction = user ? (
    <button className="btn btn-sm" type="button" onClick={signOut}>
      <Octicon name="person" size={14} />
      <span>Sign out</span>
    </button>
  ) : (
    <a className="btn btn-sm btn-primary" href={loginHref()}>
      <Octicon name="mark-github" size={16} />
      <span>Sign in with GitHub</span>
    </a>
  );

  return (
    <div className="mp-site">
      <a className="skip-link" href="#main-content">Skip to content</a>
      <header className="mp-header" style={{ height: "64px", backgroundColor: "#010409", borderBottom: "1px solid #30363d" }}>
        <div className="mp-shell mp-header-row" style={{ height: "64px", gap: "20px" }}>
          <Link className="mp-brand" href="/" aria-label="GitBounty home" style={{ display: "inline-flex", alignItems: "center", gap: "10px", color: "#f0f6fc", fontWeight: 600, fontSize: "16px" }}>
            <Octicon name="mark-github" size={28} />
            <span style={{ letterSpacing: "-0.01em" }}>GitBounty</span>
          </Link>

          <nav className="mp-desktop-nav" aria-label="Primary" style={{ display: "flex", alignItems: "center", gap: "16px" }}>
            {primaryLinks.map(([href, label]) => {
              const target = destination(href);
              const isExternalOrLogin = target.startsWith("http") || target.startsWith("/auth") || target.startsWith("/login");
              return isExternalOrLogin ? (
                <a
                  key={href}
                  href={target}
                  aria-current={current === href ? "page" : undefined}
                  style={{
                    fontSize: "14px",
                    fontWeight: current === href ? 600 : 400,
                    color: current === href ? "#f0f6fc" : "#7d8590",
                    textDecoration: "none",
                    padding: "4px 8px",
                    borderRadius: "6px"
                  }}
                >
                  {label}
                </a>
              ) : (
                <Link
                  key={href}
                  href={target}
                  prefetch={true}
                  aria-current={current === href ? "page" : undefined}
                  style={{
                    fontSize: "14px",
                    fontWeight: current === href ? 600 : 400,
                    color: current === href ? "#f0f6fc" : "#7d8590",
                    textDecoration: "none",
                    padding: "4px 8px",
                    borderRadius: "6px"
                  }}
                >
                  {label}
                </Link>
              );
            })}
            <a
              href="https://github.com/dipesh4000/gitbounty"
              target="_blank"
              rel="noreferrer"
              style={{ fontSize: "14px", color: "#7d8590", display: "inline-flex", alignItems: "center", gap: "4px" }}
            >
              GitHub <Octicon name="link-external" size={12} />
            </a>
          </nav>

          <div className="mp-actions" style={{ marginLeft: "auto", display: "flex", alignItems: "center", gap: "10px" }}>
            <span
              className="Label Label--success"
              style={{ display: "inline-flex", alignItems: "center", gap: "5px", padding: "2px 8px", fontSize: "12px" }}
              title="Avalanche Fuji C-Chain & SmoothSend Sponsored"
            >
              <Octicon name="zap" size={12} />
              <span>Fuji Testnet</span>
            </span>

            {user ? <WalletActivity /> : <Link className="btn btn-sm" href="/extension">Install extension</Link>}
            {accountAction}
          </div>

          <details className="mp-mobile-menu">
            <summary>Menu</summary>
            <nav aria-label="Mobile">
              {primaryLinks.map(([href, label]) => (
                <Link key={href} href={destination(href)}>{label}</Link>
              ))}
              <Link href="/extension">Install extension</Link>
              <a href="https://github.com/dipesh4000/gitbounty">GitHub ↗</a>
              {accountAction}
            </nav>
          </details>
        </div>
      </header>

      <main id="main-content">{children}</main>

      <footer className="mp-footer" style={{ borderTop: "1px solid #30363d", backgroundColor: "#0d1117" }}>
        <div className="mp-shell mp-footer-grid">
          <div className="mp-footer-brand">
            <Link className="mp-brand" href="/" style={{ color: "#f0f6fc", display: "inline-flex", alignItems: "center", gap: "8px" }}>
              <Octicon name="mark-github" size={24} />
              <span>GitBounty</span>
            </Link>
            <p style={{ color: "#7d8590", fontSize: "13px", marginTop: "12px" }}>
              Verifiable GitHub contributions turned into points and Avalanche rewards.
            </p>
          </div>
          {footerGroups.map(([title, links]) => (
            <div className="mp-footer-group" key={title}>
              <strong style={{ color: "#7d8590", fontSize: "12px", textTransform: "uppercase", letterSpacing: "0.05em" }}>{title}</strong>
              {links.map(([href, label]) => {
                const isExternal = href.startsWith("http");
                return isExternal ? (
                  <a href={href} key={href} target="_blank" rel="noreferrer" style={{ color: "#7d8590", fontSize: "13px" }}>{label}</a>
                ) : (
                  <Link href={destination(href)} key={href} style={{ color: "#7d8590", fontSize: "13px" }}>{label}</Link>
                );
              })}
            </div>
          ))}
        </div>
        <div className="mp-shell mp-footer-bottom" style={{ borderTop: "1px solid #21262d", paddingBlock: "16px", color: "#7d8590", fontSize: "12px" }}>
          <span>Points are reputation. Fuji test USDC has no monetary value.</span>
          <span>GitBounty · Built for Open Source</span>
        </div>
      </footer>
    </div>
  );
}
