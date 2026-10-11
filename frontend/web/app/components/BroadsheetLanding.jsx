"use client";

import React from "react";
import Image from "next/image";
import { useAuth, loginHref } from "./AuthProvider";
import { useApiResource } from "../lib/useApiResource";
import { formatPoints } from "../lib/api";

const steps = [
  ["01", "Pick an issue", "Maintainers choose an open issue in a repository they manage."],
  ["02", "Publish a reward", "Set the category and points. The bounty appears on the public board."],
  ["03", "Ship the fix", "Contributors open a pull request that closes the rewarded issue."],
  ["04", "Keep the credit", "After an eligible merge, points follow the PR author's GitHub identity."],
];

export default function BroadsheetLanding() {
  const { user, error, signOut } = useAuth();
  const { resource, reload } = useApiResource("/api/issues?per_page=4&sort=updated");
  const issues = resource.data?.items ?? [];
  return <div className="reward-site">
    <a className="skip" href="#top">Skip to main content</a>
    <div className="ann"><a href="/extension">The GitBounty extension puts rewards inside GitHub →</a></div>
    <header><div className="w sn">
      <a className="brand" href="/"><Image src="/icon-192.png" width={34} height={34} alt="" />GitBounty</a>
      <nav className="nl" aria-label="Primary"><a className="nb" href={user ? "/explore" : loginHref("/explore")}>Explore bounties</a><a className="nb" href="#how">How it works</a><a className="nb" href="/docs">Docs</a></nav>
      <div className="na">
        {user ? <React.Fragment><a className="si" href={user ? "/explore" : loginHref("/explore")}>@{user.github_login}</a><button className="b s" onClick={signOut}>Sign out</button></React.Fragment>
          : <a className="b s" href={loginHref()}>Sign in with GitHub</a>}
        <a className="b s p" href={user ? "/maintainers" : loginHref("/maintainers")}>Create a bounty</a>
      </div>
    </div></header>
    {error && <p className="w auth-notice" role="status">{error}</p>}
    <main id="top">
      <section className="sh"><div className="w">
        <p className="hero-eyebrow"><i /> Built for the work worth shipping</p>
        <h1>Turn GitHub issues into <span>opportunities.</span></h1>
        <p className="lead">Point rewards for GitHub issues, and a contribution history that follows the PR author.</p>
        <div className="cta"><a className="b p" href={user ? "/explore" : loginHref("/explore")}>Explore bounties</a><a className="b" href={user ? "/maintainers" : loginHref("/maintainers")}>Create a bounty</a></div>
        <div className="stage"><div className="win" aria-label="Illustrative reward example">
          <div className="bar"><span className="dots"><i /><i /><i /></span><span className="url">github.com/acme/webkit/issues/3847</span><span className="xt">GitBounty</span></div>
          <div className="gh"><div className="ghm">
            <h2>Task queue stalls when concurrency exceeds worker count <small>#3847</small></h2>
            <p className="m"><span className="open">Open</span> kenji-r opened this issue · 3 comments</p>
            <div className="cm"><b>kenji-r</b><p>Once in-flight tasks pass the worker pool size, the queue stops draining. Repro: <code>bench/queue.test.ts</code></p></div>
            <ul className="tl"><li><i /><span><b>mira-dev</b> opened pull request <u>#412</u> that closes this issue</span></li><li><i /><span><b>kenji-r</b> merged <u>#412</u></span></li><li className="hl"><i /><span><b>GitBounty</b> recorded <b>250 pts</b> for <b>@mira-dev</b></span></li></ul>
          </div><aside className="ghs"><div><h3>Labels</h3><span className="lb">bug</span><span className="lb">good first issue</span></div><div className="gb"><h3>GitBounty reward</h3><div className="pts">250 <span>pts</span></div><ul><li>Earned after an eligible closing PR merges</li><li>Goes to the PR author&apos;s GitHub account</li></ul></div></aside></div>
        </div><div className="fl"><b>@mira-dev · Contribution history</b><div className="pts">+250 <span>pts</span></div><small>acme/webkit#412 merged</small></div></div>
        <p className="cap">Illustrative interface. Names and values are placeholders. Rewards are points.</p>
        <a className="scroll-cue" href="#how">Discover the workflow <span aria-hidden="true">↓</span></a>
      </div></section>
      <div className="reward-trust"><div className="w"><span>Built for open source</span><span>GitHub identities</span><span>Issue rewards</span><span>Merged pull requests</span><span>Contribution history</span></div></div>
      <section className="s" id="how"><div className="w"><h2>From issue to contribution history.</h2><p className="sub">A familiar GitHub workflow, with a reason to pick up the next issue.</p><div className="reward-steps">{steps.map(([number,title,copy]) => <div className="win pad" key={number}><span className="pt">{number}</span><h3>{title}</h3><p>{copy}</p></div>)}</div></div></section>
      <section className="s alt" id="contributors"><div className="w sp"><div className="t"><h2>Find work worth your evening.</h2><p className="sub">Browse published bounties, filter by technology and category, and open the issue on GitHub when one fits.</p><a className="b p section-action" href={user ? "/explore" : loginHref("/explore")}>Browse all bounties →</a></div>
        <div className="win pad" aria-live="polite">
          <div className="bar">Published bounties</div>
          {resource.status === "loading" && <p className="em">Loading published bounties…</p>}
          {resource.error && <div className="em"><p>Published bounties didn’t load. {resource.error}</p><button className="b" onClick={reload}>Retry</button></div>}
          {resource.status === "ready" && !issues.length && <div className="em"><p>No bounties have been published yet.</p><a className="b" href={user ? "/maintainers" : loginHref("/maintainers")}>Publish the first bounty</a></div>}
          <ul>{issues.map(issue => <li key={issue.id}><a className="row" href={user ? issue.html_url : loginHref()}><div><b>{issue.title}</b><small>{issue.repository} #{issue.number} · {issue.language || issue.category}</small></div><span className="pt">+{formatPoints(issue.points)}</span></a></li>)}</ul>
        </div>
      </div></section>
      <section className="s" id="maintainers"><div className="w sp r"><div className="t"><h2>Set the reward. Show the rules.</h2><p className="sub">Choose your repository and an open issue, set the points, then review and publish. Manage everything you have published in one place.</p><a className="b p section-action" href={user ? "/maintainers" : loginHref("/maintainers")}>Create a bounty</a></div><div className="win pad"><span className="pt">For repository maintainers</span><div className="big">1–1,000 <span>pts</span></div><ul className="rules"><li>Publish on repositories you administer or maintain</li><li>Rewards follow the eligible closing PR author</li><li>Public issues appear on the website and extension</li><li>Connect the GitHub App for automatic merge processing</li></ul></div></div></section>
      <section className="s alt" id="extension"><div className="w sp"><div><h2>The reward is already on the issue.</h2><p className="sub">See published point values inside GitHub. Your extension keeps your activity and contribution history one click away.</p><a className="b section-action" href="/extension">Install the extension →</a></div><div className="win pad"><div className="bar"><span className="xt">GitBounty for GitHub</span></div><div className="ir"><i /><span>Task queue stalls when concurrency exceeds worker count</span><span className="pt">★ 250 pts</span></div><p className="cap">Illustrative issue badge. Only published rewards appear in the extension.</p></div></div></section>
      <section className="s" id="identity"><div className="w sp"><div><p className="section-kicker">A history that stays yours</p><h2>Your work. Your GitHub identity.</h2><p className="sub">Eligible rewards recorded before you join wait under your GitHub account. Sign in and claim them from your points history.</p><a className="b section-action" href={user ? "/leaderboard" : loginHref("/leaderboard")}>See the leaderboard →</a></div>
        <figure className="heat-card"><div className="heat-heading"><h3>Contribution activity</h3><span>Example profile</span></div>
          <div className="heat-months" aria-hidden="true"><span>Jan</span><span>Feb</span><span>Mar</span><span>Apr</span><span>May</span><span>Jun</span><span>Jul</span><span>Aug</span><span>Sep</span></div>
          <div className="reward-heatmap" role="img" aria-label="Illustrative contribution graph with purple squares showing different activity levels; not account data.">
            {Array.from({ length: 36 * 7 }, (_, i) => <i aria-hidden="true" key={i} data-level={Math.floor(((i * 19 + i * i * 5 + 7) % 17) / 4)} />)}
          </div>
          <div className="heat-legend" aria-hidden="true"><span>Less</span>{[0,1,2,3,4].map(level => <i key={level} data-level={level} />)}<span>More</span></div>
          <figcaption>Illustrative activity, not live account data. Your Points workspace records eligible merges, rewards and claims.</figcaption>
          <div className="heat-note"><span>Linked to your GitHub identity</span><span>Points, always</span></div>
        </figure>
      </div></section>
      <section className="s"><div className="w"><div className="fin"><Image src="/reward-mascot-1.png" width={150} height={169} alt="GitBounty cat holding a reward coin" /><div><h2>Start with one issue.</h2><p className="sub">Publish a reward as a maintainer, or find the next thing worth picking up.</p><div className="cta section-action"><a className="b p" href={user ? "/explore" : loginHref("/explore")}>Explore bounties</a><a className="b" href={user ? "/maintainers" : loginHref("/maintainers")}>Create a bounty</a></div></div></div></div></section>
    </main>
    <footer><div className="w"><a className="brand" href="/">GitBounty</a><span>© 2026 GitBounty</span><nav aria-label="Footer"><a href="/docs">Docs</a><a href="https://github.com/dipesh4000/gitbounty">GitHub</a><a href="/privacy">Privacy</a><a href="/terms">Terms</a></nav></div></footer>
  </div>;
}
