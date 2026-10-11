"use client";

import Image from "next/image";
import { useAuth, loginHref } from "./AuthProvider";

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
  const { user, signOut } = useAuth();
  const destination = (href: string) => !user && (href === "/explore" || href === "/maintainers" || href === "/leaderboard") ? loginHref(href) : href;
  const accountAction = user ? <button className="mp-button" type="button" onClick={signOut}>Sign out</button> : <a className="mp-button mp-button-primary" href={loginHref()}>Sign in with GitHub</a>;

  return (
    <div className="mp-site">
      <a className="skip-link" href="#main-content">Skip to content</a>
      <header className="mp-header">
        <div className="mp-shell mp-header-row">
          <a className="mp-brand" href="/" aria-label="GitBounty home">
            <Image src="/favicon-32.png" alt="" width="30" height="30" />
            <span>GitBounty</span>
          </a>
          <nav className="mp-desktop-nav" aria-label="Primary">
            {primaryLinks.map(([href, label]) => (
              <a key={href} href={destination(href)} aria-current={current === href ? "page" : undefined}>{label}</a>
            ))}
            <a href="https://github.com/dipesh4000/gitbounty">GitHub ↗</a>
          </nav>
          <div className="mp-actions">
            <a className="mp-button mp-button-quiet" href="/extension">Install extension</a>
            {accountAction}
          </div>
          <details className="mp-mobile-menu">
            <summary>Menu</summary>
            <nav aria-label="Mobile">
              {primaryLinks.map(([href, label]) => <a key={href} href={destination(href)}>{label}</a>)}
              <a href="/extension">Install extension</a>
              <a href="https://github.com/dipesh4000/gitbounty">GitHub ↗</a>
              {accountAction}
            </nav>
          </details>
        </div>
      </header>
      <main id="main-content">{children}</main>
      <footer className="mp-footer">
        <div className="mp-shell mp-footer-grid">
          <div className="mp-footer-brand">
            <a className="mp-brand" href="/"><Image src="/favicon-32.png" alt="" width="34" height="34" /><span>GitBounty</span></a>
            <p>Open-source work, made visible through verifiable merged contributions.</p>
          </div>
          {footerGroups.map(([title, links]) => (
            <div className="mp-footer-group" key={title}>
              <strong>{title}</strong>
              {links.map(([href, label]) => <a href={destination(href)} key={href}>{label}</a>)}
            </div>
          ))}
        </div>
        <div className="mp-shell mp-footer-bottom"><span>Points, not money or tokens.</span><span>GitBounty · developer preview</span></div>
      </footer>
    </div>
  );
}
