"""Work out which issue a merged pull request closed.

This matters because points come from the issue, not from the PR: the issue creator decided what fixing it was
worth, so the PR has to be tied back to that issue before anything can be awarded.

GitHub closes an issue automatically when a PR body says "Closes #12", using a fixed set of keywords. That is the
rule reproduced here, read from the PR's title and body.

**Known limit:** an issue linked by hand through GitHub's "Development" sidebar, with no keyword in the text, is
not found this way. GitHub only exposes those links through its GraphQL API (`closingIssuesReferences`), and this
codebase speaks REST. If that turns out to matter, the fix is a GraphQL query, not a better regular expression.
"""

from __future__ import annotations

import re
from dataclasses import dataclass

# GitHub's own closing keywords, and what may sit between them and the issue reference.
_KEYWORDS = r"clos(?:e|es|ed)|fix(?:|es|ed)|resolv(?:e|es|ed)"

# "Closes #12" and "Fixes owner/repo#12"
_SHORT_REFERENCE = re.compile(
    rf"\b(?:{_KEYWORDS})\b\s*:?\s+(?:(?P<repo>[\w.-]+/[\w.-]+))?#(?P<number>\d+)",
    re.IGNORECASE,
)

# "Closes https://github.com/owner/repo/issues/12"
_URL_REFERENCE = re.compile(
    rf"\b(?:{_KEYWORDS})\b\s*:?\s+https?://github\.com/(?P<repo>[\w.-]+/[\w.-]+)/issues/(?P<number>\d+)",
    re.IGNORECASE,
)


@dataclass(frozen=True)
class IssueReference:
    """An issue a pull request says it closes."""

    repo_full_name: str
    number: int


def find_closed_issues(text: str, default_repo: str) -> list[IssueReference]:
    """Every issue the text claims to close, in the order they appear, without duplicates.

    `default_repo` is the repository the PR itself is in, used for bare `#12` references.
    """
    if not text:
        return []

    found: list[IssueReference] = []
    seen: set[IssueReference] = set()

    for pattern in (_URL_REFERENCE, _SHORT_REFERENCE):
        for match in pattern.finditer(text):
            reference = IssueReference(
                repo_full_name=match.group("repo") or default_repo,
                number=int(match.group("number")),
            )
            if reference not in seen:
                seen.add(reference)
                found.append(reference)

    return found
