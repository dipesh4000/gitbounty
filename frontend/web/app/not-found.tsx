import Link from "next/link";
import type { Metadata } from "next";
import { MarketingShell } from "./components/MarketingShell";

export const metadata: Metadata = {
  title: "Page not found — GitBounty",
  description: "That page does not exist on GitBounty.",
};

/* The 404. Shaped like the rest of the site rather than a bare browser page, and it offers the four
   places somebody who landed here probably wanted. */
export default function NotFound() {
  return (
    <MarketingShell>
      <section className="mp-hero">
        <div className="mp-shell mp-hero-grid">
          <div>
            <h1>That page isn’t here.</h1>
            <p>
              The address you followed doesn’t match anything on GitBounty. It may have been renamed, or
              the link may have been wrong to begin with.
            </p>
            <div className="mp-status-line"><span />404 · page not found</div>
          </div>
          <dl className="mp-evidence">
            <div><dt>EXPLORE</dt><dd><Link href="/explore">Published bounties</Link></dd></div>
            <div><dt>MAINTAINERS</dt><dd><Link href="/maintainers">Publish an issue</Link></dd></div>
            <div><dt>LEADERBOARD</dt><dd><Link href="/leaderboard">Rankings</Link></dd></div>
            <div><dt>DOCS</dt><dd><Link href="/docs">Documentation</Link></dd></div>
          </dl>
        </div>
      </section>
      <section className="mp-next">
        <div className="mp-shell">
          <h2>Try one of these instead.</h2>
          <div>
            <Link href="/">Back to the landing page<span aria-hidden="true">→</span></Link>
            <Link href="/explore">Browse published bounties<span aria-hidden="true">→</span></Link>
            <Link href="/status">See what is built<span aria-hidden="true">→</span></Link>
          </div>
        </div>
      </section>
    </MarketingShell>
  );
}
