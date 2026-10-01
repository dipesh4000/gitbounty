# A future paid phase — proposal only

**Nothing in this document is built, scheduled or decided.** GitBounty is a points platform
([`../PRODUCT.md`](../PRODUCT.md)), and no code in this repository moves money, holds funds or touches a
blockchain. This exists so that a buyer who eventually wants monetary bounties knows what the honest cost
is, and so nobody starts building toward it by accident.

It is written as a set of **prerequisites**, not a design. If any one of them cannot be met, the paid phase
should not ship.

## The decision that comes first

Two shapes, and they are not variations of each other:

1. **Maintainer-funded escrow.** A maintainer deposits money against an issue; it is released to the
   contributor on merge. GitBounty holds other people's money between those events. In most jurisdictions
   that is **money transmission**, with licensing, capital and reporting obligations attached. This is the
   shape the original pitch described ([`original-money-pitch.md`](original-money-pitch.md)).
2. **Points redeemed by GitBounty.** GitBounty funds a pool and pays contributors out of it for points they
   have earned. GitBounty is spending its own money, which is an ordinary business expense, not custody.

**(2) is dramatically simpler and safer**, and it is the direction `overview.md` already anticipated. Pick
before designing anything.

## Non-negotiable prerequisites

### Legal and financial

- [ ] A written legal opinion on whether the chosen shape is money transmission where GitBounty operates
- [ ] A decision on who the payer of record is, and the tax reporting that follows (1099-NEC in the US
      above the threshold; equivalents elsewhere)
- [ ] KYC/AML obligations assessed, and a sanctions-screening requirement established or ruled out
- [ ] Terms and a privacy policy **written and reviewed by a lawyer** — today's pages are engineer-written
      summaries that say so on their faces
- [ ] A decision on which countries are supported, and how an unsupported one is refused clearly

### Payments

- [ ] A **regulated payment provider** — Stripe Connect or equivalent. Not a chain, not a wallet, not a
      custodial key. GitBounty must never hold a private key that can move funds
- [ ] **Server-authoritative pricing.** An amount is never taken from a request body. The server resolves
      it from its own records and the client is told what it will be charged
- [ ] **Idempotent payment operations**, keyed by a client-supplied idempotency key, so a retried request
      cannot pay twice
- [ ] **Signed webhook verification over the original request bytes** — the raw body, before any JSON
      parsing or re-serialisation, with a constant-time comparison
- [ ] **Replay protection**: every delivery id recorded, a seen id rejected, a timestamp skew window enforced
- [ ] A refund and dispute workflow, including what happens to points already awarded when a payment is
      reversed

### Accounting

- [ ] **No float.** Money is integer minor units plus an ISO-4217 currency code. Never a `float`, never a
      `double`, never JavaScript's `number` for an amount
- [ ] A **double-entry ledger** separate from `points_ledger`, where every movement has two sides and the
      sum of all balances is zero at all times, with a reconciliation job that proves it
- [ ] Payouts are rows in that ledger, with the provider's reference, created in the same transaction as
      the state change that justified them
- [ ] An auditable trail from any payout back to the merge that caused it

### Rules

- [ ] Explicit, published acceptance and payout rules: when a bounty becomes payable, who decides, how long
      a maintainer has to object, and what happens if they never do
- [ ] **A payout must never be released on an unverified issue-close event alone.** An issue can be closed
      by anybody with write access, for any reason. Release requires the verified merge of a pull request by
      an identified contributor, checked server-side against GitHub
- [ ] A minimum and maximum payout, and a per-account and per-period cap
- [ ] A hold period and a manual-review path for anything unusual
- [ ] What happens to funds when a bounty is cancelled, a repository disappears, or a contributor never
      claims

### Abuse

- [ ] Collusion between two cooperating accounts — unsolved today for points — **must** be solved before it
      is solved for money. The incentive to do it goes up by orders of magnitude
- [ ] Identity verification strong enough that one person cannot be both sides
- [ ] Monitoring, alerting and a kill switch that stops payouts without stopping the product

### Security

- [ ] No secret in a browser bundle, ever. No publishable key that can move money
- [ ] Payment-provider credentials in a secrets manager, rotated, with a documented procedure
- [ ] An independent security review of the payment paths specifically

## What must not be copied

The benchmarked project, [sundai-club/git-paid](https://github.com/sundai-club/git-paid), implements a
maintainer-funded escrow with blockchain settlement. Whatever its merits as a demonstration, its approach
has the problems this checklist exists to prevent: custodial private keys in environment variables, release
triggered by issue-close events, and webhook handling without the replay and raw-body guarantees above.
**Treat it as a product-flow reference and nothing else.** No code or text from it is in this repository.

## If this is never done

That is a perfectly good outcome. Points are a complete product. `PRODUCT.md` describes something that
works, is auditable, and carries no financial-services risk at all. Adding money is a different company,
not a feature.
