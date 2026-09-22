# Feature seams — what Aastha needs from Nishika

[`feature-split.md`](feature-split.md) says who builds what. This file says where those features touch, so both
sides can be built at the same time without waiting on each other.

Aastha's two features (Merged PR Detection, Points + Leaderboard) sit downstream of both of Nishika's
foundations (GitHub Login, Database). Until those exist, Aastha's side runs against **stubs** that match the
shapes below. When Nishika's real versions land, the stubs are deleted and nothing else has to change — as long as
the shapes still match. **If a shape here has to change, say so before changing it.**

## Seam 1 — GitHub Login

Merged PR Detection has to know *whose* GitHub account to look at, and needs permission to look.

What Aastha's code expects from the login feature:

| What | Shape | Why |
|---|---|---|
| Current user, per request | A FastAPI dependency, `get_current_user()`, returning the logged-in user or raising 401 | So a sync endpoint knows whose merges to fetch |
| Its fields | `id` (our own user id), `github_id` (int, GitHub's numeric id), `github_login` (str) | `github_id` is the stable key — a person can rename their GitHub account, `github_login` changes with it |
| The user's GitHub token | Readable server-side for the logged-in user | Merged PRs are fetched *as that user*, not with a shared app token |

OAuth scopes: public merged PRs need no privileged scope — `read:user` is enough. **Do not request `repo`.** It
grants read/write to the user's private repositories, and nothing here needs it.

Stub until then: a dev-only override that fixes the current user from an environment variable, off by default and
never enabled in a deployed build.

## Seam 2 — Database

The schema is Nishika's feature, including these tables. Aastha's features need somewhere to record which merges
have already been counted (so a re-sync doesn't award the same PR twice) and what each user's points are.

Roughly what has to exist — exact column names and types to be settled with Nishika before a migration is written:

- **users** — our user id, `github_id`, `github_login`, avatar, created-at. Owned by the login feature.
- **merged_prs** — one row per counted merge: the user it belongs to, the PR's GitHub id, repo full name, PR title
  and URL, the category, when it was merged, the issue it closed (if any), and points awarded. Unique on
  (user, PR id) so a re-sync is idempotent.
- **issue_points** — a maintainer-set value for one issue, from the website. See seam 4.
- **points / leaderboard reads** — whether points live as a column on `users`, or are summed from `merged_prs` on
  read, is an open question. Summing is simpler and can't drift out of sync; a stored total is faster. Aastha will
  propose one once the leaderboard queries are written.

Migrations are hand-written SQL in [`migrations/`](migrations) and **Nishika applies them** to her Supabase project
(see [`migrations/README.md`](migrations/README.md)). Nobody applies one from their own machine.

Stub until then: Aastha's side runs against a local database with the same table shapes, so the query code is real
even while the hosted schema isn't.

## Seam 3 — Categories (shared vocabulary)

Both sides use categories, so they have to agree on the same list. Nishika's Issue Browsing sorts *open issues* into
them; Aastha's Merged PR Detection sorts *merged PRs* into them; the per-category leaderboards group by them.

The list:

`frontend`, `backend`, `fullstack`, `docs`, `testing`, `devops`, `design`, `mobile`, `other`

Stored as a plain lowercase string in one shared place, so neither side can drift. `other` exists so nothing is
ever uncategorised — it is an honest "no idea", not a dumping ground.

A note for the issue browser: categorising a *merged PR* is easier than categorising an *open issue*, because a PR
has changed files to look at and an open issue only has its title, body and labels. Don't expect the same accuracy
from both sides.

## Seam 4 — Where an issue's points come from

An issue creator sets what their issue is worth in one of two ways (see [`overview.md`](overview.md)):

- **A GitHub label**, such as `gitbounty:40`. Read straight from GitHub. Aastha's side parses it; no database
  involved, no maintainer signup.
- **On the GitBounty website**, by a signed-in maintainer. This is a *screen* (Nishika's side, since it needs login
  and sits with the rest of the site) writing a *stored value* that Aastha's award code reads.

When an issue has both, **the website value wins** — it was set deliberately by someone we authenticated, and it
can be corrected, whereas a label can be edited by anyone with write access to the repo.

What Aastha's side needs for the stored half:

| What | Shape |
|---|---|
| A place to record a maintainer-set value | repo full name, issue number, points, who set it, when |
| Looked up by | (repo full name, issue number) — the same pair a PR's closed issue gives us |

Until that screen and table exist, only the label path is live, and the award code treats a missing stored value as
"no override" rather than an error.

## What Aastha's side provides back

For Nishika's website work, once built:

- an endpoint for the logged-in user's own points and merge history
- an endpoint for the leaderboards (overall, weekly, per-category)

Exact paths and JSON go here once they exist, rather than being guessed now.
