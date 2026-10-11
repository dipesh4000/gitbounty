"""Shapes for Merged PR Detection.

A `MergedPR` is one pull request, opened by a GitBounty user, that has been merged. It is the raw material for
points: one merged PR, one category, some points.
"""

from __future__ import annotations

from collections.abc import Mapping
from dataclasses import dataclass, field, replace
from datetime import datetime
from enum import StrEnum

from .issue_links import IssueReference, find_closed_issues


class Category(StrEnum):
    """The shared category vocabulary.

    Both halves of the product use these: Nishika's issue browser sorts open issues into them, this feature sorts
    merged PRs into them, and the per-category leaderboards group by them. Changing this list is a change to
    the shared vocabulary in docs/points-rules.md -- agree it first.
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
    #: The GitBounty `users.id` of the author, when known. Set by the sync, which knows whose account it
    #: is querying. Used to stop a maintainer collecting a bounty they published themselves.
    author_user_id: int | None = None

    def with_author_user_id(self, user_id: int) -> "MergedPR":
        return replace(self, author_user_id=user_id)

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


class PullRequestState(StrEnum):
    """Where a pull request is in its life, as GitHub reports it.

    Every value is decided from something GitHub actually returns -- the draft flag, the open/closed state,
    the merge timestamp, and the reviews endpoint. None of it is guessed from timing, comment counts or
    who the reviewer is.
    """

    DRAFT = "draft"
    OPEN = "open"
    IN_REVIEW = "in_review"
    CHANGES_REQUESTED = "changes_requested"
    APPROVED = "approved"
    MERGED = "merged"
    CLOSED_UNMERGED = "closed_unmerged"

    @property
    def is_open(self) -> bool:
        return self in {
            PullRequestState.DRAFT,
            PullRequestState.OPEN,
            PullRequestState.IN_REVIEW,
            PullRequestState.CHANGES_REQUESTED,
            PullRequestState.APPROVED,
        }


@dataclass(frozen=True)
class ReviewState:
    """What reviewers have said, reduced to the three facts the lifecycle needs."""

    approved: bool = False
    changes_requested: bool = False
    #: Anybody has left a review of any kind, including a plain comment.
    reviewed: bool = False


@dataclass(frozen=True)
class AuthoredPR:
    """One pull request this user wrote, in whatever state it is in.

    `MergedPR` is the narrower shape the award path uses; this is the superset the website shows. Both key
    on `github_pr_id`, GitHub's own immutable id, so they describe the same thing.
    """

    github_pr_id: int
    repo_full_name: str
    number: int
    title: str
    url: str
    author_login: str
    labels: tuple[str, ...] = field(default_factory=tuple)
    body: str = ""
    is_draft: bool = False
    is_closed: bool = False
    merged_at: datetime | None = None
    created_at: datetime | None = None
    updated_at: datetime | None = None
    closed_at: datetime | None = None
    author_user_id: int | None = None

    def with_author_user_id(self, user_id: int) -> "AuthoredPR":
        return replace(self, author_user_id=user_id)

    @property
    def repo_owner(self) -> str:
        return self.repo_full_name.split("/", 1)[0]

    @property
    def is_self_merge(self) -> bool:
        """True when the author merged into a repository they own. Comparison is case-insensitive."""
        return self.repo_owner.casefold() == self.author_login.casefold()

    @property
    def closed_issues(self) -> list[IssueReference]:
        return find_closed_issues(f"{self.title}\n{self.body}", self.repo_full_name)

    def as_merged(self) -> MergedPR:
        """The narrower shape, for the award path. Only valid once this is merged."""
        if self.merged_at is None:
            raise ValueError("as_merged() on a pull request that is not merged")
        return MergedPR(
            github_pr_id=self.github_pr_id,
            repo_full_name=self.repo_full_name,
            number=self.number,
            title=self.title,
            url=self.url,
            merged_at=self.merged_at,
            author_login=self.author_login,
            labels=self.labels,
            body=self.body,
            author_user_id=self.author_user_id,
        )


def pull_request_state(pr: AuthoredPR, review: ReviewState | None = None) -> PullRequestState:
    """The lifecycle state, from what GitHub reports and nothing else.

    Order matters, and follows GitHub's own precedence:

      1. A merge timestamp means merged, whatever else is true.
      2. Closed with no merge timestamp means closed without merging.
      3. Draft is draft, even if somebody has reviewed it -- it is not asking to be merged yet.
      4. An outstanding change request outranks an approval, because the change is still outstanding.
      5. An approval with no outstanding change request means approved.
      6. Any other review means somebody is looking.
      7. Otherwise it is simply open.

    `review` is None when reviews were not fetched (they cost one request per pull request, and a merged
    or closed one does not need them). That yields `open` rather than a guess.
    """
    if pr.merged_at is not None:
        return PullRequestState.MERGED
    if pr.is_closed:
        return PullRequestState.CLOSED_UNMERGED
    if pr.is_draft:
        return PullRequestState.DRAFT
    if review is None:
        return PullRequestState.OPEN
    if review.changes_requested:
        return PullRequestState.CHANGES_REQUESTED
    if review.approved:
        return PullRequestState.APPROVED
    if review.reviewed:
        return PullRequestState.IN_REVIEW
    return PullRequestState.OPEN


@dataclass(frozen=True)
class PublishedBounty:
    """A bounty a verified maintainer published on GitBounty. The only thing that awards its value."""

    repo_full_name: str
    issue_number: int
    points: int
    category: Category
    #: The GitBounty user who published it. None when the row predates that column being populated.
    maintainer_user_id: int | None

    @property
    def key(self) -> tuple[str, int]:
        return (self.repo_full_name.casefold(), self.issue_number)


# Keyed by (lowercased repo full name, issue number), which is how a closing reference is matched.
PublishedBounties = Mapping[tuple[str, int], PublishedBounty]
