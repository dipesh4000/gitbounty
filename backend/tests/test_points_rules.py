"""The points rules: what a merged pull request is worth, and the bounds on a published bounty."""

import pytest

from app.features.points.rules import (
    FLAT_POINTS_PER_MERGE,
    MAX_ISSUE_POINTS,
    MIN_ISSUE_POINTS,
    RULE_VERSION,
    PointsOutOfRange,
    baseline_award,
    is_valid_bounty_points,
    points_from_labels,
    suggested_bounty_points,
    validate_bounty_points,
)


@pytest.mark.parametrize(
    ("labels", "expected"),
    [
        (("gitbounty:40",), 40),
        (("gitbounty: 25",), 25),
        (("gitbounty=25",), 25),
        (("GitBounty:15",), 15),
        (("points:7",), 7),
        (("50 points",), 50),
        (("30 pts",), 30),
        (("100 xp",), 100),
        (("bug", "gitbounty:12", "good first issue"), 12),
        # Nothing to read
        ((), None),
        (("bug", "enhancement"), None),
        (("gitbounty",), None),
        (("gitbounty: lots",), None),
        (("$100 bounty",), None),        # the money version's label is not a points label
        (("closes 12 issues",), None),
    ],
)
def test_points_from_labels(labels: tuple[str, ...], expected: int | None) -> None:
    assert points_from_labels(labels) == expected


def test_the_highest_label_wins_when_a_maintainer_left_an_old_one_behind() -> None:
    assert points_from_labels(("gitbounty:10", "gitbounty:30")) == 30


def test_the_baseline_is_a_fixed_documented_amount() -> None:
    assert baseline_award() == FLAT_POINTS_PER_MERGE == 5


def test_a_bounty_value_is_bounded_at_both_ends() -> None:
    """MAX_ISSUE_POINTS used to be None, with a comment admitting that was the known way to cheat."""
    assert MIN_ISSUE_POINTS == 1
    assert MAX_ISSUE_POINTS == 1000

    assert is_valid_bounty_points(1)
    assert is_valid_bounty_points(1000)
    assert not is_valid_bounty_points(0)
    assert not is_valid_bounty_points(-5)
    assert not is_valid_bounty_points(1001)
    assert not is_valid_bounty_points(100_000)


def test_validate_names_the_bounds_in_its_error() -> None:
    assert validate_bounty_points(40) == 40
    for rejected in (0, -1, 1001, 100_000):
        with pytest.raises(PointsOutOfRange, match="between 1 and 1000"):
            validate_bounty_points(rejected)


def test_a_label_suggestion_is_clamped_rather_than_dropped() -> None:
    """`gitbounty:5000` means "a lot"; showing the maintainer 1000 beats showing them nothing."""
    assert suggested_bounty_points(("gitbounty:40",)) == 40
    assert suggested_bounty_points(("gitbounty:5000",)) == MAX_ISSUE_POINTS
    assert suggested_bounty_points(("gitbounty:0",)) == MIN_ISSUE_POINTS
    assert suggested_bounty_points(("bug",)) is None


def test_the_rule_version_is_recorded_so_old_awards_stay_explainable() -> None:
    assert RULE_VERSION == "points-v1"
