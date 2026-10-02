"""HTTP endpoints for Merged PR Detection."""

from __future__ import annotations

from datetime import datetime
from typing import Annotated, Literal

import httpx
from fastapi import APIRouter, Depends, HTTPException, Query, status
from pydantic import BaseModel

from ...auth import CurrentUser, get_current_user_with_token
from ...db import DatabaseNotConfigured, pool
from ..points.store import published_bounties, upsert_user
from .github import GitHubAuthError, GitHubError, GitHubRateLimited
from .models import Category
from .service import detect_merges

router = APIRouter(prefix="/api/me/merged-prs", tags=["merged PRs"])


def _require_database() -> None:
    try:
        pool()
    except DatabaseNotConfigured as error:
        raise HTTPException(status.HTTP_503_SERVICE_UNAVAILABLE, str(error)) from error


class ClosedIssueResponse(BaseModel):
    repo_full_name: str
    number: int


class MergedPRResponse(BaseModel):
    github_pr_id: int
    repo_full_name: str
    number: int
    title: str
    url: str
    merged_at: datetime
    category: Category
    category_source: Literal["maintainer", "inferred"]
    closed_issues: list[ClosedIssueResponse]
    bounty_repo_full_name: str | None
    bounty_issue_number: int | None
    bounty_points: int | None
    """The value on the published bounty this pull request closes, or null when it closes none."""
    baseline_eligible: bool
    """Whether this merge qualifies for the flat per-merge amount, i.e. the repository takes part."""
    eligible_points: int
    """The most this merge could earn. What it *did* earn is in the ledger -- see /api/me/points."""


class DetectionResponse(BaseModel):
    github_login: str
    merges: list[MergedPRResponse]
    counted: int
    self_merges_skipped: int
    eligible_points: int


@router.get("", response_model=DetectionResponse)
async def list_my_merged_prs(
    user: Annotated[CurrentUser, Depends(get_current_user_with_token)],
    inspect_files: Annotated[
        bool,
        Query(description="Look at each PR's changed files for a better category. Costs one request per PR."),
    ] = True,
) -> DetectionResponse:
    """The signed-in user's merged pull requests, categorised, with what each is *eligible* to earn.

    Read-only: it calls GitHub and stores nothing. "Eligible" is the important word -- whether a merge has
    actually been awarded depends on the ledger, and only `POST /api/me/sync` writes to it. A bounty is
    awarded once, to one person, so two people can both see the same bounty as eligible here and only one
    of them will be credited.
    """
    _require_database()
    async with pool().acquire() as connection:
        user_row_id = await upsert_user(connection, user.github_id, user.github_login, user.avatar_url)
        bounties = await published_bounties(connection)

    async with httpx.AsyncClient(timeout=30.0) as client:
        try:
            result = await detect_merges(
                client,
                user.github_login,
                user.github_token,
                inspect_files=inspect_files,
                published_bounties=bounties,
                author_user_id=user_row_id,
            )
        except GitHubAuthError as error:
            raise HTTPException(status.HTTP_401_UNAUTHORIZED, str(error)) from error
        except GitHubRateLimited as error:
            headers = (
                {"Retry-After": str(error.retry_after_seconds)} if error.retry_after_seconds else None
            )
            raise HTTPException(
                status.HTTP_429_TOO_MANY_REQUESTS, str(error), headers=headers
            ) from error
        except GitHubError as error:
            raise HTTPException(status.HTTP_502_BAD_GATEWAY, str(error)) from error

    return DetectionResponse(
        github_login=user.github_login,
        merges=[
            MergedPRResponse(
                github_pr_id=merge.pr.github_pr_id,
                repo_full_name=merge.pr.repo_full_name,
                number=merge.pr.number,
                title=merge.pr.title,
                url=merge.pr.url,
                merged_at=merge.pr.merged_at,
                category=merge.category,
                category_source=merge.category_source,  # type: ignore[arg-type]
                closed_issues=[
                    ClosedIssueResponse(repo_full_name=ref.repo_full_name, number=ref.number)
                    for ref in merge.closed_issues
                ],
                bounty_repo_full_name=merge.bounty.repo_full_name if merge.bounty else None,
                bounty_issue_number=merge.bounty.issue_number if merge.bounty else None,
                bounty_points=merge.bounty.points if merge.bounty else None,
                baseline_eligible=merge.baseline_eligible,
                eligible_points=merge.eligible_points,
            )
            for merge in result.merges
        ],
        counted=len(result.merges),
        self_merges_skipped=result.self_merges_skipped,
        eligible_points=result.eligible_points,
    )
