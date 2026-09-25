"""How many points a merged pull request is worth.

GitBounty does not judge the value of a contribution -- the issue creator does. They put a number on their issue,
and the contributor whose merged PR closes it receives exactly that number.

Two things sit on top of that:

- **Every** merged PR earns a small flat amount, so contributing to a repository that has never heard of GitBounty
  still counts and a new user's profile isn't empty.
- A creator can set the number as a GitHub label, or on the GitBounty website. The website value wins, because it
  was set deliberately by someone we authenticated, while a label can be edited by anyone with write access.

Everything here is pure: no network, no database. What to *do* with the answer is the caller's problem.
"""

from __future__ import annotations

import re

# What any merged PR is worth on its own. Deliberately small: the point of the product is the creator's number,
# and this is only here so an empty leaderboard isn't the first thing a new user sees.
FLAT_POINTS_PER_MERGE = 5

# A creator's value is NOT capped. That is the literal reading of "the creator decides", and it is also the known
# way to cheat: two people can agree to put 100,000 points on a trivial issue. See overview.md -- unsolved, and it
# needs an answer before this is public.
MAX_ISSUE_POINTS: int | None = None

# `gitbounty:40` is the documented form. The other two are conveniences, because maintainers will type what feels
# natural and a label that nearly works is worse than one that clearly doesn't.
_LABEL_PATTERNS = (
    re.compile(r"^\s*gitbounty\s*[:=\-]?\s*(\d+)\s*$", re.IGNORECASE),
    re.compile(r"^\s*points\s*[:=\-]?\s*(\d+)\s*$", re.IGNORECASE),
    re.compile(r"^\s*(\d+)\s*(?:points|pts|xp)\s*$", re.IGNORECASE),
)


def points_from_labels(labels: tuple[str, ...] | list[str]) -> int | None:
    """The points value a creator put on an issue via its labels, or None if there isn't one.

    When an issue carries more than one points label -- which shouldn't happen, but labels are free-form -- the
    highest wins. Someone who raised the value and forgot to remove the old label meant the higher number.
    """
    found = [
        int(match.group(1))
        for label in labels
        for pattern in _LABEL_PATTERNS
        if (match := pattern.match(label))
    ]
    return max(found) if found else None


def award_for_merge(issue_points: int | None) -> int:
    """What a single merged PR is worth: the flat amount, plus whatever the issue creator allocated."""
    if issue_points is None or issue_points < 0:
        return FLAT_POINTS_PER_MERGE
    if MAX_ISSUE_POINTS is not None:
        issue_points = min(issue_points, MAX_ISSUE_POINTS)
    return FLAT_POINTS_PER_MERGE + issue_points
