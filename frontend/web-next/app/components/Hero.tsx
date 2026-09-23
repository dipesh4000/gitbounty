import { BOUNTIES } from "../lib/bounties";

/* The hero, including the little board preview. That preview is the five highest bounties, which is fixed data,
   so it renders on the server -- in the static site it was built by JavaScript after the page loaded. */
export function Hero() {
  const topFive = [...BOUNTIES].sort((a, b) => b.amount - a.amount).slice(0, 5);

  return (
    <section className="hero" id="top">
      <div className="wrap hero-inner">
        <div className="hero-copy">
          <h1>Open-source work,<br />paid the day it ships.</h1>
          <p className="hero-sub">
            Maintainers attach a bounty to any GitHub issue. Contributors merge a fix and get paid straight to
            their wallet — no invoices, no 20% cut, no waiting on someone to run payroll.
          </p>
          <div className="hero-actions">
            <button className="btn btn-primary btn-lg" type="button">Connect GitHub</button>
            <a className="btn btn-outline btn-lg" href="#bounties">Browse open bounties</a>
          </div>
          <p className="hero-note">Free for individual bounties. No wallet setup, no seed phrase.</p>
        </div>

        <div className="hero-board" aria-label="Preview of open bounties">
          <div className="board-card">
            <div className="board-card-head">
              <span className="board-dot" aria-hidden="true"></span>
              <span>Open bounties</span>
              <span className="board-count">{BOUNTIES.length} open</span>
            </div>
            <ul className="board-rows">
              {topFive.map((bounty) => (
                <li className="board-row" key={bounty.id}>
                  <div style={{ minWidth: 0, flex: 1 }}>
                    <span className="row-repo">{bounty.repo}</span>
                    <span className="row-title">{bounty.title}</span>
                  </div>
                  <span className="row-amount">${bounty.amount} {bounty.currency}</span>
                </li>
              ))}
            </ul>
          </div>
        </div>
      </div>
    </section>
  );
}
