"""Merged PR Detection, end to end: ask GitHub what a user merged, and say what kind of work each one was.

This is the layer that makes the judgement calls. Fetching reports what GitHub says; categorising is a pure
function; this decides what to do with both -- which PRs don't count, and how hard to work at categorising.
"""

from __future__ import annotations

import asyncio
from dataclasses import dataclass

import httpx

from .categorise import categorise
from .github import fetch_changed_paths, fetch_merged_prs
from .models import Category, MergedPR

# How many of a PR's files to look at, at once. GitHub's ordinary limit is 5000 requests an hour and one PR costs
# one request, so the cap is politeness rather than necessity: don't open a hundred sockets at a stranger's API.
_CONCURRENT_FILE_REQUESTS = 8


@dataclass(frozen=True)
class DetectedMerge:
    """A merged PR that counts, and what kind of work it was."""

    pr: MergedPR
    category: Category


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


async def _categorise_with_files(
    client: httpx.AsyncClient,
    pr: MergedPR,
    token: str,
    semaphore: asyncio.Semaphore,
) -> DetectedMerge:
    """Categorise one PR, paying for its file list if we can get it.

    A failure to read the files is not a failure to categorise: fall back to labels and title rather than losing
    the merge entirely. One unreachable PR shouldn't cost someone their points.
    """
    paths: list[str] = []
    try:
        async with semaphore:
            paths = await fetch_changed_paths(client, pr.repo_full_name, pr.number, token)
    except Exception:
        paths = []

    return DetectedMerge(pr=pr, category=categorise(pr, paths))


async def detect_merges(
    client: httpx.AsyncClient,
    login: str,
    token: str,
    *,
    inspect_files: bool = True,
) -> DetectionResult:
    """Find `login`'s merged PRs and categorise each one.

    Self-merges -- a PR merged into a repo its own author owns -- are dropped here. Anyone can create a repo, open
    a PR against it and merge it, so counting those would make the leaderboard meaningless (plan.md says so too).

    `inspect_files=False` skips the per-PR file lookup and categorises from labels and titles alone: one request
    instead of one-plus-N, at the cost of a vaguer answer.
    """
    all_prs = await fetch_merged_prs(client, login, token)

    countable = [pr for pr in all_prs if not pr.is_self_merge]
    self_merges_skipped = len(all_prs) - len(countable)

    if not inspect_files:
        merges = [DetectedMerge(pr=pr, category=categorise(pr)) for pr in countable]
        return DetectionResult(merges=merges, self_merges_skipped=self_merges_skipped)

    semaphore = asyncio.Semaphore(_CONCURRENT_FILE_REQUESTS)
    merges = list(
        await asyncio.gather(*(_categorise_with_files(client, pr, token, semaphore) for pr in countable))
    )
    return DetectionResult(merges=merges, self_merges_skipped=self_merges_skipped)
