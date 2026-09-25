"""Finding the issue a PR closed -- which is where its points come from."""

import pytest

from app.features.merged_prs.issue_links import IssueReference, find_closed_issues

REPO = "org/project"


@pytest.mark.parametrize(
    ("text", "expected"),
    [
        ("Closes #12", [IssueReference(REPO, 12)]),
        ("closes #12", [IssueReference(REPO, 12)]),
        ("CLOSES #12", [IssueReference(REPO, 12)]),
        ("closes: #12", [IssueReference(REPO, 12)]),
        ("Fixes #3", [IssueReference(REPO, 3)]),
        ("Fixed #3", [IssueReference(REPO, 3)]),
        ("Fix #3", [IssueReference(REPO, 3)]),
        ("Resolves #8", [IssueReference(REPO, 8)]),
        ("Resolved #8", [IssueReference(REPO, 8)]),
        # Another repository
        ("Fixes owner/other#42", [IssueReference("owner/other", 42)]),
        ("Closes https://github.com/django/django/issues/999", [IssueReference("django/django", 999)]),
        # Several at once, order preserved, duplicates dropped
        ("Fixes #7 and resolves #9", [IssueReference(REPO, 7), IssueReference(REPO, 9)]),
        ("Closes #5. Also closes #5.", [IssueReference(REPO, 5)]),
        # Not closing references
        ("Refs #5", []),
        ("See #5", []),
        ("Related to #5", []),
        ("Part of the fix for later", []),
        ("", []),
        ("Closes the gap in the docs", []),
    ],
)
def test_find_closed_issues(text: str, expected: list[IssueReference]) -> None:
    assert find_closed_issues(text, REPO) == expected


def test_a_url_and_a_short_reference_to_the_same_issue_count_once() -> None:
    text = "Closes https://github.com/org/project/issues/12 -- closes #12"
    assert find_closed_issues(text, REPO) == [IssueReference(REPO, 12)]
