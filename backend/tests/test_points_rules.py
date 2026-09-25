"""How many points a merged PR is worth."""

import pytest

from app.features.points.rules import FLAT_POINTS_PER_MERGE, award_for_merge, points_from_labels


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


def test_the_highest_label_wins_when_a_creator_left_an_old_one_behind() -> None:
    assert points_from_labels(("gitbounty:10", "gitbounty:30")) == 30


def test_an_unmarked_merge_still_earns_the_flat_amount() -> None:
    assert award_for_merge(None) == FLAT_POINTS_PER_MERGE


def test_a_marked_issue_adds_its_value_on_top() -> None:
    assert award_for_merge(40) == FLAT_POINTS_PER_MERGE + 40


def test_zero_points_is_honoured_not_treated_as_unset() -> None:
    """A creator who says an issue is worth 0 has said something; it isn't the same as saying nothing."""
    assert award_for_merge(0) == FLAT_POINTS_PER_MERGE


def test_a_negative_value_is_ignored_rather_than_subtracting() -> None:
    assert award_for_merge(-50) == FLAT_POINTS_PER_MERGE
