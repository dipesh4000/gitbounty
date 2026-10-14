# Working rules

## 1. Follow the authoritative documents

- [overview.md](overview.md) defines the product.
- [plan.md](plan.md) defines implementation order and acceptance checks.
- [docs/hackathon-submission.md](docs/hackathon-submission.md) tracks public proof.
- Read the current code before claiming anything is implemented.

## 2. Preserve identity and reward invariants

- A reward belongs to the stable numeric GitHub ID of the eligible merged PR author.
- Usernames are display data and may change.
- Clients cannot establish authorship, repository permission, reward amount, recipient, or payment success.
- Registration and retries must not duplicate allocations, points, vouchers, or transfers.
- Points are append-only reputation and do not convert into money.

## 3. Keep chain and provider boundaries explicit

- Avalanche Fuji is the required hackathon settlement environment.
- A reward is “funded” only after confirmed escrow funding.
- A payment is “paid” only after independent verification of the expected contract event and token transfer.
- Privy may provide authentication and wallet UX but does not own canonical reward records.
- SmoothSend may provide execution, account abstraction, sponsorship, or recovery but is optional.
- Mainnet, eERC, ICM/ICTT, and custom L1 work are stretch goals until the Fuji flow is complete.

## 4. Database and contract changes

- Numbered SQL migrations remain authoritative; never edit a migration that may have been applied.
- Add the next migration with purpose and dependency comments.
- Never apply shared-database changes without explicit owner authorization and a backup.
- Contract deployments are immutable evidence: record source, compiler settings, constructor arguments, address, chain, and transaction.
- Changes to authorization signers, upgrade controls, refunds, or token custody require explicit security review.

## 5. Secrets and financial safety

- Never commit or print real credentials, OAuth tokens, session values, database URLs, private keys, authorization keys, or wallet recovery material.
- Browser bundles receive only public identifiers and configuration.
- Server signing keys live in a proper secret store and are separate from user wallets.
- Use test assets on Fuji for the hackathon proof.
- Every user-triggered transfer must show network, token, amount, recipient, and purpose before signing.

## 6. Scope discipline

- Build vertical slices in the order in [plan.md](plan.md).
- Do not build a custom L1, token, bridge, governance system, generic payment abstraction, or multi-chain layer speculatively.
- Reuse existing GitHub, points, allocation, API, styling, and test boundaries.
- Add dependencies only when the platform or installed dependencies cannot solve the actual requirement cleanly.

## 7. Git and user-owned work

- Do not run Git commands unless the user explicitly asks.
- Preserve unrelated files and changes.
- Do not push, pull, commit, amend, reset, rebase, or change branches on the user's behalf without an explicit request.

## 8. Done means checked

- Run the smallest relevant deterministic check after each implementation slice.
- Security and money paths require negative tests, not only happy paths.
- Report what was verified, what was not, and which external configuration remains.
- Do not call the submission complete without a deployed live demo, Fuji transaction evidence, source link, <=3-minute video, pitch slides, accurate build-window delta and accepted portal receipt.
