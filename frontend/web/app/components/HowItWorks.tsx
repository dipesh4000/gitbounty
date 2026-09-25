const STEPS = [
  { index: "01", title: "Tag the issue", body: "Add a bounty label with an amount. Funds move into escrow immediately — no separate invoice or approval chain." },
  { index: "02", title: "Escrow holds it", body: "A chain-agnostic contract locks the funds in ERC-20 stablecoins until the work is verified as done." },
  { index: "03", title: "Contributor merges", body: "Anyone can pick up the issue, open a PR against it, and get it reviewed and merged as usual." },
  { index: "04", title: "Wallet gets paid", body: "The merge event fires a webhook that releases the escrow straight to the contributor's wallet — same day." },
];

export function HowItWorks() {
  return (
    <section className="section section-alt" id="how-it-works">
      <div className="wrap">
        <div className="section-head">
          <h2>How it works</h2>
          <p>Four steps, all triggered by things you already do on GitHub.</p>
        </div>

        <ol className="steps">
          {STEPS.map((step) => (
            <li className="step" key={step.index}>
              <span className="step-index">{step.index}</span>
              <h3>{step.title}</h3>
              <p>{step.body}</p>
            </li>
          ))}
        </ol>
      </div>
    </section>
  );
}
