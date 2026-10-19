"use client";

import { useEffect, useRef, useState } from "react";
import Image from "next/image";
import { useAuth, loginHref } from "./AuthProvider";
import { LandingBounties } from "./LandingBounties";

const flows=[['01 / Published bounty','A clear issue. A visible reward.','Published by a maintainer through the GitBounty GitHub App. Read the requirements and discuss your approach before you start.','acme/webkit #128\nMake keyboard navigation work for everyone','Frontend · Accessibility','40 bounty points'],['02 / Pull request','Your code. Their review.','Open a pull request that closes the issue and go through the normal GitHub review process. No GitBounty account needed yet — eligibility follows the PR.','feat: add keyboard focus to filter menu\nCloses #128 · PR #142 by @sam-dev','Review and merge on GitHub','Contribution in progress'],['03 / Contribution recorded','Merged work. Lasting credit.','GitHub sends a webhook when the PR merges. GitBounty checks it against eligibility rules, then allocates points to the author’s GitHub ID — even before they’ve signed up.','@sam-dev · acme/webkit #142\n40 bounty points + 5 baseline points','Recorded for the PR author','45 points to claim']];
const roles={contributor:[['01 / CONNECT','Bring your GitHub identity.','Sign in to explore bounties and keep your work connected to your account.'],['02 / CONTRIBUTE','Find something you can fix.','Choose an issue, follow the contribution guide, and open your pull request.'],['03 / BUILD YOUR RECORD','Make the merge count.','After an eligible merge, claim your allocated points and see the contribution in your history.']],maintainer:[['01 / CONNECT','Bring your project.','Sign in with GitHub, then connect the GitBounty GitHub App to a public repository you administer or maintain.'],['02 / PUBLISH','Point to the work that matters.','Choose an open issue, set a category and point reward, then review and publish.'],['03 / REVIEW','Keep your GitHub workflow.','Review the contribution and merge when ready. Connect the GitHub App for automatic merge processing.']]};
const colors=["#242032","#392347","#593073","#8550b2","#bd8af0"];

function onTabKey(event) {
  const tabs=Array.from(event.currentTarget.querySelectorAll("[role=tab]"));
  const current=tabs.indexOf(document.activeElement);
  let next;
  if (["ArrowRight","ArrowDown"].includes(event.key)) next=(current+1)%tabs.length;
  else if (["ArrowLeft","ArrowUp"].includes(event.key)) next=(current-1+tabs.length)%tabs.length;
  else if (event.key === "Home") next=0;
  else if (event.key === "End") next=tabs.length-1;
  else return;
  event.preventDefault(); tabs[next].focus(); tabs[next].click();
}

export default function BroadsheetLanding() {
  const {user,error}=useAuth();
  const destination=path => user ? path : loginHref(path);
  const [flow,setFlow]=useState(0);
  const [role,setRole]=useState("contributor");
  const root=useRef(null);
  useEffect(() => {
    const element=root.current;
    const motion=window.matchMedia?.("(prefers-reduced-motion: reduce)");
    let frame;
    const update=() => {
      const y=window.scrollY;
      element.querySelector("#nav").classList.toggle("scrolled",y>10);
      const max=document.documentElement.scrollHeight-window.innerHeight;
      element.style.setProperty("--p",max>0 ? String(y/max) : "0");
      element.querySelectorAll("[data-speed]").forEach(node => {
        node.style.translate=motion?.matches ? "none" : "0 "+(y*Number(node.dataset.speed))+"px";
      });
    };
    const scroll=() => {cancelAnimationFrame(frame); frame=requestAnimationFrame(update);};
    const hero=element.querySelector(".hero");
    const glow=event => {
      if(motion?.matches) return;
      const bounds=hero.getBoundingClientRect();
      hero.style.setProperty("--mx",(event.clientX-bounds.left)+"px");
      hero.style.setProperty("--my",(event.clientY-bounds.top)+"px");
    };
    hero.addEventListener("pointermove",glow);
    const observer=typeof IntersectionObserver === "undefined" ? null : new IntersectionObserver(entries => {
      entries.forEach(entry => {if(entry.isIntersecting){entry.target.classList.add("in");observer.unobserve(entry.target);}});
    },{threshold:.12});
    if(observer){element.classList.add("enhanced");element.querySelectorAll(".reveal").forEach(node => observer.observe(node));}
    window.addEventListener("scroll",scroll,{passive:true});
    motion?.addEventListener("change",scroll);
    update();
    return () => {window.removeEventListener("scroll",scroll);hero.removeEventListener("pointermove",glow);motion?.removeEventListener("change",scroll);cancelAnimationFrame(frame);observer?.disconnect();element.classList.remove("enhanced");};
  },[]);
  return <div className="landing-preview" ref={root}>
{error && <p role="status" className="wrap">{error}</p>}

<a className="skip" href="#main">Skip to content</a>
<div className="progress" aria-hidden="true"></div>
<div className="notice"><b>BUILT FOR OPEN SOURCE</b> &nbsp; / &nbsp; Your GitHub identity. Your contribution history.</div>

<header className="nav" id="nav">
  <div className="wrap navrow">
    <a className="brand" href="/"><Image src="/favicon.svg" width={32} height={32} unoptimized alt="" />GitBounty</a>
    <nav className="navlinks" aria-label="Primary">
      <a href="#workflow">How it works</a>
      <a href="#published">Browse issues</a>
      <a href="#identity">For contributors</a>
      <a href="/wallet">App wallet</a>
    </nav>
    <div className="actions">
      <a className="signin btn"  href={user ? "/explore" : loginHref()}>{user ? "@"+user.github_login : "Sign in with GitHub"}</a>
      <a className="btn primary"  href={destination("/explore")}>Explore bounties <span aria-hidden="true">↗</span></a>
    </div>
    <details className="landing-mobile-menu"><summary>Menu</summary><nav aria-label="Mobile navigation"><a href="#published">Browse issues</a><a href="/bounties">Fuji escrow bounties</a><a href="#workflow">How it works</a><a href="/maintainers">Maintainer workspace</a><a href="/docs">Docs</a></nav></details>
  </div>
</header>

<main id="main">

<section className="hero" id="top">
  <div className="hero-glow" aria-hidden="true"></div>
  <div className="wrap hero-inner">
    <div className="hero-heading">
    <div className="hero-copy">
    <a className="announcement reveal" href="#workflow"><span>OPEN SOURCE, WITH REWARDS</span><b aria-hidden="true">→</b></a>
    <h1 className="reveal">Build open source.<span>Get rewarded.</span></h1>
    <p className="intro reveal">Pick an issue worth solving. Ship your fix on GitHub. Build your reputation and claim funded rewards—all from one place.</p>
    <div className="actions reveal">
      <a className="btn primary"  href={destination("/explore")}>Explore bounties <span aria-hidden="true">↗</span></a>
      <a className="btn"  href={destination("/maintainers")}>Create a bounty <span aria-hidden="true">→</span></a>
    </div>
    <p className="micro reveal"><a href="#published">Browse without signing in ↓</a> · App-managed wallets · SmoothSend-sponsored flow</p>
    <p className="sample">Avalanche Fuji demo · Test USDC has no monetary value</p>
    </div>
    <Image className="hero-mascot" src="/mascot-backpack_phone.svg" width={270} height={297} unoptimized alt="" aria-hidden="true" />
    </div>

    <div className="stage reveal">
      <div className="window hero-window">
        <div className="windowbar"><i className="dot"></i><i className="dot"></i><i className="dot"></i><span className="address">github.com / acme / webkit / issues / 128</span><b>GitBounty for GitHub</b></div>
        <div className="issuebody">
          <div className="issue-main">
            <div className="repo"><span>acme</span> / <span>webkit</span> &nbsp; · &nbsp; Public repository</div>
            <h2>Make keyboard navigation work for everyone <small>#128</small></h2>
            <div className="meta"><span className="pill">◉ Open</span> opened by alex-dev · 3 comments</div>
            <div className="comment">
              <div className="avatar">a</div>
              <div><b>alex-dev</b><p>The filter menu should be easy to use without a mouse. Let&apos;s make every option reachable with <span className="code">Tab</span>.</p></div>
            </div>
          </div>
          <aside className="issue-side">
            <div className="label">On this issue</div>
            <div className="tags">accessibility &nbsp; · &nbsp; frontend</div>
            <div className="reward">
              <div className="eyebrow" style={{"fontSize":"8px"}}>GitBounty reward</div>
              <strong>40 <small>points</small></strong>
              <p>For the author of the eligible closing pull request.</p>
            </div>
          </aside>
        </div>
      </div>
      <div className="receipt-float">
        <span className="check" aria-hidden="true">✓</span>
        <div><strong>Contribution recognised</strong><p>@sam-dev · Pull request #142 merged</p></div>
        <span className="number">+45 <small>pts</small></span>
      </div>
    </div>
    <p className="sample">Illustrative interface. Names and values are placeholders. 40 bounty points + 5 baseline points.</p>
  </div>
</section>

<section className="showcase" aria-labelledby="showcase-title">
  <div className="wrap">
    <div className="showcase-heading reveal">
      <p className="eyebrow">Everything connected to the work</p>
      <h2 id="showcase-title">From an issue to<br /><span>your contribution record.</span></h2>
      <p>A GitHub webhook tells GitBounty when a pull request merges, so credit always lands on the GitHub account that opened it &mdash; verified, not self-reported.</p>
    </div>
    <div className="showcase-scene">
      <div className="showcase-stack">
        <article className="showcase-card reveal">
          <small>01 / DISCOVER</small>
          <strong>Published issues</strong>
          <div className="showcase-item"><span>◉</span><span>Make keyboard navigation work</span><b>40 pts</b></div>
          <div className="showcase-item"><span>◉</span><span>Document the setup flow</span><b>20 pts</b></div>
        </article>
        <article className="showcase-card reveal">
          <small>02 / BUILD</small>
          <strong>A pull request on GitHub</strong>
          <div className="showcase-code">+ focus-visible support<br />+ keyboard filter controls<br /><span>Closes #128 · PR #142</span></div>
        </article>
      </div>
      <div className="showcase-mascot reveal">
        <Image className="mascot" src="/mascot-magnifier.svg" width={302} height={298} unoptimized alt="GitBounty mascot inspecting a contribution with a magnifying glass" />
        <span className="orbit orbit-one" aria-hidden="true">✳</span>
        <span className="orbit orbit-two" aria-hidden="true">+</span>
      </div>
      <article className="showcase-card showcase-result reveal">
        <small>03 / RECOGNISE</small>
        <strong>Contribution recorded</strong>
        <div className="showcase-result-score">+45 <span>points</span></div>
        <p>For @sam-dev, the author of the eligible merged pull request.</p>
        <div className="showcase-result-foot"><span>40 bounty + 5 baseline</span><span>✓ Verified work</span></div>
      </article>
    </div>
    <p className="sample">Illustrative product scene · actual awards depend on GitBounty&apos;s eligibility rules</p>
  </div>
</section>

<div className="principles" aria-label="GitBounty principles">
  <div className="ticker">
    <span>Verified by GitHub webhooks</span><span>Public repositories only</span><span>Points have no cash value</span><span>Credit to the PR author, always</span>
    <span aria-hidden="true">Verified by GitHub webhooks</span><span aria-hidden="true">Public repositories only</span><span aria-hidden="true">Points have no cash value</span><span aria-hidden="true">Credit to the PR author, always</span>
  </div>
</div>

<LandingBounties />
<section className="section reward-guide" aria-labelledby="reward-guide-title"><div className="wrap">
  <p className="eyebrow">Before you start</p><h2 id="reward-guide-title">Know what you’re earning.</h2>
  <div className="reward-guide-grid">
    <article><span>01 / REPUTATION</span><h3>Points follow your work.</h3><p>A 40-point bounty plus an eligible 5-point baseline earns 45 points, recorded as separate awards. Points cannot be exchanged for money.</p></article>
    <article><span>02 / FUNDING</span><h3>Check the deposit.</h3><p>For escrow rewards, inspect the public proof page. An approval or published amount alone does not mean USDC is funded.</p><a href="/bounties">Inspect escrow rewards ↗</a></article>
    <article><span>03 / CLAIM</span><h3>Claim inside the app.</h3><p>Merge within the funded work window, then confirm your claim before the seven-day grace expires. The sponsored path uses your app wallet and SmoothSend gas credits.</p></article>
  </div>
  <div className="landing-faq"><h3>A few things worth knowing</h3>
    <details><summary>Do I need a wallet to start contributing?</summary><p>No. Browse issues and contribute through GitHub first. With managed wallets enabled, GitBounty creates and controls an encrypted signing wallet for your account. Supported reward transactions use SmoothSend sponsorship.</p></details>
    <details><summary>Does merging a pull request automatically pay me?</summary><p>No. GitBounty verifies eligibility and reserves the reward for the PR author’s numeric GitHub identity. The author submits a claim, and the app verifies the on-chain transfer.</p></details>
    <details><summary>What happens if I miss the claim deadline?</summary><p>The escrow can return unclaimed USDC to the payer after the displayed deadline, including when points were already awarded. An off-chain award does not extend the claim window.</p></details>
    <details><summary>Who verifies the contribution?</summary><p>GitBounty checks GitHub evidence and its backend signer authorizes the recipient. The Avalanche contract enforces that authorization and prevents a second payout.</p></details>
  </div>
</div></section>
<section className="section">
  <div className="wrap">
    <div className="section-head reveal">
      <div>
        <p className="eyebrow">A little direction. A lot of possibility.</p>
        <h2>Less searching.<br />More shipping.</h2>
      </div>
      <p>Give meaningful work a place to be discovered. Give the people who do it a record to keep.</p>
    </div>
    <div className="cards">
      <article className="card reveal">
        <div className="mini">
          <div className="mini-line"><span>◉ Fix keyboard focus</span><b>40 pts</b></div>
          <div className="mini-line"><span>◉ Improve the setup guide</span><b>20 pts</b></div>
          <div className="mini-line"><span>◉ Add regression coverage</span><b>60 pts</b></div>
        </div>
        <h3>Find your kind of work.</h3>
        <p>Browse GitBounty-registered rewards on public repositories. External bounty labels aren&apos;t GitBounty rewards — only what&apos;s published here counts.</p>
      </article>
      <article className="card reveal">
        <div className="mini">
          <div className="mini-line"><span>Reward for this issue</span><span>↗</span></div>
          <div className="amount">40 <small>points</small></div>
          <div className="mini-line"><span className="category">Frontend</span><span>Ready to publish ✓</span></div>
        </div>
        <h3>Make priorities visible.</h3>
        <p>Connect a public repository through the GitBounty GitHub App, choose an issue, set its point reward, and publish.</p>
      </article>
      <article className="card reveal">
        <div className="mini">
          <div className="mini-line"><span style={{"color":"#b58cfa"}}>⑂ Pull request merged</span><b>+45 pts</b></div>
          <div className="ruleline"></div>
          <div className="ruleline short"></div>
          <div className="mini-line"><span>Recorded for @sam-dev</span><span>✓</span></div>
        </div>
        <h3>Keep the credit.</h3>
        <p>GitHub sends a webhook on merge. GitBounty checks it against eligibility rules, then credits the PR author — not whoever clicked merge.</p>
      </article>
    </div>
  </div>
</section>

<section id="workflow" className="section connected">
  <div className="wrap split">
    <div className="reveal">
      <p className="eyebrow">One familiar workflow</p>
      <h2>From “I can fix that”<br />to “I built that.”</h2>
      <p className="desc">Maintainers connect a public repository through the GitBounty GitHub App and publish rewards on the issues they choose. The work itself still happens as a normal GitHub pull request.</p>
      <div className="flowtabs" role="tablist" tabIndex={-1} onKeyDown={onTabKey} aria-label="Contribution workflow" aria-orientation="vertical">
        <button className="flowtab" id="flow-tab-0" role="tab" aria-selected={flow === 0} aria-controls="flow-panel" data-flow="0" tabIndex={flow === 0 ? 0 : -1} onClick={() => setFlow(0)}><span className="stepnum">01</span>Find a published issue<span className="arr" aria-hidden="true">↗</span></button>
        <button className="flowtab" id="flow-tab-1" role="tab" aria-selected={flow === 1} aria-controls="flow-panel" data-flow="1" tabIndex={flow === 1 ? 0 : -1} onClick={() => setFlow(1)}><span className="stepnum">02</span>Make your contribution<span className="arr" aria-hidden="true">↗</span></button>
        <button className="flowtab" id="flow-tab-2" role="tab" aria-selected={flow === 2} aria-controls="flow-panel" data-flow="2" tabIndex={flow === 2 ? 0 : -1} onClick={() => setFlow(2)}><span className="stepnum">03</span>Build your record<span className="arr" aria-hidden="true">↗</span></button>
      </div>
    </div>
    <div className="reveal">
      <div className="window" id="flow-panel" role="tabpanel" aria-labelledby={"flow-tab-"+flow} tabIndex={0}>
        <div className="windowbar"><i className="dot"></i><i className="dot"></i><i className="dot"></i><span className="address">The contribution journey</span></div>
        <div className="flow-preview" id="flow-box">
          <span className="state" id="flow-state">{flows[flow][0]}</span>
          <h3 id="flow-title">{flows[flow][1]}</h3>
          <p id="flow-desc">{flows[flow][2]}</p>
          <div className="flow-code" id="flow-code">{flows[flow][3]}</div>
          <div className="flow-footer"><span id="flow-label">{flows[flow][4]}</span><b id="flow-value">{flows[flow][5]}</b></div>
        </div>
      </div>
      <p className="sample">Interactive product illustration · select a step to explore</p>
    </div>
  </div>
</section>

<section id="identity" className="section identity">
  <div className="wrap split">
    <div className="reveal">
      <div className="profile">
        <div className="profilehead"><div className="avatar">s</div><div><b>Sam Developer</b><p>@sam-dev</p></div><span>Contributor</span></div>
        <div className="stats"><div><strong>245</strong><small>Points earned</small></div><div><strong>9</strong><small>Merged contributions</small></div></div>
        <div className="label">A little progress, day after day.</div>
        <div id="graph" className="graph" role="img" aria-label="Illustrative purple contribution activity over 26 weeks">{Array.from({length:182}, (_,i) => <span className="cell" key={i} style={{background:colors[(i*17+i%9*7)%11<4?0:(i*13)%4+1]}} />)}</div>
        <div className="legend"><span>Contribution activity</span><span>Less <i style={{"background":"#242032"}}></i><i style={{"background":"#44285f"}}></i><i style={{"background":"#593073"}}></i><i style={{"background":"#bf8bff"}}></i> More</span></div>
        <div className="activity"><span style={{"color":"#bc8dec"}}>⑂</span><span>Keyboard navigation improved<br /><span style={{"color":"#827d93"}}>acme/webkit · #142</span></span><b>+45 pts</b></div>
      </div>
      <p className="sample">Example profile and activity. Not live account data.</p>
    </div>
    <div className="reveal">
      <p className="eyebrow">A record that belongs to you</p>
      <h2>Your work adds up.<br />Let it show.</h2>
      <p className="desc">Build a history of the projects you helped move forward, one merged contribution at a time.</p>
      <ul>
        <li>Every point traces back to a specific merged pull request.</li>
        <li>Rewards follow your GitHub numeric ID, not your username &mdash; a handle change never breaks a claim.</li>
        <li>Points earned before you had an account stay allocated and wait for you to claim.</li>
      </ul>
      <a className="btn"  href={destination("/leaderboard")} style={{"marginTop":"28px"}}>Meet the contributors <span aria-hidden="true">↗</span></a>
    </div>
  </div>
</section>

<section id="extension" className="extension">
  <div className="wrap split">
    <div className="reveal">
      <p className="eyebrow">Right where you already work</p>
      <h2>A sidekick for<br />your next contribution.</h2>
      <p className="desc">See GitBounty-registered point rewards beside the issue on GitHub &mdash; not just any bounty label someone pasted into the title. Public repositories only.</p>
      <a className="btn"  href={"/extension"} style={{"marginTop":"28px"}}>Install the extension <span aria-hidden="true">↗</span></a>
      <p className="micro" style={{"marginTop":"13px","textAlign":"left"}}>Chrome, Edge &amp; Brave · manual developer installation · no sign-in required to browse</p>
    </div>
    <div className="ext-box reveal">
      <div className="repo"><span>⌘ &nbsp; acme / webkit</span><span>Issues</span></div>
      <div className="ext-row"><span>◉</span><span>Make keyboard navigation<br />work for everyone</span><b>✳ 40 pts</b></div>
      <div className="ext-row dim"><span>◉</span><span>Update browser support docs</span></div>
      <div className="ext-row dim"><span>◉</span><span>Improve empty state copy</span></div>
      <p className="sample">Only GitBounty-registered issues carry a points tag &mdash; the rest show none</p>
    </div>
  </div>
</section>

<section id="start" className="section start">
  <div className="wrap">
    <p className="eyebrow reveal">Your next step</p>
    <h2 className="reveal">Start with what you do best.</h2>
    <p className="reveal">There’s a place for both sides of a pull request.</p>
    <Image className="mascot rocket reveal" src="/mascot-rocket.svg" width={252} height={295} unoptimized alt="GitBounty mascot riding a rocket toward the next issue" />
    <div className="role-switch reveal" role="tablist" tabIndex={-1} onKeyDown={onTabKey} aria-label="Choose your role">
      <button id="role-contributor" role="tab" aria-selected={role === "contributor"} aria-controls="role-panel" data-role="contributor" tabIndex={role === "contributor" ? 0 : -1} onClick={() => setRole("contributor")}>I want to contribute</button>
      <button id="role-maintainer" role="tab" aria-selected={role === "maintainer"} aria-controls="role-panel" data-role="maintainer" tabIndex={role === "maintainer" ? 0 : -1} onClick={() => setRole("maintainer")}>I maintain a project</button>
    </div>
    <div className="start-steps" id="role-panel" role="tabpanel" aria-labelledby={"role-"+role} tabIndex={0}>{roles[role].map(([number,title,copy]) => <article className="start-step" key={number}><span>{number}</span><h3>{title}</h3><p>{copy}</p></article>)}</div>
    <a className="btn primary reveal" id="role-cta"  href={role === "maintainer" ? destination("/maintainers") : destination("/explore")}>{role === "maintainer" ? "Publish my first bounty ↗" : "Find my first bounty ↗"}</a>
  </div>
</section>

<section className="final">
  <div className="wrap final-inner">
    <Image className="mascot reveal" src="/mascot-trophy.svg" width={251} height={280} unoptimized alt="GitBounty mascot holding a golden contribution award" />
    <div className="reveal">
      <p className="eyebrow">Small fixes. Lasting contributions.</p>
      <h2>Your next issue<br />could be the one.</h2>
      <p>Help a project move forward. Take your credit with you.</p>
      <div className="actions">
        <a className="btn primary"  href={destination("/explore")}>Explore bounties ↗</a>
        <a className="btn"  href={destination("/maintainers")}>Create a bounty →</a>
      </div>
    </div>
  </div>
</section>

</main>

<footer>
  <div className="wrap">
    <div className="footer-main">
      <div className="footer-brand">
        <a className="brand" href="/"><Image src="/favicon.svg" width={32} height={32} unoptimized alt="" />GitBounty</a>
        <p>Find worthwhile issues. Build a contribution history that follows your GitHub identity.</p>
        <span className="footer-tag">Open-source work, made visible.</span>
      </div>
      <nav className="footer-nav" aria-label="Footer">
        <div>
          <h3>Explore</h3>
          <a href="#workflow">How it works</a>
          <a href="#identity">Contribution history</a>
          <a href="#start">Get started</a>
        </div>
        <div>
          <h3>Product</h3>
          <a href="#extension">Browser extension</a>
          <a href="#workflow">Points workflow</a>
          <a href="#start">For maintainers</a>
        </div>
        <div>
          <h3>Information</h3>
          <a  href={"/docs"}>Docs</a>
          <a  href={"/privacy"}>Privacy</a>
          <a  href={"/terms"}>Terms</a>
        </div>
      </nav>
    </div>
    <div className="footer-bottom">
      <span>© 2026 GitBounty</span>
      <span>Points recognise contributions and have no cash value.</span>
      <a href="#top">Back to top ↑</a>
    </div>
  </div>
</footer>


</div>;
}
