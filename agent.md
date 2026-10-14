# Agent guide

Read [overview.md](overview.md), then [plan.md](plan.md), then [rules.md](rules.md) before changing the project.

## Mission

Ship a judge-verifiable GitHub reward flow on Avalanche Fuji. A maintainer funds an issue bounty, GitBounty verifies the eligible merged PR author, and that contributor claims the exact escrowed USDC reward.

## Current-versus-target discipline

- Existing code includes GitHub authentication, GitHub App webhooks, points, allocations, wallet proofs, SmoothSend integration, and payment verification.
- The Fuji escrow contract and Privy migration are planned until source, tests, deployment evidence, and live verification exist.
- Never convert roadmap statements into “implemented” claims without checking the code and evidence.
- Historical migrations describe prior models; add new numbered migrations for the new settlement design.

## Priority order

1. Preserve stable GitHub numeric identity and idempotent awards.
2. Prove the smallest funded Fuji escrow lifecycle.
3. Connect verified GitHub eligibility to exact-recipient settlement.
4. Make the deployed experience understandable and accessible.
5. Record public evidence and package the submission.
6. Add Privy native GitHub onboarding and optional SmoothSend claims after the direct-wallet proof; follow the dated phase gates.
7. Package pitch slides, video and accurate build-window provenance; owner handles source/license and portal publication.

## Engineering boundaries

- The backend decides eligibility, bounty ID, token, amount, recipient, chain, authorization nonce, and deadline.
- The contract enforces funding, authorization, replay protection, settlement, and refunds.
- Its immutable signer is trusted for GitHub eligibility. Fixed seven-day claim grace may expire even after an off-chain award.
- The frontend displays state and requests user signatures; it is never trusted as an authority.
- Privy owns wallet UX, not GitBounty's reward database or GitHub identity model.
- SmoothSend is optional transaction infrastructure, not a product invariant.
- Points remain an append-only off-chain reputation ledger.

## Completion evidence

Every completed phase needs proportionate automated checks and observable evidence. The submission additionally requires one real GitHub two-account run and one successful Fuji settlement linked on Snowtrace. Simulated tests alone do not prove the hackathon demo.

Read [implementation audit](docs/implementation-audit.md) and [dependency gates](docs/dependency-boundaries.md). Native Privy GitHub OAuth is supported; custom JWT is optional. Preserve existing immutable wallets, and never assume a Vercel function keeps an infinite worker alive.

Do not expose secrets in source, logs, tool output, screenshots, videos, documentation, or chat.
