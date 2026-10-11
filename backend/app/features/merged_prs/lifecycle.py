"""The lifecycle of one pull request: what state it is in, and what it is eligible to earn.

Separate from `service.py` because that module answers "what should be awarded"; this one answers "what
should the contributor be told". Only the first of those writes anything.

The eligibility rules are the ones in `docs/points-rules.md`, stated here as the reasons a contributor
actually reads. A pull request that cannot earn anything must always say why -- the database enforces
that with a check constraint, and so does this.
"""

from __future__ import annotations

from dataclasses import dataclass

from ..points.rules import baseline_award
from .models import (
    AuthoredPR,
    MergedPR,
    Category,
    PublishedBounties,
    PublishedBounty,
    PullRequestState,
    ReviewState,
    pull_request_state,
)


@dataclass(frozen=True)
class TrackedPullRequest:
    """One pull request as the website shows it."""

    pr: AuthoredPR
    state: PullRequestState
    category: Category
    category_source: str
    bounty: PublishedBounty | None
    baseline_eligible: bool
    eligible: bool
    ineligible_reason: str | None

    @property
    def expected_points(self) -> int:
        """What this pull request would earn if it were merged as it stands.

        Zero for anything ineligible. This is a forecast, not a promise: a bounty is awarded once, so an
        eligible pull request can still earn only the baseline if somebody else's merge gets there first.
        """
        if not self.eligible:
            return 0
        return (self.bounty.points if self.bounty else 0) + (baseline_award() if self.baseline_eligible else 0)


def assess(
    pr: AuthoredPR,
    *,
    review: ReviewState | None,
    inferred_category: Category,
    published: PublishedBounties,
    tracked_repositories: frozenset[str],
) -> TrackedPullRequest:
    """Work out one pull request's state, its bounty, and whether it can earn anything.

    `review` may be None, meaning reviews were not looked up for this pull request -- that yields `open`
    rather than a guess (see `models.pull_request_state`).
    """
    state = pull_request_state(pr, review)
    bounty = _matching_bounty(pr, published)
    baseline_eligible = pr.repo_full_name.casefold() in tracked_repositories

    eligible, reason = _eligibility(pr, bounty=bounty, baseline_eligible=baseline_eligible)

    return TrackedPullRequest(
        pr=pr,
        state=state,
        # A published bounty's category is the maintainer's deliberate choice and outranks inference.
        category=bounty.category if bounty else inferred_category,
        category_source="maintainer" if bounty else "inferred",
        bounty=bounty,
        baseline_eligible=baseline_eligible,
        eligible=eligible,
        ineligible_reason=reason,
    )


def _matching_bounty(pr: AuthoredPR | MergedPR, published: PublishedBounties) -> PublishedBounty | None:
    """The shared award/display rule: first closing bounty, excluding the author's own."""
    for reference in pr.closed_issues:
        bounty = published.get((reference.repo_full_name.casefold(), reference.number))
        if bounty is None:
            continue
        if bounty.maintainer_user_id and bounty.maintainer_user_id == pr.author_user_id:
            continue
        return bounty
    return None


def _eligibility(
    pr: AuthoredPR,
    *,
    bounty: PublishedBounty | None,
    baseline_eligible: bool,
) -> tuple[bool, str | None]:
    """Whether this pull request could earn anything, and -- when it could not -- why, in a sentence.

    Checked in the order a person would ask. Being open is not a reason to be ineligible: an open pull
    request that closes a published bounty is eligible, it simply has not been merged yet.
    """
    if pr.is_self_merge:
        return False, (
            "Merging your own pull request into a repository you own earns nothing. "
            "Open it against somebody else's repository for it to count."
        )

    if bounty is None and not baseline_eligible:
        return False, (
            f"{pr.repo_full_name} has no bounties published on GitBounty, so merges there earn nothing. "
            "Ask a maintainer to publish one, or find work in a participating repository."
        )

    if bounty is None:
        # Baseline only: eligible, with nothing to apologise for.
        return True, None

    if bounty.maintainer_user_id and bounty.maintainer_user_id == pr.author_user_id:
        # Defensive: _matching_bounty already drops these, so reaching here means a rule changed.
        return False, "You published this bounty, so you cannot also collect it."

    return True, None
