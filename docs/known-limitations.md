# Known limitations

Everything GitBounty does not do, stated plainly. A capability list without this is marketing.

## Not deployed

GitBounty runs locally. There is no hosted instance, no domain, no CI deployment step and no monitoring. No
page claims otherwise. This is the owner's current choice, not an oversight.

## Anti-abuse

| | |
|---|---|
| **Two cooperating accounts** | **Not solved.** A publishes a bounty on their repository, B fixes it, B is credited; they swap next time. The self-merge rule does not catch it. The 1000-point ceiling makes it slow rather than impossible. Candidate mitigations — minimum repository age or stars, a per-pair rate limit, a cap on points from one maintainer, review of outliers — are none of them built |
| **Low-value merges** | A typo fix in a participating repository earns the same baseline as a real fix |
| **Reverted merges** | Not detected. The correction mechanism exists (`record_adjustment`) but nothing calls it automatically |
| **Moderation** | No endpoint and no UI. An adjustment can only be written from code |
| **Renamed or transferred repositories** | A bounty stops matching new pull requests after a rename. Matching is case-insensitive but not rename-aware |

## Pull request lifecycle

Only **merged** pull requests are tracked. GitBounty does not show open, draft, in-review,
changes-requested, approved or closed-without-merge pull requests. "My PRs" distinguishes what a recorded
merge earned — a bounty, the baseline, or nothing, with the reason — but every row in it is merged.

Adding the open states means fetching authored pull requests regardless of state plus their review status,
and a `pull_requests` table. The schema does not have one.

## Issues linked outside the pull request text

A closing link made by hand through GitHub's "Development" sidebar, with no `Closes #12` in the title or
body, is not found. GitHub only exposes those through GraphQL (`closingIssuesReferences`) and this codebase
speaks REST. The fix is a GraphQL query, not a better regular expression.

## Repositories

- **Private repositories are not supported.** The OAuth scope is `read:user` and publishing refuses a
  private repository with an explanation. Supporting them means a GitHub App — see
  [`github-app.md`](github-app.md).
- **Organisation repositories work**, where GitHub reports `admin` or `maintain`. Being a member is not
  enough, deliberately.

## Scale

- GitHub's search API caps at **1000 results**, so a first import for somebody with more merged pull
  requests than that cannot reach the oldest. Incremental sync keeps the newest reachable.
- Repository and issue listings page to 500 and 500.
- Synchronisation makes one GitHub request per pull request when categorising from files
  (`inspect_files=false` skips it).
- There is **no API rate limiting** of GitBounty's own endpoints.

## Observability

Logging is `logging.basicConfig(level=INFO)`. No structured logs, no request or correlation ids, no metrics
and no error-reporting integration. `/ready` is the only operational signal.

## Testing

| Covered | Not covered |
|---|---|
| Backend: 277 tests — unit, API integration, auth, CSRF, migrations, idempotency, mocked GitHub, leaderboards | |
| Extension: 35 tests — logic plus jsdom DOM-injection against GitHub-shaped fixtures | |
| Browser: the landing page's live data, and the extension badging a real github.com issue list, both verified in real Chrome | **Frontend component tests: none.** No test runner for `frontend/web`. The website is covered only by lint, typecheck, build and manual browsing |
| | **No automated accessibility checks.** Keyboard, focus, labels, contrast and reduced motion were written for, not measured |
| | **No end-to-end test** driving a browser through sign-in → publish → merge → award |

A real OAuth sign-in has **not** been completed end to end in this environment: it needs a human at
github.com to authorise an app. The implementation, its state handling and its failure paths are covered by
tests; the round trip through github.com is not.

## Legal and policy

The privacy and terms pages are **summaries written by engineers**, say so on their faces, and have not
been reviewed by a lawyer. There is no cookie banner, no data-processing agreement, no deletion endpoint
and no stated retention period.

## Licence

There is no `LICENSE` file, so by default **no rights are granted**. Choosing one is an owner decision; see
[`handoff.md`](handoff.md).

## Documentation that predates current decisions

`overview.md`, `agent.md`, `plan.md`, `feature-split.md` and `feature-seams.md` are the team's working
notes and describe an earlier design — in particular, awarding points from a `gitbounty:N` GitHub label on
any repository. [`PRODUCT.md`](../PRODUCT.md) and [`points-rules.md`](points-rules.md) are current and win.
`docs/original-money-pitch.md` is the original escrow pitch, kept as history and implemented nowhere.
