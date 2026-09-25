'use client';

/**
 * GitBounty — Landing page (Direction B: "Broadsheet")
 * Single-file React component. No dependencies beyond React 18+.
 * Styling: inline style objects + one <style> block (fonts, resets, :hover rules).
 * Data below is SAMPLE data — replace ISSUES / LEAD with API data.
 * See DESIGN_SYSTEM.md for tokens, type, components, and motion rules.
 */
import React, { useEffect, useReducer, useRef } from 'react';

/* ---------- data + behavior ---------- */
const G = '#B7F34A';
const CATS = ['All','Frontend','Backend','Full-stack','Docs','Testing','DevOps','Design','Mobile'];
const ISSUES = [
  {repo:'openframe/core',num:1842,title:'Improve keyboard navigation in the command palette',cat:'Frontend',labels:['TypeScript','a11y'],stars:12400,mins:120,pts:40},
  {repo:'relaylabs/queue',num:611,title:'Retry backoff ignores max_delay under sustained load',cat:'Backend',labels:['Go','good first review'],stars:3100,mins:300,pts:60},
  {repo:'marrow/orm',num:2207,title:'Support composite keys in the migration diff',cat:'Full-stack',labels:['TypeScript','Postgres'],stars:8700,mins:1500,pts:80},
  {repo:'halyard/docs',num:93,title:'Document streaming responses with runnable examples',cat:'Docs',labels:['MDX'],stars:1200,mins:180,pts:20},
  {repo:'cinder/test-kit',num:418,title:'Snapshot test is flaky on Windows path separators',cat:'Testing',labels:['Rust','flaky'],stars:2400,mins:40,pts:30},
  {repo:'driftwood/deploy',num:755,title:'Cache Docker layers across the CI matrix build',cat:'DevOps',labels:['YAML','Docker'],stars:5600,mins:360,pts:50},
  {repo:'tessellate/ui',num:1301,title:'Muted text fails contrast in the dark theme tokens',cat:'Design',labels:['CSS','tokens'],stars:9900,mins:1440,pts:null},
  {repo:'harbor/app',num:274,title:'Android back gesture dismisses nested modal twice',cat:'Mobile',labels:['Kotlin'],stars:1800,mins:2900,pts:35},
  {repo:'openframe/core',num:1857,title:'Typed events for plugin lifecycle hooks',cat:'Backend',labels:['TypeScript','API'],stars:12400,mins:20,pts:null}
];
const LEAD = [
  ['maya-dev',[185,720,4210],[6,21,118],'Frontend',[2,1,0]],
  ['jkoenig',[160,810,5120],[4,19,131],'Backend',[-1,0,0]],
  ['amara-o',[150,540,2980],[5,17,86],'Docs',[3,2,1]],
  ['lin-rui',[135,610,3640],[3,14,97],'Testing',[0,-2,-1]],
  ['tdrummond',[120,455,3890],[4,12,103],'DevOps',[1,1,0]],
  ['pvasquez',[95,500,2210],[3,15,64],'Full-stack',[-2,1,2]],
  ['hiro-t',[90,380,1760],[2,11,49],'Mobile',[4,3,0]],
  ['noor-a',[80,420,2540],[3,13,77],'Design',[0,-1,1]],
  ['ellis-w',[70,300,1980],[2,9,58],'Backend',[-3,0,-1]]
];
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
  ['Is GitBounty paying real money?','No. Points are a record of recognition. They are not currency, tokens, or redeemable value, and they can’t be bought, sold, or withdrawn.'],
  ['How are points assigned?','A maintainer adds a point label to an issue, such as gitbounty:40. When a merged pull request closes that issue, the contributor earns the issue value plus the baseline merge reward.'],
  ['Does every merged PR earn points?','Every valid merged pull request in a tracked repository earns a small baseline of +5. Issue values apply only when a maintainer has explicitly set one.'],
  ['What stops someone from farming points?','Self-merges don’t count, a pull request can only be awarded once, and every award keeps its merge evidence. Safeguards around point allocation are still being hardened before public launch.'],
  ['Do maintainers need to install anything?','Point values are set with GitHub labels on the repository. Detailed maintainer setup is still being finalized and will be documented before launch.'],
  ['Is the Chrome extension required?','No. The extension is a future, optional layer. The complete product is the website.'],
  ['Does GitBounty replace GitHub’s issue or review workflow?','No. Issues, discussion, review, and merge all stay on GitHub. GitBounty reads the merged result and records it.']
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

function vals(c) {
  const s = c.gb; if (!s) return {};
  const set = c.gbSet, wide = s.w >= 900;
  const op = i => s.stage >= i ? '1' : '0.14';
  const hero = {o1:op(1),o2:op(2),o3:op(3),o4:op(4),o5:op(5),pts:'+' + s.pts,progressScale:s.stage/5,
    status:['ISSUE OPEN','BRANCH PUSHED','DIFF +18 −4','PR OPEN · CHECKS 12/12','MERGED · VERIFYING','VERIFIED · RECORDED'][s.stage],
    statusFg: s.stage >= 4 ? G : '#AAB5AB', mergeBg: s.stage >= 4 ? G : '#303C33', totalBg: s.stage >= 5 ? '#172B12' : 'transparent'};
  const q = s.q.trim().toLowerCase();
  let rows = ISSUES.filter(i => (s.cat === 'All' || i.cat === s.cat) && (!q || (i.repo + ' ' + i.title + ' ' + i.labels.join(' ') + ' #' + i.num).toLowerCase().includes(q)));
  rows.sort(s.sort === 'recent' ? (a,b) => a.mins - b.mins : s.sort === 'stars' ? (a,b) => b.stars - a.stars : (a,b) => (b.pts||0) - (a.pts||0));
  if (s.ex === 'empty') rows = [];
  const loading = s.ex === 'loading', error = s.ex === 'error';
  const issues = rows.map(i => ({...i, numS:'#' + i.num, stars:kfmt(i.stars), updated:ago(i.mins), catU:i.cat.toUpperCase(), ptsS: i.pts ? '+' + i.pts : '+5', ptsNote: i.pts ? 'issue value' : 'base only', ptsFg: i.pts ? G : '#AAB5AB', aria:'View issue ' + i.repo + ' #' + i.num}));
  const cats = CATS.map(k => { const on = s.cat === k; return {label:k, count: k === 'All' ? ISSUES.length : ISSUES.filter(i => i.cat === k).length, pressed: on ? 'true' : 'false', bg: on ? '#172B12' : 'transparent', fg: on ? G : '#AAB5AB', bd: on ? G : '#303C33', onClick: () => set({cat:k, ex: s.ex === 'empty' ? 'live' : s.ex})}; });
  const exStates = [['live','Live'],['loading','Loading'],['empty','Empty'],['error','Offline']].map(([k,l]) => ({label:l, pressed: s.ex === k ? 'true' : 'false', fg: s.ex === k ? '#080B09' : '#AAB5AB', bg: s.ex === k ? '#AAB5AB' : 'transparent', onClick: () => set({ex:k})}));
  const hs = s.step;
  const steps = STEPS.map((x,i) => ({n:x[0], k:x[1], title:x[2], pressed: i === hs ? 'true' : 'false', op: i === hs ? '1' : '0.4', nFg: i <= hs ? G : '#707C72', dot: i <= hs ? G : '#303C33', bd: i === hs ? G : '#303C33', onClick: () => set({step:i, tab:i})}));
  const how = {progressScale: (typeof document !== 'undefined' && document.getElementById('how-track')) ? s.prog : hs/3, a1: hs >= 1 ? '1' : '0.12', a2: hs >= 2 ? '1' : '0.12', a3: hs >= 3 ? '1' : '0.12',
    status:['OPEN · UNASSIGNED','IN PROGRESS · PR #1910','MERGED · VERIFIED','+45 RECORDED'][hs], statusFg: hs >= 2 ? G : '#AAB5AB', rowBg: hs >= 3 ? '#172B12' : 'transparent', big:['FIND','BUILD','MERGE','EARN'][hs], num:STEPS[hs][0]};
  const ri = {week:0, month:1, all:2}[s.range];
  const L = LEAD.filter(l => s.lbCat === 'All' || l[3] === s.lbCat).map(l => ({u:l[0], p:l[1][ri], m:l[2][ri], cat:l[3], mv:l[4][ri]})).sort((a,b) => b.p - a.p);
  const leaders = L.map((l,i) => ({rank:String(i+1).padStart(2,'0'), init:l.u.slice(0,2).toUpperCase(), user:'@' + l.u, pts:l.p.toLocaleString('en-US'), merges:l.m + ' merges', mergesN:l.m, cat:l.cat, mv: l.mv > 0 ? '▲ ' + l.mv : l.mv < 0 ? '▼ ' + (-l.mv) : '—', mvFg: l.mv > 0 ? G : l.mv < 0 ? '#AAB5AB' : '#707C72', mvAria: l.mv > 0 ? 'up ' + l.mv : l.mv < 0 ? 'down ' + (-l.mv) : 'no change'}));
  const ranges = [['week','Week'],['month','Month'],['all','All time']].map(([k,l]) => ({label:l, pressed: s.range === k ? 'true' : 'false', fg: s.range === k ? '#080B09' : '#AAB5AB', bg: s.range === k ? G : 'transparent', onClick: () => set({range:k})}));
  const you = {rank:['27','31','142'][ri], pts:['45','95','310'][ri], merges:['1','3','11'][ri] + ' merges', mv:['▲ 5','▲ 2','▲ 9'][ri]};
  const faq = FAQ.map((x,i) => ({q:x[0], a:x[1], open: s.faq === i, exp: s.faq === i ? 'true' : 'false', sign: s.faq === i ? '−' : '+', id:'faq-' + i, onClick: () => set({faq: s.faq === i ? -1 : i})}));
  const taxo = TAXO.map((t,i) => { const on = s.hov === i; return {n:'0' + (i+1), name:t[0].toUpperCase(), glob:t[1], label:t[2], count: ISSUES.filter(x => x.cat === TAXO_CAT[i]).length + ' open', gOp: (on || !wide) ? '1' : '0', gX: (on || !wide) ? 'none' : 'translateX(-8px)', fg: on ? '#F2F6EF' : '#AAB5AB', nFg: on ? G : '#707C72', bg: on ? '#0D110E' : 'transparent', onEnter: () => set({hov:i}), onLeave: () => set({hov:-1})}; });
  const chain = CHAIN.map((k,i) => ({k, n:'0' + (i+1), href:'#ch-' + i, fg: i === s.chapter ? '#F2F6EF' : i < s.chapter ? '#AAB5AB' : '#707C72', dot: i <= s.chapter ? G : '#303C33', ring: i === s.chapter ? G : 'transparent'}));
  return {
    wide, narrow: !wide, navWide: s.w >= 1120, navNarrow: s.w < 1120, hero, cats, exStates, issues, steps, how, leaders, ranges, you, faq, taxo, chain, catOpts: CATS,
    q: s.q, sort: s.sort, lbCat: s.lbCat, loading, error, isEmpty: !loading && !error && rows.length === 0, hasRows: !loading && !error && rows.length > 0,
    resultsLabel: loading ? 'Fetching issues…' : error ? 'Index unavailable' : rows.length + ' open issue' + (rows.length === 1 ? '' : 's') + (s.cat !== 'All' ? ' · ' + s.cat : ''),
    emptyMsg: q ? 'No open issues match “' + s.q.trim() + '”' + (s.cat !== 'All' ? ' in ' + s.cat : '') + '.' : 'No open ' + (s.cat === 'All' ? '' : s.cat + ' ') + 'issues right now.',
    lbEmpty: L.length === 0,
    onQ: e => set({q: e.target.value, ex: s.ex === 'empty' ? 'live' : s.ex}), onSort: e => set({sort: e.target.value}), onLbCat: e => set({lbCat: e.target.value}),
    clear: () => set({q:'', cat:'All', ex:'live'}),
    retry: () => { set({ex:'loading'}); setTimeout(() => set({ex:'live'}), 900); },
    headerBg: s.scrolled || s.menu ? 'rgba(8,11,9,0.88)' : 'rgba(8,11,9,0)', headerBd: s.scrolled ? '#202923' : 'rgba(32,41,35,0)', headerBlur: s.scrolled ? 'blur(10px)' : 'none',
    menu: s.menu, menuExp: s.menu ? 'true' : 'false', menuLabel: s.menu ? 'Close' : 'Menu', toggleMenu: () => set({menu: !s.menu}), closeMenu: () => set({menu:false})
  };
}


/* ---------- global CSS (fonts, resets, hover states) ---------- */
const CSS = "@import url('https://fonts.googleapis.com/css2?family=Space+Grotesk:wght@400;500;600;700&family=Inter:wght@400;500;600&family=JetBrains+Mono:wght@400;500;600&display=swap');\nhtml{scroll-behavior:smooth}\nbody{margin:0;background:#080B09;color:#F2F6EF;font-family:Inter,system-ui,sans-serif;-webkit-font-smoothing:antialiased}\na{color:#F2F6EF;text-decoration:none}\na:hover{color:#B7F34A}\n::selection{background:#B7F34A;color:#080B09}\n:focus-visible{outline:2px solid #D7FF8F;outline-offset:2px}\ninput::placeholder{color:#707C72}\nbutton,a,input,select{transition-property:background,color,border-color,opacity;transition-duration:160ms}\n@media (prefers-reduced-motion:reduce){html{scroll-behavior:auto}*{transition:none!important}}\n.gbh0:hover{background:#9DDD32 !important;color:#080B09 !important}\n.gbh1:hover{background:#9DDD32 !important;color:#080B09 !important}\n.gbh2:hover{border-color:#AAB5AB !important}\n.gbh3:hover{color:#F2F6EF !important}\n.gbh4:hover{background:#0D110E !important}\n.gbh5:hover{opacity:1 !important}\n.gbh6:hover{color:#B7F34A !important}\n.gbh7:hover{background:#9DDD32 !important;color:#080B09 !important}\n.gbh8:hover{color:#B7F34A !important}";

/* ---------- component ---------- */
export default function GitBountyLanding() {
  const [, force] = useReducer(x => x + 1, 0);
  const c = useRef(null);
  if (!c.current) { c.current = { forceUpdate: () => {} }; init(c.current); }
  c.current.forceUpdate = force;
  useEffect(() => { mount(c.current); return () => unmount(c.current); }, []);
  const v = vals(c.current);

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
        <div style={{ maxWidth: "1320px", margin: "0 auto", padding: "0 clamp(20px,4vw,56px)", height: "60px", display: "flex", alignItems: "center", gap: "28px", fontFamily: "'JetBrains Mono',monospace", fontSize: "12.5px" }}>
          <a href="#top" aria-label="GitBounty home" style={{ display: "flex", alignItems: "center", gap: "10px", fontFamily: "'Space Grotesk',sans-serif", fontWeight: "700", fontSize: "17px", letterSpacing: "-0.02em" }}><img src="/assets/favicon.png" alt="" width="28" height="28" style={{ display: "block", width: "28px", height: "28px", objectFit: "contain" }} />GitBounty</a>
          {v.navWide && (<>
            <nav aria-label="Primary" style={{ whiteSpace: "nowrap", display: "flex", gap: "24px", color: "#AAB5AB", marginLeft: "auto" }}>
              <a href="#explore" style={{ color: "#AAB5AB" }}>Explore Issues</a><a href="#how" style={{ color: "#AAB5AB" }}>How It Works</a><a href="#leaderboard" style={{ color: "#AAB5AB" }}>Leaderboard</a><a href="#maintainers" style={{ color: "#AAB5AB" }}>For Maintainers</a><a href="https://github.com" style={{ color: "#AAB5AB" }}>GitHub ↗</a>
              </nav>
            <span aria-hidden="true" style={{ width: "1px", height: "20px", background: "#303C33" }}></span>
            <a href="#signin" style={{ whiteSpace: "nowrap", color: "#F2F6EF" }}>Sign in</a>
            <a href="#connect" style={{ whiteSpace: "nowrap", fontFamily: "Inter,sans-serif", fontSize: "14px", fontWeight: "600", background: "#B7F34A", color: "#080B09", padding: "8px 14px", borderRadius: "2px" }} className="gbh0">Connect GitHub</a>
            </>)}
          {v.navNarrow && (<>
            <button type="button" aria-expanded={v.menuExp} aria-controls="mnav" onClick={v.toggleMenu} style={{ marginLeft: "auto", minHeight: "44px", padding: "0 14px", background: "transparent", border: "1px solid #303C33", borderRadius: "2px", color: "#F2F6EF", font: "500 13px 'JetBrains Mono',monospace", cursor: "pointer" }}>{v.menuLabel}</button>
            </>)}
          </div>
        {v.menu && (<>
          <nav id="mnav" aria-label="Mobile" style={{ borderTop: "1px solid #202923", padding: "8px clamp(20px,4vw,56px) 20px", display: "flex", flexDirection: "column", fontSize: "17px" }}>
            <a href="#explore" onClick={v.closeMenu} style={{ padding: "14px 0", borderBottom: "1px solid #202923" }}>Explore Issues</a><a href="#how" onClick={v.closeMenu} style={{ padding: "14px 0", borderBottom: "1px solid #202923" }}>How It Works</a><a href="#leaderboard" onClick={v.closeMenu} style={{ padding: "14px 0", borderBottom: "1px solid #202923" }}>Leaderboard</a><a href="#maintainers" onClick={v.closeMenu} style={{ padding: "14px 0", borderBottom: "1px solid #202923" }}>For Maintainers</a><a href="#signin" style={{ whiteSpace: "nowrap", padding: "14px 0", borderBottom: "1px solid #202923" }}>Sign in</a>
            <a href="#connect" style={{ whiteSpace: "nowrap", marginTop: "16px", textAlign: "center", padding: "14px", background: "#B7F34A", color: "#080B09", fontWeight: "600", borderRadius: "2px" }}>Connect GitHub</a>
            </nav>
          </>)}
        </header>
      <main id="top">
        {/* HERO */}
        <section aria-labelledby="h-hero" style={{ maxWidth: "1320px", margin: "0 auto", padding: "clamp(40px,6vw,80px) clamp(20px,4vw,56px) 0" }}>
          <div style={{ display: "flex", justifyContent: "space-between", gap: "16px", flexWrap: "wrap", fontFamily: "'JetBrains Mono',monospace", fontSize: "11.5px", color: "#707C72", borderBottom: "1px solid #303C33", paddingBottom: "12px", marginBottom: "clamp(28px,4vw,48px)" }}><span>THE OPEN-SOURCE LEDGER</span><span>points · not money · not tokens</span></div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(min(100%,340px),1fr))", gap: "40px clamp(32px,5vw,64px)", alignItems: "end" }}>
            <h1 id="h-hero" style={{ gridColumn: "1/-1", fontFamily: "'Space Grotesk',sans-serif", fontWeight: "600", fontSize: "clamp(46px,7.4vw,96px)", lineHeight: "0.94", letterSpacing: "-0.045em", margin: "0" }}>Find the issue.<br />Ship the fix.<br /><span style={{ color: "#B7F34A" }}>Earn the signal.</span></h1>
            <p style={{ fontSize: "clamp(17px,1.3vw,19px)", lineHeight: "1.6", color: "#AAB5AB", margin: "0", maxWidth: "34em", textWrap: "pretty" }}>GitBounty turns merged open-source contributions into a visible record of impact. Discover issues that match your skills, ship the work through GitHub, and earn points when your pull request merges.</p>
            <div style={{ display: "grid", gap: "16px", justifyItems: "start" }}>
              <div style={{ display: "flex", flexWrap: "wrap", gap: "10px" }}>
                <a href="#explore" style={{ display: "inline-flex", alignItems: "center", gap: "10px", minHeight: "48px", padding: "0 20px", background: "#B7F34A", color: "#080B09", fontWeight: "600", fontSize: "15px", borderRadius: "2px" }} className="gbh1">Explore open issues →</a>
                <a href="#provenance" style={{ display: "inline-flex", alignItems: "center", minHeight: "48px", padding: "0 20px", border: "1px solid #465449", fontSize: "15px", borderRadius: "2px" }} className="gbh2">How points work</a>
                </div>
              <span style={{ fontFamily: "'JetBrains Mono',monospace", fontSize: "12px", color: "#707C72" }}>Built around GitHub. No new contribution workflow.</span>
              </div>
            </div>
          <ol aria-label="Sample contribution: issue to reputation" style={{ listStyle: "none", margin: "clamp(48px,6vw,80px) 0 0", padding: "0", display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(min(100%,180px),1fr))", borderTop: "1px solid #465449", borderBottom: "1px solid #303C33", position: "relative", fontFamily: "'JetBrains Mono',monospace" }}>
            <span aria-hidden="true" style={{ position: "absolute", top: "-2px", left: "0", height: "3px", width: "100%", transform: `scaleX(${v.hero.progressScale})`, transformOrigin: "left", background: "#B7F34A", transition: "transform 600ms cubic-bezier(.2,.7,.2,1)" }}></span>
            <li style={{ padding: "20px 18px 22px 0", borderRight: "1px solid #202923", display: "grid", gap: "8px", alignContent: "start" }}><span style={{ fontSize: "11px", color: "#707C72" }}>01 ISSUE</span><span style={{ fontSize: "20px", fontWeight: "600" }}>#1842</span><span style={{ fontSize: "12px", color: "#AAB5AB", lineHeight: "1.5" }}>openframe/core<br />Improve keyboard navigation<br /><span style={{ color: "#B7F34A" }}>+40 · FRONTEND</span></span></li>
            <li style={{ padding: "20px 18px 22px", borderRight: "1px solid #202923", display: "grid", gap: "8px", alignContent: "start", opacity: v.hero.o1, transition: "opacity 420ms" }}><span style={{ fontSize: "11px", color: "#707C72" }}>02 CODE</span><span style={{ fontSize: "20px", fontWeight: "600" }}><span style={{ color: "#3DDB82" }}>+18</span>{" "}−4</span><span style={{ fontSize: "12px", color: "#AAB5AB", lineHeight: "1.5", overflowWrap: "anywhere" }}>CommandPalette.tsx<br />useFocusTrap(ref)</span></li>
            <li style={{ padding: "20px 18px 22px", borderRight: "1px solid #202923", display: "grid", gap: "8px", alignContent: "start", opacity: v.hero.o2, transition: "opacity 420ms" }}><span style={{ fontSize: "11px", color: "#707C72" }}>03 PULL REQUEST</span><span style={{ fontSize: "20px", fontWeight: "600" }}>#1910</span><span style={{ fontSize: "12px", color: "#AAB5AB", lineHeight: "1.5" }}>checks 12/12<br />review approved</span></li>
            <li style={{ padding: "20px 18px 22px", borderRight: "1px solid #202923", display: "grid", gap: "8px", alignContent: "start", opacity: v.hero.o3, transition: "opacity 420ms" }}><span style={{ fontSize: "11px", color: "#707C72" }}>04 MERGE</span><span style={{ fontSize: "20px", fontWeight: "600", display: "flex", alignItems: "center", gap: "8px" }}><span aria-hidden="true" style={{ width: "9px", height: "9px", borderRadius: "50%", background: v.hero.mergeBg }}></span>a3f9c1e</span><span style={{ fontSize: "12px", color: "#AAB5AB", lineHeight: "1.5" }}>→ main · 14:32 UTC<br />author ≠ merger</span></li>
            <li style={{ padding: "20px 18px 22px", borderRight: "1px solid #202923", display: "grid", gap: "8px", alignContent: "start", opacity: v.hero.o4, background: v.hero.totalBg, transition: "opacity 420ms,background 420ms" }}><span style={{ fontSize: "11px", color: "#707C72" }}>05 POINTS</span><span style={{ fontSize: "28px", fontWeight: "600", color: "#B7F34A", lineHeight: "1" }}>{v.hero.pts}</span><span style={{ fontSize: "12px", color: "#AAB5AB", lineHeight: "1.5" }}>+5 base<br />+40 issue value</span></li>
            <li style={{ padding: "20px 0 22px 18px", display: "grid", gap: "8px", alignContent: "start", opacity: v.hero.o5, transition: "opacity 420ms" }}><span style={{ fontSize: "11px", color: "#707C72" }}>06 REPUTATION</span><span style={{ fontSize: "20px", fontWeight: "600" }}>@maya-dev</span><span style={{ fontSize: "12px", color: "#AAB5AB", lineHeight: "1.5" }}>#01 this week<br />Frontend · 6 merges</span></li>
            </ol>
          <div style={{ display: "flex", justifyContent: "space-between", gap: "12px", flexWrap: "wrap", padding: "10px 0", fontFamily: "'JetBrains Mono',monospace", fontSize: "11px", color: "#707C72" }}><span aria-live="polite" style={{ color: v.hero.statusFg }}>{v.hero.status}</span><span>sample data · illustrative repositories</span></div>
          </section>
        {/* MANIFESTO */}
        <section aria-label="Why GitBounty" style={{ maxWidth: "1320px", margin: "0 auto", padding: "clamp(88px,12vw,176px) clamp(20px,4vw,56px)" }}>
          <p data-reveal="" style={{ fontFamily: "'Space Grotesk',sans-serif", fontWeight: "500", fontSize: "clamp(36px,5.6vw,80px)", lineHeight: "1", letterSpacing: "-0.04em", margin: "0 0 40px", maxWidth: "14em" }}>Open source already has the work. It needs a better{" "}<span style={{ color: "#B7F34A" }}>signal.</span></p>
          <p style={{ fontFamily: "'JetBrains Mono',monospace", fontSize: "clamp(13px,1.1vw,15px)", lineHeight: "1.8", color: "#AAB5AB", margin: "0", display: "flex", flexWrap: "wrap", gap: "4px 24px" }}><span>Find work matched to your stack.</span><span aria-hidden="true" style={{ color: "#465449" }}>/</span><span>Keep the contribution on GitHub.</span><span aria-hidden="true" style={{ color: "#465449" }}>/</span><span>Build reputation from merged code.</span></p>
          </section>
        {/* EXPLORER */}
        <section id="explore" aria-labelledby="h-explore" style={{ scrollMarginTop: "60px", borderTop: "1px solid #303C33" }}>
          <div style={{ maxWidth: "1320px", margin: "0 auto", padding: "clamp(64px,8vw,112px) clamp(20px,4vw,56px)" }}>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(min(100%,300px),1fr))", gap: "24px 64px", alignItems: "end", marginBottom: "40px" }}>
              <h2 id="h-explore" style={{ fontFamily: "'Space Grotesk',sans-serif", fontWeight: "600", fontSize: "clamp(36px,4.6vw,64px)", lineHeight: "1", letterSpacing: "-0.035em", margin: "0" }}>Work worth opening.</h2>
              <p style={{ fontSize: "18px", lineHeight: "1.6", color: "#AAB5AB", margin: "0", maxWidth: "30em" }}>Browse unassigned issues by the kind of work you actually want to do.</p>
              </div>
            <div style={{ display: "flex", flexWrap: "wrap", borderTop: "1px solid #465449" }}>
              <aside aria-label="Filters" style={{ flex: "1 1 220px", maxWidth: "100%", boxSizing: "border-box", padding: "20px 24px 20px 0", display: "grid", gap: "20px", alignContent: "start", borderRight: "1px solid #202923" }}>
                <label style={{ display: "grid", gap: "8px", fontFamily: "'JetBrains Mono',monospace", fontSize: "11px", color: "#707C72" }}>SEARCH{" "}<input type="search" value={v.q} onChange={v.onQ} placeholder="repo, title, label…" style={{ minHeight: "44px", padding: "0 12px", background: "#0D110E", border: "1px solid #303C33", borderRadius: "2px", color: "#F2F6EF", font: "15px Inter,sans-serif", outlineOffset: "0" }} />
                  </label>
                <label style={{ display: "grid", gap: "8px", fontFamily: "'JetBrains Mono',monospace", fontSize: "11px", color: "#707C72" }}>SORT{" "}<select value={v.sort} onChange={v.onSort} style={{ minHeight: "44px", padding: "0 8px", background: "#0D110E", border: "1px solid #303C33", borderRadius: "2px", color: "#F2F6EF", font: "14px Inter,sans-serif" }}><option value="points">Highest points</option><option value="recent">Recently updated</option><option value="stars">Most stars</option></select>
                  </label>
                <div role="group" aria-label="Category" style={{ display: "flex", flexDirection: "column", gap: "2px" }}>
                  <span style={{ fontFamily: "'JetBrains Mono',monospace", fontSize: "11px", color: "#707C72", marginBottom: "6px" }}>CATEGORY</span>
                  {v.cats.map((c, $index) => (<React.Fragment key={$index}>
                    <button type="button" aria-pressed={c.pressed} onClick={c.onClick} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", minHeight: "40px", padding: "0 10px", border: "0", borderLeft: `2px solid ${c.bd}`, background: c.bg, color: c.fg, font: "500 14px Inter,sans-serif", cursor: "pointer", textAlign: "left", transition: "all 160ms" }} className="gbh3">{c.label}<span style={{ fontFamily: "'JetBrains Mono',monospace", fontSize: "11px" }}>{c.count}</span></button>
                    </React.Fragment>))}
                  </div>
                <div role="group" aria-label="Preview state (design demo)" style={{ display: "flex", flexWrap: "wrap", gap: "4px", fontFamily: "'JetBrains Mono',monospace", fontSize: "11px", paddingTop: "16px", borderTop: "1px dashed #303C33" }}>
                  <span style={{ width: "100%", color: "#707C72", marginBottom: "4px" }}>PREVIEW STATE</span>
                  {v.exStates.map((s, $index) => (<React.Fragment key={$index}><button type="button" aria-pressed={s.pressed} onClick={s.onClick} style={{ minHeight: "30px", padding: "0 8px", border: "1px solid #303C33", borderRadius: "2px", background: s.bg, color: s.fg, font: "inherit", cursor: "pointer" }}>{s.label}</button></React.Fragment>))}
                  </div>
                </aside>
              <div style={{ flex: "999 1 520px", minWidth: "0" }}>
                <div style={{ display: "flex", justifyContent: "space-between", padding: "14px 0 14px 24px", borderBottom: "1px solid #303C33", fontFamily: "'JetBrains Mono',monospace", fontSize: "11.5px", color: "#707C72" }}><span aria-live="polite">{v.resultsLabel}</span><span>sample data</span></div>
                {v.loading && (<>
                  <div aria-busy="true" style={{ paddingLeft: "24px" }}><div style={{ padding: "22px 0", borderBottom: "1px solid #202923" }}><div style={{ height: "12px", width: "40%", background: "#172019", marginBottom: "10px" }}></div><div style={{ height: "12px", width: "70%", background: "#172019" }}></div></div><div style={{ padding: "22px 0", borderBottom: "1px solid #202923", opacity: ".6" }}><div style={{ height: "12px", width: "30%", background: "#172019", marginBottom: "10px" }}></div><div style={{ height: "12px", width: "55%", background: "#172019" }}></div></div><div style={{ padding: "22px 0", opacity: ".35" }}><div style={{ height: "12px", width: "36%", background: "#172019", marginBottom: "10px" }}></div><div style={{ height: "12px", width: "62%", background: "#172019" }}></div></div></div>
                  </>)}
                {v.error && (<>
                  <div role="alert" style={{ padding: "48px 24px", display: "grid", gap: "12px", justifyItems: "start" }}><span style={{ fontFamily: "'JetBrains Mono',monospace", fontSize: "12px", color: "#AAB5AB" }}>ERR 503 · issue index unreachable</span><p style={{ fontFamily: "'Space Grotesk',sans-serif", fontSize: "28px", letterSpacing: "-0.02em", margin: "0" }}>Issues didn’t load.</p><p style={{ margin: "0", color: "#AAB5AB" }}>Filters are kept. Nothing on GitHub is affected.</p><button type="button" onClick={v.retry} style={{ minHeight: "44px", padding: "0 18px", border: "1px solid #465449", borderRadius: "2px", background: "transparent", color: "#F2F6EF", font: "500 14px Inter,sans-serif", cursor: "pointer" }}>Retry</button></div>
                  </>)}
                {v.isEmpty && (<>
                  <div style={{ padding: "48px 24px", display: "grid", gap: "12px", justifyItems: "start" }}><span style={{ fontFamily: "'JetBrains Mono',monospace", fontSize: "12px", color: "#707C72" }}>0 rows</span><p style={{ fontFamily: "'Space Grotesk',sans-serif", fontSize: "28px", letterSpacing: "-0.02em", margin: "0" }}>{v.emptyMsg}</p><button type="button" onClick={v.clear} style={{ minHeight: "44px", padding: "0 18px", border: "1px solid #465449", borderRadius: "2px", background: "transparent", color: "#F2F6EF", font: "500 14px Inter,sans-serif", cursor: "pointer" }}>Clear filters</button></div>
                  </>)}
                {v.hasRows && (<>
                  <ul style={{ listStyle: "none", margin: "0", padding: "0" }}>
                    {v.issues.map((i, $index) => (<React.Fragment key={$index}>
                      <li style={{ borderBottom: "1px solid #202923", transition: "background 160ms" }} className="gbh4">
                        <a href="#explore" aria-label={i.aria} style={{ display: "grid", gridTemplateColumns: "minmax(0,1fr) auto", gap: "10px 24px", padding: "18px 16px 18px 24px", color: "#F2F6EF" }}>
                          <span style={{ minWidth: "0", display: "grid", gap: "8px" }}>
                            <span style={{ fontFamily: "'JetBrains Mono',monospace", fontSize: "12px", color: "#AAB5AB", display: "flex", flexWrap: "wrap", gap: "4px 14px" }}><span>{i.repo} {i.numS}</span><span style={{ color: "#707C72" }}>★ {i.stars} · {i.updated}</span></span>
                            <span style={{ fontFamily: "'Space Grotesk',sans-serif", fontSize: "clamp(18px,1.6vw,22px)", fontWeight: "500", letterSpacing: "-0.01em", lineHeight: "1.25" }}>{i.title}</span>
                            <span style={{ display: "flex", flexWrap: "wrap", gap: "6px", fontFamily: "'JetBrains Mono',monospace", fontSize: "11px", color: "#AAB5AB" }}><span style={{ color: "#F2F6EF" }}>{i.catU}</span>{i.labels.map((l, $index) => (<React.Fragment key={$index}><span>· {l}</span></React.Fragment>))}</span>
                            </span>
                          <span style={{ display: "grid", justifyItems: "end", alignContent: "center", gap: "2px", fontFamily: "'JetBrains Mono',monospace" }}><span style={{ fontSize: "24px", fontWeight: "600", color: i.ptsFg }}>{i.ptsS}</span><span style={{ fontSize: "10.5px", color: "#707C72" }}>{i.ptsNote}</span><span style={{ fontSize: "12px", color: "#AAB5AB", marginTop: "6px" }}>View issue →</span></span>
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
        <section id="how" aria-labelledby="h-how" style={{ scrollMarginTop: "60px", borderTop: "1px solid #303C33", background: "#0D110E" }}>
          <div style={{ maxWidth: "1320px", margin: "0 auto", padding: "clamp(64px,8vw,112px) clamp(20px,4vw,56px)" }}>
            <h2 id="h-how" style={{ fontFamily: "'Space Grotesk',sans-serif", fontWeight: "600", fontSize: "clamp(36px,4.6vw,64px)", lineHeight: "1", letterSpacing: "-0.035em", margin: "0 0 48px", maxWidth: "12em" }}>Four steps. Three of them already happen on GitHub.</h2>
            <div role="tablist" aria-label="How it works" style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(min(100%,220px),1fr))", position: "relative", borderTop: "1px solid #303C33" }}>
              <span aria-hidden="true" style={{ position: "absolute", top: "-1px", left: "0", height: "2px", width: "100%", transform: `scaleX(${v.how.progressScale})`, transformOrigin: "left", background: "#B7F34A", transition: "transform 520ms cubic-bezier(.2,.7,.2,1)" }}></span>
              {v.steps.map((st, $index) => (<React.Fragment key={$index}>
                <button type="button" role="tab" aria-selected={st.pressed} onClick={st.onClick} style={{ display: "grid", gap: "10px", alignContent: "start", textAlign: "left", padding: "22px 20px 26px 0", background: "transparent", border: "0", color: "#F2F6EF", cursor: "pointer", opacity: st.op, transition: "opacity 180ms" }} className="gbh5">
                  <span style={{ fontFamily: "'JetBrains Mono',monospace", fontSize: "12px", color: st.nFg }}>{st.n} — {st.k}</span>
                  <span style={{ fontSize: "17px", lineHeight: "1.5", fontFamily: "Inter,sans-serif" }}>{st.title}</span>
                  </button>
                </React.Fragment>))}
              </div>
            <div role="tabpanel" style={{ marginTop: "24px", display: "flex", flexWrap: "wrap", border: "1px solid #303C33", borderRadius: "4px", background: "#080B09", fontFamily: "'JetBrains Mono',monospace", fontSize: "13px", overflow: "hidden" }}>
              <div style={{ flex: "1 1 260px", padding: "24px", borderRight: "1px solid #202923", display: "grid", gap: "6px", alignContent: "start" }}><span style={{ color: "#707C72", fontSize: "11px" }}>ARTIFACT · {v.how.num}</span><span style={{ fontFamily: "'Space Grotesk',sans-serif", fontSize: "clamp(48px,6vw,88px)", fontWeight: "600", letterSpacing: "-0.04em", lineHeight: "1" }}>{v.how.big}</span><span style={{ color: v.how.statusFg, fontSize: "12px" }}>{v.how.status}</span></div>
              <div style={{ flex: "2 1 420px", minWidth: "0", display: "grid" }}>
                <div style={{ padding: "16px 20px", borderBottom: "1px solid #202923", color: "#AAB5AB" }}>openframe/core{" "}<span style={{ color: "#F2F6EF" }}>#1842</span>{" "}Improve keyboard navigation ·{" "}<span style={{ color: "#F2F6EF" }}>gitbounty:40</span></div>
                <div style={{ padding: "16px 20px", borderBottom: "1px solid #202923", color: "#AAB5AB", opacity: v.how.a1, transition: "opacity 480ms" }}>branch maya-dev:fix/palette-focus-trap → PR{" "}<span style={{ color: "#F2F6EF" }}>#1910</span>{" "}· approved</div>
                <div style={{ padding: "16px 20px", borderBottom: "1px solid #202923", color: "#AAB5AB", opacity: v.how.a2, transition: "opacity 480ms" }}><span style={{ color: "#B7F34A" }}>●</span>{" "}merged a3f9c1e · closes #1842 ✓ · author ≠ merger ✓</div>
                <div style={{ padding: "16px 20px", display: "flex", justifyContent: "space-between", gap: "16px", opacity: v.how.a3, background: v.how.rowBg, transition: "opacity 480ms,background 480ms" }}><span style={{ color: "#AAB5AB" }}>ledger · @maya-dev · FRONTEND</span><span style={{ color: "#B7F34A", fontWeight: "600", fontSize: "18px" }}>+45</span></div>
                </div>
              </div>
            </div>
          </section>
        {/* PROVENANCE */}
        <section id="provenance" aria-labelledby="h-prov" style={{ scrollMarginTop: "60px", borderTop: "1px solid #303C33" }}>
          <div data-reveal="" style={{ maxWidth: "1320px", margin: "0 auto", padding: "clamp(72px,10vw,144px) clamp(20px,4vw,56px)", display: "grid", justifyItems: "center", textAlign: "center" }}>
            <h2 id="h-prov" style={{ fontFamily: "'Space Grotesk',sans-serif", fontWeight: "600", fontSize: "clamp(38px,5.4vw,76px)", lineHeight: "0.98", letterSpacing: "-0.04em", margin: "0 0 24px", maxWidth: "12em" }}>Every point has a commit behind it.</h2>
            <p style={{ fontSize: "18px", lineHeight: "1.6", color: "#AAB5AB", margin: "0 0 56px", maxWidth: "32em" }}>GitBounty records where points came from, what shipped, and when it merged. Recognition stays attached to the work that earned it.</p>
            <div style={{ width: "100%", maxWidth: "520px", textAlign: "left", background: "#F2F6EF", color: "#080B09", borderRadius: "2px", padding: "28px 28px 24px", fontFamily: "'JetBrains Mono',monospace", fontSize: "13.5px", lineHeight: "1.85", boxSizing: "border-box" }}>
              <div style={{ display: "flex", justifyContent: "space-between", fontSize: "11px", borderBottom: "1px solid #080B09", paddingBottom: "10px", marginBottom: "12px" }}><span>GITBOUNTY · RECEIPT</span><span>SAMPLE</span></div>
              <div style={{ display: "grid", gridTemplateColumns: "auto minmax(0,1fr)", gap: "0 20px" }}>
                <span style={{ color: "#303C33" }}>contributor</span><span>@maya-dev</span><span style={{ color: "#303C33" }}>repository</span><span>openframe/core</span><span style={{ color: "#303C33" }}>pull request</span><span>#1910</span><span style={{ color: "#303C33" }}>closed issue</span><span>#1842</span><span style={{ color: "#303C33" }}>category</span><span>FRONTEND</span><span style={{ color: "#303C33" }}>merged</span><span>2026-09-18 14:32 UTC</span>
                </div>
              <div style={{ borderTop: "1px dashed #080B09", marginTop: "14px", paddingTop: "10px", display: "grid", gridTemplateColumns: "minmax(0,1fr) auto" }}><span>BASE MERGE REWARD</span><span>+5</span><span>ISSUE VALUE</span><span>+40</span></div>
              <div style={{ borderTop: "2px solid #080B09", marginTop: "10px", paddingTop: "10px", display: "grid", gridTemplateColumns: "minmax(0,1fr) auto", alignItems: "baseline", fontWeight: "600" }}><span>TOTAL EARNED</span><span style={{ fontSize: "28px", background: "#B7F34A", padding: "0 8px" }}>+45</span></div>
              <div style={{ marginTop: "14px", fontSize: "11px", color: "#303C33" }}>Recognition only. Not currency, not redeemable.</div>
              </div>
            </div>
          </section>
        {/* TWO-SIDED */}
        <section id="maintainers" aria-label="Contributors and maintainers" style={{ scrollMarginTop: "60px", borderTop: "1px solid #303C33" }}>
          <div style={{ maxWidth: "1320px", margin: "0 auto", padding: "clamp(64px,8vw,112px) clamp(20px,4vw,56px)", display: "flex", flexWrap: "wrap", gap: "56px" }}>
            <div data-reveal="" style={{ flex: "2 1 480px", minWidth: "0" }}>
              <h2 style={{ fontFamily: "'Space Grotesk',sans-serif", fontWeight: "600", fontSize: "clamp(40px,5.4vw,76px)", lineHeight: "0.96", letterSpacing: "-0.04em", margin: "0 0 40px" }}>Stop searching<br />at random.</h2>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(min(100%,220px),1fr))", gap: "0 32px", fontSize: "18px", lineHeight: "1.45" }}>
                <p style={{ margin: "0", padding: "16px 0", borderTop: "1px solid #303C33" }}>Browse work by discipline.</p>
                <p style={{ margin: "0", padding: "16px 0", borderTop: "1px solid #303C33" }}>See what an issue is worth before starting.</p>
                <p style={{ margin: "0", padding: "16px 0", borderTop: "1px solid #303C33" }}>Keep working through GitHub.</p>
                <p style={{ margin: "0", padding: "16px 0", borderTop: "1px solid #303C33" }}>Build a public record from merged contributions.</p>
                <p style={{ margin: "0", padding: "16px 0", borderTop: "1px solid #303C33" }}>Compete by week, category, or all time.</p>
                </div>
              </div>
            <div data-reveal="" style={{ flex: "1 1 300px", minWidth: "0", borderLeft: "1px solid #465449", paddingLeft: "clamp(20px,3vw,40px)", fontFamily: "'JetBrains Mono',monospace", fontSize: "13px", color: "#AAB5AB", lineHeight: "1.7" }}>
              <div style={{ fontSize: "11px", color: "#707C72", marginBottom: "16px" }}>FOR MAINTAINERS</div>
              <h2 style={{ fontFamily: "'Space Grotesk',sans-serif", fontWeight: "500", fontSize: "clamp(26px,2.6vw,34px)", lineHeight: "1.1", letterSpacing: "-0.025em", color: "#F2F6EF", margin: "0 0 24px" }}>Give important work a signal.</h2>
              <div style={{ padding: "12px", border: "1px solid #303C33", borderRadius: "2px", marginBottom: "20px", background: "#0D110E" }}><span style={{ color: "#707C72" }}>$ label add{" "}</span><span style={{ color: "#B7F34A" }}>gitbounty:60</span><span style={{ color: "#707C72" }}>{" "}→ #611</span></div>
              <div>+ assign points through a GitHub label</div><div>+ bring overlooked issues back into view</div><div>+ attract contributors with relevant skills</div><div>= preserve the existing review process</div><div style={{ color: "#F2F6EF" }}>= keep control of what gets merged</div>
              </div>
            </div>
          </section>
        {/* CATEGORIES */}
        <section aria-labelledby="h-cat" style={{ borderTop: "1px solid #303C33" }}>
          <div style={{ maxWidth: "1320px", margin: "0 auto", padding: "clamp(64px,8vw,112px) clamp(20px,4vw,56px)" }}>
            <h2 id="h-cat" style={{ fontFamily: "'Space Grotesk',sans-serif", fontWeight: "600", fontSize: "clamp(34px,4vw,56px)", lineHeight: "1", letterSpacing: "-0.035em", margin: "0 0 36px" }}>A taxonomy of useful work.</h2>
            <ul style={{ listStyle: "none", margin: "0", padding: "0", display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(min(100%,280px),1fr))", borderTop: "1px solid #303C33", borderLeft: "1px solid #303C33" }}>
              {v.taxo.map((t, $index) => (<React.Fragment key={$index}>
                <li onMouseEnter={t.onEnter} onMouseLeave={t.onLeave} style={{ aspectRatio: "1.35", minHeight: "180px", display: "flex", flexDirection: "column", justifyContent: "space-between", padding: "20px", borderRight: "1px solid #303C33", borderBottom: "1px solid #303C33", background: t.bg, transition: "background 160ms" }}>
                  <span style={{ display: "flex", justifyContent: "space-between", fontFamily: "'JetBrains Mono',monospace", fontSize: "12px", color: t.nFg }}><span>{t.n}</span><span style={{ color: "#707C72" }}>{t.count}</span></span>
                  <span style={{ display: "grid", gap: "10px" }}><span style={{ fontFamily: "'Space Grotesk',sans-serif", fontWeight: "600", fontSize: "clamp(24px,2.3vw,32px)", letterSpacing: "-0.02em", color: t.fg }}>{t.name}</span><span style={{ fontFamily: "'JetBrains Mono',monospace", fontSize: "12px", color: "#AAB5AB", overflowWrap: "anywhere" }}>{t.glob}</span><span style={{ fontFamily: "'JetBrains Mono',monospace", fontSize: "11px", color: "#707C72", opacity: t.gOp, transition: "opacity 180ms" }}>label {t.label}</span></span>
                  </li>
                </React.Fragment>))}
              </ul>
            </div>
          </section>
        {/* LEADERBOARD */}
        <section id="leaderboard" aria-labelledby="h-lb" style={{ scrollMarginTop: "60px", borderTop: "1px solid #303C33", background: "#0D110E" }}>
          <div style={{ maxWidth: "1320px", margin: "0 auto", padding: "clamp(64px,8vw,112px) clamp(20px,4vw,56px)", display: "flex", flexWrap: "wrap", gap: "48px" }}>
            <div style={{ flex: "1 1 280px", display: "grid", gap: "28px", alignContent: "start" }}>
              <h2 id="h-lb" style={{ fontFamily: "'Space Grotesk',sans-serif", fontWeight: "600", fontSize: "clamp(36px,4.2vw,58px)", lineHeight: "1", letterSpacing: "-0.035em", margin: "0" }}>Recognition for work that merged.</h2>
              <div role="group" aria-label="Time range" style={{ display: "flex", gap: "4px" }}>{v.ranges.map((r, $index) => (<React.Fragment key={$index}><button type="button" aria-pressed={r.pressed} onClick={r.onClick} style={{ minHeight: "40px", padding: "0 14px", border: "1px solid #303C33", borderRadius: "2px", background: r.bg, color: r.fg, font: "500 13px Inter,sans-serif", cursor: "pointer" }}>{r.label}</button></React.Fragment>))}</div>
              <label style={{ display: "grid", gap: "8px", fontFamily: "'JetBrains Mono',monospace", fontSize: "11px", color: "#707C72" }}>CATEGORY<select value={v.lbCat} onChange={v.onLbCat} style={{ minHeight: "44px", background: "#080B09", border: "1px solid #303C33", borderRadius: "2px", color: "#F2F6EF", font: "14px Inter,sans-serif", padding: "0 8px", maxWidth: "240px" }}>{v.catOpts.map(o => <option key={o} value={o}>{o}</option>)}</select></label>
              <p style={{ margin: "0", fontSize: "15px", lineHeight: "1.6", color: "#707C72", maxWidth: "24em" }}>Only merged, verified contributions rank. Sample data shown.</p>
              </div>
            <div style={{ flex: "2 1 480px", minWidth: "0", fontFamily: "'JetBrains Mono',monospace", fontSize: "14px" }}>
              {v.leaders.map((l, $index) => (<React.Fragment key={$index}>
                <div style={{ display: "grid", gridTemplateColumns: "44px minmax(0,1fr) auto 56px", gap: "16px", alignItems: "baseline", padding: "14px 0", borderBottom: "1px solid #202923" }}>
                  <span style={{ color: "#707C72" }}>{l.rank}</span>
                  <span style={{ minWidth: "0", display: "flex", flexWrap: "wrap", gap: "2px 14px", alignItems: "baseline" }}><span style={{ fontFamily: "'Space Grotesk',sans-serif", fontSize: "20px", letterSpacing: "-0.01em" }}>{l.user}</span><span style={{ fontSize: "12px", color: "#707C72" }}>{l.cat} · {l.merges}</span></span>
                  <span style={{ color: "#B7F34A", fontWeight: "600", fontSize: "16px" }}>{l.pts}</span>
                  <span aria-label={l.mvAria} style={{ textAlign: "right", color: l.mvFg, fontSize: "12px" }}>{l.mv}</span>
                  </div>
                </React.Fragment>))}
              {v.lbEmpty && (<><p style={{ padding: "24px 0", color: "#AAB5AB", fontFamily: "Inter,sans-serif", margin: "0" }}>Nobody ranked in this category for this period yet.</p></>)}
              <div style={{ display: "grid", gridTemplateColumns: "44px minmax(0,1fr) auto 56px", gap: "16px", alignItems: "baseline", padding: "14px 12px", margin: "12px -12px 0", background: "#172B12", borderTop: "2px solid #B7F34A" }}>
                <span>{v.you.rank}</span><span style={{ fontFamily: "'Space Grotesk',sans-serif", fontSize: "20px" }}>You{" "}<span style={{ fontFamily: "'JetBrains Mono',monospace", fontSize: "12px", color: "#AAB5AB" }}>· {v.you.merges}</span></span><span style={{ color: "#B7F34A", fontWeight: "600", fontSize: "16px" }}>{v.you.pts}</span><span style={{ textAlign: "right", color: "#B7F34A", fontSize: "12px" }}>{v.you.mv}</span>
                </div>
              </div>
            </div>
          </section>
        {/* EXTENSION */}
        <section aria-labelledby="h-ext" style={{ borderTop: "1px solid #303C33" }}>
          <div data-reveal="" style={{ maxWidth: "1320px", margin: "0 auto", padding: "clamp(64px,8vw,112px) clamp(20px,4vw,56px)" }}>
            <div style={{ display: "flex", flexWrap: "wrap", justifyContent: "space-between", alignItems: "flex-end", gap: "24px", marginBottom: "40px" }}>
              <div><span style={{ display: "inline-block", fontFamily: "'JetBrains Mono',monospace", fontSize: "11px", color: "#AAB5AB", border: "1px solid #465449", borderRadius: "999px", padding: "3px 10px", marginBottom: "20px" }}>OPTIONAL EXTENSION · NOT YET RELEASED</span><h2 id="h-ext" style={{ fontFamily: "'Space Grotesk',sans-serif", fontWeight: "600", fontSize: "clamp(36px,4.6vw,64px)", lineHeight: "1", letterSpacing: "-0.035em", margin: "0" }}>Stay on GitHub.</h2></div>
              <p style={{ fontSize: "18px", lineHeight: "1.6", color: "#AAB5AB", margin: "0", maxWidth: "28em" }}>See the signal where the work already lives. The extension is optional—the complete product remains available on the web.</p>
              </div>
            <div style={{ border: "1px solid #303C33", borderRadius: "6px", overflow: "hidden", background: "#0D110E" }}>
              <div style={{ padding: "10px 14px", borderBottom: "1px solid #202923", fontFamily: "'JetBrains Mono',monospace", fontSize: "12px", color: "#707C72", display: "flex", gap: "12px", alignItems: "center" }}><span aria-hidden="true">● ● ●</span><span style={{ flex: "1", background: "#080B09", border: "1px solid #202923", borderRadius: "3px", padding: "5px 10px", overflow: "hidden", whiteSpace: "nowrap", textOverflow: "ellipsis" }}>github.com/relaylabs/queue/issues</span></div>
              <div style={{ display: "grid" }}>
                <div style={{ display: "grid", gridTemplateColumns: "20px minmax(0,1fr) auto", gap: "12px", padding: "14px 18px", borderBottom: "1px solid #202923", alignItems: "center" }}><span aria-hidden="true" style={{ color: "#3DDB82" }}>◯</span><span style={{ minWidth: "0" }}><span style={{ fontWeight: "500" }}>Retry backoff ignores max_delay under sustained load</span>{" "}<span style={{ fontSize: "12px", color: "#707C72" }}>#611 · 5 hours ago</span></span><span style={{ fontFamily: "'JetBrains Mono',monospace", fontSize: "11px", background: "#172B12", color: "#B7F34A", padding: "3px 8px", borderRadius: "2px" }}>GB +60 · BACKEND</span></div>
                <div style={{ display: "grid", gridTemplateColumns: "20px minmax(0,1fr) auto", gap: "12px", padding: "14px 18px", borderBottom: "1px solid #202923", alignItems: "center" }}><span aria-hidden="true" style={{ color: "#3DDB82" }}>◯</span><span style={{ minWidth: "0" }}><span style={{ fontWeight: "500" }}>Expose queue depth as a metric</span>{" "}<span style={{ fontSize: "12px", color: "#707C72" }}>#598 · 2 days ago</span></span><span style={{ fontFamily: "'JetBrains Mono',monospace", fontSize: "11px", color: "#AAB5AB", border: "1px solid #303C33", padding: "2px 8px", borderRadius: "2px" }}>GB +5 base</span></div>
                <div style={{ display: "grid", gridTemplateColumns: "20px minmax(0,1fr) auto", gap: "12px", padding: "14px 18px", alignItems: "center" }}><span aria-hidden="true" style={{ color: "#3DDB82" }}>◯</span><span style={{ minWidth: "0" }}><span style={{ fontWeight: "500" }}>README install steps reference old flag</span>{" "}<span style={{ fontSize: "12px", color: "#707C72" }}>#602 · 1 day ago</span></span><span style={{ fontFamily: "'JetBrains Mono',monospace", fontSize: "11px", background: "#172B12", color: "#B7F34A", padding: "3px 8px", borderRadius: "2px" }}>GB +15 · DOCS</span></div>
                </div>
              </div>
            </div>
          </section>
        {/* INTEGRITY */}
        <section aria-labelledby="h-int" style={{ borderTop: "1px solid #303C33" }}>
          <div data-reveal="" style={{ maxWidth: "1320px", margin: "0 auto", padding: "clamp(64px,8vw,112px) clamp(20px,4vw,56px)" }}>
            <h2 id="h-int" style={{ fontFamily: "'Space Grotesk',sans-serif", fontWeight: "600", fontSize: "clamp(36px,4.6vw,64px)", lineHeight: "1", letterSpacing: "-0.035em", margin: "0 0 40px", maxWidth: "14em" }}>Points should be difficult to fake.</h2>
            <div style={{ fontFamily: "'JetBrains Mono',monospace", fontSize: "13px", border: "1px solid #303C33", borderRadius: "4px", overflow: "hidden" }}>
              <div style={{ display: "grid", gridTemplateColumns: "minmax(0,1fr) auto", padding: "12px 18px", background: "#0D110E", borderBottom: "1px solid #303C33", fontSize: "11px", color: "#707C72" }}><span>AUDIT RULES</span><span>STATUS</span></div>
              <div style={{ display: "grid", gridTemplateColumns: "minmax(0,1fr) auto", gap: "16px", padding: "16px 18px", borderBottom: "1px solid #202923" }}><span style={{ fontFamily: "Inter,sans-serif", fontSize: "17px" }}>Self-merges do not count.</span><span style={{ color: "#3DDB82" }}>✓ enforced</span></div>
              <div style={{ display: "grid", gridTemplateColumns: "minmax(0,1fr) auto", gap: "16px", padding: "16px 18px", borderBottom: "1px solid #202923" }}><span style={{ fontFamily: "Inter,sans-serif", fontSize: "17px" }}>The same pull request cannot be awarded twice.</span><span style={{ color: "#3DDB82" }}>✓ enforced</span></div>
              <div style={{ display: "grid", gridTemplateColumns: "minmax(0,1fr) auto", gap: "16px", padding: "16px 18px", borderBottom: "1px solid #202923" }}><span style={{ fontFamily: "Inter,sans-serif", fontSize: "17px" }}>Every award retains its repository and merge evidence.</span><span style={{ color: "#3DDB82" }}>✓ enforced</span></div>
              <div style={{ display: "grid", gridTemplateColumns: "minmax(0,1fr) auto", gap: "16px", padding: "16px 18px", borderBottom: "1px solid #202923" }}><span style={{ fontFamily: "Inter,sans-serif", fontSize: "17px" }}>Re-synchronization cannot silently reduce earned points.</span><span style={{ color: "#3DDB82" }}>✓ enforced</span></div>
              <div style={{ display: "grid", gridTemplateColumns: "minmax(0,1fr) auto", gap: "16px", padding: "16px 18px" }}><span style={{ fontFamily: "Inter,sans-serif", fontSize: "17px", color: "#AAB5AB" }}>Suspicious point allocation requires additional safeguards before public launch.</span><span style={{ color: "#AAB5AB" }}>○ open work</span></div>
              </div>
            </div>
          </section>
        {/* ARCHITECTURE */}
        <section aria-labelledby="h-arch" style={{ borderTop: "1px solid #303C33", background: "#0D110E" }}>
          <div data-reveal="" style={{ maxWidth: "1320px", margin: "0 auto", padding: "clamp(64px,8vw,112px) clamp(20px,4vw,56px)", display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(min(100%,340px),1fr))", gap: "48px" }}>
            <div>
              <h2 id="h-arch" style={{ fontFamily: "'Space Grotesk',sans-serif", fontWeight: "600", fontSize: "clamp(34px,4vw,56px)", lineHeight: "1.02", letterSpacing: "-0.035em", margin: "0 0 20px" }}>No replacement workflow.</h2>
              <p style={{ fontSize: "18px", lineHeight: "1.6", color: "#AAB5AB", margin: "0", maxWidth: "28em" }}>No separate code review system. GitBounty begins and ends with the work already happening on GitHub.</p>
              </div>
            <ol style={{ listStyle: "none", margin: "0", padding: "0 0 0 24px", borderLeft: "1px solid #465449", fontFamily: "'JetBrains Mono',monospace", fontSize: "14px", display: "grid", gap: "22px" }}>
              <li style={{ position: "relative" }}><span aria-hidden="true" style={{ position: "absolute", left: "-29px", top: "5px", width: "9px", height: "9px", background: "#F2F6EF" }}></span>GitHub identity{" "}<span style={{ color: "#707C72" }}>— sign in with GitHub</span></li>
              <li style={{ position: "relative" }}><span aria-hidden="true" style={{ position: "absolute", left: "-29px", top: "5px", width: "9px", height: "9px", background: "#F2F6EF" }}></span>Issue discovery{" "}<span style={{ color: "#707C72" }}>— labels + filters</span></li>
              <li style={{ position: "relative" }}><span aria-hidden="true" style={{ position: "absolute", left: "-29px", top: "5px", width: "9px", height: "9px", background: "#F2F6EF" }}></span>Pull request{" "}<span style={{ color: "#707C72" }}>— repo’s own review</span></li>
              <li style={{ position: "relative" }}><span aria-hidden="true" style={{ position: "absolute", left: "-29px", top: "5px", width: "9px", height: "9px", background: "#B7F34A" }}></span>Merge verification{" "}<span style={{ color: "#707C72" }}>— merged + closed issue</span></li>
              <li style={{ position: "relative" }}><span aria-hidden="true" style={{ position: "absolute", left: "-29px", top: "5px", width: "9px", height: "9px", background: "#B7F34A" }}></span>Points ledger{" "}<span style={{ color: "#707C72" }}>— one entry per merge</span></li>
              <li style={{ position: "relative" }}><span aria-hidden="true" style={{ position: "absolute", left: "-29px", top: "5px", width: "9px", height: "9px", background: "#B7F34A" }}></span>Leaderboards{" "}<span style={{ color: "#707C72" }}>— week · month · category · all</span></li>
              </ol>
            </div>
          </section>
        {/* FAQ */}
        <section aria-labelledby="h-faq" style={{ borderTop: "1px solid #303C33" }}>
          <div style={{ maxWidth: "980px", margin: "0 auto", padding: "clamp(64px,8vw,112px) clamp(20px,4vw,56px)" }}>
            <h2 id="h-faq" style={{ fontFamily: "'Space Grotesk',sans-serif", fontWeight: "600", fontSize: "clamp(34px,4vw,56px)", lineHeight: "1", letterSpacing: "-0.035em", margin: "0 0 32px" }}>FAQ</h2>
            <div style={{ borderTop: "1px solid #465449" }}>
              {v.faq.map((f, $index) => (<React.Fragment key={$index}>
                <div style={{ borderBottom: "1px solid #303C33" }}>
                  <h3 style={{ margin: "0" }}><button type="button" aria-expanded={f.exp} aria-controls={f.id} onClick={f.onClick} style={{ width: "100%", display: "grid", gridTemplateColumns: "minmax(0,1fr) auto", gap: "20px", alignItems: "center", minHeight: "64px", padding: "18px 0", background: "transparent", border: "0", color: "#F2F6EF", textAlign: "left", font: "500 clamp(18px,1.6vw,22px) 'Space Grotesk',sans-serif", letterSpacing: "-0.01em", cursor: "pointer" }} className="gbh6">{f.q}<span aria-hidden="true" style={{ fontFamily: "'JetBrains Mono',monospace", color: "#AAB5AB" }}>{f.sign}</span></button></h3>
                  {f.open && (<><p id={f.id} style={{ margin: "0 0 24px", fontSize: "17px", lineHeight: "1.6", color: "#AAB5AB", maxWidth: "40em" }}>{f.a}</p></>)}
                  </div>
                </React.Fragment>))}
              </div>
            </div>
          </section>
        {/* CTA (typographic green) */}
        <section aria-labelledby="h-cta" style={{ borderTop: "1px solid #303C33" }}>
          <div style={{ maxWidth: "1320px", margin: "0 auto", padding: "clamp(96px,13vw,200px) clamp(20px,4vw,56px)" }}>
            <h2 id="h-cta" style={{ fontFamily: "'Space Grotesk',sans-serif", fontWeight: "700", fontSize: "clamp(50px,9vw,136px)", lineHeight: "0.9", letterSpacing: "-0.05em", margin: "0 0 48px" }}>Your next contribution<br /><span style={{ color: "#B7F34A" }}>is already open.</span></h2>
            <div style={{ display: "flex", flexWrap: "wrap", gap: "24px 40px", alignItems: "center", borderTop: "3px solid #B7F34A", paddingTop: "28px" }}>
              <p style={{ fontSize: "19px", lineHeight: "1.5", margin: "0", color: "#AAB5AB", flex: "1 1 280px", maxWidth: "26em" }}>Find an issue that matches your skills and make the work count.</p>
              <a href="#explore" style={{ display: "inline-flex", alignItems: "center", minHeight: "52px", padding: "0 24px", background: "#B7F34A", color: "#080B09", fontWeight: "600", fontSize: "16px", borderRadius: "2px" }} className="gbh7">Explore open issues →</a>
              <a href="#connect" style={{ display: "inline-flex", alignItems: "center", minHeight: "52px", padding: "0 4px", color: "#F2F6EF", fontWeight: "500", fontSize: "16px", borderBottom: "1px solid #465449" }} className="gbh8">Connect GitHub</a>
              </div>
            </div>
          </section>
        </main>
      <footer style={{ borderTop: "1px solid #465449" }}>
        <div style={{ maxWidth: "1320px", margin: "0 auto", padding: "40px clamp(20px,4vw,56px) 28px", display: "grid", gap: "32px" }}>
          <div style={{ display: "flex", flexWrap: "wrap", justifyContent: "space-between", gap: "24px", alignItems: "baseline" }}>
            <span style={{ display: "flex", alignItems: "center", flexWrap: "wrap", gap: "10px", fontFamily: "'Space Grotesk',sans-serif", fontWeight: "700", fontSize: "22px", letterSpacing: "-0.02em" }}><img src="/assets/favicon.png" alt="" width="32" height="32" style={{ display: "block", width: "32px", height: "32px", objectFit: "contain" }} />GitBounty <span style={{ fontFamily: "Inter,sans-serif", fontWeight: "400", fontSize: "15px", color: "#AAB5AB", letterSpacing: "0" }}>Open-source work, made visible.</span></span>
            <nav aria-label="Footer" style={{ display: "flex", flexWrap: "wrap", gap: "12px 24px", fontSize: "14px" }}><a href="#explore" style={{ color: "#AAB5AB" }}>Explore</a><a href="#leaderboard" style={{ color: "#AAB5AB" }}>Leaderboard</a><a href="#provenance" style={{ color: "#AAB5AB" }}>Contributors</a><a href="#maintainers" style={{ color: "#AAB5AB" }}>Maintainers</a><a href="https://github.com" style={{ color: "#AAB5AB" }}>GitHub repo</a><a href="#docs" style={{ color: "#AAB5AB" }}>Docs</a><a href="#privacy" style={{ color: "#AAB5AB" }}>Privacy</a><a href="#terms" style={{ color: "#AAB5AB" }}>Terms</a><a href="#status" style={{ color: "#AAB5AB" }}>Status</a></nav>
            </div>
          <div style={{ fontFamily: "'JetBrains Mono',monospace", fontSize: "12px", color: "#707C72", display: "flex", flexWrap: "wrap", justifyContent: "space-between", gap: "12px", borderTop: "1px dashed #303C33", paddingTop: "16px" }}><span>EOF · gitbounty-web v0.9.0 · build 2026.09.24</span><span>ledger schema 1</span></div>
          </div>
        </footer>
    </>
  );
}
