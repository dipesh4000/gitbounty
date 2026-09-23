const CARDS = [
  {
    tag: "Maintainers",
    title: "Clear your backlog",
    body: "Attach a bounty to any issue in a few clicks. You decide the amount and the repo; GitBounty handles escrow, matching, and payout.",
    checks: [
      "Fund issues straight from labels you already use",
      "Refund automatically if a bounty goes stale",
      "See every open and paid bounty in one place",
    ],
  },
  {
    tag: "Contributors",
    title: "Get paid for the fix",
    body: "Find funded issues that match your stack, open a PR, and get paid the moment it merges — no client calls, no chasing invoices.",
    checks: [
      "Browse bounties by label, language, or amount",
      "Get a wallet automatically on your first GitHub login",
      "Funds land the same day your PR is merged",
    ],
  },
];

export function Audience() {
  return (
    <section className="section section-alt" id="audience">
      <div className="wrap">
        <div className="section-head">
          <h2>Built for both sides</h2>
          <p>Maintainers and contributors get the same login, different jobs to do.</p>
        </div>

        <div className="audience-grid">
          {CARDS.map((card) => (
            <div className="audience-card" key={card.tag}>
              <span className="audience-tag">{card.tag}</span>
              <h3>{card.title}</h3>
              <p>{card.body}</p>
              <ul className="check-list">
                {card.checks.map((check) => <li key={check}>{check}</li>)}
              </ul>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
