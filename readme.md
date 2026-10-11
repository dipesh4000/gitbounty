# GitBounty

Find rewarded GitHub issues, contribute a fix, and earn points for an eligible merged pull request.
Use the website to discover and manage bounties, or the optional browser extension to see rewards directly on GitHub.

**Current status:** an implemented local points application. Not a deployed service or a payment platform.
GitHub App webhooks and pre-registration reward claims are implemented but still need live GitHub verification.

## Product direction

- Maintainers publish rewards on GitBounty. Only registered, published rewards should appear on the website and extension.
- Rewards belong to the pull request author's **stable GitHub numeric ID**, whether or not they have a GitBounty account.
- A contributor must sign in with that same GitHub account to create their GitBounty account and claim their points.
- Registration does not determine eligibility or create a second award; the signed-in GitHub identity claims a reserved award once.
- Optional fixed AVAX promises accompany points bounties. Owners pay each verified claim from a browser wallet;
  GitBounty does not fund or guarantee payment. Both parties pay gas; points do not convert into money.
  Live execution requires migration 0015 and the payment configuration in [setup](docs/setup.md).

## Start here

| Document | Purpose |
|---|---|
| [Product overview](overview.md) | Agreed experience and product boundaries |
| [Progress and next steps](plan.md) | What exists, what is unverified, and what to build next |
| [Local setup](docs/setup.md) | Run the backend, website, extension and checks |
| [Architecture](docs/architecture.md) | Current code structure and planned integration |
| [Points rules](docs/points-rules.md) | Current award rules and the pending claim model |
| [Security and operations](docs/security.md) | Credentials, migrations, recovery and deployment |

## Implementation today

FastAPI serves GitHub OAuth, issue browsing, maintainer publishing, PR tracking, points history,
leaderboards and moderation APIs. Postgres stores an append-only points ledger.
The website uses React/TypeScript with Next.js-style routing through vinext.
The Manifest V3 extension adds issue badges and a points popup.

The backend uses **uv** with a committed lockfile. **Async SQLAlchemy** now serves the issue board and authentication;
the remaining database queries are being migrated from asyncpg SQL.
Selected public repositories can receive signed GitHub App webhooks; contributor sync remains the reconciliation path.

## Run locally

Follow [setup](docs/setup.md) for Python 3.12, Node 22.13+, local Postgres and GitHub OAuth configuration.
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
