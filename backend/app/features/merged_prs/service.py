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
from collections.abc import Mapping
from dataclasses import dataclass

import httpx

from ..points.rules import baseline_award
from .categorise import categorise
from .github import fetch_changed_paths, fetch_merged_prs
from .issue_links import IssueReference
from .models import Category, MergedPR

# How many extra lookups to run at once. GitHub's ordinary limit is 5000 requests an hour, so the cap is
# politeness rather than necessity: don't open a hundred sockets at a stranger's API.
_CONCURRENT_REQUESTS = 8


@dataclass(frozen=True)
class PublishedBounty:
    """A bounty a verified maintainer published on GitBounty. The only thing that awards its value."""

    repo_full_name: str
    issue_number: int
    points: int
    category: Category
    #: The GitBounty user who published it. None when the row predates that column being populated.
    maintainer_user_id: int | None

    @property
    def key(self) -> tuple[str, int]:
        return (self.repo_full_name.casefold(), self.issue_number)


# Keyed by (lowercased repo full name, issue number), which is how a closing reference is matched.
PublishedBounties = Mapping[tuple[str, int], PublishedBounty]


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
    client: httpx.AsyncClient, pr: MergedPR, token: str, semaphore: asyncio.Semaphore
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


def _matching_bounty(pr: MergedPR, published: PublishedBounties) -> PublishedBounty | None:
    """The published bounty this pull request closes.

    When a pull request closes several published bounties -- "Closes #1, closes #2" -- the first one it
    names is the one it is credited with. Awarding all of them would let one pull request collect several
    maintainers' budgets at once, and the database only allows one award per bounty anyway, so picking
    deliberately is better than letting insertion order decide. The rest stay open for their own work.
    """
    for reference in pr.closed_issues:
        bounty = published.get((reference.repo_full_name.casefold(), reference.number))
        if bounty is None:
            continue
        # A maintainer cannot collect their own bounty. The self-merge rule already covers their own
        # repositories; this covers publishing a bounty and then fixing it in somebody else's.
        if bounty.maintainer_user_id and bounty.maintainer_user_id == pr.author_user_id:
            continue
        return bounty
    return None


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
