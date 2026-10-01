# GitBounty — what this product is

The single source of truth for what GitBounty does. Where this file and any other document disagree, this
one wins. `readme.md` is the public introduction; `docs/` holds the detail; `overview.md`, `agent.md`,
`plan.md` and `feature-split.md` are the team's working notes and predate several decisions recorded here.

**This file is original. No part of it is derived from any other project's documentation.** An earlier
version of `PRODUCT.md` on `origin/main` was a verbatim copy of the README of
[sundai-club/git-paid](https://github.com/sundai-club/git-paid) — a different product, describing escrow,
the Radius SDK and crypto wallets. It was rejected in full and replaced by this.

## In one paragraph

GitBounty is a points-based recognition platform for open-source contribution. A maintainer publishes one
of their own open GitHub issues as a bounty worth a number of points. A contributor fixes it through the
ordinary GitHub workflow. When their pull request merges and closes that issue, they receive exactly those
points, recorded as an immutable entry naming the pull request it came from. Points feed category and
time-window leaderboards.

## What GitBounty is not

Not a cash bounty platform, a cryptocurrency product, a wallet, an escrow service, a blockchain
application, or a payment processor. Nothing in this codebase moves money, holds funds, or touches a chain.
Points are not currency, tokens, securities or redeemable value, and cannot be bought, sold, transferred or
withdrawn.

A possible future paid phase is sketched in [`docs/future-paid-bounties.md`](docs/future-paid-bounties.md).
That document is a proposal about what would have to be true before money could be handled safely. It is
not a plan, not scheduled, and nothing in the codebase builds toward it.

## The workflow

1. A user signs in with their GitHub account (OAuth, `read:user`).
2. A maintainer opens the workspace and sees the repositories GitHub says they **administer or maintain** —
   personal or organisation. Nothing is pasted by hand and nothing the client claims is trusted.
3. They pick a repository; GitBounty loads its open issues from GitHub.
4. They select issues, give each a category and a value between **1 and 1000 points**, review the
   selection, and publish.
5. **Only published bounties appear in the public explorer.** Unpublishing one removes it.
6. The optional browser extension shows a published bounty's points and category beside the matching issue
   on GitHub.
7. A contributor solves the issue through the normal pull-request workflow, saying `Closes #N`.
8. Synchronisation reads the contributor's merged pull requests from GitHub, as that contributor, with
   their own token. There are no webhooks: GitBounty does not own these repositories and cannot ask their
   maintainers to install one.
9. When an eligible merged pull request closes a published bounty, **its author** — not whoever clicked
   Merge — receives the bounty's value **exactly once**, enforced by a database constraint.
10. The contribution appears in the author's pull-request list, points history, category totals and the
    leaderboards.
11. The maintainer can inspect, edit, unpublish, republish or archive their bounties. Nothing is deleted,
    and every change is recorded with who made it, what it was before, and why.
12. **Every points change has traceable provenance**: the pull request, the bounty, what that bounty was
    worth at the time, the category and who chose it, the rule version, and a reason.

## The rules, in brief

Full detail, including what is deliberately not defended against, is in
[`docs/points-rules.md`](docs/points-rules.md).

- A bounty is **1–1000 points**, enforced in the API schema and by a database check constraint.
- A **baseline of 5 points** is awarded for a merged pull request in a repository that has published at
  least one bounty. *This rule is deliberately retained*: without it a contributor who fixes something in a
  participating repository that happens to have no bounty on that issue records nothing. It does not apply
  to merges into repositories that have never taken part, because that was farmable with a throwaway
  repository and a second account.
- A `gitbounty:40` **GitHub label awards nothing**. It pre-fills the value when a maintainer publishes
  through GitBounty, and the extension shows it as an explicitly-marked label value. Only a bounty
  published by a maintainer GitBounty has authenticated awards points.
- **No points for merging your own pull request into your own repository.**
- **A maintainer cannot collect a bounty they published.**
- **One bounty, one award, ever** — to one person, however many pull requests close it.
- An award is **frozen** at the value the bounty had when it was recorded. A later change by the maintainer
  does not alter it.
- Corrections are **new negative entries with a required reason**, never edits.

## The two surfaces

- **The website** (`frontend/web/`) — the public landing page and opportunity explorer, and the signed-in
  workspace: opportunities, maintainer workspace, my pull requests, points history, leaderboard.
- **The browser extension** (`frontend/extension/`) — optional. Shows a published bounty beside the issue
  on GitHub. **The website must work completely without it, and does.**

## Deployment status

**GitBounty is not deployed.** It runs locally: the FastAPI backend on `:8001`, the Next.js site on
`:3000`, Postgres in a local container, and the extension loaded unpacked. No page claims otherwise. The
owner has asked for it to stay local for now.

## Decided

| | |
|---|---|
| Backend | FastAPI (Python), plain SQL through asyncpg |
| Database | Postgres. Schema is `migrations/`, applied by `backend/dev/migrate.py` |
| Auth | GitHub OAuth, scope `read:user`; tokens Fernet-encrypted at rest, never sent to a browser |
| Website | Next.js (vinext build target), React, TypeScript |
| Extension | Chrome Manifest V3, vanilla JS |
| Points | Append-only ledger; totals are always `sum(points)` over entries |

## Open, and needing an owner decision

- **The open-source licence.** `readme.md` carries an MIT badge and there is no `LICENSE` file. Nobody
  should invent one; see [`docs/handoff.md`](docs/handoff.md).
- **Private repositories.** Out of scope today. Supporting them means a GitHub App rather than broader
  OAuth scopes; the integration seam and the exact setup are in
  [`docs/github-app.md`](docs/github-app.md).
- **Collusion between two cooperating accounts.** Not solved. The 1000-point ceiling slows it; nothing
  detects it. Candidate mitigations are listed in `docs/points-rules.md` and none are built.
- **Hosting**, if the product is ever deployed.

## Changing this document

The product definition above is not changed by writing code. A proposed change is documented here with its
rationale and approved by the owner first.
