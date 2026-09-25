export function Security() {
  return (
    <section className="section" id="security">
      <div className="wrap">
        <div className="section-head">
          <h2>Under the hood</h2>
          <p>
            Built on well-documented, boring-on-purpose tooling — Next.js, GitHub webhooks, and a four-function
            Solidity contract.
          </p>
        </div>

        <div className="flow-strip" aria-label="Architecture flow">
          <span className="flow-node">Client<br /><small>bounty board, wallet UI</small></span>
          <span className="flow-arrow" aria-hidden="true">&#8594;</span>
          <span className="flow-node">Event engine<br /><small>verifies GitHub webhooks</small></span>
          <span className="flow-arrow" aria-hidden="true">&#8594;</span>
          <span className="flow-node">Escrow contract<br /><small>holds and releases funds</small></span>
        </div>

        <div className="trust-grid">
          <div className="trust-card">
            <h3>Verified webhooks</h3>
            <p>
              Every webhook is HMAC-signed per repository, so forged or replayed events are rejected before they
              ever touch escrow.
            </p>
          </div>
          <div className="trust-card">
            <h3>Timelocked refunds</h3>
            <p>
              If a bounty goes stale, a configurable timelock returns the funds to the maintainer automatically.
              Nothing gets stuck.
            </p>
          </div>
        </div>
      </div>
    </section>
  );
}
