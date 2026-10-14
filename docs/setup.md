# Development and deployment setup

This guide covers the existing application and names planned settings for the hackathon escrow/Privy work. Planned settings are not usable until their corresponding code exists.

## Prerequisites

- Python 3.12
- uv
- Node.js 24
- PostgreSQL
- Two GitHub accounts for the live flow
- A GitHub OAuth app and GitHub App
- An Avalanche-compatible wallet with Fuji test AVAX
- Official Fuji test USDC
- A Privy application when Phase 5 begins
- A Fuji RPC endpoint

## Repository layout

Run commands from the component directory; this is not a root npm workspace.

```text
backend/             FastAPI application
frontend/web/        Next.js website
frontend/extension/  optional browser extension
migrations/          PostgreSQL migrations
e2e/                 browser tests
contracts/           planned Solidity workspace
```

## Database

Use a throwaway local PostgreSQL database for development and tests. Configure `DATABASE_URL` in the ignored `backend/.env` file. Apply migrations through the existing runner:

```powershell
cd backend
uv sync --locked
uv run python dev/migrate.py status
uv run python dev/migrate.py up
```

Never apply migrations to a shared database without explicit owner approval and a backup. Never edit an applied migration.

## Existing backend configuration

Copy `backend/.env.example` to ignored `backend/.env` and configure only the values required for the feature under test:

- `DATABASE_URL`
- `SESSION_SECRET`
- `TOKEN_ENCRYPTION_KEY`
- `GITHUB_CLIENT_ID`
- `GITHUB_CLIENT_SECRET`
- `GITHUB_CALLBACK_URL`
- `FRONTEND_URL`
- `GITHUB_APP_ID`
- `GITHUB_APP_SLUG`
- `GITHUB_APP_PRIVATE_KEY_PATH`
- `GITHUB_WEBHOOK_SECRET`
- `SECURE_COOKIES`
- `ADMIN_GITHUB_IDS` when testing moderation

The current SmoothSend path additionally recognizes its existing `AVAX_*` and `SMOOTHSEND_*` settings. Those remain historical/current compatibility settings until the new escrow flow replaces or reuses them.

Start the API:

```powershell
cd backend
uv run uvicorn app.main:app --reload --port 8001
```

Useful endpoints:

- `http://localhost:8001/health`
- `http://localhost:8001/ready`
- `http://localhost:8001/docs`

## Website

```powershell
cd frontend/web
npm.cmd ci
npm.cmd run dev
```

Open `http://localhost:3000`.

Checks:

```powershell
npm.cmd test
npm.cmd run lint
npm.cmd run typecheck
npm.cmd run build
```

## Backend checks

```powershell
cd backend
uv run pytest
```

Database-backed tests require an isolated local database. A run that skips database tests is not full verification.

## Browser checks

Follow [../e2e/README.md](../e2e/README.md). The harness must use isolated local data and simulated GitHub unless a test explicitly documents live external effects.

## Planned contract workspace

Phase 1 will add `contracts/` using Hardhat 3, Node 24 and viem:

```text
contracts/
  contracts/GitBountyEscrow.sol
  test/escrow.test.ts
  scripts/deploy-fuji.ts
  hardhat.config.ts
  package.json
  package-lock.json
  deployments/fuji.json
```

The deployment record may contain public addresses, transaction hashes, chain ID, compiler metadata, and constructor arguments. It must never contain deployer or signer private keys.

Pin compiler and dependencies, set evmVersion = cancun explicitly, and retain Standard JSON build input/output and optimizer settings. [Avalanche compiler guidance](https://build.avax.network/docs/primary-network/verify-contract/hardhat) warns against relying on newer compiler defaults. Contract commands will become executable setup instructions only when this workspace exists.

Planned public configuration:

- Fuji chain ID `43113`
- Fuji RPC URL
- official Fuji USDC address
- deployed escrow contract address
- Snowtrace base URL

Planned server-only configuration:

- settlement authorization signer or external signer reference
- expected immutable signer address and deployment block
- optional RPC provider credential

Planned browser configuration:

- Privy app ID
- chain ID
- escrow and token addresses

The API should return authoritative public payment configuration so the frontend does not duplicate it inconsistently.

## Planned Privy setup

When Phase 5 begins:

1. Create/configure a Privy app for the exact development and production origins.
2. Enable native GitHub OAuth; it is supported by current Privy docs. Keep the existing direct OAuth route as fallback.
3. Configure Avalanche Fuji as the default and supported EVM chain.
4. Enable embedded EOA creation and external EVM wallets; preserve any existing immutable receiving EOA.
5. Verify the access token and linked identity server-side, map its numeric GitHub subject to the existing user, then establish the normal GitBounty app session. Reject conflicting app/Privy identities.
6. Require a wallet signature challenge before persisting the payout address.
7. Retain the separate GitHub owner-authorization token flow for permission checks and App installation reads. A Privy access token is not a GitHub API credential.
8. Test logout, token refresh, two-account migration, same-address recovery/export and MFA. Custom JWT is an optional existing-auth alternative, not required for native GitHub login.

Official references: [native GitHub OAuth](https://docs.privy.io/authentication/user-authentication/login-methods/oauth), [access tokens](https://docs.privy.io/authentication/user-authentication/access-tokens), and [connect or create a wallet](https://docs.privy.io/wallets/connectors/usage/connect-or-create).

## GitHub configuration

OAuth is used for user identity and user-specific GitHub actions. The GitHub App is used for repository installation scope and webhook processing.

For the live demo:

- use a dedicated public repository;
- enable Issues;
- install the GitHub App only on the selected repository;
- configure the production webhook URL and secret;
- request only permissions required by the actual API calls;
- use two distinct GitHub users for payer and contributor.

## Fuji assets

Use faucet AVAX only for gas and official Fuji test USDC for the bounty. Test assets have no monetary value. Verify token address and decimals against current official Avalanche/Circle information before deployment rather than copying an old address blindly.

Checked October 13: Fuji chain ID 43113, USDC 0x5425890298aed601595a70AB815c96711a31Bc65 has bytecode and six decimals. A needs USDC plus AVAX for exact allowance approval and funding; B needs AVAX for a direct claim. Pre-fund both before recording. SmoothSend sponsorship is an optional separately verified enhancement.

## Deployment configuration

The current Vercel configuration routes website, API, authentication, webhooks, and health endpoints under one origin. The target persistent Python API needs explicit proxy rewrites, host secret-file delivery and a worker restart check. Confirm operator account/budget first; a sleeping free instance is not an always-on worker. The fallback is bounded authenticated request-driven drain/sync with saved inbox state.

Production must configure:

- exact frontend and OAuth callback URLs;
- secure cookies;
- production database and migration status;
- GitHub App private key and webhook secret;
- Fuji RPC and contract configuration;
- Privy public/server configuration when implemented;
- authorization signer through secure secret storage;
- logs that exclude secrets and transaction authorization payloads where sensitive.

Before implementing the new flow, resolve the advisory findings and operational preflights in [dependency-boundaries.md](dependency-boundaries.md). Same-origin proxy cookies, callback redirects, App permissions, TLS/pool limits and worker progress need live checks after deployment.

## Local-to-live promotion

1. Pass deterministic contract tests.
2. Pass backend and frontend tests locally.
3. Run a local integration flow against a local EVM node.
4. Deploy the exact tested contract artifact to Fuji.
5. Verify a manual fund/settle smoke test.
6. Deploy the application configuration.
7. Run the two-account GitHub-to-Fuji flow in [testing-data.md](testing-data.md).
8. Record public evidence in [hackathon-submission.md](hackathon-submission.md).

Never use successful local or simulated tests as a claim that production or Fuji has been verified.
