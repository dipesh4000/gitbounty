'use client';

/**
 * GitBounty — the public landing page ("Broadsheet").
 *
 * The issue list and the leaderboard here read the **live** API: `/api/issues` returns bounties
 * maintainers have actually published, and `/api/leaderboard` the real ranking. Both are public
 * endpoints, so this works for a visitor who is not signed in.
 *
 * It used to ship nine invented issues in invented repositories, a nine-person invented leaderboard with
 * totals up to 4,210, an invented "you: rank 27" row, and a visible Live/Loading/Empty/Offline switcher --
 * none of it labelled as sample data in the page itself. A landing page for a product about provenance
 * cannot be made of numbers nobody earned.
 *
 * Styling: inline style objects reading the tokens in globals.css, plus one <style> block for resets and
 * :hover rules. Colours are `var(--token)` so this page and the app cannot drift apart.
 */
import React, { useEffect, useReducer, useRef, useState } from 'react';
import { api, categoryLabel, formatPoints, timeAgo } from '../lib/api';
import { useAuth } from './AuthProvider';

/* ---------- data + behavior ---------- */
const G = 'var(--signal)';
const CATS = ['All','Frontend','Backend','Full-stack','Docs','Testing','DevOps','Design','Mobile'];
const TAXO = [
  ['Frontend','src/components/**/*.tsx','area:ui'],
  ['Backend','server/routes/*.py','area:api'],
  ['Full-stack','app/{api,ui}/**/*','area:api + area:ui'],
  ['Documentation','docs/**/*.md','type:docs'],
  ['Testing','tests/**/*.spec.ts','type:test'],
  ['DevOps','.github/workflows/*.yml','area:ci'],
  ['Design','tokens/*.json','area:design'],
  ['Mobile','android/**/*.kt · ios/**/*.swift','platform:mobile']
];
const TAXO_CAT = ['Frontend','Backend','Full-stack','Docs','Testing','DevOps','Design','Mobile'];
const FAQ = [
  ['Is GitBounty paying real money?','No. Points are a record of recognition. They are not currency, tokens, securities or redeemable value, and they can’t be bought, sold, transferred or withdrawn. Nothing in GitBounty moves money.'],
  ['How are points assigned?','A maintainer signs in, picks an open issue in a repository they administer or maintain, and publishes it as a bounty worth between 1 and 1000 points. When a merged pull request closes that published bounty, its author receives exactly that value, plus the baseline.'],
  ['Does a gitbounty:40 GitHub label award points?','No. Anyone with write access to a repository can add a label, so a label on its own awards nothing. It is used as a suggested value when a maintainer publishes through GitBounty, and the browser extension marks it as a label value rather than an award.'],
  ['Does every merged pull request earn points?','Every merged pull request you authored into a repository that has published at least one GitBounty bounty earns a baseline of 5 points. A bounty’s own value applies on top, only for the pull request that closes it.'],
  ['Who receives the points — the author or whoever merges?','The author of the pull request. GitBounty asks GitHub for the pull requests you authored and that have been merged, so the person credited is the person who did the work.'],
  ['What stops someone from farming points?','Merging your own pull request into your own repository earns nothing, a bounty is awarded once and only once however many pull requests close it, a maintainer cannot collect a bounty they published, values are capped at 1000, and every award keeps the pull request and bounty it came from. Two people deliberately colluding is not solved — that limitation is written down rather than hidden.'],
  ['Is the browser extension required?','No. The extension shows a published bounty’s value beside the issue on GitHub. The website is the complete product and works without it.'],
  ['Does GitBounty replace GitHub’s issue or review workflow?','No. Issues, discussion, review and merge all stay on GitHub. GitBounty reads the merged result and records it.']
];
const STEPS = [
  ['01','FIND','Filter open issues by the work you know.'],
  ['02','BUILD','Open the issue, discuss the approach, and contribute through the repository’s normal workflow.'],
  ['03','MERGE','GitBounty verifies the merged pull request and the issue it closed.'],
  ['04','EARN','Your points, category, repository, and merge evidence become part of your contribution record.']
];
const CHAIN = ['ISSUE','CODE','PULL REQUEST','MERGE','POINTS','REPUTATION'];
const kfmt = n => n >= 1000 ? (n/1000).toFixed(1).replace('.0','') + 'k' : '' + n;
const ago = m => m < 60 ? m + 'm ago' : m < 1440 ? Math.round(m/60) + 'h ago' : Math.round(m/1440) + 'd ago';
let RM = false;

function init(c) {
  const s = c.gb = {q:'',cat:'All',sort:'points',ex:'live',range:'week',lbCat:'All',faq:0,step:0,prog:0,stage:0,pts:0,scrolled:false,w:1280,menu:false,hov:-1,chapter:0,tab:null};
  c.gbSet = p => { Object.assign(s, p); c.forceUpdate(); };
}

function mount(c) {
  const s = c.gb, set = c.gbSet;
  RM = !!(window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches);
  if (RM) set({stage:5, pts:45});
  let raf = 0;
  const onScroll = () => { if (raf) return; raf = requestAnimationFrame(() => { raf = 0;
    const p = {scrolled: scrollY > 24};
    const t = document.getElementById('how-track');
    if (t) { const r = t.getBoundingClientRect(); const span = r.height - innerHeight; const pr = span > 0 ? Math.min(1, Math.max(0, -r.top / span)) : 0; p.prog = Math.round(pr*100)/100; p.step = Math.min(3, Math.floor(pr * 4)); }
    const ch = document.querySelectorAll('[data-chapter]'); let a = 0; ch.forEach((e, i) => { if (e.getBoundingClientRect().top < innerHeight * 0.45) a = i; }); p.chapter = a;
    if (Object.keys(p).some(k => p[k] !== s[k])) c.gbSet(p);
  }); };
  const onResize = () => c.gbSet({w: innerWidth});
  addEventListener('scroll', onScroll, {passive:true}); addEventListener('resize', onResize); onResize();
  const countTo = () => { const t0 = performance.now(); const f = now => { const e = Math.min(1, (now - t0) / 650); c.gbSet({pts: Math.round(45 * (1 - Math.pow(1 - e, 3)))}); if (e < 1) c._pt = requestAnimationFrame(f); }; c._pt = requestAnimationFrame(f); };
  if (!RM) { const tick = () => { if (s.stage < 5) { c.gbSet({stage: s.stage + 1}); if (s.stage === 5) countTo(); c._ht = setTimeout(tick, s.stage === 5 ? 7000 : 1050); } else { c.gbSet({stage:0, pts:0}); c._ht = setTimeout(tick, 900); } }; c._ht = setTimeout(tick, 800); }
  let io = null;
  setTimeout(() => {
    onScroll();
    if (RM || !('IntersectionObserver' in window)) return;
    io = new IntersectionObserver(es => es.forEach(e => { if (e.isIntersecting) { e.target.style.opacity = '1'; e.target.style.transform = 'none'; io.unobserve(e.target); } }), {threshold: 0.06});
    document.querySelectorAll('[data-reveal]').forEach(el => { if (el.getBoundingClientRect().top > innerHeight) { el.style.opacity = '0'; el.style.transform = 'translateY(16px)'; el.style.transition = 'opacity 560ms cubic-bezier(.2,.7,.2,1), transform 560ms cubic-bezier(.2,.7,.2,1)'; io.observe(el); } });
  }, 60);
  c._gbOff = () => { removeEventListener('scroll', onScroll); removeEventListener('resize', onResize); clearTimeout(c._ht); cancelAnimationFrame(c._pt); io && io.disconnect(); };
}
function unmount(c) { c._gbOff && c._gbOff(); }

function vals(c, live) {
  const s = c.gb; if (!s) return {};
  const set = c.gbSet, wide = s.w >= 900;
  /* The un-reached steps of the hero sequence are dimmed, not hidden. 0.14 made their text unreadable --
     axe measured it as a serious contrast failure on the live page, and 0.62 still failed. 0.85 keeps
     the sequence readable as a sequence while leaving every step above the 4.5:1 threshold -- the
     progression is carried by the status line, the progress bar and the lit cell background as well, so
     it does not depend on the text fading to be legible. */
  const op = i => s.stage >= i ? '1' : '0.85';
  const hero = {o1:op(1),o2:op(2),o3:op(3),o4:op(4),o5:op(5),pts:'+' + s.pts,progressScale:s.stage/5,
    status:['ISSUE OPEN','BRANCH PUSHED','DIFF +18 −4','PR OPEN · CHECKS 12/12','MERGED · VERIFYING','VERIFIED · RECORDED'][s.stage],
    statusFg: s.stage >= 4 ? G : 'var(--text-secondary)', mergeBg: s.stage >= 4 ? G : 'var(--line)', totalBg: s.stage >= 5 ? 'var(--signal-dark)' : 'transparent'};
  /* Published bounties, from the live API. `live.issues` is every published bounty the API returned;
     filtering and sorting happen here so the chips respond without another round trip. */
  const q = s.q.trim().toLowerCase();
  const all = live.issues.items;
  let rows = all.filter(i =>
    (s.cat === 'All' || categoryLabel(i.category) === s.cat) &&
    (!q || (i.repository + ' ' + i.title + ' ' + i.labels.join(' ') + ' #' + i.number).toLowerCase().includes(q)));
  rows = [...rows].sort(
    s.sort === 'recent' ? (a,b) => new Date(b.issue_updated_at || 0) - new Date(a.issue_updated_at || 0)
    : s.sort === 'stars' ? (a,b) => b.stars - a.stars
    : (a,b) => b.points - a.points);
  const loading = live.issues.status === 'loading';
  const error = live.issues.status === 'error';
  const issues = rows.map(i => ({
    repo: i.repository, num: i.number, title: i.title, labels: i.labels.slice(0, 3), href: i.html_url,
    numS: '#' + i.number, stars: kfmt(i.stars), updated: timeAgo(i.issue_updated_at),
    catU: categoryLabel(i.category).toUpperCase(),
    ptsS: '+' + formatPoints(i.points), ptsNote: i.posted_by ? '@' + i.posted_by : 'published bounty', ptsFg: G,
    aria: 'View issue ' + i.repository + ' #' + i.number + ' on GitHub',
  }));
  const cats = CATS.map(k => { const on = s.cat === k; return {label:k, count: k === 'All' ? all.length : all.filter(i => categoryLabel(i.category) === k).length, pressed: on ? 'true' : 'false', bg: on ? 'var(--signal-dark)' : 'transparent', fg: on ? G : 'var(--text-secondary)', bd: on ? G : 'var(--line)', onClick: () => set({cat:k})}; });
  const hs = s.step;
  /* These are real tabs, not decoration. They used to be dimmed to 0.4 when not selected, which axe
     measured at 1.95:1 -- a control nobody can read is worse than one that looks less prominent. The
     selected state is carried by the border, the number's colour and the dot, all of which already
     change, so the text stays at full opacity. */
  const steps = STEPS.map((x,i) => ({n:x[0], k:x[1], title:x[2], pressed: i === hs ? 'true' : 'false', op: '1', nFg: i <= hs ? G : 'var(--text-muted)', dot: i <= hs ? G : 'var(--line)', bd: i === hs ? G : 'var(--line)', onClick: () => set({step:i, tab:i})}));
  const how = {progressScale: (typeof document !== 'undefined' && document.getElementById('how-track')) ? s.prog : hs/3, a1: hs >= 1 ? '1' : '0.85', a2: hs >= 2 ? '1' : '0.85', a3: hs >= 3 ? '1' : '0.85',
    status:['OPEN · UNASSIGNED','IN PROGRESS · PR #1910','MERGED · VERIFIED','+45 RECORDED'][hs], statusFg: hs >= 2 ? G : 'var(--text-secondary)', rowBg: hs >= 3 ? 'var(--signal-dark)' : 'transparent', big:['FIND','BUILD','MERGE','EARN'][hs], num:STEPS[hs][0]};
  /* The real leaderboard, for the selected window and category. There is no movement arrow: GitBounty
     does not store a previous ranking, so an up/down indicator could only be invented. */
  const leaders = live.leaderboard.entries.map(l => ({
    rank: String(l.rank).padStart(2,'0'), init: l.github_login.slice(0,2).toUpperCase(),
    user: '@' + l.github_login, pts: formatPoints(l.points),
    merges: l.merges + (l.merges === 1 ? ' merge' : ' merges'),
  }));
  const ranges = [['week','Week'],['month','Month'],['all','All time']].map(([k,l]) => ({label:l, pressed: s.range === k ? 'true' : 'false', fg: s.range === k ? 'var(--signal-ink)' : 'var(--text-secondary)', bg: s.range === k ? G : 'transparent', onClick: () => set({range:k})}));
  /* The signed-in visitor's own position, from the API. Null when signed out or unranked -- never a
     placeholder. */
  const you = live.leaderboard.me && {
    rank: String(live.leaderboard.me.rank).padStart(2,'0'),
    pts: formatPoints(live.leaderboard.me.points),
    merges: live.leaderboard.me.merges + (live.leaderboard.me.merges === 1 ? ' merge' : ' merges'),
  };
  const faq = FAQ.map((x,i) => ({q:x[0], a:x[1], open: s.faq === i, exp: s.faq === i ? 'true' : 'false', sign: s.faq === i ? '−' : '+', id:'faq-' + i, onClick: () => set({faq: s.faq === i ? -1 : i})}));
  const taxo = TAXO.map((t,i) => { const on = s.hov === i; return {n:'0' + (i+1), name:t[0].toUpperCase(), glob:t[1], label:t[2], count: all.filter(x => categoryLabel(x.category) === TAXO_CAT[i]).length + ' open', gOp: (on || !wide) ? '1' : '0', gX: (on || !wide) ? 'none' : 'translateX(-8px)', fg: on ? 'var(--text)' : 'var(--text-secondary)', nFg: on ? G : 'var(--text-muted)', bg: on ? 'var(--canvas-raised)' : 'transparent', onEnter: () => set({hov:i}), onLeave: () => set({hov:-1})}; });
  const chain = CHAIN.map((k,i) => ({k, n:'0' + (i+1), href:'#ch-' + i, fg: i === s.chapter ? 'var(--text)' : i < s.chapter ? 'var(--text-secondary)' : 'var(--text-muted)', dot: i <= s.chapter ? G : 'var(--line)', ring: i === s.chapter ? G : 'transparent'}));
  return {
    wide, narrow: !wide, navWide: s.w >= 1120, navNarrow: s.w < 1120, hero, cats, issues, steps, how, leaders, ranges, you, faq, taxo, chain, catOpts: CATS,
    q: s.q, sort: s.sort, lbCat: s.lbCat, loading, error,
    errorMessage: live.issues.error,
    isEmpty: !loading && !error && rows.length === 0, hasRows: !loading && !error && rows.length > 0,
    resultsLabel: loading ? 'Loading published bounties…'
      : error ? 'Could not reach GitBounty'
      : rows.length + ' published ' + (rows.length === 1 ? 'bounty' : 'bounties') + (s.cat !== 'All' ? ' · ' + s.cat : ''),
    emptyMsg: q || s.cat !== 'All'
      ? 'No published bounty matches those filters.'
      : 'No bounties have been published yet.',
    emptyHint: q || s.cat !== 'All'
      ? 'Try another category, or clear the search.'
      : 'Maintainers publish bounties on their own open issues. Sign in to publish the first one.',
    filtered: Boolean(q) || s.cat !== 'All',
    lbEmpty: !live.leaderboard.loading && leaders.length === 0,
    lbLoading: live.leaderboard.loading,
    lbError: live.leaderboard.error,
    onQ: e => set({q: e.target.value}), onSort: e => set({sort: e.target.value}), onLbCat: e => set({lbCat: e.target.value}),
    clear: () => set({q:'', cat:'All'}),
    retry: live.issues.reload,
    headerBg: s.scrolled || s.menu ? 'rgba(8,11,9,0.88)' : 'rgba(8,11,9,0)', headerBd: s.scrolled ? 'var(--line-soft)' : 'rgba(32,41,35,0)', headerBlur: s.scrolled ? 'blur(10px)' : 'none',
    menu: s.menu, menuExp: s.menu ? 'true' : 'false', menuLabel: s.menu ? 'Close' : 'Menu', toggleMenu: () => set({menu: !s.menu}), closeMenu: () => set({menu:false}),
    signedIn: live.signedIn, authLoading: live.authLoading, onAccountButton: live.onAccountButton
  };
}


/* ---------- global CSS (fonts, resets, hover states) ---------- */
/*
  Resets and :hover rules. The font @import that used to head this string is gone: layout.tsx already
  self-hosts Space Grotesk, Inter and JetBrains Mono through next/font, so the @import was a second,
  render-blocking request to fonts.googleapis.com for fonts the page already had -- and the only thing
  stopping this page from being self-contained.
*/
const CSS = [
  "html{scroll-behavior:smooth}",
  "body{margin:0;background:var(--canvas);color:var(--text);font-family:var(--font-body);-webkit-font-smoothing:antialiased}",
  "a{color:var(--text);text-decoration:none}",
  "a:hover{color:var(--signal)}",
  "::selection{background:var(--signal);color:var(--signal-ink)}",
  ":focus-visible{outline:2px solid var(--focus);outline-offset:2px}",
  "input::placeholder{color:var(--text-muted)}",
  "button,a,input,select{transition-property:background,color,border-color,opacity;transition-duration:160ms}",
  "@media (prefers-reduced-motion:reduce){html{scroll-behavior:auto}*{transition:none!important;animation:none!important}}",
  ".gbh0:hover,.gbh1:hover,.gbh7:hover{background:var(--signal-hover) !important;color:var(--signal-ink) !important}",
  ".gbh2:hover{border-color:var(--text-secondary) !important}",
  ".gbh3:hover{color:var(--text) !important}",
  ".gbh4:hover{background:var(--canvas-raised) !important}",
  ".gbh5:hover{opacity:1 !important}",
  ".gbh6:hover,.gbh8:hover{color:var(--signal) !important}",
].join("\n");


/* ---------- live data ---------- */

/*
  Both endpoints below are public, so a visitor who has never signed in sees the real thing. State is only
  written from the promise callback, never synchronously in the effect body.
*/

function usePublishedBounties() {
  const [state, setState] = useState({ status: 'loading', items: [], error: null });
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    let active = true;
    void api('/api/issues?per_page=100&sort=updated').then(
      result => { if (active) setState({ status: 'ready', items: result.items, error: null }); },
      error => { if (active) setState({ status: 'error', items: [], error: error?.message || 'Could not load published bounties.' }); },
    );
    return () => { active = false; };
  }, [attempt]);

  return { ...state, reload: () => setAttempt(n => n + 1) };
}

function useLeaderboard(range, category) {
  const [state, setState] = useState({ loading: true, entries: [], me: null, error: null });
  const key = `${range}:${category}`;

  useEffect(() => {
    let active = true;
    const params = new URLSearchParams({ period: range, per_page: '10' });
    if (category !== 'All') params.set('category', CATEGORY_VALUES[category]);
    void api(`/api/leaderboard?${params}`).then(
      result => { if (active) setState({ loading: false, entries: result.entries, me: result.me, error: null }); },
      error => { if (active) setState({ loading: false, entries: [], me: null, error: error?.message || 'Could not load the leaderboard.' }); },
    );
    return () => { active = false; };
  }, [key, range, category]);

  return state;
}

/* The chips are written for people; the API takes the stored value. */
const CATEGORY_VALUES = {
  Frontend: 'frontend', Backend: 'backend', 'Full-stack': 'fullstack', Docs: 'docs', Testing: 'testing',
  DevOps: 'devops', Design: 'design', Mobile: 'mobile', Other: 'other',
};

/* ---------- component ---------- */
export default function GitBountyLanding() {
  const { user, status: authStatus, signIn, signOut } = useAuth();
  const authLoading = authStatus === 'loading';
  // Signed in, the primary button is the way out; signed out, it is the way in.
  const onAccountButton = () => (user ? signOut() : signIn());
  const [, force] = useReducer(x => x + 1, 0);
  const c = useRef(null);
  if (!c.current) { c.current = { forceUpdate: () => {} }; init(c.current); }
  c.current.forceUpdate = force;
  useEffect(() => { mount(c.current); return () => unmount(c.current); }, []);

  const issues = usePublishedBounties();
  const leaderboard = useLeaderboard(c.current.gb.range, c.current.gb.lbCat);
  const v = vals(c.current, { issues, leaderboard, signedIn: Boolean(user), authLoading, onAccountButton });

  return (
    <>
      {/*
      THESIS: GitBounty is a broadsheet contribution ledger where open issues become inspectable proof of merged work.
      OWN-WORLD: near-black editorial fields, hairline rules, off-white reading type, mono evidence, and acid green reserved for earned points and action.
      STORY: discover an issue, contribute through GitHub, verify the merge, record the points, then compare visible contribution history.
      FIRST VIEWPORT: the promise and an animated six-stage issue-to-reputation strip land together before the next section enters.
      FORM: editorial broadsheet with technical ledger artifacts, dense scanning surfaces, and almost no ornamental cards.
      FINISH: every shipped claim is grounded or labeled illustrative; responsive, reduced-motion, and interface states are part of the design.
      */}
      <a className="skip-link" href="#top">Skip to content</a>
      <style>{CSS}</style>
      <header style={{ position: "sticky", top: "0", zIndex: "50", background: v.headerBg, borderBottom: `1px solid ${v.headerBd}`, backdropFilter: v.headerBlur, WebkitBackdropFilter: v.headerBlur, transition: "background 180ms,border-color 180ms" }}>
        <div style={{ maxWidth: "1320px", margin: "0 auto", padding: "0 clamp(20px,4vw,56px)", height: "60px", display: "flex", alignItems: "center", gap: "28px", fontFamily: "var(--font-mono)", fontSize: "12.5px" }}>
          <a href="/" aria-label="GitBounty home" style={{ display: "flex", alignItems: "center", gap: "10px", fontFamily: "var(--font-display)", fontWeight: "700", fontSize: "17px", letterSpacing: "-0.02em" }}><img src="/assets/favicon.png" alt="" width="28" height="28" style={{ display: "block", width: "28px", height: "28px", objectFit: "contain" }} />GitBounty</a>
          {v.navWide && (<>
            <nav aria-label="Primary" style={{ whiteSpace: "nowrap", display: "flex", gap: "24px", color: "var(--text-secondary)", marginLeft: "auto" }}>
              <a href="/explore" style={{ color: "var(--text-secondary)" }}>Explore Issues</a><a href="/how-it-works" style={{ color: "var(--text-secondary)" }}>How It Works</a><a href="/leaderboard" style={{ color: "var(--text-secondary)" }}>Leaderboard</a><a href="/maintainers" style={{ color: "var(--text-secondary)" }}>For Maintainers</a><a href="https://github.com/dipesh4000/gitbounty" style={{ color: "var(--text-secondary)" }}>GitHub ↗</a>
              </nav>
            <span aria-hidden="true" style={{ width: "1px", height: "20px", background: "var(--line)" }}></span>
            <a href="/extension" style={{ whiteSpace: "nowrap", color: "var(--text)" }}>Get extension</a>
            <button type="button" disabled={authLoading} title={user ? 'Sign out' : undefined} onClick={onAccountButton} style={{ whiteSpace: "nowrap", fontFamily: "var(--font-body)", fontSize: "14px", fontWeight: "600", background: "var(--signal)", color: "var(--canvas)", padding: "8px 14px", border: "0", borderRadius: "2px", cursor: "pointer" }} className="gbh0">{user ? '@' + user.github_login : 'Connect GitHub'}</button>
            </>)}
          {v.navNarrow && (<>
            <button type="button" aria-expanded={v.menuExp} aria-controls="mnav" onClick={v.toggleMenu} style={{ marginLeft: "auto", minHeight: "44px", padding: "0 14px", background: "transparent", border: "1px solid var(--line)", borderRadius: "2px", color: "var(--text)", font: "500 13px var(--font-mono)", cursor: "pointer" }}>{v.menuLabel}</button>
            </>)}
          </div>
        {v.menu && (<>
          <nav id="mnav" aria-label="Mobile" style={{ borderTop: "1px solid var(--line-soft)", padding: "8px clamp(20px,4vw,56px) 20px", display: "flex", flexDirection: "column", fontSize: "17px" }}>
            <a href="/explore" onClick={v.closeMenu} style={{ padding: "14px 0", borderBottom: "1px solid var(--line-soft)" }}>Explore Issues</a><a href="/how-it-works" onClick={v.closeMenu} style={{ padding: "14px 0", borderBottom: "1px solid var(--line-soft)" }}>How It Works</a><a href="/leaderboard" onClick={v.closeMenu} style={{ padding: "14px 0", borderBottom: "1px solid var(--line-soft)" }}>Leaderboard</a><a href="/maintainers" onClick={v.closeMenu} style={{ padding: "14px 0", borderBottom: "1px solid var(--line-soft)" }}>For Maintainers</a><a href="/extension" onClick={v.closeMenu} style={{ padding: "14px 0", borderBottom: "1px solid var(--line-soft)" }}>Get extension</a>
            <button type="button" disabled={authLoading} title={user ? 'Sign out' : undefined} onClick={onAccountButton} style={{ whiteSpace: "nowrap", marginTop: "16px", textAlign: "center", padding: "14px", background: "var(--signal)", color: "var(--canvas)", fontWeight: "600", border: "0", borderRadius: "2px", cursor: "pointer" }}>{user ? '@' + user.github_login : 'Connect GitHub'}</button>
            </nav>
          </>)}
        </header>
      <main id="top">
        {/* HERO */}
        <section aria-labelledby="h-hero" style={{ maxWidth: "1320px", margin: "0 auto", padding: "clamp(40px,6vw,80px) clamp(20px,4vw,56px) 0" }}>
          <div style={{ display: "flex", justifyContent: "space-between", gap: "16px", flexWrap: "wrap", fontFamily: "var(--font-mono)", fontSize: "11.5px", color: "var(--text-muted)", borderBottom: "1px solid var(--line)", paddingBottom: "12px", marginBottom: "clamp(28px,4vw,48px)" }}><span>THE OPEN-SOURCE LEDGER</span><span>points · not money · not tokens</span></div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(min(100%,340px),1fr))", gap: "40px clamp(32px,5vw,64px)", alignItems: "end" }}>
            <h1 id="h-hero" style={{ gridColumn: "1/-1", fontFamily: "var(--font-display)", fontWeight: "600", fontSize: "clamp(46px,7.4vw,96px)", lineHeight: "0.94", letterSpacing: "-0.045em", margin: "0" }}>Find the issue.<br />Ship the fix.<br /><span style={{ color: "var(--signal)" }}>Earn the signal.</span></h1>
            <p style={{ fontSize: "clamp(17px,1.3vw,19px)", lineHeight: "1.6", color: "var(--text-secondary)", margin: "0", maxWidth: "34em", textWrap: "pretty" }}>GitBounty turns merged open-source contributions into a visible record of impact. Discover issues that match your skills, ship the work through GitHub, and earn points when your pull request merges.</p>
            <div style={{ display: "grid", gap: "16px", justifyItems: "start" }}>
              <div style={{ display: "flex", flexWrap: "wrap", gap: "10px" }}>
                <a href="/explore" style={{ display: "inline-flex", alignItems: "center", gap: "10px", minHeight: "48px", padding: "0 20px", background: "var(--signal)", color: "var(--canvas)", fontWeight: "600", fontSize: "15px", borderRadius: "2px" }} className="gbh1">Explore open issues →</a>
                <a href="/how-it-works" style={{ display: "inline-flex", alignItems: "center", minHeight: "48px", padding: "0 20px", border: "1px solid var(--line-strong)", fontSize: "15px", borderRadius: "2px" }} className="gbh2">How points work</a>
                </div>
              <span style={{ fontFamily: "var(--font-mono)", fontSize: "12px", color: "var(--text-muted)" }}>Built around GitHub. No new contribution workflow.</span>
              </div>
            </div>
          <ol aria-label="Sample contribution: issue to reputation" style={{ listStyle: "none", margin: "clamp(48px,6vw,80px) 0 0", padding: "0", display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(min(100%,180px),1fr))", borderTop: "1px solid var(--line-strong)", borderBottom: "1px solid var(--line)", position: "relative", fontFamily: "var(--font-mono)" }}>
            <span aria-hidden="true" style={{ position: "absolute", top: "-2px", left: "0", height: "3px", width: "100%", transform: `scaleX(${v.hero.progressScale})`, transformOrigin: "left", background: "var(--signal)", transition: "transform 600ms cubic-bezier(.2,.7,.2,1)" }}></span>
            <li style={{ padding: "20px 18px 22px 0", borderRight: "1px solid var(--line-soft)", display: "grid", gap: "8px", alignContent: "start" }}><span style={{ fontSize: "11px", color: "var(--text-muted)" }}>01 ISSUE</span><span style={{ fontSize: "20px", fontWeight: "600" }}>#1842</span><span style={{ fontSize: "12px", color: "var(--text-secondary)", lineHeight: "1.5" }}>example-org/example-app<br />Improve keyboard navigation<br /><span style={{ color: "var(--signal)" }}>+40 · FRONTEND</span></span></li>
            <li style={{ padding: "20px 18px 22px", borderRight: "1px solid var(--line-soft)", display: "grid", gap: "8px", alignContent: "start", opacity: v.hero.o1, transition: "opacity 420ms" }}><span style={{ fontSize: "11px", color: "var(--text-muted)" }}>02 CODE</span><span style={{ fontSize: "20px", fontWeight: "600" }}><span style={{ color: "var(--status)" }}>+18</span>{" "}−4</span><span style={{ fontSize: "12px", color: "var(--text-secondary)", lineHeight: "1.5", overflowWrap: "anywhere" }}>CommandPalette.tsx<br />useFocusTrap(ref)</span></li>
            <li style={{ padding: "20px 18px 22px", borderRight: "1px solid var(--line-soft)", display: "grid", gap: "8px", alignContent: "start", opacity: v.hero.o2, transition: "opacity 420ms" }}><span style={{ fontSize: "11px", color: "var(--text-muted)" }}>03 PULL REQUEST</span><span style={{ fontSize: "20px", fontWeight: "600" }}>#1910</span><span style={{ fontSize: "12px", color: "var(--text-secondary)", lineHeight: "1.5" }}>checks 12/12<br />review approved</span></li>
            <li style={{ padding: "20px 18px 22px", borderRight: "1px solid var(--line-soft)", display: "grid", gap: "8px", alignContent: "start", opacity: v.hero.o3, transition: "opacity 420ms" }}><span style={{ fontSize: "11px", color: "var(--text-muted)" }}>04 MERGE</span><span style={{ fontSize: "20px", fontWeight: "600", display: "flex", alignItems: "center", gap: "8px" }}><span aria-hidden="true" style={{ width: "9px", height: "9px", borderRadius: "50%", background: v.hero.mergeBg }}></span>a3f9c1e</span><span style={{ fontSize: "12px", color: "var(--text-secondary)", lineHeight: "1.5" }}>→ main · 14:32 UTC<br />author ≠ merger</span></li>
            <li style={{ padding: "20px 18px 22px", borderRight: "1px solid var(--line-soft)", display: "grid", gap: "8px", alignContent: "start", opacity: v.hero.o4, background: v.hero.totalBg, transition: "opacity 420ms,background 420ms" }}><span style={{ fontSize: "11px", color: "var(--text-muted)" }}>05 POINTS</span><span style={{ fontSize: "28px", fontWeight: "600", color: "var(--signal)", lineHeight: "1" }}>{v.hero.pts}</span><span style={{ fontSize: "12px", color: "var(--text-secondary)", lineHeight: "1.5" }}>+5 base<br />+40 issue value</span></li>
            <li style={{ padding: "20px 0 22px 18px", display: "grid", gap: "8px", alignContent: "start", opacity: v.hero.o5, transition: "opacity 420ms" }}><span style={{ fontSize: "11px", color: "var(--text-muted)" }}>06 REPUTATION</span><span style={{ fontSize: "20px", fontWeight: "600" }}>@example-user</span><span style={{ fontSize: "12px", color: "var(--text-secondary)", lineHeight: "1.5" }}>#01 this week<br />Frontend · 6 merges</span></li>
            </ol>
          <div style={{ display: "flex", justifyContent: "space-between", gap: "12px", flexWrap: "wrap", padding: "10px 0", fontFamily: "var(--font-mono)", fontSize: "11px", color: "var(--text-muted)" }}><span aria-live="polite" style={{ color: v.hero.statusFg }}>{v.hero.status}</span><span>illustration · not real repositories or people</span></div>
          </section>
        {/* MANIFESTO */}
        <section aria-label="Why GitBounty" style={{ maxWidth: "1320px", margin: "0 auto", padding: "clamp(88px,12vw,176px) clamp(20px,4vw,56px)" }}>
          <p data-reveal="" style={{ fontFamily: "var(--font-display)", fontWeight: "500", fontSize: "clamp(36px,5.6vw,80px)", lineHeight: "1", letterSpacing: "-0.04em", margin: "0 0 40px", maxWidth: "14em" }}>Open source already has the work. It needs a better{" "}<span style={{ color: "var(--signal)" }}>signal.</span></p>
          <p style={{ fontFamily: "var(--font-mono)", fontSize: "clamp(13px,1.1vw,15px)", lineHeight: "1.8", color: "var(--text-secondary)", margin: "0", display: "flex", flexWrap: "wrap", gap: "4px 24px" }}><span>Find work matched to your stack.</span><span aria-hidden="true" style={{ color: "var(--line-strong)" }}>/</span><span>Keep the contribution on GitHub.</span><span aria-hidden="true" style={{ color: "var(--line-strong)" }}>/</span><span>Build reputation from merged code.</span></p>
          </section>
        {/* EXPLORER */}
        <section id="explore" aria-labelledby="h-explore" style={{ scrollMarginTop: "60px", borderTop: "1px solid var(--line)" }}>
          <div style={{ maxWidth: "1320px", margin: "0 auto", padding: "clamp(64px,8vw,112px) clamp(20px,4vw,56px)" }}>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(min(100%,300px),1fr))", gap: "24px 64px", alignItems: "end", marginBottom: "40px" }}>
              <h2 id="h-explore" style={{ fontFamily: "var(--font-display)", fontWeight: "600", fontSize: "clamp(36px,4.6vw,64px)", lineHeight: "1", letterSpacing: "-0.035em", margin: "0" }}>Work worth opening.</h2>
              <p style={{ fontSize: "18px", lineHeight: "1.6", color: "var(--text-secondary)", margin: "0", maxWidth: "30em" }}>Browse unassigned issues by the kind of work you actually want to do.</p>
              </div>
            <div style={{ display: "flex", flexWrap: "wrap", borderTop: "1px solid var(--line-strong)" }}>
              <aside aria-label="Filters" style={{ flex: "1 1 220px", maxWidth: "100%", boxSizing: "border-box", padding: "20px 24px 20px 0", display: "grid", gap: "20px", alignContent: "start", borderRight: "1px solid var(--line-soft)" }}>
                <label style={{ display: "grid", gap: "8px", fontFamily: "var(--font-mono)", fontSize: "11px", color: "var(--text-muted)" }}>SEARCH{" "}<input type="search" value={v.q} onChange={v.onQ} placeholder="repo, title, label…" style={{ minHeight: "44px", padding: "0 12px", background: "var(--canvas-raised)", border: "1px solid var(--line)", borderRadius: "2px", color: "var(--text)", font: "15px var(--font-body)", outlineOffset: "0" }} />
                  </label>
                <label style={{ display: "grid", gap: "8px", fontFamily: "var(--font-mono)", fontSize: "11px", color: "var(--text-muted)" }}>SORT{" "}<select value={v.sort} onChange={v.onSort} style={{ minHeight: "44px", padding: "0 8px", background: "var(--canvas-raised)", border: "1px solid var(--line)", borderRadius: "2px", color: "var(--text)", font: "14px var(--font-body)" }}><option value="points">Highest points</option><option value="recent">Recently updated</option><option value="stars">Most stars</option></select>
                  </label>
                <div role="group" aria-label="Category" style={{ display: "flex", flexDirection: "column", gap: "2px" }}>
                  <span style={{ fontFamily: "var(--font-mono)", fontSize: "11px", color: "var(--text-muted)", marginBottom: "6px" }}>CATEGORY</span>
                  {v.cats.map((c, $index) => (<React.Fragment key={$index}>
                    <button type="button" aria-pressed={c.pressed} onClick={c.onClick} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", minHeight: "40px", padding: "0 10px", border: "0", borderLeft: `2px solid ${c.bd}`, background: c.bg, color: c.fg, font: "500 14px var(--font-body)", cursor: "pointer", textAlign: "left", transition: "all 160ms" }} className="gbh3">{c.label}<span style={{ fontFamily: "var(--font-mono)", fontSize: "11px" }}>{c.count}</span></button>
                    </React.Fragment>))}
                  </div>
                </aside>
              <div style={{ flex: "999 1 520px", minWidth: "0" }}>
                <div style={{ display: "flex", justifyContent: "space-between", padding: "14px 0 14px 24px", borderBottom: "1px solid var(--line)", fontFamily: "var(--font-mono)", fontSize: "11.5px", color: "var(--text-muted)" }}><span aria-live="polite">{v.resultsLabel}</span><span>live from GitBounty</span></div>
                {v.loading && (<>
                  <div aria-busy="true" style={{ paddingLeft: "24px" }}><div style={{ padding: "22px 0", borderBottom: "1px solid var(--line-soft)" }}><div style={{ height: "12px", width: "40%", background: "var(--surface-raised)", marginBottom: "10px" }}></div><div style={{ height: "12px", width: "70%", background: "var(--surface-raised)" }}></div></div><div style={{ padding: "22px 0", borderBottom: "1px solid var(--line-soft)", opacity: ".6" }}><div style={{ height: "12px", width: "30%", background: "var(--surface-raised)", marginBottom: "10px" }}></div><div style={{ height: "12px", width: "55%", background: "var(--surface-raised)" }}></div></div><div style={{ padding: "22px 0", opacity: ".35" }}><div style={{ height: "12px", width: "36%", background: "var(--surface-raised)", marginBottom: "10px" }}></div><div style={{ height: "12px", width: "62%", background: "var(--surface-raised)" }}></div></div></div>
                  </>)}
                {v.error && (<>
                  <div role="alert" style={{ padding: "48px 24px", display: "grid", gap: "12px", justifyItems: "start" }}><span style={{ fontFamily: "var(--font-mono)", fontSize: "12px", color: "var(--text-secondary)" }}>GITBOUNTY API UNAVAILABLE</span><p style={{ fontFamily: "var(--font-display)", fontSize: "28px", letterSpacing: "-0.02em", margin: "0" }}>Published bounties didn’t load.</p><p style={{ margin: "0", color: "var(--text-secondary)" }}>{v.errorMessage} Your filters are kept, and nothing on GitHub is affected.</p><button type="button" onClick={v.retry} style={{ minHeight: "44px", padding: "0 18px", border: "1px solid var(--line-strong)", borderRadius: "2px", background: "transparent", color: "var(--text)", font: "500 14px var(--font-body)", cursor: "pointer" }}>Retry</button></div>
                  </>)}
                {v.isEmpty && (<>
                  <div style={{ padding: "48px 24px", display: "grid", gap: "12px", justifyItems: "start" }}><p style={{ fontFamily: "var(--font-display)", fontSize: "28px", letterSpacing: "-0.02em", margin: "0" }}>{v.emptyMsg}</p><p style={{ margin: "0", color: "var(--text-secondary)" }}>{v.emptyHint}</p>{v.filtered ? (<button type="button" onClick={v.clear} style={{ minHeight: "44px", padding: "0 18px", border: "1px solid var(--line-strong)", borderRadius: "2px", background: "transparent", color: "var(--text)", font: "500 14px var(--font-body)", cursor: "pointer" }}>Clear filters</button>) : (<button type="button" disabled={v.authLoading} onClick={v.onAccountButton} style={{ minHeight: "44px", padding: "0 18px", border: "1px solid var(--signal)", borderRadius: "2px", background: "var(--signal)", color: "var(--signal-ink)", font: "700 14px var(--font-body)", cursor: "pointer" }}>{v.signedIn ? "Publish a bounty" : "Connect GitHub to publish"}</button>)}</div>
                  </>)}
                {v.hasRows && (<>
                  <ul style={{ listStyle: "none", margin: "0", padding: "0" }}>
                    {v.issues.map((i, $index) => (<React.Fragment key={$index}>
                      <li style={{ borderBottom: "1px solid var(--line-soft)", transition: "background 160ms" }} className="gbh4">
                        <a href={i.href} target="_blank" rel="noreferrer" aria-label={i.aria} style={{ display: "grid", gridTemplateColumns: "minmax(0,1fr) auto", gap: "10px 24px", padding: "18px 16px 18px 24px", color: "var(--text)" }}>
                          <span style={{ minWidth: "0", display: "grid", gap: "8px" }}>
                            <span style={{ fontFamily: "var(--font-mono)", fontSize: "12px", color: "var(--text-secondary)", display: "flex", flexWrap: "wrap", gap: "4px 14px" }}><span>{i.repo} {i.numS}</span><span style={{ color: "var(--text-muted)" }}>★ {i.stars} · {i.updated}</span></span>
                            <span style={{ fontFamily: "var(--font-display)", fontSize: "clamp(18px,1.6vw,22px)", fontWeight: "500", letterSpacing: "-0.01em", lineHeight: "1.25" }}>{i.title}</span>
                            <span style={{ display: "flex", flexWrap: "wrap", gap: "6px", fontFamily: "var(--font-mono)", fontSize: "11px", color: "var(--text-secondary)" }}><span style={{ color: "var(--text)" }}>{i.catU}</span>{i.labels.map((l, $index) => (<React.Fragment key={$index}><span>· {l}</span></React.Fragment>))}</span>
                            </span>
                          <span style={{ display: "grid", justifyItems: "end", alignContent: "center", gap: "2px", fontFamily: "var(--font-mono)" }}><span style={{ fontSize: "24px", fontWeight: "600", color: i.ptsFg }}>{i.ptsS}</span><span style={{ fontSize: "10.5px", color: "var(--text-muted)" }}>{i.ptsNote}</span><span style={{ fontSize: "12px", color: "var(--text-secondary)", marginTop: "6px" }}>View issue →</span></span>
                          </a>
                        </li>
                      </React.Fragment>))}
                    </ul>
                  </>)}
                </div>
              </div>
            </div>
          </section>
        {/* HOW (tabbed) */}
        <section id="how" aria-labelledby="h-how" style={{ scrollMarginTop: "60px", borderTop: "1px solid var(--line)", background: "var(--canvas-raised)" }}>
          <div style={{ maxWidth: "1320px", margin: "0 auto", padding: "clamp(64px,8vw,112px) clamp(20px,4vw,56px)" }}>
            <h2 id="h-how" style={{ fontFamily: "var(--font-display)", fontWeight: "600", fontSize: "clamp(36px,4.6vw,64px)", lineHeight: "1", letterSpacing: "-0.035em", margin: "0 0 48px", maxWidth: "12em" }}>Four steps. Three of them already happen on GitHub.</h2>
            <div role="tablist" aria-label="How it works" style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(min(100%,220px),1fr))", position: "relative", borderTop: "1px solid var(--line)" }}>
              <span aria-hidden="true" style={{ position: "absolute", top: "-1px", left: "0", height: "2px", width: "100%", transform: `scaleX(${v.how.progressScale})`, transformOrigin: "left", background: "var(--signal)", transition: "transform 520ms cubic-bezier(.2,.7,.2,1)" }}></span>
              {v.steps.map((st, $index) => (<React.Fragment key={$index}>
                <button type="button" role="tab" aria-selected={st.pressed} onClick={st.onClick} style={{ display: "grid", gap: "10px", alignContent: "start", textAlign: "left", padding: "22px 20px 26px 0", background: "transparent", border: "0", color: "var(--text)", cursor: "pointer", opacity: st.op, transition: "opacity 180ms" }} className="gbh5">
                  <span style={{ fontFamily: "var(--font-mono)", fontSize: "12px", color: st.nFg }}>{st.n} — {st.k}</span>
                  <span style={{ fontSize: "17px", lineHeight: "1.5", fontFamily: "var(--font-body)" }}>{st.title}</span>
                  </button>
                </React.Fragment>))}
              </div>
            <div role="tabpanel" style={{ marginTop: "24px", display: "flex", flexWrap: "wrap", border: "1px solid var(--line)", borderRadius: "4px", background: "var(--canvas)", fontFamily: "var(--font-mono)", fontSize: "13px", overflow: "hidden" }}>
              <div style={{ flex: "1 1 260px", padding: "24px", borderRight: "1px solid var(--line-soft)", display: "grid", gap: "6px", alignContent: "start" }}><span style={{ color: "var(--text-muted)", fontSize: "11px" }}>ARTIFACT · {v.how.num}</span><span style={{ fontFamily: "var(--font-display)", fontSize: "clamp(48px,6vw,88px)", fontWeight: "600", letterSpacing: "-0.04em", lineHeight: "1" }}>{v.how.big}</span><span style={{ color: v.how.statusFg, fontSize: "12px" }}>{v.how.status}</span></div>
              <div style={{ flex: "2 1 420px", minWidth: "0", display: "grid" }}>
                <div style={{ padding: "16px 20px", borderBottom: "1px solid var(--line-soft)", color: "var(--text-secondary)" }}>example-org/example-app{" "}<span style={{ color: "var(--text)" }}>#1842</span>{" "}Improve keyboard navigation ·{" "}<span style={{ color: "var(--text)" }}>gitbounty:40</span></div>
                <div style={{ padding: "16px 20px", borderBottom: "1px solid var(--line-soft)", color: "var(--text-secondary)", opacity: v.how.a1, transition: "opacity 480ms" }}>branch example-user:fix/palette-focus-trap → PR{" "}<span style={{ color: "var(--text)" }}>#1910</span>{" "}· approved</div>
                <div style={{ padding: "16px 20px", borderBottom: "1px solid var(--line-soft)", color: "var(--text-secondary)", opacity: v.how.a2, transition: "opacity 480ms" }}><span style={{ color: "var(--signal)" }}>●</span>{" "}merged a3f9c1e · closes #1842 ✓ · author ≠ merger ✓</div>
                <div style={{ padding: "16px 20px", display: "flex", justifyContent: "space-between", gap: "16px", opacity: v.how.a3, background: v.how.rowBg, transition: "opacity 480ms,background 480ms" }}><span style={{ color: "var(--text-secondary)" }}>ledger · @example-user · FRONTEND</span><span style={{ color: "var(--signal)", fontWeight: "600", fontSize: "18px" }}>+45</span></div>
                </div>
              </div>
            </div>
          </section>
        {/* PROVENANCE */}
        <section id="provenance" aria-labelledby="h-prov" style={{ scrollMarginTop: "60px", borderTop: "1px solid var(--line)" }}>
          <div data-reveal="" style={{ maxWidth: "1320px", margin: "0 auto", padding: "clamp(72px,10vw,144px) clamp(20px,4vw,56px)", display: "grid", justifyItems: "center", textAlign: "center" }}>
            <h2 id="h-prov" style={{ fontFamily: "var(--font-display)", fontWeight: "600", fontSize: "clamp(38px,5.4vw,76px)", lineHeight: "0.98", letterSpacing: "-0.04em", margin: "0 0 24px", maxWidth: "12em" }}>Every point has a commit behind it.</h2>
            <p style={{ fontSize: "18px", lineHeight: "1.6", color: "var(--text-secondary)", margin: "0 0 56px", maxWidth: "32em" }}>GitBounty records where points came from, what shipped, and when it merged. Recognition stays attached to the work that earned it.</p>
            <div style={{ width: "100%", maxWidth: "520px", textAlign: "left", background: "var(--text)", color: "var(--canvas)", borderRadius: "2px", padding: "28px 28px 24px", fontFamily: "var(--font-mono)", fontSize: "13.5px", lineHeight: "1.85", boxSizing: "border-box" }}>
              <div style={{ display: "flex", justifyContent: "space-between", fontSize: "11px", borderBottom: "1px solid var(--canvas)", paddingBottom: "10px", marginBottom: "12px" }}><span>GITBOUNTY · RECEIPT</span><span>SAMPLE</span></div>
              <div style={{ display: "grid", gridTemplateColumns: "auto minmax(0,1fr)", gap: "0 20px" }}>
                <span style={{ color: "var(--line)" }}>contributor</span><span>@example-user</span><span style={{ color: "var(--line)" }}>repository</span><span>example-org/example-app</span><span style={{ color: "var(--line)" }}>pull request</span><span>#1910</span><span style={{ color: "var(--line)" }}>closed issue</span><span>#1842</span><span style={{ color: "var(--line)" }}>category</span><span>FRONTEND</span><span style={{ color: "var(--line)" }}>merged</span><span>2026-09-18 14:32 UTC</span><span style={{ color: "var(--line)" }}>example</span><span>illustration only</span>
                </div>
              <div style={{ borderTop: "1px dashed var(--line-soft)", marginTop: "14px", paddingTop: "10px", display: "grid", gridTemplateColumns: "minmax(0,1fr) auto" }}><span>BASE MERGE REWARD</span><span>+5</span><span>ISSUE VALUE</span><span>+40</span></div>
              <div style={{ borderTop: "2px solid var(--canvas)", marginTop: "10px", paddingTop: "10px", display: "grid", gridTemplateColumns: "minmax(0,1fr) auto", alignItems: "baseline", fontWeight: "600" }}><span>TOTAL EARNED</span><span style={{ fontSize: "28px", background: "var(--signal)", padding: "0 8px" }}>+45</span></div>
              <div style={{ marginTop: "14px", fontSize: "11px", color: "var(--line)" }}>Recognition only. Not currency, not redeemable.</div>
              </div>
            </div>
          </section>
        {/* TWO-SIDED */}
        <section id="maintainers" aria-label="Contributors and maintainers" style={{ scrollMarginTop: "60px", borderTop: "1px solid var(--line)" }}>
          <div style={{ maxWidth: "1320px", margin: "0 auto", padding: "clamp(64px,8vw,112px) clamp(20px,4vw,56px)", display: "flex", flexWrap: "wrap", gap: "56px" }}>
            <div data-reveal="" style={{ flex: "2 1 480px", minWidth: "0" }}>
              <h2 style={{ fontFamily: "var(--font-display)", fontWeight: "600", fontSize: "clamp(40px,5.4vw,76px)", lineHeight: "0.96", letterSpacing: "-0.04em", margin: "0 0 40px" }}>Stop searching<br />at random.</h2>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(min(100%,220px),1fr))", gap: "0 32px", fontSize: "18px", lineHeight: "1.45" }}>
                <p style={{ margin: "0", padding: "16px 0", borderTop: "1px solid var(--line)" }}>Browse work by discipline.</p>
                <p style={{ margin: "0", padding: "16px 0", borderTop: "1px solid var(--line)" }}>See what an issue is worth before starting.</p>
                <p style={{ margin: "0", padding: "16px 0", borderTop: "1px solid var(--line)" }}>Keep working through GitHub.</p>
                <p style={{ margin: "0", padding: "16px 0", borderTop: "1px solid var(--line)" }}>Build a public record from merged contributions.</p>
                <p style={{ margin: "0", padding: "16px 0", borderTop: "1px solid var(--line)" }}>Compete by week, category, or all time.</p>
                </div>
              </div>
            <div data-reveal="" style={{ flex: "1 1 300px", minWidth: "0", borderLeft: "1px solid var(--line-strong)", paddingLeft: "clamp(20px,3vw,40px)", fontFamily: "var(--font-mono)", fontSize: "13px", color: "var(--text-secondary)", lineHeight: "1.7" }}>
              <div style={{ fontSize: "11px", color: "var(--text-muted)", marginBottom: "16px" }}>FOR MAINTAINERS</div>
              <h2 style={{ fontFamily: "var(--font-display)", fontWeight: "500", fontSize: "clamp(26px,2.6vw,34px)", lineHeight: "1.1", letterSpacing: "-0.025em", color: "var(--text)", margin: "0 0 24px" }}>Give important work a signal.</h2>
              <div style={{ padding: "12px", border: "1px solid var(--line)", borderRadius: "2px", marginBottom: "20px", background: "var(--canvas-raised)" }}><span style={{ color: "var(--text-muted)" }}>$ label add{" "}</span><span style={{ color: "var(--signal)" }}>gitbounty:60</span><span style={{ color: "var(--text-muted)" }}>{" "}→ #611</span></div>
              <div>+ assign points through a GitHub label</div><div>+ bring overlooked issues back into view</div><div>+ attract contributors with relevant skills</div><div>= preserve the existing review process</div><div style={{ color: "var(--text)" }}>= keep control of what gets merged</div>
              </div>
            </div>
          </section>
        {/* CATEGORIES */}
        <section aria-labelledby="h-cat" style={{ borderTop: "1px solid var(--line)" }}>
          <div style={{ maxWidth: "1320px", margin: "0 auto", padding: "clamp(64px,8vw,112px) clamp(20px,4vw,56px)" }}>
            <h2 id="h-cat" style={{ fontFamily: "var(--font-display)", fontWeight: "600", fontSize: "clamp(34px,4vw,56px)", lineHeight: "1", letterSpacing: "-0.035em", margin: "0 0 36px" }}>A taxonomy of useful work.</h2>
            <ul style={{ listStyle: "none", margin: "0", padding: "0", display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(min(100%,280px),1fr))", borderTop: "1px solid var(--line)", borderLeft: "1px solid var(--line)" }}>
              {v.taxo.map((t, $index) => (<React.Fragment key={$index}>
                <li onMouseEnter={t.onEnter} onMouseLeave={t.onLeave} style={{ aspectRatio: "1.35", minHeight: "180px", display: "flex", flexDirection: "column", justifyContent: "space-between", padding: "20px", borderRight: "1px solid var(--line)", borderBottom: "1px solid var(--line)", background: t.bg, transition: "background 160ms" }}>
                  <span style={{ display: "flex", justifyContent: "space-between", fontFamily: "var(--font-mono)", fontSize: "12px", color: t.nFg }}><span>{t.n}</span><span style={{ color: "var(--text-muted)" }}>{t.count}</span></span>
                  <span style={{ display: "grid", gap: "10px" }}><span style={{ fontFamily: "var(--font-display)", fontWeight: "600", fontSize: "clamp(24px,2.3vw,32px)", letterSpacing: "-0.02em", color: t.fg }}>{t.name}</span><span style={{ fontFamily: "var(--font-mono)", fontSize: "12px", color: "var(--text-secondary)", overflowWrap: "anywhere" }}>{t.glob}</span><span style={{ fontFamily: "var(--font-mono)", fontSize: "11px", color: "var(--text-muted)", opacity: t.gOp, transition: "opacity 180ms" }}>label {t.label}</span></span>
                  </li>
                </React.Fragment>))}
              </ul>
            </div>
          </section>
        {/* LEADERBOARD */}
        <section id="leaderboard" aria-labelledby="h-lb" style={{ scrollMarginTop: "60px", borderTop: "1px solid var(--line)", background: "var(--canvas-raised)" }}>
          <div style={{ maxWidth: "1320px", margin: "0 auto", padding: "clamp(64px,8vw,112px) clamp(20px,4vw,56px)", display: "flex", flexWrap: "wrap", gap: "48px" }}>
            <div style={{ flex: "1 1 280px", display: "grid", gap: "28px", alignContent: "start" }}>
              <h2 id="h-lb" style={{ fontFamily: "var(--font-display)", fontWeight: "600", fontSize: "clamp(36px,4.2vw,58px)", lineHeight: "1", letterSpacing: "-0.035em", margin: "0" }}>Recognition for work that merged.</h2>
              <div role="group" aria-label="Time range" style={{ display: "flex", gap: "4px" }}>{v.ranges.map((r, $index) => (<React.Fragment key={$index}><button type="button" aria-pressed={r.pressed} onClick={r.onClick} style={{ minHeight: "40px", padding: "0 14px", border: "1px solid var(--line)", borderRadius: "2px", background: r.bg, color: r.fg, font: "500 13px var(--font-body)", cursor: "pointer" }}>{r.label}</button></React.Fragment>))}</div>
              <label style={{ display: "grid", gap: "8px", fontFamily: "var(--font-mono)", fontSize: "11px", color: "var(--text-muted)" }}>CATEGORY<select value={v.lbCat} onChange={v.onLbCat} style={{ minHeight: "44px", background: "var(--canvas)", border: "1px solid var(--line)", borderRadius: "2px", color: "var(--text)", font: "14px var(--font-body)", padding: "0 8px", maxWidth: "240px" }}>{v.catOpts.map(o => <option key={o} value={o}>{o}</option>)}</select></label>
              <p style={{ margin: "0", fontSize: "15px", lineHeight: "1.6", color: "var(--text-muted)" }}>Only merged, verified contributions rank. Every total is the sum of entries that each name a pull request.</p>
              </div>
            <div style={{ flex: "2 1 480px", minWidth: "0", fontFamily: "var(--font-mono)", fontSize: "14px" }}>
              {v.leaders.map((l, $index) => (<React.Fragment key={$index}>
                <div style={{ display: "grid", gridTemplateColumns: "44px minmax(0,1fr) auto", gap: "16px", alignItems: "baseline", padding: "14px 0", borderBottom: "1px solid var(--line-soft)" }}>
                  <span style={{ color: "var(--text-muted)" }}>{l.rank}</span>
                  <span style={{ minWidth: "0", display: "flex", flexWrap: "wrap", gap: "2px 14px", alignItems: "baseline" }}><span style={{ fontFamily: "var(--font-display)", fontSize: "20px", letterSpacing: "-0.01em" }}>{l.user}</span><span style={{ fontSize: "12px", color: "var(--text-muted)" }}>{l.merges}</span></span>
                  <span style={{ color: "var(--signal)", fontWeight: "600", fontSize: "16px" }}>{l.pts}</span>
                  </div>
                </React.Fragment>))}
              {v.lbLoading && (<p style={{ padding: "24px 0", color: "var(--text-secondary)", fontFamily: "var(--font-body)", margin: "0" }} aria-live="polite">Loading the leaderboard…</p>)}
              {v.lbError && (<p role="alert" style={{ padding: "24px 0", color: "var(--text-secondary)", fontFamily: "var(--font-body)", margin: "0" }}>{v.lbError}</p>)}
              {v.lbEmpty && !v.lbError && (<p style={{ padding: "24px 0", color: "var(--text-secondary)", fontFamily: "var(--font-body)", margin: "0" }}>Nobody has earned points in this category for this period yet.</p>)}
              {/* Your own position, from the API. Absent when signed out or unranked -- never a placeholder. */}
              {v.you && (
                <div style={{ display: "grid", gridTemplateColumns: "44px minmax(0,1fr) auto", gap: "16px", alignItems: "baseline", padding: "14px 12px", margin: "12px -12px 0", background: "var(--signal-dark)", borderTop: "2px solid var(--signal)" }}>
                  <span>{v.you.rank}</span><span style={{ fontFamily: "var(--font-display)", fontSize: "20px" }}>You{" "}<span style={{ fontFamily: "var(--font-mono)", fontSize: "12px", color: "var(--text-secondary)" }}>· {v.you.merges}</span></span><span style={{ color: "var(--signal)", fontWeight: "600", fontSize: "16px" }}>{v.you.pts}</span>
                  </div>
              )}
              </div>
            </div>
          </section>
        {/* EXTENSION */}
        <section aria-labelledby="h-ext" style={{ borderTop: "1px solid var(--line)" }}>
          <div data-reveal="" style={{ maxWidth: "1320px", margin: "0 auto", padding: "clamp(64px,8vw,112px) clamp(20px,4vw,56px)" }}>
            <div style={{ display: "flex", flexWrap: "wrap", justifyContent: "space-between", alignItems: "flex-end", gap: "24px", marginBottom: "40px" }}>
              <div><span style={{ display: "inline-block", fontFamily: "var(--font-mono)", fontSize: "11px", color: "var(--text-secondary)", border: "1px solid var(--line-strong)", borderRadius: "999px", padding: "3px 10px", marginBottom: "20px" }}>OPTIONAL EXTENSION · LOAD UNPACKED</span><h2 id="h-ext" style={{ fontFamily: "var(--font-display)", fontWeight: "600", fontSize: "clamp(36px,4.6vw,64px)", lineHeight: "1", letterSpacing: "-0.035em", margin: "0" }}>Stay on GitHub.</h2></div>
              <p style={{ fontSize: "18px", lineHeight: "1.6", color: "var(--text-secondary)", margin: "0", maxWidth: "28em" }}>See the signal where the work already lives. The extension is optional—the complete product remains available on the web.</p>
              </div>
            <div style={{ border: "1px solid var(--line)", borderRadius: "6px", overflow: "hidden", background: "var(--canvas-raised)" }}>
              <div style={{ padding: "10px 14px", borderBottom: "1px solid var(--line-soft)", fontFamily: "var(--font-mono)", fontSize: "12px", color: "var(--text-muted)", display: "flex", gap: "12px", alignItems: "center" }}><span aria-hidden="true">● ● ●</span><span style={{ flex: "1", background: "var(--canvas)", border: "1px solid var(--line-soft)", borderRadius: "3px", padding: "5px 10px", overflow: "hidden", whiteSpace: "nowrap", textOverflow: "ellipsis" }}>github.com/example-org/example-app/issues</span></div>
              <div style={{ display: "grid" }}>
                <div style={{ display: "grid", gridTemplateColumns: "20px minmax(0,1fr) auto", gap: "12px", padding: "14px 18px", borderBottom: "1px solid var(--line-soft)", alignItems: "center" }}><span aria-hidden="true" style={{ color: "var(--status)" }}>◯</span><span style={{ minWidth: "0" }}><span style={{ fontWeight: "500" }}>Retry backoff ignores max_delay under sustained load</span>{" "}<span style={{ fontSize: "12px", color: "var(--text-muted)" }}>#611 · 5 hours ago</span></span><span style={{ fontFamily: "var(--font-mono)", fontSize: "11px", background: "var(--signal-dark)", color: "var(--signal)", padding: "3px 8px", borderRadius: "2px" }}>GB +60 · BACKEND</span></div>
                <div style={{ display: "grid", gridTemplateColumns: "20px minmax(0,1fr) auto", gap: "12px", padding: "14px 18px", borderBottom: "1px solid var(--line-soft)", alignItems: "center" }}><span aria-hidden="true" style={{ color: "var(--status)" }}>◯</span><span style={{ minWidth: "0" }}><span style={{ fontWeight: "500" }}>Expose queue depth as a metric</span>{" "}<span style={{ fontSize: "12px", color: "var(--text-muted)" }}>#598 · 2 days ago</span></span><span style={{ fontFamily: "var(--font-mono)", fontSize: "11px", color: "var(--text-secondary)", border: "1px solid var(--line)", padding: "2px 8px", borderRadius: "2px" }}>GB +5 base</span></div>
                <div style={{ display: "grid", gridTemplateColumns: "20px minmax(0,1fr) auto", gap: "12px", padding: "14px 18px", alignItems: "center" }}><span aria-hidden="true" style={{ color: "var(--status)" }}>◯</span><span style={{ minWidth: "0" }}><span style={{ fontWeight: "500" }}>README install steps reference old flag</span>{" "}<span style={{ fontSize: "12px", color: "var(--text-muted)" }}>#602 · 1 day ago</span></span><span style={{ fontFamily: "var(--font-mono)", fontSize: "11px", background: "var(--signal-dark)", color: "var(--signal)", padding: "3px 8px", borderRadius: "2px" }}>GB +15 · DOCS</span></div>
                </div>
              </div>
            </div>
          </section>
        {/* INTEGRITY */}
        <section aria-labelledby="h-int" style={{ borderTop: "1px solid var(--line)" }}>
          <div data-reveal="" style={{ maxWidth: "1320px", margin: "0 auto", padding: "clamp(64px,8vw,112px) clamp(20px,4vw,56px)" }}>
            <h2 id="h-int" style={{ fontFamily: "var(--font-display)", fontWeight: "600", fontSize: "clamp(36px,4.6vw,64px)", lineHeight: "1", letterSpacing: "-0.035em", margin: "0 0 40px", maxWidth: "14em" }}>Points should be difficult to fake.</h2>
            <div style={{ fontFamily: "var(--font-mono)", fontSize: "13px", border: "1px solid var(--line)", borderRadius: "4px", overflow: "hidden" }}>
              <div style={{ display: "grid", gridTemplateColumns: "minmax(0,1fr) auto", padding: "12px 18px", background: "var(--canvas-raised)", borderBottom: "1px solid var(--line)", fontSize: "11px", color: "var(--text-muted)" }}><span>AUDIT RULES</span><span>STATUS</span></div>
              <div style={{ display: "grid", gridTemplateColumns: "minmax(0,1fr) auto", gap: "16px", padding: "16px 18px", borderBottom: "1px solid var(--line-soft)" }}><span style={{ fontFamily: "var(--font-body)", fontSize: "17px" }}>Self-merges do not count.</span><span style={{ color: "var(--status)" }}>✓ enforced</span></div>
              <div style={{ display: "grid", gridTemplateColumns: "minmax(0,1fr) auto", gap: "16px", padding: "16px 18px", borderBottom: "1px solid var(--line-soft)" }}><span style={{ fontFamily: "var(--font-body)", fontSize: "17px" }}>The same pull request cannot be awarded twice.</span><span style={{ color: "var(--status)" }}>✓ enforced</span></div>
              <div style={{ display: "grid", gridTemplateColumns: "minmax(0,1fr) auto", gap: "16px", padding: "16px 18px", borderBottom: "1px solid var(--line-soft)" }}><span style={{ fontFamily: "var(--font-body)", fontSize: "17px" }}>Every award retains its repository and merge evidence.</span><span style={{ color: "var(--status)" }}>✓ enforced</span></div>
              <div style={{ display: "grid", gridTemplateColumns: "minmax(0,1fr) auto", gap: "16px", padding: "16px 18px", borderBottom: "1px solid var(--line-soft)" }}><span style={{ fontFamily: "var(--font-body)", fontSize: "17px" }}>Re-synchronization cannot silently reduce earned points.</span><span style={{ color: "var(--status)" }}>✓ enforced</span></div>
              <div style={{ display: "grid", gridTemplateColumns: "minmax(0,1fr) auto", gap: "16px", padding: "16px 18px" }}><span style={{ fontFamily: "var(--font-body)", fontSize: "17px", color: "var(--text-secondary)" }}>Suspicious point allocation requires additional safeguards before public launch.</span><span style={{ color: "var(--text-secondary)" }}>○ open work</span></div>
              </div>
            </div>
          </section>
        {/* ARCHITECTURE */}
        <section aria-labelledby="h-arch" style={{ borderTop: "1px solid var(--line)", background: "var(--canvas-raised)" }}>
          <div data-reveal="" style={{ maxWidth: "1320px", margin: "0 auto", padding: "clamp(64px,8vw,112px) clamp(20px,4vw,56px)", display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(min(100%,340px),1fr))", gap: "48px" }}>
            <div>
              <h2 id="h-arch" style={{ fontFamily: "var(--font-display)", fontWeight: "600", fontSize: "clamp(34px,4vw,56px)", lineHeight: "1.02", letterSpacing: "-0.035em", margin: "0 0 20px" }}>No replacement workflow.</h2>
              <p style={{ fontSize: "18px", lineHeight: "1.6", color: "var(--text-secondary)", margin: "0", maxWidth: "28em" }}>No separate code review system. GitBounty begins and ends with the work already happening on GitHub.</p>
              </div>
            <ol style={{ listStyle: "none", margin: "0", padding: "0 0 0 24px", borderLeft: "1px solid var(--line-strong)", fontFamily: "var(--font-mono)", fontSize: "14px", display: "grid", gap: "22px" }}>
              <li style={{ position: "relative" }}><span aria-hidden="true" style={{ position: "absolute", left: "-29px", top: "5px", width: "9px", height: "9px", background: "var(--text)" }}></span>GitHub identity{" "}<span style={{ color: "var(--text-muted)" }}>— sign in with GitHub</span></li>
              <li style={{ position: "relative" }}><span aria-hidden="true" style={{ position: "absolute", left: "-29px", top: "5px", width: "9px", height: "9px", background: "var(--text)" }}></span>Issue discovery{" "}<span style={{ color: "var(--text-muted)" }}>— labels + filters</span></li>
              <li style={{ position: "relative" }}><span aria-hidden="true" style={{ position: "absolute", left: "-29px", top: "5px", width: "9px", height: "9px", background: "var(--text)" }}></span>Pull request{" "}<span style={{ color: "var(--text-muted)" }}>— repo’s own review</span></li>
              <li style={{ position: "relative" }}><span aria-hidden="true" style={{ position: "absolute", left: "-29px", top: "5px", width: "9px", height: "9px", background: "var(--signal)" }}></span>Merge verification{" "}<span style={{ color: "var(--text-muted)" }}>— merged + closed issue</span></li>
              <li style={{ position: "relative" }}><span aria-hidden="true" style={{ position: "absolute", left: "-29px", top: "5px", width: "9px", height: "9px", background: "var(--signal)" }}></span>Points ledger{" "}<span style={{ color: "var(--text-muted)" }}>— one entry per merge</span></li>
              <li style={{ position: "relative" }}><span aria-hidden="true" style={{ position: "absolute", left: "-29px", top: "5px", width: "9px", height: "9px", background: "var(--signal)" }}></span>Leaderboards{" "}<span style={{ color: "var(--text-muted)" }}>— week · month · category · all</span></li>
              </ol>
            </div>
          </section>
        {/* FAQ */}
        <section aria-labelledby="h-faq" style={{ borderTop: "1px solid var(--line)" }}>
          <div style={{ maxWidth: "980px", margin: "0 auto", padding: "clamp(64px,8vw,112px) clamp(20px,4vw,56px)" }}>
            <h2 id="h-faq" style={{ fontFamily: "var(--font-display)", fontWeight: "600", fontSize: "clamp(34px,4vw,56px)", lineHeight: "1", letterSpacing: "-0.035em", margin: "0 0 32px" }}>FAQ</h2>
            <div style={{ borderTop: "1px solid var(--line-strong)" }}>
              {v.faq.map((f, $index) => (<React.Fragment key={$index}>
                <div style={{ borderBottom: "1px solid var(--line)" }}>
                  <h3 style={{ margin: "0" }}><button type="button" aria-expanded={f.exp} aria-controls={f.id} onClick={f.onClick} style={{ width: "100%", display: "grid", gridTemplateColumns: "minmax(0,1fr) auto", gap: "20px", alignItems: "center", minHeight: "64px", padding: "18px 0", background: "transparent", border: "0", color: "var(--text)", textAlign: "left", font: "500 clamp(18px,1.6vw,22px) var(--font-display)", letterSpacing: "-0.01em", cursor: "pointer" }} className="gbh6">{f.q}<span aria-hidden="true" style={{ fontFamily: "var(--font-mono)", color: "var(--text-secondary)" }}>{f.sign}</span></button></h3>
                  {f.open && (<><p id={f.id} style={{ margin: "0 0 24px", fontSize: "17px", lineHeight: "1.6", color: "var(--text-secondary)", maxWidth: "40em" }}>{f.a}</p></>)}
                  </div>
                </React.Fragment>))}
              </div>
            </div>
          </section>
        {/* CTA (typographic green) */}
        <section aria-labelledby="h-cta" style={{ borderTop: "1px solid var(--line)" }}>
          <div style={{ maxWidth: "1320px", margin: "0 auto", padding: "clamp(96px,13vw,200px) clamp(20px,4vw,56px)" }}>
            <h2 id="h-cta" style={{ fontFamily: "var(--font-display)", fontWeight: "700", fontSize: "clamp(50px,9vw,136px)", lineHeight: "0.9", letterSpacing: "-0.05em", margin: "0 0 48px" }}>Your next contribution<br /><span style={{ color: "var(--signal)" }}>is already open.</span></h2>
            <div style={{ display: "flex", flexWrap: "wrap", gap: "24px 40px", alignItems: "center", borderTop: "3px solid var(--signal)", paddingTop: "28px" }}>
              <p style={{ fontSize: "19px", lineHeight: "1.5", margin: "0", color: "var(--text-secondary)", flex: "1 1 280px", maxWidth: "26em" }}>Find an issue that matches your skills and make the work count.</p>
              <a href="/explore" style={{ display: "inline-flex", alignItems: "center", minHeight: "52px", padding: "0 24px", background: "var(--signal)", color: "var(--canvas)", fontWeight: "600", fontSize: "16px", borderRadius: "2px" }} className="gbh7">Explore open issues →</a>
              <button type="button" disabled={authLoading} onClick={() => (user ? window.location.assign('/explore') : signIn())} style={{ display: "inline-flex", alignItems: "center", minHeight: "52px", padding: "0 4px", color: "var(--text)", background: "transparent", border: "0", borderBottom: "1px solid var(--line-strong)", fontWeight: "500", fontSize: "16px", cursor: "pointer" }} className="gbh8">{user ? 'Browse issues' : 'Connect GitHub'}</button>
              </div>
            </div>
          </section>
        </main>
      <footer style={{ borderTop: "1px solid var(--line-strong)" }}>
        <div style={{ maxWidth: "1320px", margin: "0 auto", padding: "40px clamp(20px,4vw,56px) 28px", display: "grid", gap: "32px" }}>
          <div style={{ display: "flex", flexWrap: "wrap", justifyContent: "space-between", gap: "24px", alignItems: "baseline" }}>
            <span style={{ display: "flex", alignItems: "center", flexWrap: "wrap", gap: "10px", fontFamily: "var(--font-display)", fontWeight: "700", fontSize: "22px", letterSpacing: "-0.02em" }}><img src="/assets/favicon.png" alt="" width="32" height="32" style={{ display: "block", width: "32px", height: "32px", objectFit: "contain" }} />GitBounty <span style={{ fontFamily: "var(--font-body)", fontWeight: "400", fontSize: "15px", color: "var(--text-secondary)", letterSpacing: "0" }}>Open-source work, made visible.</span></span>
            <nav aria-label="Footer" style={{ display: "flex", flexWrap: "wrap", gap: "12px 24px", fontSize: "14px" }}><a href="/explore" style={{ color: "var(--text-secondary)" }}>Explore</a><a href="/leaderboard" style={{ color: "var(--text-secondary)" }}>Leaderboard</a><a href="/contributors" style={{ color: "var(--text-secondary)" }}>Contributors</a><a href="/maintainers" style={{ color: "var(--text-secondary)" }}>Maintainers</a><a href="https://github.com/dipesh4000/gitbounty" style={{ color: "var(--text-secondary)" }}>GitHub repo</a><a href="/docs" style={{ color: "var(--text-secondary)" }}>Docs</a><a href="/privacy" style={{ color: "var(--text-secondary)" }}>Privacy</a><a href="/terms" style={{ color: "var(--text-secondary)" }}>Terms</a><a href="/status" style={{ color: "var(--text-secondary)" }}>Status</a></nav>
            </div>
          <div style={{ fontFamily: "var(--font-mono)", fontSize: "12px", color: "var(--text-muted)", display: "flex", flexWrap: "wrap", justifyContent: "space-between", gap: "12px", borderTop: "1px dashed var(--line)", paddingTop: "16px" }}><span>Points, not money or tokens.</span><span>Not deployed — running locally</span></div>
          </div>
        </footer>
    </>
  );
}
