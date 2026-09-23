export function Pricing() {
  return (
    <section className="section section-alt" id="pricing">
      <div className="wrap pricing-wrap">
        <div className="section-head">
          <h2>Free while we grow</h2>
          <p>
            Individual bounties run at 0% commission today. Later, teams that want more can opt into premium
            tools — the core escrow layer stays free either way.
          </p>
        </div>

        <div className="pricing-grid">
          <div className="price-card">
            <h3>Individual</h3>
            <p className="price-amount">0<span>% fee</span></p>
            <p>Fund or claim bounties on any public repo. Non-custodial wallet included.</p>
            <ul className="check-list">
              <li>Unlimited bounties</li>
              <li>Instant payout on merge</li>
              <li>Community support</li>
            </ul>
            <button className="btn btn-outline" type="button">Connect GitHub</button>
          </div>

          <div className="price-card price-card-highlight">
            <h3>Organization</h3>
            <p className="price-amount">Custom</p>
            <p>For teams that want estimation, analytics, and split payouts on top of the free escrow layer.</p>
            <ul className="check-list">
              <li>AI-assisted bounty estimation</li>
              <li>Spend analytics across repos</li>
              <li>Milestone streaming &amp; multi-contributor splits</li>
            </ul>
            <button className="btn btn-primary" type="button">Talk to us</button>
          </div>
        </div>
      </div>
    </section>
  );
}
