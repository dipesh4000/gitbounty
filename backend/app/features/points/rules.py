"""How many points a merged pull request is worth, and the bounds that keep that number meaningful.

GitBounty does not judge the value of a contribution -- the maintainer who published the bounty does.
A contributor whose merged pull request closes a published bounty receives exactly the value on it.

Everything here is pure: no network, no database. What to *do* with the answer is the caller's problem.
The rules themselves are written down in `docs/points-rules.md`; this module is that document, enforced.
"""

from __future__ import annotations

import re

# Which version of the rules produced an award. Stored on every ledger entry, so changing a rule does
# not make past awards unexplainable. Bump it whenever a number or a condition below changes.
RULE_VERSION = "points-v1"

# What any merged pull request in a tracked repository is worth on its own. Deliberately small: the point
# of the product is the maintainer's number, and this is only here so a contributor who fixes something
# in a participating repository that happens to have no bounty on it still has a record.
FLAT_POINTS_PER_MERGE = 5

# The bounds on one published bounty, enforced here, in the API schema, and by a database check
# constraint (migration 0007). Previously MAX_ISSUE_POINTS was None, with a comment admitting that this
# was the known way to cheat: anyone could put 100,000 points on a trivial issue in their own repository.
# 1000 is high enough to express "this is a big piece of work" and low enough that minting a leaderboard
# position takes real, visible, repeated collusion rather than one afternoon.
MIN_ISSUE_POINTS = 1
MAX_ISSUE_POINTS = 1000

# `gitbounty:40` is the documented form. The other two are conveniences, because maintainers will type
# what feels natural and a label that nearly works is worse than one that clearly doesn't.
#
# NOTE ON WHAT LABELS DO NOW: a label is read to *suggest* a value to a maintainer publishing a bounty
# through GitBounty, and the extension surfaces one as an explicitly-marked label value. A label on its
# own no longer awards anything, because nobody GitBounty has authenticated stands behind it -- anyone
# with write access to a repository can add one. Only a bounty published by a verified maintainer awards
# points. See docs/points-rules.md.
_LABEL_PATTERNS = (
    re.compile(r"^\s*gitbounty\s*[:=\-]?\s*(\d+)\s*$", re.IGNORECASE),
    re.compile(r"^\s*points\s*[:=\-]?\s*(\d+)\s*$", re.IGNORECASE),
    re.compile(r"^\s*(\d+)\s*(?:points|pts|xp)\s*$", re.IGNORECASE),
)


class PointsOutOfRange(ValueError):
    """A bounty value outside MIN_ISSUE_POINTS..MAX_ISSUE_POINTS."""


def points_from_labels(labels: tuple[str, ...] | list[str]) -> int | None:
    """The points value a maintainer wrote in an issue's labels, or None if there isn't one.

    A *suggestion*, not an award. When an issue carries more than one points label -- which shouldn't
    happen, but labels are free-form -- the highest wins: someone who raised the value and forgot to
    remove the old label meant the higher number.
    """
    found = [
        int(match.group(1))
        for label in labels
        for pattern in _LABEL_PATTERNS
        if (match := pattern.match(label))
    ]
    return max(found) if found else None


def is_valid_bounty_points(points: int) -> bool:
    return MIN_ISSUE_POINTS <= points <= MAX_ISSUE_POINTS


def validate_bounty_points(points: int) -> int:
    """The value a maintainer is allowed to publish, or an error naming the bounds."""
    if not is_valid_bounty_points(points):
        raise PointsOutOfRange(
            f"A bounty must be between {MIN_ISSUE_POINTS} and {MAX_ISSUE_POINTS} points."
        )
    return points


def suggested_bounty_points(labels: tuple[str, ...] | list[str]) -> int | None:
    """A label's value, clamped into the publishable range, for pre-filling the publish form.

    Clamped rather than rejected: a maintainer who wrote `gitbounty:5000` meant "a lot", and showing
    them 1000 with the bound stated is more useful than showing them nothing.
    """
    value = points_from_labels(labels)
    if value is None:
        return None
    return min(max(value, MIN_ISSUE_POINTS), MAX_ISSUE_POINTS)


def baseline_award() -> int:
    """What a merged pull request in a tracked repository earns on its own."""
    return FLAT_POINTS_PER_MERGE
