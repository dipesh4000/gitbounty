<p align="center">
  <img src="frontend/web/public/assets/logo_mark.svg" alt="" width="54" height="48" />
</p>

<h1 align="center">GitBounty</h1>

<p align="center">
  <strong>Open-source contribution, made visible.</strong><br/>
  A maintainer publishes an issue as a bounty worth points. A contributor fixes it on GitHub.
  When the pull request merges, its author earns those points — recorded, once, with the evidence attached.
</p>

<p align="center">
  <em>Points, not money. No wallet, no escrow, no blockchain, no payments.</em>
</p>

---

## What this is

GitBounty turns merged open-source work into an inspectable record of recognition.

- **Maintainers** publish one of their own open GitHub issues as a bounty worth 1–1000 points, choosing a
  category. Only published bounties are visible to contributors.
- **Contributors** browse those bounties by the kind of work they want to do, fix one through the ordinary
  GitHub workflow, and — when the pull request merges and closes the issue — receive exactly those points.
- **Everyone** sees category and time-window leaderboards built from entries that each name the pull
  request behind them.

The reward is recognition and competition. Points are not currency, tokens, securities or redeemable
value; they cannot be bought, sold, transferred or withdrawn. **Nothing here moves money.**

[`PRODUCT.md`](PRODUCT.md) is the full product definition and the file that wins any disagreement.

> **Status: runs locally. Not deployed anywhere.** There is no hosted GitBounty. Everything below runs on
> your own machine.

## How it works

```
   maintainer                         contributor
        │                                   │
        │ publishes an open issue           │ browses published bounties
        │ as a bounty (1–1000 pts)          │
        ▼                                   ▼
   ┌──────────────────────────────────────────────┐
   │              the GitHub workflow             │
   │   issue → branch → pull request → review     │
   └──────────────────────────────────────────────┘
                        │ merged, closing the issue
                        ▼
   ┌──────────────────────────────────────────────┐
   │  sync reads YOUR merged PRs, as YOU, with    │
   │  your own token — no webhooks                │
   └──────────────────────────────────────────────┘
                        │
                        ▼
      one immutable ledger entry per award:
      pull request · bounty · value at the time ·
      category · rule version · reason
                        │
                        ▼
          profile · points history · leaderboards
```

Three things that shape the design:

- **The points go to the pull request's author**, not to whoever clicked Merge.
- **A bounty is awarded once, ever, to one person** — enforced by a database constraint, not by
  application logic.
- **The ledger is append-only.** A correction is a new negative entry with a reason. A total is always the
  sum of entries that can each be read.

The rules the code enforces, and what is deliberately *not* defended against, are in
[`docs/points-rules.md`](docs/points-rules.md).

## Run it locally

You need Python 3.12+, Node 22.13+, Docker (for a throwaway Postgres), and a GitHub OAuth app.

```bash
# 1. database
docker run -d --name gitbounty_dev_db \
  -e POSTGRES_USER=gitbounty -e POSTGRES_PASSWORD=gitbounty_local_dev \
  -e POSTGRES_DB=gitbounty_dev -p 5440:5432 postgres:17-alpine

# 2. backend
cd backend
python3 -m venv .venv && . .venv/bin/activate
pip install -r requirements-dev.txt
cp .env.example .env          # then fill it in — see docs/setup.md
python dev/migrate.py up
uvicorn app.main:app --port 8001 --reload

# 3. website (in another terminal)
cd frontend/web
npm ci
npm run dev                   # http://localhost:3000
```

Then open <http://localhost:3000> and click **Connect GitHub**.

Full instructions, including creating the OAuth app and generating the two secrets, are in
[`docs/setup.md`](docs/setup.md). The optional browser extension has its own
[README](frontend/extension/README.md).

## Repository layout

| Path | Holds |
|---|---|
| `backend/` | The FastAPI service: OAuth, the points ledger, synchronisation, the maintainer API |
| `frontend/web/` | The website: landing page, opportunity explorer, and the signed-in workspace |
| `frontend/extension/` | The optional Chrome extension |
| `migrations/` | Every schema change, in order. The only description of the database |
| `docs/` | Setup, architecture, API, security, points rules, runbooks, handoff |
| `examples/web/` | The original vanilla landing page the Next.js site was ported from |

## Tests and checks

```bash
cd backend && . .venv/bin/activate && pytest        # 277 tests
cd frontend/web && npm run lint && npm run typecheck && npm run build
cd frontend/extension && npm run check              # 35 tests
```

Everything above runs in CI on every push and pull request — see
[`.github/workflows/ci.yml`](.github/workflows/ci.yml) and [`docs/ci.md`](docs/ci.md).

## Documentation

| | |
|---|---|
| [`PRODUCT.md`](PRODUCT.md) | What the product is, and what it is not |
| [`docs/setup.md`](docs/setup.md) | Local development, from nothing to running |
| [`docs/architecture.md`](docs/architecture.md) | How the pieces fit together, and why |
| [`docs/data-model.md`](docs/data-model.md) | Every table and what it is for |
| [`docs/api.md`](docs/api.md) | The HTTP contract |
| [`docs/points-rules.md`](docs/points-rules.md) | The rules, enforced, and the gaps |
| [`docs/security.md`](docs/security.md) | The security model, and the secret-rotation checklist |
| [`docs/database-runbook.md`](docs/database-runbook.md) | Migrations, backup and restore |
| [`docs/github-app.md`](docs/github-app.md) | What private-repository support would need |
| [`docs/deployment-readiness.md`](docs/deployment-readiness.md) | What must be true before deploying |
| [`docs/troubleshooting.md`](docs/troubleshooting.md) | When something does not work |
| [`docs/known-limitations.md`](docs/known-limitations.md) | What is not built and not defended against |
| [`docs/handoff.md`](docs/handoff.md) | Ownership-transfer checklist |
| [`docs/future-paid-bounties.md`](docs/future-paid-bounties.md) | A future proposal. Not current, not built |
| [`docs/original-money-pitch.md`](docs/original-money-pitch.md) | The original escrow pitch, kept as history |

## Licence

**Not yet chosen.** This repository has no `LICENSE` file, so by default no rights are granted. Picking one
is an owner decision — see [`docs/handoff.md`](docs/handoff.md).
