"""Self-merge detection: the rule that stops someone farming points from their own repos."""

from datetime import datetime, timezone

import pytest

from app.features.merged_prs.models import MergedPR


def make_pr(repo_full_name: str, author_login: str) -> MergedPR:
    return MergedPR(
        github_pr_id=1,
        repo_full_name=repo_full_name,
        number=7,
        title="Fix the thing",
        url="https://github.com/x/y/pull/7",
        merged_at=datetime(2026, 9, 1, tzinfo=timezone.utc),
        author_login=author_login,
    )


@pytest.mark.parametrize(
    ("repo", "author", "expected"),
    [
        ("aastha-malik/toy", "aastha-malik", True),
        ("Aastha-Malik/toy", "aastha-malik", True),   # GitHub logins are case-insensitive
        ("aastha-malik/toy", "AASTHA-MALIK", True),
        ("django/django", "aastha-malik", False),
        ("some-org/project", "aastha-malik", False),
        ("aastha-malik-fan/toy", "aastha-malik", False),  # prefix, not the same owner
    ],
)
def test_is_self_merge(repo: str, author: str, expected: bool) -> None:
    assert make_pr(repo, author).is_self_merge is expected


def test_repo_owner_splits_on_first_slash_only() -> None:
    assert make_pr("owner/repo", "someone").repo_owner == "owner"
