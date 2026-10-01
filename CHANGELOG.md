# Changelog

Notable changes to GitBounty. Newest first.

The format is loosely [Keep a Changelog](https://keepachangelog.com/). There are no releases yet: GitBounty
is not deployed and has no version tags. When there is a first release, it becomes `0.1.0` and this file
gains a heading per version.

## How a release will work, when there is one

1. Everything in **Unreleased** moves under a new `## [x.y.z] — YYYY-MM-DD` heading.
2. A tag `vx.y.z` is pushed.
3. The checklist in [`docs/deployment-readiness.md`](docs/deployment-readiness.md) is completed first, not
   afterwards.

Version numbers follow semantic versioning, applied to the **API contract** in
[`docs/api.md`](docs/api.md) — that is the thing other people could depend on.

## Unreleased

### Added

- An append-only `points_ledger`. Every award and correction names its pull request, bounty, the bounty's
  value at the time, the category and who chose it, the rule version and a reason. A total is always the
  sum of its entries.
- Bounty lifecycle: publish, edit, recategorise, unpublish, republish, archive. Nothing is deleted, and
  every change is recorded in `issue_points_history` with who made it and why.
- Organisation repository support, where GitHub reports `admin` or `maintain` permission.
- A maintainer workspace: pick a repository, search its open issues, select, review, publish, then manage
  what you published.
- A points history view, and `GET /api/me/points/history`.
- Leaderboard time windows, categories, paging, and the signed-in user's own position when it falls outside
  the current page.
- A visible Sync GitHub control with last-synced time, progress and failure reasons; a synchronisation now
  starts automatically after sign-in.
- `sync_runs`, so "never synced", "syncing", "synced and empty" and "failed" stop being the same empty
  table.
- CSRF protection on every cookie-authenticated write, and `GET /api/csrf`.
- `GET /ready`, reporting each dependency without naming a host.
- A migration runner (`backend/dev/migrate.py`) with `schema_migrations`, checksum verification, and a
  refusal to touch a non-local database without `--i-have-approval`.
- CI: backend tests against a real Postgres, website lint/typecheck/build, extension tests, secret scanning,
  dependency audits and migration validation.
- `docs/`: setup, architecture, data model, API, points rules, security and secret rotation, database
  runbook, GitHub App, deployment readiness, troubleshooting, known limitations, CI, handoff, and a
  future-paid-bounties proposal.
- `app/not-found.tsx` and `app/error.tsx`.

### Changed

- **Only a bounty published by a verified maintainer awards points.** A `gitbounty:N` GitHub label is now a
  suggestion when publishing and an explicitly-marked fallback in the extension.
- **A bounty is bounded at 1–1000 points**, enforced in the API schema and by a database constraint.
  Previously uncapped.
- **The baseline award requires a participating repository** — one with at least one published bounty.
- **One bounty is awarded once, ever, to one person**, enforced by a partial unique index.
- A recorded award is frozen at the value the bounty had at the time; corrections are new negative entries.
- `POST /api/me/sync` returns `202` and runs in the background, resuming from the last successful cursor.
- The landing page reads live data instead of shipping invented issues, leaderboards and a "your rank" row.
- Every interior page's copy now matches the implementation, including a "Not done" section on `/status`.
- `migrations/` is the only description of the schema; the test suites build from it.
- The extension's pull-request banner names the author as the recipient, and appears only for a published
  bounty.
- `readme.md` describes the points product. The original escrow pitch is kept as
  `docs/original-money-pitch.md`.

### Removed

- The website's hard-coded demo sign-in (`demoSession.ts`).
- The extension popup's fabricated account.
- Thirteen unused components, and the three lint exclusions two of them were the reason for.
- `backend/dev/schema.sql`, a second copy of the schema that had already drifted from the migrations.

### Fixed

- `GET /api/issues` passed asyncpg `Record`s to a Pydantic model, which does not coerce them — a 500
  against a real database that every mocked test passed through.
- The backend test suite read the developer's `.env`, so results depended on the machine.
- The backend no longer refuses to start when the database is unreachable, which previously made `/ready` —
  the endpoint whose job is to report that — unreachable too.
