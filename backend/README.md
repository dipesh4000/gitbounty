# Backend

**Status: active development.** The backend uses FastAPI, Postgres through `asyncpg`, and hand-written SQL
migrations. GitHub OAuth, issue browsing/sync, merged-PR detection, points, and leaderboards are implemented.

One FastAPI app serves both halves of the split in [`../feature-split.md`](../feature-split.md) — Nishika's login
and issue browsing, Aastha's merged-PR detection and points. Keep each feature in its own module so the two don't
collide.

## What is built

- **Log a user in with GitHub** — OAuth with a signed session cookie and encrypted stored access token.
- **Serve open GitHub issues by category** — the board reads cached Postgres rows; an authenticated sync refreshes them.
- **Sync a user's merged PRs** — ask GitHub, *as that user*, which of their pull requests have been merged,
  and work out the category of each.
- **Award and serve points** — turn those merges into points, and answer the leaderboard queries.
- Read and write the database (Postgres on Supabase). Schema changes come from [`../migrations/`](../migrations),
  not from this folder, and Nishika applies them by hand.

## Two things that shape the design

- **No webhooks.** We don't own the repos whose issues we list, so we can't ask their maintainers to install one.
  Everything is pulled per-user, with the user's own GitHub token.
- **No points for self-merges.** A PR merged by its own author into their own repo is the obvious way to fake a
  score, so it doesn't count.

## Not in scope

Escrow, wallets, bounty funding and `release()` / `refund()` calls belong to the deferred money phase
(see [`../overview.md`](../overview.md)). Don't build them.

## Rules that apply here

See [`../rules.md`](../rules.md), in particular section 5 (never commit secrets — GitHub OAuth client secret, user
access tokens, the database URL) and section 7 (don't decide an open question by scaffolding it).
