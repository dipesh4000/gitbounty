"use client";

import Link from "next/link";
import Image from "next/image";
import { useAuth } from "./AuthProvider";

const primaryLinks = [
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
  const { user, loading, connect } = useAuth();
  const authLabel = user ? `@${user.github_login}` : "Connect GitHub";

  return (
    <div className="mp-site">
      <a className="skip-link" href="#main-content">Skip to content</a>
      <header className="mp-header">
        <div className="mp-shell mp-header-row">
          <Link className="mp-brand" href="/" aria-label="GitBounty home">
            <Image src="/assets/favicon.png" alt="" width="30" height="30" />
            <span>GitBounty</span>
          </Link>
          <nav className="mp-desktop-nav" aria-label="Primary">
            {primaryLinks.map(([href, label]) => (
              <Link key={href} href={href} aria-current={current === href ? "page" : undefined}>{label}</Link>
            ))}
            <Link href="https://github.com/dipesh4000/gitbounty">GitHub ↗</Link>
          </nav>
          <div className="mp-actions">
            <Link className="mp-button mp-button-quiet" href="/extension">Get extension</Link>
            <button className="mp-button mp-button-primary" type="button" disabled={loading} title={user ? "Sign out" : undefined} onClick={() => connect("nav")}>{authLabel}</button>
          </div>
          <details className="mp-mobile-menu">
            <summary>Menu</summary>
            <nav aria-label="Mobile">
              {primaryLinks.map(([href, label]) => <Link key={href} href={href}>{label}</Link>)}
              <Link href="/extension">Get extension</Link>
              <Link href="https://github.com/dipesh4000/gitbounty">GitHub ↗</Link>
              <button type="button" disabled={loading} onClick={() => connect("nav")}>{authLabel}</button>
            </nav>
          </details>
        </div>
      </header>
      <main id="main-content">{children}</main>
      <footer className="mp-footer">
        <div className="mp-shell mp-footer-grid">
          <div className="mp-footer-brand">
            <Link className="mp-brand" href="/"><Image src="/assets/favicon.png" alt="" width="34" height="34" /><span>GitBounty</span></Link>
            <p>Open-source work, made visible through verifiable merged contributions.</p>
          </div>
          {footerGroups.map(([title, links]) => (
            <div className="mp-footer-group" key={title}>
              <strong>{title}</strong>
              {links.map(([href, label]) => <Link href={href} key={href}>{label}</Link>)}
            </div>
          ))}
        </div>
        <div className="mp-shell mp-footer-bottom"><span>Points, not money or tokens.</span><span>GitBounty · developer preview</span></div>
      </footer>
    </div>
  );
}
