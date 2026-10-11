import type { Metadata } from "next";
import { MarketingShell } from "./MarketingShell";

type Section = { heading: string; body: string; items?: string[]; code?: string };
type PageSpec = {
  path: string;
  title: string;
  lede: string;
  status: string;
  evidence: Array<[string, string]>;
  sections: Section[];
  next: Array<[string, string]>;
};

export const pages: Record<PageKey, PageSpec> = {
  explore: {
    path: "/explore",
    title: "Find work worth opening.",
    lede: "GitBounty organizes published bounties around the kind of work you want to do, then keeps the contribution itself on GitHub.",
    status: "Opportunity explorer",
    evidence: [["SOURCE", "Bounties maintainers published"], ["FILTERS", "Category · search"], ["WORKFLOW", "Opens on GitHub"], ["SIGN-IN", "Required for the workspace"]],
    sections: [
      { heading: "Browse by the work, not the hype.", body: "The explorer is organized around concrete work categories: frontend, backend, full-stack, documentation, testing, DevOps, design, mobile and other.", items: ["Only issues a maintainer has published on GitBounty appear here.", "Treat points as recognition attached to work—not as payment.", "Discussion, review and merge all stay in the repository."] },
      { heading: "The list is live.", body: "Both the landing page and the signed-in explorer read the same endpoint, and it returns only bounties with a current published status. Unpublishing one removes it from both.", code: "published bounty → pull request → merge → points" },
    ],
    next: [["/how-it-works", "See how work becomes points"], ["/maintainers", "Publish your own issue as a bounty"]],
  },
  "how-it-works": {
    path: "/how-it-works",
    title: "The workflow stays on GitHub.",
    lede: "GitBounty adds discovery and recognition around the contribution process you already know. It does not replace issues, pull requests, reviews, or merges.",
    status: "Contribution protocol",
    evidence: [["INPUT", "A published bounty"], ["PROOF", "Merged pull request"], ["REWARD", "A ledger entry"], ["BASELINE", "+5 per merge in a participating repo"]],
    sections: [
      { heading: "Find and build.", body: "Choose a published bounty that matches your skills, read the repository’s contribution guide, discuss the approach when needed, and open a normal pull request that says which issue it closes.", items: ["No separate editor or review system.", "An AVAX promise is paid individually by the owner after your verified claim. GitBounty does not guarantee it.", "Maintainers keep control of acceptance and merge."] },
      { heading: "Merge and record.", body: "After your pull request merges, synchronising reads it from GitHub and writes an entry naming the pull request, the bounty, the category and the rule version. The points go to the pull request’s author, not to whoever clicked Merge. A bounty is awarded once, to one person, ever.", code: "bounty value + 5 baseline = one immutable ledger entry" },
    ],
    next: [["/contributors", "What a contribution record contains"], ["/maintainers", "Publish a bounty"]],
  },
  leaderboard: {
    path: "/leaderboard",
    title: "Reputation with receipts.",
    lede: "Leaderboards make sustained contribution visible while every score remains traceable to a merged pull request.",
    status: "Leaderboard",
    evidence: [["WINDOWS", "Week · month · all time"], ["BREAKDOWN", "Nine categories"], ["TIEBREAK", "Merges, then handle"], ["SOURCE", "Ledger entries"]],
    sections: [
      { heading: "A ranking is only useful if it can be inspected.", body: "A total is the sum of individual ledger entries, each naming the pull request and the bounty it came from. There is no stored score that could drift from the entries behind it.", items: ["Weekly and monthly windows surface current momentum.", "Category boards show where somebody contributes.", "Your own position is shown even when it falls past the last page."] },
      { heading: "No purchasable rank.", body: "Points cannot be bought, sold, withdrawn, or transferred. A withdrawn award is a new negative entry with a reason, never a quiet edit, and somebody whose entries net to zero leaves the board rather than sitting at the bottom of it.", code: "rank ← ledger entries ← merged pull requests" },
    ],
    next: [["/contributors", "What a contribution record contains"], ["/status", "What is and is not built"]],
  },
  maintainers: {
    path: "/maintainers",
    title: "Point contributors at the work that matters.",
    lede: "Publish an open issue from a repository you administer as a bounty worth 1 to 1000 points, and keep every technical decision inside the repository.",
    status: "Maintainer workspace",
    evidence: [["WHO", "Admin or maintain on the repo"], ["RANGE", "1–1000 points"], ["SCOPE", "Public repositories"], ["COST", "No payment flow"]],
    sections: [
      { heading: "Publish from the workspace.", body: "Sign in, pick a repository GitHub says you administer or maintain — personal or organisation — choose open issues from it, set a category and a value, review the selection, and publish. Only what you select is published.", items: ["Your permission is re-checked with GitHub on every write.", "A gitbounty:40 label pre-fills the value as a suggestion; a label alone awards nothing.", "Private repositories are not supported yet."] },
      { heading: "You stay in control of it afterwards.", body: "Edit a value or category, unpublish, republish or archive. Nothing is deleted, and every change is recorded with who made it, what it was before and why. A bounty already claimed keeps the value it was awarded at — editing it does not rewrite history.", code: "publish → merge closes it → one award, once, ever" },
    ],
    next: [["/extension", "See bounties on GitHub itself"], ["/docs", "Read the documentation"]],
  },
  extension: {
    path: "/extension",
    title: "Install GitBounty for GitHub.",
    lede: "See published rewards beside GitHub issues and pull requests. The current extension is a local developer build; install it manually in Chrome, Edge, or Brave.",
    status: "Developer build - not yet on the Chrome Web Store",
    evidence: [["VERSION", "0.4.0"], ["BROWSERS", "Chrome, Edge, Brave"], ["REQUIRES", "Local API on port 8001"], ["COST", "Free extension; payments on website"]],
    sections: [
      { heading: "1. Prepare your local project.", body: "Use the extension files already included in this repository. Start the GitBounty backend and confirm its readiness endpoint before installing.", items: ["Extension folder: frontend/extension. No extension build step is required.", "The backend must run at http://localhost:8001 for this developer build.", "If you downloaded the repository as a ZIP, extract it first."], code: "http://localhost:8001/ready" },
      { heading: "2. Load the extension in your browser.", body: "Open your browser's extensions manager, turn on Developer mode, then choose Load unpacked. Select the frontend/extension folder containing manifest.json.", items: ["Chrome: chrome://extensions", "Edge: edge://extensions", "Brave: brave://extensions", "Pin GitBounty using the browser's Extensions menu."], code: "Developer mode > Load unpacked > frontend/extension" },
      { heading: "3. Open a published bounty on GitHub.", body: "Reload the GitHub issue page after installation. A reward appears only when a maintainer has published that issue on GitBounty. Open the toolbar popup to check your account and contributions.", items: ["A GitHub label alone does not create a reward.", "If no badge appears, check API readiness and whether the bounty is published.", "After changing extension files, click Reload in the extensions manager and refresh GitHub.", "Permissions: activeTab and access to the local API; no analytics or remote executable code."], code: "Published bounty > GitHub issue > point reward" },
    ],
    next: [["https://github.com/dipesh4000/gitbounty", "Open the project repository"], ["/privacy", "Read the privacy summary"]],
  },
  contributors: {
    path: "/contributors",
    title: "Your work should outlive the feed.",
    lede: "A GitBounty contribution record organizes merged work into an inspectable history: what changed, where it landed, and what recognition it earned.",
    status: "Contributor record",
    evidence: [["IDENTITY", "GitHub account"], ["UNIT", "Merged pull request"], ["CATEGORY", "Work type"], ["PROVENANCE", "Pull request + bounty"]],
    sections: [
      { heading: "Evidence before score.", body: "Every entry keeps the pull request and the bounty it came from, what that bounty was worth at the time, which version of the rules produced it, and why — so a total can always be traced back to actual work.", items: ["Pull request and repository identity.", "Merge time and work category, with whether a maintainer chose that category.", "Bounty and baseline shown as separate entries."] },
      { heading: "Built for a body of work.", body: "The record shows a pattern across repositories and categories, not one context-free number. Corrections appear in it as their own entries, so the history stays readable even when something had to be put right.", code: "work history > vanity metric" },
    ],
    next: [["/leaderboard", "How rankings work"], ["/how-it-works", "The contribution workflow"]],
  },
  docs: {
    path: "/docs",
    title: "The operating manual, without the fog.",
    lede: "Start with the workflow that matches your role. Points recognize contributions; optional AVAX promises are paid by individual owners.",
    status: "Documentation index",
    evidence: [["CONTRIBUTORS", "Find · build · merge"], ["MAINTAINERS", "Publish · review · merge"], ["EXTENSION", "Optional"], ["MONEY", "Owner-funded AVAX promises"]],
    sections: [
      { heading: "For contributors.", body: "How bounties are discovered, how merged work is verified, and what appears in a contribution record.", items: ["Explore published bounties.", "Understand where each point came from.", "Read the leaderboard model."] },
      { heading: "For maintainers and builders.", body: "Set an exact Avalanche payment promise on first publication. Current testing uses USDC on Avalanche Fuji. After the contributor claims, open Payments, fund the displayed SmoothSend smart account, review the reward and USDC fee, and sign with your connected wallet. The owner pays the fee. GitBounty verifies receipts and does not fund or guarantee payment.", code: "published promise → verified merge → contributor claim → owner-signed payment → verified receipt" },
    ],
    next: [["/how-it-works", "Contributor workflow"], ["/maintainers", "Maintainer setup"], ["/extension", "Extension setup"]],
  },
  privacy: {
    path: "/privacy",
    title: "Privacy should be legible too.",
    lede: "A plain summary of what GitBounty stores and why. It is not a substitute for a reviewed policy, and it has not been reviewed by a lawyer.",
    status: "Privacy summary · pre-launch, not legally reviewed",
    evidence: [["OAUTH", "read:user"], ["SESSION", "Signed user ID only"], ["TOKEN", "Encrypted at rest"], ["EXTENSION", "No analytics"]],
    sections: [
      { heading: "What is stored.", body: "Your GitHub numeric id, login, display name and avatar URL; an encrypted GitHub access token; the merged pull requests GitBounty has counted for you; the points entries behind your total; and the bounties you have published.", items: ["The OAuth flow requests read:user, not private-repository access.", "The browser session cookie holds only a signed internal user ID — never a token.", "Access tokens are encrypted before storage and are cleared when you sign out."] },
      { heading: "What the extension does.", body: "It asks the GitBounty API which bounties are published for the repository you are looking at, and reads the issue numbers already on the page. It contains no analytics, no remotely loaded code and no credentials.", code: "permission surface: activeTab + the GitBounty API" },
    ],
    next: [["/terms", "Read the pre-launch terms"], ["/status", "See what is built"]],
  },
  terms: {
    path: "/terms",
    title: "Points are recognition, not value.",
    lede: "These pre-launch terms describe the product boundary plainly. They have not been reviewed by a lawyer and are not a substitute for terms that have been.",
    status: "Terms summary · pre-launch, not legally reviewed",
    evidence: [["POINTS", "Non-transferable"], ["CASH VALUE", "None"], ["WORKFLOW", "Repository-controlled"], ["AVAILABILITY", "Not deployed"]],
    sections: [
      { heading: "Points and payment promises.", body: "GitBounty points are not currency or redeemable value. They cannot be purchased, sold, transferred, or withdrawn. A separately published payment promise is the owner’s responsibility. GitBounty does not fund or guarantee it; payment requires the owner’s signature through SmoothSend. Fuji test tokens have no monetary value." },
      { heading: "Repositories set the rules for contribution.", body: "Using GitBounty does not override a repository’s license, contribution guide, code of conduct, review decisions, or maintainer authority.", items: ["A published bounty does not guarantee merge or acceptance.", "Awards obtained by manipulation may be withdrawn; a withdrawal is a recorded entry, not a deletion.", "Features and availability can change."] },
    ],
    next: [["/privacy", "Privacy summary"], ["/docs", "Return to docs"]],
  },
  status: {
    path: "/status",
    title: "What works. What is next.",
    lede: "GitBounty runs locally and is not deployed anywhere. This page separates what is built and tested from what still needs an owner decision or external configuration.",
    status: "Build status · runs locally, not deployed",
    evidence: [["WEBSITE", "Runs locally"], ["BACKEND", "Runs locally"], ["OAUTH", "Implemented; needs an app"], ["EXTENSION", "Load unpacked"]],
    sections: [
      { heading: "Built and tested.", body: "GitHub OAuth, the append-only points ledger with its bounds and anti-double-award constraints, the maintainer publish and lifecycle workflow, merged-pull-request synchronisation with recorded status, category leaderboards, the opportunity explorer, and the browser extension.", items: ["The backend and extension test suites cover these paths.", "Database migrations bootstrap a clean database from scratch.", "Points rules are documented and enforced in both the application and the database."] },
      { heading: "Not done.", body: "GitBounty is not deployed and this page makes no claim that it is. Private repositories are not supported, collusion between two cooperating accounts is not defended against, and the privacy and terms summaries have not been legally reviewed.", code: "runs locally ≠ deployed" },
    ],
    next: [["/extension", "Install the extension"], ["https://github.com/dipesh4000/gitbounty", "Follow development on GitHub ↗"]],
  },
};

export type PageKey =
  | "explore" | "how-it-works" | "leaderboard" | "maintainers" | "extension"
  | "contributors" | "docs" | "privacy" | "terms" | "status";

export function InteriorPage({ page }: { page: PageKey }) {
  const spec = pages[page];
  return (
    <MarketingShell current={spec.path}>
      <section className="mp-hero">
        <div className="mp-shell mp-hero-grid">
          <div><h1>{spec.title}</h1><p>{spec.lede}</p><div className="mp-status-line"><span />{spec.status}</div>{page === "extension" && <a className="mp-button mp-button-primary mp-install-action" href="#extension-install">View installation steps <span aria-hidden="true">&darr;</span></a>}</div>
          <dl className="mp-evidence">{spec.evidence.map(([term, value]) => <div key={term}><dt>{term}</dt><dd>{value}</dd></div>)}</dl>
        </div>
      </section>
      <div className="mp-content">
        {spec.sections.map((section, index) => (
          <section className="mp-section" key={section.heading} id={page === "extension" && index === 0 ? "extension-install" : undefined}>
            <div className="mp-shell mp-section-grid">
              <div className="mp-section-index">{String(index + 1).padStart(2, "0")}</div>
              <div><h2>{section.heading}</h2><p>{section.body}</p></div>
              <div className="mp-section-detail">
                {section.items && <ul>{section.items.map(item => <li key={item}>{item}</li>)}</ul>}
                {section.code && <code>{section.code}</code>}
              </div>
            </div>
          </section>
        ))}
      </div>
      <section className="mp-next"><div className="mp-shell"><h2>Explore GitBounty.</h2><div>{spec.next.map(([href, label]) => <a href={href} key={href}>{label}<span aria-hidden="true">→</span></a>)}</div></div></section>
    </MarketingShell>
  );
}

export function pageMetadata(page: PageKey): Metadata {
  const spec = pages[page];
  return {
    title: `${spec.title} — GitBounty`,
    description: spec.lede,
    openGraph: { title: `${spec.title} — GitBounty`, description: spec.lede, type: "website" },
    twitter: { card: "summary_large_image", title: `${spec.title} — GitBounty`, description: spec.lede },
  };
}
