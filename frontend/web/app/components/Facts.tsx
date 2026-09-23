const FACTS = [
  { number: "0%", label: "platform commission, always" },
  { number: "4", label: "functions run the entire escrow contract" },
  { number: "1", label: "GitHub login is the whole onboarding flow" },
  { number: "instant", label: "payout the moment a PR merges" },
];

export function Facts() {
  return (
    <section className="facts" aria-label="Key facts">
      <div className="wrap facts-inner">
        {FACTS.map((fact) => (
          <div className="fact" key={fact.label}>
            <span className="fact-num">{fact.number}</span>
            <span className="fact-label">{fact.label}</span>
          </div>
        ))}
      </div>
    </section>
  );
}
