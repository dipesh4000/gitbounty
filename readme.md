# GitBounty

Find rewarded GitHub issues, contribute a fix, and earn points for an eligible merged pull request.
Use the website to discover and manage bounties, or the optional browser extension to see rewards directly on GitHub.

**Current status:** deployed at [GitBounty](https://gitbounty-web.vercel.app), with points bounties and
owner-funded payments through SmoothSend. The two-account trial reached a verified merge and points
award; wallet claiming and a live SmoothSend payout remain unverified. See [progress](plan.md).

## Product direction

- Maintainers publish rewards on GitBounty. Only registered, published rewards should appear on the website and extension.
- Rewards belong to the pull request author's **stable GitHub numeric ID**, whether or not they have a GitBounty account.
- A contributor must sign in with that same GitHub account to create their GitBounty account and claim their points.
- Registration does not determine eligibility or create a second award; the signed-in GitHub identity claims a reserved award once.
- Optional fixed payment promises accompany points bounties. Current testing uses official USDC on
  Avalanche Fuji; existing mainnet AVAX promises retain their terms. Owners sign through an external
  browser wallet, fund a SmoothSend smart account, and pay payout fees in USDC. Contributors receive
  the full reward in their linked external wallet. Points do not convert into money.
  Execution requires migrations through 0016 and the payment configuration in [setup](docs/setup.md).
  GitBounty does not fund or guarantee payment.

## Why this demo uses SmoothSend

GitBounty showcases SmoothSend as the execution layer for real contribution rewards: an eligible
GitHub merge becomes an owner-reviewed payout, with fees paid in USDC through `user-pays-erc20`.
The owner signs one ERC-4337 UserOperation; SmoothSend estimates fees, supplies paymaster data and
submits the operation. The contributor receives the full promised amount, with the fee paid separately.
The payout does not require native AVAX in the owner's signing wallet; funding from an ordinary wallet
and later sending received funds can still require native gas.

The Payments workflow names SmoothSend, shows its smart-account funding address and fee quote,
and supports recovery by UserOperation hash. This is the demo's provider integration, not an embedded
GitBounty wallet or a withdrawal service. See [implementation details](docs/architecture.md#smoothsend-payments)
and the [two-account demo](docs/testing-data.md#a-fund-and-pay-through-smoothsend).

## Start here

| Document | Purpose |
|---|---|
| [Product overview](overview.md) | Agreed experience and product boundaries |
| [Progress and next steps](plan.md) | What exists, what is unverified, and what to build next |
| [Local setup](docs/setup.md) | Run the backend, website, extension and checks |
| [Architecture](docs/architecture.md) | Current code structure and planned integration |
| [Points rules](docs/points-rules.md) | Current award rules and implemented claim model |
| [Security and operations](docs/security.md) | Credentials, migrations, recovery and deployment |

## Implementation today

FastAPI serves GitHub OAuth, issue browsing, maintainer publishing, PR tracking, points history,
leaderboards and moderation APIs. Postgres stores an append-only points ledger.
The website uses React/TypeScript with the standard Next.js App Router.
The Manifest V3 extension adds issue badges and a points popup.

The backend uses **uv** with a committed lockfile. **Async SQLAlchemy** now serves the issue board and authentication;
the remaining database queries are being migrated from asyncpg SQL.
Selected public repositories can receive signed GitHub App webhooks; contributor sync remains the reconciliation path.

## Run locally

Follow [setup](docs/setup.md) for Python 3.12, Node 24 LTS, local Postgres and GitHub OAuth configuration.
The API runs on port 8001 and the website on port 3000.
Load `frontend/extension` unpacked in Chrome, Brave or Edge.

Run commands inside the relevant project folder; this is not a root npm workspace.
The generated API reference is available at [localhost:8001/docs](http://localhost:8001/docs) while the backend runs.

## Repository

| Folder | Purpose |
|---|---|
| `backend/` | FastAPI application and Python tests |
| `frontend/web/` | Website and component tests |
| `frontend/extension/` | Browser extension and tests |
| `migrations/` | Numbered SQL schema changes |
| `e2e/` | Browser journey and accessibility tests |

Contributors and coding agents should read [agent.md](agent.md) and [rules.md](rules.md).
No licence has been selected; there is no `LICENSE` file.
