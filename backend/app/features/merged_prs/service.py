"""Merged pull request detection, end to end: ask GitHub what a user merged, say what kind of work each
one was, and work out what it is eligible to earn.

This is the layer that makes the judgement calls. Fetching reports what GitHub says; categorising and the
points rules are pure functions. This decides what to do with them -- which pull requests don't count, how
hard to work at categorising, and which *published bounty* a pull request's points come from.

What changed, and why. This used to award the value of any `gitbounty:N` label it found on any issue in
any repository, fetched live from GitHub. That meant points could be earned from an issue GitBounty had
never seen, set by anyone with write access to a repository. Now a value comes only from a bounty a
verified maintainer published through GitBounty (`issue_points`, status `published`), which is what makes
an award traceable to a person we authenticated.
"""

from __future__ import annotations

import asyncio
from dataclasses import dataclass

import httpx

from ..points.rules import baseline_award
from .categorise import categorise
from .github import fetch_authored_prs, fetch_changed_paths, fetch_merged_prs, fetch_review_state
from .issue_links import IssueReference
from .lifecycle import TrackedPullRequest, assess, _matching_bounty
from .models import (
    AuthoredPR,
    Category,
    MergedPR,
    PublishedBounties,
    PublishedBounty,
    PullRequestState,
)

# How many extra lookups to run at once. GitHub's ordinary limit is 5000 requests an hour, so the cap is
# politeness rather than necessity: don't open a hundred sockets at a stranger's API.
_CONCURRENT_REQUESTS = 8


@dataclass(frozen=True)
class DetectedMerge:
    """A merged pull request, and what it is eligible to earn.

    "Eligible" rather than "earned": whether it is actually awarded depends on what the ledger already
    holds, which only the store can answer. One bounty is awarded once, ever, to anybody.
    """

    pr: MergedPR
    #: Inferred from the pull request's changed files, labels and title.
    inferred_category: Category
    #: Every issue the pull request says it closes, in the order it says them.
    closed_issues: tuple[IssueReference, ...]
    #: The published bounty this pull request closes, if it closes one.
    bounty: PublishedBounty | None
    #: Whether this merge qualifies for the flat per-merge amount.
    baseline_eligible: bool

    @property
    def category(self) -> Category:
        """The category an award is recorded under.

        A published bounty's category is the maintainer's deliberate choice and is authoritative; it is
        never silently overridden by what the changed files looked like.
        """
        return self.bounty.category if self.bounty else self.inferred_category

    @property
    def category_source(self) -> str:
        return "maintainer" if self.bounty else "inferred"

    @property
    def eligible_points(self) -> int:
        """The most this merge could earn, if nothing has been awarded for it yet."""
        total = self.bounty.points if self.bounty else 0
        return total + (baseline_award() if self.baseline_eligible else 0)


@dataclass(frozen=True)
class DetectionResult:
    """Everything one sync found.

    `self_merges_skipped` is reported rather than quietly dropped: someone whose merges don't show up
    deserves to be told why, and a number that's suspiciously high is worth seeing.
    """

    merges: list[DetectedMerge]
    self_merges_skipped: int

    @property
    def total_found(self) -> int:
        return len(self.merges) + self.self_merges_skipped

    @property
    def eligible_points(self) -> int:
        return sum(merge.eligible_points for merge in self.merges)


async def _changed_paths(
    client: httpx.AsyncClient, pr: MergedPR | AuthoredPR, token: str, semaphore: asyncio.Semaphore
) -> list[str]:
    """A pull request's changed files, or nothing if they can't be read.

    A failure here is not a failure to categorise: fall back to labels and title rather than losing the
    merge entirely. One unreachable pull request shouldn't cost someone their points.
    """
    try:
        async with semaphore:
            return await fetch_changed_paths(client, pr.repo_full_name, pr.number, token)
    except Exception:
        return []


async def _detect_one(
    client: httpx.AsyncClient,
    pr: MergedPR,
    token: str,
    semaphore: asyncio.Semaphore,
    *,
    inspect_files: bool,
    published: PublishedBounties,
    tracked_repositories: frozenset[str],
) -> DetectedMerge:
    """Categorise one merged pull request and work out what it is eligible to earn."""
    paths = await _changed_paths(client, pr, token, semaphore) if inspect_files else []
    bounty = _matching_bounty(pr, published)
    return DetectedMerge(
        pr=pr,
        inferred_category=categorise(pr, paths),
        closed_issues=tuple(pr.closed_issues),
        bounty=bounty,
        # The baseline is for repositories that take part in GitBounty. Paying it for a merge into any
        # repository at all made it farmable with a throwaway repository and a second account; a bounty
        # published by a verified maintainer is what makes a repository a participant.
        baseline_eligible=pr.repo_full_name.casefold() in tracked_repositories,
    )


async def detect_merges(
    client: httpx.AsyncClient,
    login: str,
    token: str,
    *,
    inspect_files: bool = True,
    published_bounties: PublishedBounties | None = None,
    author_user_id: int | None = None,
    since: object = None,
) -> DetectionResult:
    """Find `login`'s merged pull requests, categorise each one, and say what each is eligible to earn.

    Self-merges -- a pull request merged into a repository its own author owns -- are dropped here. Anyone
    can create a repository, open a pull request against it and merge it, so counting those would make the
    leaderboard meaningless. This does not catch two people colluding; see docs/points-rules.md, which
    says what is and is not defended against.

    `inspect_files=False` skips the per-pull-request file lookup and categorises from labels and titles
    alone: cheaper, and a vaguer answer.
    """
    all_prs = await fetch_merged_prs(client, login, token, since=since)
    if author_user_id is not None:
        all_prs = [pr.with_author_user_id(author_user_id) for pr in all_prs]

    countable = [pr for pr in all_prs if not pr.is_self_merge]
    self_merges_skipped = len(all_prs) - len(countable)

    semaphore = asyncio.Semaphore(_CONCURRENT_REQUESTS)
    published = published_bounties or {}
    tracked = frozenset(repo for repo, _ in published)

    merges = list(
        await asyncio.gather(
            *(
                _detect_one(
                    client, pr, token, semaphore,
                    inspect_files=inspect_files,
                    published=published,
                    tracked_repositories=tracked,
                )
                for pr in countable
            )
        )
    )
    return DetectionResult(merges=merges, self_merges_skipped=self_merges_skipped)


# --- the whole lifecycle, not only the merged part --------------------------


@dataclass(frozen=True)
class LifecycleResult:
    """Every pull request this user has authored, with its state."""

    tracked: list[TrackedPullRequest]

    @property
    def merged(self) -> list[TrackedPullRequest]:
        return [item for item in self.tracked if item.state is PullRequestState.MERGED]


async def _review_for(
    client: httpx.AsyncClient,
    pr: AuthoredPR,
    token: str,
    semaphore: asyncio.Semaphore,
):
    """A pull request's review state, or None when it was not or could not be looked up.

    Only open, non-draft pull requests are asked about: a merged or closed one's state is already decided,
    and a draft is a draft whatever anybody has said. That keeps the extra requests proportional to the
    work actually in flight rather than to the whole history.

    A failure yields None rather than an exception. Not knowing the review state costs the contributor a
    more precise label; it must not cost them the pull request.
    """
    if pr.merged_at is not None or pr.is_closed or pr.is_draft:
        return None
    try:
        async with semaphore:
            return await fetch_review_state(client, pr.repo_full_name, pr.number, token)
    except Exception:
        return None


async def detect_pull_requests(
    client: httpx.AsyncClient,
    login: str,
    token: str,
    *,
    inspect_files: bool = True,
    inspect_reviews: bool = True,
    published_bounties: PublishedBounties | None = None,
    author_user_id: int | None = None,
    since: object = None,
) -> LifecycleResult:
    """Find every pull request `login` has authored and work out where each one stands.

    Self-merges are **kept** here, unlike `detect_merges`, and marked ineligible with the reason. Dropping
    them silently is right for the award path and wrong for the contributor's own list: somebody whose
    work does not appear deserves to be told why rather than left wondering.
    """
    all_prs = await fetch_authored_prs(client, login, token, since=since)
    if author_user_id is not None:
        all_prs = [pr.with_author_user_id(author_user_id) for pr in all_prs]

    published = published_bounties or {}
    tracked_repositories = frozenset(repo for repo, _ in published)
    semaphore = asyncio.Semaphore(_CONCURRENT_REQUESTS)

    async def one(pr: AuthoredPR) -> TrackedPullRequest:
        review = await _review_for(client, pr, token, semaphore) if inspect_reviews else None
        paths = (
            await _changed_paths(client, pr, token, semaphore)
            if inspect_files
            else []
        )
        return assess(
            pr,
            review=review,
            inferred_category=categorise(pr, paths),
            published=published,
            tracked_repositories=tracked_repositories,
        )

    return LifecycleResult(tracked=list(await asyncio.gather(*(one(pr) for pr in all_prs))))
