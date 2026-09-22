# Backend

**Status: not started.** Stack chosen: **FastAPI** (Python), per the tech stack table in [`../plan.md`](../plan.md).

One FastAPI app serves both halves of the split in [`../feature-split.md`](../feature-split.md) — Nishika's login
and issue browsing, Aastha's merged-PR detection and points. Keep each feature in its own module so the two don't
collide.

## What it has to do

- **Log a user in with GitHub** (Nishika) — OAuth via Authlib, and a session the website can carry.
- **Serve open GitHub issues by category** (Nishika) — the API behind the issue browser.
- **Sync a user's merged PRs** (Aastha) — ask GitHub, *as that user*, which of their pull requests have been merged,
  and work out the category of each.
- **Award and serve points** (Aastha) — turn those merges into points, and answer the leaderboard queries.
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
