"""Merged PR Detection, end to end: ask GitHub what a user merged, say what kind of work each one was, and work
out what it is worth.

This is the layer that makes the judgement calls. Fetching reports what GitHub says, categorising and the points
rules are pure functions; this decides what to do with them -- which PRs don't count, how hard to work at
categorising, and which issue a PR's points come from.
"""

from __future__ import annotations

import asyncio
from collections.abc import Mapping
from dataclasses import dataclass

import httpx

from ..points.rules import award_for_merge, points_from_labels
from .categorise import categorise
from .github import fetch_changed_paths, fetch_issue_labels, fetch_merged_prs
from .issue_links import IssueReference
from .models import Category, MergedPR

# How many extra lookups to run at once. GitHub's ordinary limit is 5000 requests an hour, so the cap is
# politeness rather than necessity: don't open a hundred sockets at a stranger's API.
_CONCURRENT_REQUESTS = 8

# A PR's points come from the issues it closes, looked up as (repo full name, issue number). The website half of
# seam 4 -- a maintainer setting points while signed in -- arrives as one of these mappings, so this code doesn't
# care whether that table exists yet.
StoredIssuePoints = Mapping[tuple[str, int], int]


@dataclass(frozen=True)
class DetectedMerge:
    """A merged PR that counts: what kind of work it was, and what it earned."""

    pr: MergedPR
    category: Category
    closed_issues: tuple[IssueReference, ...]
    issue_points: int | None
    points: int


@dataclass(frozen=True)
class DetectionResult:
    """Everything one sync found.

    `self_merges_skipped` is reported rather than quietly dropped: someone whose merges don't show up deserves to
    be told why, and a number that's suspiciously high is worth seeing.
    """

    merges: list[DetectedMerge]
    self_merges_skipped: int

    @property
    def total_found(self) -> int:
        return len(self.merges) + self.self_merges_skipped

    @property
    def total_points(self) -> int:
        return sum(merge.points for merge in self.merges)


async def _changed_paths(
    client: httpx.AsyncClient, pr: MergedPR, token: str, semaphore: asyncio.Semaphore
) -> list[str]:
    """A PR's changed files, or nothing if they can't be read.

    A failure here is not a failure to categorise: fall back to labels and title rather than losing the merge
    entirely. One unreachable PR shouldn't cost someone their points.
    """
    try:
        async with semaphore:
            return await fetch_changed_paths(client, pr.repo_full_name, pr.number, token)
    except Exception:
        return []


async def _issue_points(
    client: httpx.AsyncClient,
    reference: IssueReference,
    token: str,
    semaphore: asyncio.Semaphore,
    stored: StoredIssuePoints,
) -> int | None:
    """What the creator of one issue said it was worth.

    A value stored by a signed-in maintainer wins over a label: it was set deliberately, by someone we
    authenticated, and it can be corrected, whereas a label can be edited by anyone with write access to the repo.
    """
    key = (reference.repo_full_name, reference.number)
    if key in stored:
        return stored[key]

    try:
        async with semaphore:
            labels = await fetch_issue_labels(client, reference.repo_full_name, reference.number, token)
    except Exception:
        return None  # a private, deleted or renamed repo: no value found, not an error

    return points_from_labels(labels)


async def _detect_one(
    client: httpx.AsyncClient,
    pr: MergedPR,
    token: str,
    semaphore: asyncio.Semaphore,
    *,
    inspect_files: bool,
    stored: StoredIssuePoints,
) -> DetectedMerge:
    """Categorise one merged PR and work out what it earned."""
    paths = await _changed_paths(client, pr, token, semaphore) if inspect_files else []

    references = tuple(pr.closed_issues)
    values = await asyncio.gather(
        *(_issue_points(client, reference, token, semaphore, stored) for reference in references)
    )
    allocated = [value for value in values if value is not None]

    # A PR closing several marked issues earns all of them: the creator of each one allocated that value for work
    # that has now been done.
    issue_points = sum(allocated) if allocated else None

    return DetectedMerge(
        pr=pr,
        category=categorise(pr, paths),
        closed_issues=references,
        issue_points=issue_points,
        points=award_for_merge(issue_points),
    )


async def detect_merges(
    client: httpx.AsyncClient,
    login: str,
    token: str,
    *,
    inspect_files: bool = True,
    stored_issue_points: StoredIssuePoints | None = None,
) -> DetectionResult:
    """Find `login`'s merged PRs, categorise each one, and work out what each earned.

    Self-merges -- a PR merged into a repo its own author owns -- are dropped here. Anyone can create a repo, open
    a PR against it and merge it, so counting those would make the leaderboard meaningless (plan.md says so too).
    This does not catch two people colluding; see overview.md, still unsolved.

    `inspect_files=False` skips the per-PR file lookup and categorises from labels and titles alone: cheaper, and
    a vaguer answer.
    """
    all_prs = await fetch_merged_prs(client, login, token)

    countable = [pr for pr in all_prs if not pr.is_self_merge]
    self_merges_skipped = len(all_prs) - len(countable)

    semaphore = asyncio.Semaphore(_CONCURRENT_REQUESTS)
    stored = stored_issue_points or {}

    merges = list(
        await asyncio.gather(
            *(
                _detect_one(client, pr, token, semaphore, inspect_files=inspect_files, stored=stored)
                for pr in countable
            )
        )
    )
    return DetectionResult(merges=merges, self_merges_skipped=self_merges_skipped)
