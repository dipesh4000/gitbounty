# GitBounty

GitBounty turns verified GitHub contributions into transparent points and funded Avalanche rewards for the developer who authored the merged pull request.

Live application: [gitbounty-web.vercel.app](https://gitbounty-web.vercel.app)

## Hackathon direction

The target submission is a complete Fuji demonstration:

1. A maintainer publishes and funds a GitHub issue bounty in test USDC.
2. A contributor opens an eligible pull request that closes the issue.
3. GitBounty verifies the merge and PR author through GitHub.
4. The contributor claims the escrowed reward through a user-controlled wallet.
5. GitBounty independently verifies the Avalanche settlement and links to Snowtrace.

The current repository already implements the GitHub identity, bounty, points, allocation, webhook, wallet-linking, and payment-verification foundations. The hackathon roadmap adds a minimal Fuji escrow contract, improves wallet onboarding with Privy, and packages one live end-to-end proof. See [the plan](plan.md) for the exact current-versus-target boundary.

## Why Avalanche

Avalanche C-Chain provides fast EVM-compatible settlement with a public testnet suitable for a judge-verifiable prototype. GitBounty uses Fuji for the demo, official test USDC for funded rewards, and Snowtrace for public transaction evidence. A small escrow contract makes “reward available” mean funds actually exist before a contributor starts work.

## Architecture

```text
GitHub App / OAuth
        │
        ▼
FastAPI eligibility + PostgreSQL ledger
        │
        ├── points and contribution history
        │
        └── signed settlement authorization
                     │
                     ▼
Privy or external wallet ──► GitBountyEscrow on Avalanche Fuji
                                      │
                                      ▼
                            verified USDC transfer
```

- **Website:** Next.js, React, TypeScript, viem.
- **API:** FastAPI, Python, PostgreSQL, SQLAlchemy/asyncpg.
- **GitHub:** OAuth identity, GitHub App installations, signed webhooks, reconciliation sync.
- **Wallets:** planned Privy embedded/external wallet experience; current browser-wallet adapter remains available during migration.
- **Avalanche:** Fuji C-Chain, official test USDC, planned `GitBountyEscrow` contract.
- **Optional execution provider:** SmoothSend may improve account abstraction or sponsorship, but reward correctness does not depend on it.

## Core invariants

- Rewards belong to the stable numeric GitHub ID of the eligible PR author.
- Registration never creates a second award.
- Points are reputation and never convert into money.
- A cash reward is advertised as funded only after its escrow transaction is confirmed.
- Clients never choose the final recipient, amount, token, chain, or eligibility result.
- Pending or unknown transactions are never presented as paid.
- Retries cannot duplicate points or settlement.

## Documentation

| Document | Purpose |
|---|---|
| [Product overview](overview.md) | Product, principles, target experience, and non-goals |
| [Implementation plan](plan.md) | Full phased roadmap and acceptance checks |
| [Implementation audit](docs/implementation-audit.md) | Gaps found, evidence, and remaining launch gates |
| [Hackathon submission](docs/hackathon-submission.md) | Submission fields, evidence, and demo script |
| [Architecture](docs/architecture.md) | Current and target technical boundaries |
| [Dependency boundaries](docs/dependency-boundaries.md) | What may be core, replaceable, or optional |
| [Setup](docs/setup.md) | Local environment and planned contract configuration |
| [Testing](docs/testing-data.md) | Deterministic and live two-account verification |
| [Security](docs/security.md) | Identity, contract, signer, and deployment controls |
| [Points rules](docs/points-rules.md) | Off-chain points and funded-reward eligibility |

## Repository layout

| Path | Responsibility |
|---|---|
| `backend/` | FastAPI application and backend tests |
| `frontend/web/` | Website and component tests |
| `frontend/extension/` | Optional browser extension |
| `migrations/` | Numbered PostgreSQL migrations |
| `e2e/` | Browser and accessibility tests |
| `contracts/` | Planned Solidity escrow workspace |

The `contracts/` directory is part of the roadmap and must not be described as implemented until it exists and its deployment is verified.

## Run locally

See [docs/setup.md](docs/setup.md). The existing application uses Python 3.12, Node 24, PostgreSQL, GitHub OAuth/App credentials, and optional payment-provider configuration. Never commit environment files, keys, tokens, or database credentials.

## Submission status

The deployed landing page exists, but the hackathon submission is not complete until a real two-account GitHub journey ends in a verified Fuji escrow settlement. Contract address, Snowtrace transaction, public repository URL, demo video, and AI-tool disclosure will be added to [docs/hackathon-submission.md](docs/hackathon-submission.md) when verified.

No license has been selected yet. The owner must choose one before claiming a reusable open-source release.
