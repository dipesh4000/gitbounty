# Feature plan — first phase split

The first slice of GitBounty, split by feature rather than by frontend/backend — each feature carries whatever
frontend and backend work it needs to work end to end. This is the actual split Aastha and Nishika agreed on. It
updates the "who does what" part of [`plan.md`](plan.md); that file's tech stack and its other features (Extension,
Deploy) still stand — this file is just about these five.

## Nishika's features

**GitHub Login** — sign in with GitHub. No wallet, no password.

**Database** — the schema and its tables. Nishika applies migrations to the real Supabase project either way (see
[`migrations/README.md`](migrations/README.md)), so owning the schema itself keeps that in one place.

**Issue Browsing** — the page (and the API behind it) where someone browses open GitHub issues by category, to find
something to work on.

## Aastha's features

**Merged PR Detection** — checking a logged-in user's own GitHub account for pull requests they've merged, and
working out which category (frontend/backend/docs/etc.) each one belongs to.

**Points + Leaderboard** — turning detected merges into points, and the queries/pages that show weekly and
per-category leaderboards.

## Order that matters

Merged PR Detection needs GitHub Login (to check a user's own merges) and the Database (somewhere to store them) to
exist first. Points + Leaderboard needs Merged PR Detection's data to show anything real, though its queries and
pages can be built against fake data before that's ready. Issue Browsing only needs the Database, so Nishika can
build it independently of Aastha's two features.
