# Points and anti-abuse rules

The rules GitBounty enforces, what is deliberately **not** defended against, and where each rule lives in
the code. `backend/app/features/points/rules.py` is this document, enforced; migrations 0007 and 0008 are
the parts the database enforces so that application logic cannot be the only thing standing there.

Current rule version: **`points-v1`**. Every ledger entry stores the version that produced it, so changing
a rule does not make past awards unexplainable.

## What points are

Points are a record of recognition for merged open-source work. They are **not** currency, tokens,
securities or redeemable value. They cannot be bought, sold, transferred or withdrawn. Nothing in GitBounty
moves money.

## How points are earned

Two kinds of award, and only two.

| Award | Amount | When |
|---|---|---|
| **Bounty award** | the value a maintainer published on the issue, 1–1000 | a merged pull request by this person closes that published bounty |
| **Baseline award** | 5 | a merged pull request by this person lands in a repository that has at least one published GitBounty bounty |

Both are written to `points_ledger`. A person's total is `sum(points)` over their entries — there is no
stored total that could drift from the entries behind it.

### Bounds

- A bounty is between **1 and 1000 points**. Enforced in the Pydantic request schema
  (`MIN_ISSUE_POINTS`/`MAX_ISSUE_POINTS`), in `validate_bounty_points`, and by the
  `issue_points_points_check` database constraint. Raising the ceiling is a migration, on purpose.
- The baseline is **5 points** (`FLAT_POINTS_PER_MERGE`) and is not configurable per repository.

Before this version there was no maximum at all. `rules.py` said so, and said why it mattered: anyone
could put 100,000 points on a trivial issue in a repository they controlled.

### Only a published bounty awards its value

A `gitbounty:40` **label on a GitHub issue awards nothing.** Anyone with write access to a repository can
add one, and GitBounty has not seen it or authenticated the person who set it.

A label is still used, in two places where it cannot do harm:

- As a **suggestion** when a maintainer publishes a bounty through GitBounty — the publish form pre-fills
  the label's value, clamped to 1–1000 (`suggested_bounty_points`).
- As an explicitly-marked **fallback badge** in the browser extension, which reads `40 label`, is styled
  differently from a GitBounty badge, and says "not published on GitBounty" in its accessible name. The
  API's answer always replaces it; the reverse is refused.

This supersedes the sketch in `overview.md`, which described a label on any repository as a way to set a
bounty value with no signup. The workflow is: a maintainer GitBounty has authenticated publishes the
bounty, and only published bounties appear in the explorer or award anything.

### The baseline needs a participating repository

A merged pull request into *any* repository used to earn the baseline. That was farmable with a throwaway
repository and a second account. The baseline now needs the repository to have at least one published
bounty, which means a verified maintainer with admin or maintain permission on it chose to take part.

## When points are awarded, and when they are not

**Only an eligible merged pull request awards anything.** Not an approval, not a closed issue, not a closed
pull request, and not a pull request merely existing. GitBounty tracks all seven lifecycle states so a
contributor can see where their work stands, and `expected_points` on an open pull request is a forecast —
a bounty is awarded once, to one person, so somebody else's merge can still get there first.

| State | Awards |
|---|---|
| draft, open, in review, changes requested, approved | nothing |
| closed without merging | nothing |
| merged, but ineligible | nothing, and the reason is shown |
| merged and eligible | the bounty's value if it closes one, plus the baseline |

A pull request that is merged, reopened and merged again is awarded once: GitHub's pull-request id does not
change, and `points_ledger_baseline_once` and `points_ledger_bounty_once` are keyed on it.

## Who receives the points

**The pull request's author.** Not whoever clicked Merge. Synchronisation queries GitHub as the signed-in
user for `is:pr author:<their login> is:merged`, so the person being credited is by construction the
author. The extension's pull-request banner says the same thing.

## What is refused

| Case | Rule | Where |
|---|---|---|
| **Self-merge** — a pull request merged into a repository its own author owns | earns nothing at all, and is counted and reported so the person is told why | `MergedPR.is_self_merge`, `detect_merges` |
| **A maintainer collecting their own bounty**, in somebody else's repository | the bounty is not matched; the baseline still applies | `_matching_bounty` |
| **Two pull requests closing one bounty** | the bounty is awarded **once, ever, to one person**. The second earns the baseline only | `points_ledger_bounty_once` (a partial unique index) |
| **Two people both closing one bounty** | same index. Whichever sync records first is credited; the other is told the bounty was already claimed | `points_ledger_bounty_once` |
| **One pull request closing several bounties** | credited with the **first** bounty its text names. Awarding all of them would let one pull request collect several maintainers' budgets at once; the others stay open for their own work | `_matching_bounty` |
| **Re-synchronising** | awards nothing a second time. A pull request already in the ledger is already paid | `points_ledger_baseline_once`, `on conflict do nothing` |
| **A maintainer raising a bounty's value after it was awarded** | does not change the award. `bounty_points_at_award` is what it was worth at the time, and the entry is immutable | `record_merges`, migration 0008 |
| **A maintainer lowering a value, or unpublishing** | does not remove a recorded award. An unpublished bounty stops being awardable; it does not un-pay | `published_bounties` filters on `status = 'published'` |
| **A bounty over the maximum, or zero or negative** | rejected by the request schema and by a database check | migration 0007 |
| **A category that is not one of the nine** | rejected by a database check on both `issues` and `points_ledger`, so a typo in one half of the product cannot split a leaderboard | migrations 0003/0004/0008 |

## What is *not* defended against

Stated plainly, because a security claim that is not true is worse than no claim.

- **Two people colluding.** A publishes a bounty on their repository, B fixes it, B is credited, and they
  swap roles next time. The self-merge rule does not catch this and neither does anything else. The
  1000-point ceiling makes it slow rather than impossible. Mitigations that have *not* been built: a
  minimum repository age or star count, a per-person-pair rate limit, a cap on points earned from one
  maintainer, and manual review of outliers.
- **Low-value merges.** A typo fix in a participating repository earns the same baseline as a real fix.
- **Reverted merges.** GitBounty does not detect that a merged pull request was later reverted. The
  correction mechanism exists (`record_adjustment`) but nothing calls it automatically.
- **Reopened or re-merged pull requests.** A pull request is identified by GitHub's immutable id, so it is
  awarded once; a genuine second merge of the same pull request earns nothing more.
- **Transferred or renamed repositories.** The ledger keeps the name as it was at the time of the award.
  Matching is case-insensitive but not rename-aware, so a bounty on a repository that is later renamed
  stops matching new pull requests.

## Corrections

The ledger is append-only. A correction is a **new entry with a negative value and a reason**, never an
edit:

- `adjustment` — a correction, positive or negative, with a reason. A reason is required by a database
  check constraint, not just by convention.
- `void` — an award withdrawn by moderation; the points are the negation of the original. The original
  entry stays, so the history shows both what happened and that it was undone.

A user whose entries net to zero or less drops off the leaderboard rather than sitting at the bottom of it.

`POST` endpoints for moderation are **not built**; `record_adjustment` is called from code and tests only.
That is the honest state: the ledger supports corrections, and there is no UI for making one.

## Where a bounty's value and category are fixed

- **Value**: frozen in the ledger when the award is written (`bounty_points_at_award`).
- **Category**: a published bounty's category is the maintainer's choice and is authoritative for anything
  awarded on it (`category_source = 'maintainer'`). Automated inference from changed files, labels and
  repository language only applies to a baseline award, and is recorded as `category_source = 'inferred'`.
  Inference never overwrites a maintainer's choice — migration 0007 adds the column that makes that
  distinction storable, and `_upsert_issue` sets it.

## Audit trail

| Table | Holds |
|---|---|
| `points_ledger` | every award and correction: kind, signed points, category and its source, rule version, reason, pull request, bounty, maintainer, merge time |
| `issue_points_history` | every change to a bounty: published, repriced, recategorised, unpublished, republished, archived — with who did it, what it was before, and why |
| `sync_runs` | every synchronisation attempt: what it saw, what it awarded, and how it failed |
| `merged_prs` | which pull requests have been seen, which is a different question from what has been awarded |

A user reads their own ledger at `GET /api/me/points/history`; a maintainer reads one bounty's history at
`GET /api/maintainer/bounties/{owner}/{name}/{number}/history`.
