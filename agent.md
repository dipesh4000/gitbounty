# Agent guide

Read [overview.md](overview.md) first, then [plan.md](plan.md) and [rules.md](rules.md).
The overview records product intent; the plan distinguishes implemented behavior from agreed future work.

## Working context

- GitBounty is a points app with a website and optional browser extension.
- FastAPI, Postgres, GitHub OAuth and a points ledger are implemented.
- uv manages the backend project and lockfile. Async SQLAlchemy serves issue-board reads and authentication; remaining queries still use asyncpg.
- GitHub App webhooks use a signed, durable inbox and retry worker; live GitHub verification remains pending.
- Rewards must belong to the PR author's GitHub numeric ID before or after registration.
  Authentication as that identity is required to claim. Allocations and claims are implemented.
- Only registered rewards are displayed; the extension's label-only fallback has been removed.
- Owner-approved Avalanche promises are in scope. Connected browser wallets sign individual payouts
  through required SmoothSend; owners fund smart accounts and pay fees in USDC. Current tests use Fuji USDC.
  Points do not convert into money.
  Keep payout amounts and recipients server-resolved, signatures verified and retries idempotent.
- Current demo documentation must explain SmoothSend's owner-paid USDC fee flow and external
  receiving wallets. Do not imply embedded wallets, sponsored withdrawals or a verified live payout.

## Before claiming completion

Read the code instead of trusting old descriptions. Run checks appropriate to the change and report
what was verified, what skipped, and what still needs a person or external configuration.
Preserve existing API contracts and award invariants during infrastructure migrations.
Keep Pydantic response models separate from ORM models; stored tokens must never become public fields.

Open product decisions are listed in the overview. Propose and wait on those rather than choosing by scaffolding.
Do not re-ask decisions already settled by the user.

## Documentation map

- [README](readme.md): introduction and entry points.
- [Overview](overview.md): agreed product.
- [Plan](plan.md): progress and next work.
- [Setup](docs/setup.md), [architecture](docs/architecture.md), [points rules](docs/points-rules.md),
  [security and operations](docs/security.md): essential technical guidance.

Use existing CSS tokens and accessible controls for frontend changes.
