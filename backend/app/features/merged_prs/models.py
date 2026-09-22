"""Shapes for Merged PR Detection.

A `MergedPR` is one pull request, opened by a GitBounty user, that has been merged. It is the raw material for
points: one merged PR, one category, some points.
"""

from __future__ import annotations

from dataclasses import dataclass, field
from datetime import datetime
from enum import StrEnum

from .issue_links import IssueReference, find_closed_issues


class Category(StrEnum):
    """The shared category vocabulary.

    Both halves of the product use these: Nishika's issue browser sorts open issues into them, this feature sorts
    merged PRs into them, and the per-category leaderboards group by them. Changing this list is a change to
    feature-seams.md, seam 3 -- agree it first.
    """

    FRONTEND = "frontend"
    BACKEND = "backend"
    FULLSTACK = "fullstack"
    DOCS = "docs"
    TESTING = "testing"
    DEVOPS = "devops"
    DESIGN = "design"
    MOBILE = "mobile"
    OTHER = "other"


@dataclass(frozen=True)
class MergedPR:
    """One merged pull request, as GitHub describes it.

    `github_pr_id` is GitHub's own id for the PR and never changes, so it is what makes a re-sync idempotent:
    a PR already stored is a PR already counted, never awarded twice.
    """

    github_pr_id: int
    repo_full_name: str          # "owner/repo"
    number: int
    title: str
    url: str
    merged_at: datetime
    author_login: str
    labels: tuple[str, ...] = field(default_factory=tuple)
    body: str = ""

    @property
    def repo_owner(self) -> str:
        return self.repo_full_name.split("/", 1)[0]

    @property
    def is_self_merge(self) -> bool:
        """True when the author merged into a repo they own.

        Anyone can create a repo, open a PR against it and merge it, so these would be free points. plan.md calls
        this out as the obvious way to fake a score. Comparison is case-insensitive because GitHub logins are.
        """
        return self.repo_owner.casefold() == self.author_login.casefold()

    @property
    def closed_issues(self) -> list[IssueReference]:
        """The issues this PR says it closes, which is where its points come from."""
        return find_closed_issues(f"{self.title}\n{self.body}", self.repo_full_name)
