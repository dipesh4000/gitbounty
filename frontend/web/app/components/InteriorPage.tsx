import Link from "next/link";
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

export const pages = {
  explore: {
    path: "/explore",
    title: "Find work worth opening.",
    lede: "GitBounty organizes open-source issues around the kind of work you want to do, then keeps the contribution itself on GitHub.",
    status: "Issue directory · integration in progress",
    evidence: [["SOURCE", "Public GitHub issues"], ["FILTERS", "Skill · category · repository"], ["WORKFLOW", "Opens on GitHub"], ["CURRENT STATE", "Preview data on the homepage"]],
    sections: [
      { heading: "Browse by the work, not the hype.", body: "The directory is designed around concrete work categories: frontend, backend, full-stack, documentation, testing, DevOps, design, and mobile.", items: ["Scan repository, issue title, labels, and activity before opening anything.", "Treat points as recognition attached to work—not as payment.", "Use the repository’s own discussion, review, and merge process."] },
      { heading: "The live index is the next connection.", body: "The current homepage demonstrates the complete filter and issue-row experience with clearly labeled sample data. The production issue feed will replace it after the public API is connected.", code: "issue → discuss → branch → pull request → merge" },
    ],
    next: [["/how-it-works", "See how work becomes points"], ["https://github.com/issues?q=is%3Aopen+is%3Aissue+label%3A%22good+first+issue%22", "Browse open issues on GitHub ↗"]],
  },
  "how-it-works": {
    path: "/how-it-works",
    title: "The workflow stays on GitHub.",
    lede: "GitBounty adds discovery and recognition around the contribution process you already know. It does not replace issues, pull requests, reviews, or merges.",
    status: "Contribution protocol",
    evidence: [["INPUT", "Open issue"], ["PROOF", "Merged pull request"], ["REWARD", "Points ledger entry"], ["BASELINE", "+5 per valid merge"]],
    sections: [
      { heading: "Find and build.", body: "Choose an open issue that matches your skills, read the repository’s contribution guide, discuss the approach when needed, and submit a normal pull request.", items: ["No separate editor or review system.", "No wallet, invoice, or payment flow.", "Repository maintainers keep control of acceptance and merge."] },
      { heading: "Merge and record.", body: "After a qualifying pull request merges, GitBounty records the repository, category, merge evidence, and points. The same merge cannot be counted twice.", code: "+5 baseline + issue value = recorded contribution" },
    ],
    next: [["/contributors", "Understand contribution records"], ["/maintainers", "Set up issue points"]],
  },
  leaderboard: {
    path: "/leaderboard",
    title: "Reputation with receipts.",
    lede: "Leaderboards make sustained contribution visible while every score remains traceable to merged work.",
    status: "Leaderboard · data connection pending",
    evidence: [["WINDOWS", "Week · month · all time"], ["BREAKDOWN", "Category"], ["TIEBREAK", "Merges, then handle"], ["SOURCE", "Recorded merge rows"]],
    sections: [
      { heading: "A ranking is only useful if it can be inspected.", body: "GitBounty totals points from individual merge records instead of maintaining an unexplained score. That keeps the history readable and reduces drift.", items: ["Weekly and monthly views surface current momentum.", "Category views show where someone contributes.", "The homepage leaderboard is explicitly illustrative until live data is connected."] },
      { heading: "No purchasable rank.", body: "Points cannot be bought, sold, withdrawn, or transferred. They are a recognition layer for accepted open-source work.", code: "rank ← verified merges ← repository evidence" },
    ],
    next: [["/contributors", "See what a contribution record contains"], ["/status", "Check integration status"]],
  },
  maintainers: {
    path: "/maintainers",
    title: "Point contributors at the work that matters.",
    lede: "Maintainers can signal priority with a GitHub label while keeping every technical decision inside the repository.",
    status: "Maintainer setup",
    evidence: [["LABEL", "gitbounty:40"], ["AUTHORITY", "Repository maintainers"], ["REVIEW", "Native GitHub workflow"], ["COST", "No payment flow"]],
    sections: [
      { heading: "Start with one label.", body: "Create a repository label using the format gitbounty:<points>, then apply it to an open issue whose scope and acceptance criteria are ready for contributors.", items: ["Use a whole-number point value.", "Explain the expected outcome in the issue.", "Keep contribution and security guidance in the repository."] },
      { heading: "Merge remains the source of truth.", body: "A label signals the issue value; it does not guarantee acceptance. Points are recorded only after qualifying work is merged.", code: "gitbounty:40 + valid merge → 45 points" },
    ],
    next: [["/extension", "Preview labels directly on GitHub"], ["/docs", "Read the project documentation"]],
  },
  extension: {
    path: "/extension",
    title: "See the signal without leaving GitHub.",
    lede: "The optional Chrome extension adds compact GitBounty point badges beside matching issue labels. The website remains the complete product.",
    status: "Chrome extension · developer preview",
    evidence: [["VERSION", "0.1.0"], ["ACCESS", "GitHub issue pages only"], ["SIGN-IN", "Not required"], ["STORE RELEASE", "Not published yet"]],
    sections: [
      { heading: "Install the developer preview.", body: "Clone the GitBounty repository, open chrome://extensions, enable Developer mode, choose Load unpacked, and select frontend/extension.", items: ["Create or open an issue labeled gitbounty:40.", "Refresh the GitHub issue page after loading the extension.", "Look for the GB +40 PTS badge beside the label."] },
      { heading: "Deliberately small permissions.", body: "The first slice reads labels already present on GitHub issue pages. It contains no secrets, requests no broad browser permissions, and has no toolbar popup yet.", code: "github.com issue page → gitbounty:40 → GB +40 PTS" },
    ],
    next: [["https://github.com/dipesh4000/gitbounty/tree/feat/open-source-ledger-landing/frontend/extension", "View extension source ↗"], ["/privacy", "Read the privacy summary"]],
  },
  contributors: {
    path: "/contributors",
    title: "Your work should outlive the feed.",
    lede: "A GitBounty contribution record organizes merged work into an inspectable history: what changed, where it landed, and what recognition it earned.",
    status: "Contributor record",
    evidence: [["IDENTITY", "GitHub account"], ["UNIT", "Merged pull request"], ["CATEGORY", "Work type"], ["PROVENANCE", "Repository + merge URL"]],
    sections: [
      { heading: "Evidence before score.", body: "Every award retains its repository and merge reference so a total can be traced back to actual work.", items: ["Repository and pull-request identity.", "Merge time and work category.", "Baseline and issue-point breakdown."] },
      { heading: "Built for a body of work.", body: "The record is meant to show a pattern across repositories and categories—not compress someone’s contribution into one context-free number.", code: "work history > vanity metric" },
    ],
    next: [["/leaderboard", "See how rankings work"], ["/how-it-works", "Follow the contribution workflow"]],
  },
  docs: {
    path: "/docs",
    title: "The operating manual, without the fog.",
    lede: "Start with the workflow that matches your role. Every guide stays grounded in the points product that exists today.",
    status: "Documentation index",
    evidence: [["CONTRIBUTORS", "Find · build · merge"], ["MAINTAINERS", "Label · review · merge"], ["EXTENSION", "Optional preview"], ["MONEY", "Out of scope"]],
    sections: [
      { heading: "For contributors.", body: "Learn how issues are discovered, how merged work is verified, and what appears in a contribution record.", items: ["Explore open work.", "Understand point provenance.", "Read the leaderboard model."] },
      { heading: "For maintainers and builders.", body: "Use GitHub labels for issue values, preserve native repository review, and inspect the open implementation.", code: "product truth: points and recognition—not escrow" },
    ],
    next: [["/how-it-works", "Contributor workflow"], ["/maintainers", "Maintainer setup"], ["/extension", "Extension setup"]],
  },
  privacy: {
    path: "/privacy",
    title: "Privacy should be legible too.",
    lede: "This is the current developer-preview summary, not a substitute for the final policy that will accompany public launch.",
    status: "Privacy summary · prelaunch",
    evidence: [["OAUTH", "Minimum read:user scope"], ["SESSION", "Signed user ID only"], ["TOKEN", "Encrypted at rest"], ["EXTENSION", "No sign-in in v0.1"]],
    sections: [
      { heading: "What the product needs.", body: "GitBounty uses GitHub identity to connect a contribution record to the correct person and to request that person’s public merged work.", items: ["The OAuth flow requests read:user, not private-repository access.", "The browser session stores only a signed internal user ID.", "GitHub access tokens are encrypted before database storage."] },
      { heading: "What the extension does.", body: "The developer-preview extension reads matching labels from GitHub issue pages. It does not sign you in, collect form input, or contain private credentials.", code: "permission surface: GitHub issue pages" },
    ],
    next: [["/terms", "Read the prelaunch terms"], ["/status", "See what is live"]],
  },
  terms: {
    path: "/terms",
    title: "Points are recognition, not value.",
    lede: "These prelaunch terms describe the product boundary plainly while the formal launch terms are still being prepared.",
    status: "Terms summary · prelaunch",
    evidence: [["POINTS", "Non-transferable"], ["CASH VALUE", "None"], ["WORKFLOW", "Repository-controlled"], ["AVAILABILITY", "Developer preview"]],
    sections: [
      { heading: "No money promise.", body: "GitBounty points are not currency, tokens, securities, or redeemable value. They cannot be purchased, sold, transferred, or withdrawn." },
      { heading: "Repositories set the rules for contribution.", body: "Using GitBounty does not override a repository’s license, contribution guide, code of conduct, review decisions, or maintainer authority.", items: ["A point label does not guarantee merge or acceptance.", "Abusive or manipulated activity may be excluded.", "Features and availability can change during the developer preview."] },
    ],
    next: [["/privacy", "Privacy summary"], ["/docs", "Return to docs"]],
  },
  status: {
    path: "/status",
    title: "What works. What is next.",
    lede: "GitBounty is in active development. This page separates shipped code from integrations that still need production configuration.",
    status: "Build status · developer preview",
    evidence: [["WEBSITE", "Public landing live"], ["OAUTH CODE", "Integrated"], ["OAUTH CONFIG", "Pending environment values"], ["EXTENSION", "Local preview available"]],
    sections: [
      { heading: "Available now.", body: "The multi-page website, points-ledger backend, GitHub OAuth implementation, merged-PR detection, leaderboards, and first Chrome extension slice exist in the project.", items: ["The public landing experience is shareable.", "Backend and frontend test suites cover the current contracts.", "The extension can mark gitbounty:<points> labels locally."] },
      { heading: "Still being connected.", body: "Production OAuth credentials and the live issue-directory API are not configured yet. Until they are, public pages label previews and pending integrations directly.", code: "code ready ≠ production configured" },
    ],
    next: [["/extension", "Install the extension preview"], ["https://github.com/dipesh4000/gitbounty", "Follow development on GitHub ↗"]],
  },
} satisfies Record<string, PageSpec>;

export type PageKey = keyof typeof pages;

export function InteriorPage({ page }: { page: PageKey }) {
  const spec = pages[page];
  return (
    <MarketingShell current={spec.path}>
      <section className="mp-hero">
        <div className="mp-shell mp-hero-grid">
          <div><h1>{spec.title}</h1><p>{spec.lede}</p><div className="mp-status-line"><span />{spec.status}</div></div>
          <dl className="mp-evidence">{spec.evidence.map(([term, value]) => <div key={term}><dt>{term}</dt><dd>{value}</dd></div>)}</dl>
        </div>
      </section>
      <div className="mp-content">
        {spec.sections.map((section, index) => (
          <section className="mp-section" key={section.heading}>
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
      <section className="mp-next"><div className="mp-shell"><h2>Continue through the ledger.</h2><div>{spec.next.map(([href, label]) => <Link href={href} key={href}>{label}<span aria-hidden="true">→</span></Link>)}</div></div></section>
    </MarketingShell>
  );
}
