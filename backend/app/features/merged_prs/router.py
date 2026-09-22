"""HTTP endpoints for Merged PR Detection."""

from __future__ import annotations

from datetime import datetime
from typing import Annotated

import httpx
from fastapi import APIRouter, Depends, HTTPException, Query, status
from pydantic import BaseModel

from ...auth_stub import CurrentUser, get_current_user
from .github import GitHubAuthError, GitHubError, GitHubRateLimited
from .models import Category
from .service import detect_merges

router = APIRouter(prefix="/api/me/merged-prs", tags=["merged PRs"])


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
    closed_issues: list[ClosedIssueResponse]
    issue_points: int | None
    """What the issue creator allocated, or null when no closed issue carried a value."""
    points: int
    """What this merge earned: the flat per-merge amount plus whatever was allocated."""


class DetectionResponse(BaseModel):
    github_login: str
    merges: list[MergedPRResponse]
    counted: int
    self_merges_skipped: int
    total_points: int


@router.get("", response_model=DetectionResponse)
async def list_my_merged_prs(
    user: Annotated[CurrentUser, Depends(get_current_user)],
    inspect_files: Annotated[
        bool,
        Query(description="Look at each PR's changed files for a better category. Costs one request per PR."),
    ] = True,
) -> DetectionResponse:
    """The logged-in user's merged pull requests, categorised.

    Read-only and stores nothing -- there is no database yet. Once there is, this is where a sync writes rows.
    """
    async with httpx.AsyncClient(timeout=30.0) as client:
        try:
            result = await detect_merges(
                client, user.github_login, user.github_token, inspect_files=inspect_files
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
                closed_issues=[
                    ClosedIssueResponse(repo_full_name=ref.repo_full_name, number=ref.number)
                    for ref in merge.closed_issues
                ],
                issue_points=merge.issue_points,
                points=merge.points,
            )
            for merge in result.merges
        ],
        counted=len(result.merges),
        self_merges_skipped=result.self_merges_skipped,
        total_points=result.total_points,
    )
