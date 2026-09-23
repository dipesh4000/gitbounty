const FEATURES = [
  { title: "Zero commission", body: "Every dollar funded goes to the person who did the work — not 10–20% to a platform, the way legacy freelance sites take." },
  { title: "Lives on GitHub", body: "No separate dashboard or dispute portal. A bounty is just a label on an issue you already use." },
  { title: "No seed phrases", body: "Signing in with GitHub provisions a non-custodial wallet automatically. Nothing to install, nothing to memorize." },
  { title: "Paid on merge", body: "Payout is automatic and immediate, replacing the 5–14 day manual release cycles other platforms run on." },
];

export function WhyGitBounty() {
  return (
    <section className="section" id="why">
      <div className="wrap">
        <div className="section-head">
          <h2>Why GitBounty</h2>
          <p>Built to stay out of the way of the workflow you already have.</p>
        </div>

        <div className="feature-grid">
          {FEATURES.map((feature) => (
            <div className="feature" key={feature.title}>
              <h3>{feature.title}</h3>
              <p>{feature.body}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
