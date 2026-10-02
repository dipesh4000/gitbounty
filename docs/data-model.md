# Data model

Every table, what it is for, and the constraint that makes it trustworthy. The authoritative definitions
are the files in [`../migrations/`](../migrations); this is the readable version.

## users — 0001

Who has signed in.

| Column | Notes |
|---|---|
| `github_id` | **unique.** The stable identity key. A person can rename their GitHub account; the numeric id does not change |
| `github_login` | Current login. Treated as mutable everywhere |
| `github_access_token` | Fernet-encrypted (`app/crypto.py`). Never selected into any API response. Cleared on logout |
| `name`, `avatar_url`, `created_at`, `updated_at`, `last_login_at` | |

`USER_PUBLIC_COLUMNS` in `app/models.py` is the only column list used for a response, and deliberately
excludes the token.

## repositories — 0002

Cached metadata for any repository a bounty has been published on. `github_id` and `full_name` are unique.

## issues — 0003, extended by 0004 and 0007

The issue a bounty is attached to.

| Column | Notes |
|---|---|
| `github_id` | unique |
| `category` | one of nine, enforced by a check constraint |
| `category_source` | `maintainer` or `inferred`. **0007.** What stops an automated pass silently reclassifying a bounty a maintainer categorised |
| `state`, `labels`, `comments_count`, timestamps | |

## issue_points — 0004, extended by 0007

A published bounty. The name is historical.

| Column | Notes |
|---|---|
| `(repo_full_name, issue_number)` | **unique.** No duplicate active bounty for one issue |
| `points` | **check (points between 1 and 1000).** 0007 replaced `points > 0` |
| `status` | `published` / `unpublished` / `archived`. **0007.** Only `published` awards or appears in the explorer |
| `set_by_user_id` | not null, references `users`. A value exists because somebody we authenticated set it |

## issue_points_history — 0007

Append-only: every change to a bounty.

`action` is one of `published`, `repriced`, `recategorised`, `unpublished`, `republished`, `archived`, with
the before and after values, the actor (id **and** login, so the record stays readable if the user row
goes), a reason, and a timestamp.

## merged_prs — 0005

Which pull requests have been *seen*. A different question from what has been *awarded*.

`unique (user_id, github_pr_id)` — GitHub's immutable pull-request id makes a re-sync idempotent.

## points_ledger — 0008

**The record.** Append-only; a total is `sum(points)` over a user's entries.

| Column | Notes |
|---|---|
| `kind` | `bounty_award` / `baseline_award` / `adjustment` / `void` |
| `points` | **signed.** A correction is a negative entry, never a smaller edit |
| `category`, `category_source` | the maintainer's choice for a bounty award; inferred for a baseline |
| `rule_version` | which rules produced this entry, so a rule change does not make it unexplainable |
| `reason` | required for `adjustment` and `void`, by check constraint |
| `github_pr_id`, `pr_repo_full_name`, `pr_number`, `pr_author_login`, `merged_at` | the pull request |
| `bounty_repo_full_name`, `bounty_issue_number`, `bounty_points_at_award`, `maintainer_user_id` | the bounty, and what it was worth at the time |

Constraints that carry the rules:

| Name | Enforces |
|---|---|
| `points_ledger_baseline_once` | one baseline per pull request per person |
| `points_ledger_bounty_once` | **one award per bounty, to anybody, ever** — case-insensitive on the repository |
| `points_ledger_award_sign_check` | an award is never zero or negative |
| `points_ledger_award_provenance_check` | an award always names a pull request |
| `points_ledger_bounty_provenance_check` | a bounty award always names the bounty and its value at the time |
| `points_ledger_reason_check` | a correction always has a reason |
| `points_ledger_category_check` | the nine-category vocabulary, shared with `issues` |

## pull_requests — 0011

Every pull request a user has authored, in whatever state. A **cache of GitHub**, not a ledger: unlike
`points_ledger` it is deliberately mutable, because a pull request's state is whatever GitHub says today.

| Column | Notes |
|---|---|
| `(user_id, github_pr_id)` | **unique.** GitHub's immutable id, so a re-sync updates a row rather than adding one |
| `state` | one of seven, by check constraint: `draft`, `open`, `in_review`, `changes_requested`, `approved`, `merged`, `closed_unmerged` |
| `eligible`, `ineligible_reason` | **check:** an ineligible row must carry a reason. "Ineligible, with no reason" is not an answer a contributor can act on |
| `merged_at` | **check:** `(state = 'merged') = (merged_at is not null)` |
| `bounty_*`, `baseline_eligible` | what it would earn. What it *did* earn is the ledger's answer and is never stored here |
| `first_seen_at` | the one column a re-sync never updates |

## sync_runs — 0009

One row per synchronisation attempt: status, start and finish, what it saw, what it awarded, the cursor for
the next run, and — on failure — a message safe to show a user plus GitHub's `Retry-After`.

`sync_runs_one_running_per_user` is a partial unique index allowing one running sync per user, which is what
makes a double-clicked Sync button harmless.

## schema_migrations — 0006

Which migration files have been applied, with the sha256 of each one's contents at the time. Written by
`backend/dev/migrate.py`, which uses it to report a file that has been edited since it was applied.

## Indexes

Beyond the primary and unique keys:

| Table | Index | For |
|---|---|---|
| `issues` | `(state, category, issue_updated_at desc)` | the explorer |
| `issues` | GIN on `to_tsvector(title)` | title search |
| `issue_points` | `(status, updated_at desc)` | the maintainer's bounty list |
| `points_ledger` | `(user_id, created_at desc)` | a user's history |
| `points_ledger` | `(merged_at desc)`, `(category, merged_at desc)` | time-window and category leaderboards |
| `points_ledger` | `(github_pr_id)` | "what did this pull request earn?" |
| `merged_prs` | `(user_id)`, `(merged_at desc)`, `(category)` | the pull-request list |

## What is deliberately absent

No table stores money, a wallet address, a transaction, a payment or a chain identifier. No table stores a
GitHub token in plaintext. No table stores a password — GitBounty has no password of its own.
