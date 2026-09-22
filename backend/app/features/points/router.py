"""HTTP endpoints for Points and Leaderboards."""

from __future__ import annotations

from datetime import datetime, timedelta, timezone
from typing import Annotated, Literal

import httpx
from fastapi import APIRouter, Depends, HTTPException, Query, status
from pydantic import BaseModel

from ...auth_stub import CurrentUser, get_current_user, get_current_user_with_token
from ...db import DatabaseNotConfigured, pool
from ..merged_prs.github import GitHubAuthError, GitHubError, GitHubRateLimited
from ..merged_prs.models import Category
from ..merged_prs.service import detect_merges
from .store import leaderboard, record_merges, upsert_user, user_points_by_category, user_totals

router = APIRouter(prefix="/api", tags=["points"])


def _require_database() -> None:
    try:
        pool()
    except DatabaseNotConfigured as error:
        raise HTTPException(status.HTTP_503_SERVICE_UNAVAILABLE, str(error)) from error


class SyncResponse(BaseModel):
    github_login: str
    newly_counted: int
    """Merges stored for the first time by this sync."""
    updated: int
    """Merges already stored that are now worth more, because an issue was marked after the PR was merged."""
    self_merges_skipped: int
    total_points: int
    total_merges: int


class MyPointsResponse(BaseModel):
    github_login: str
    total_points: int
    total_merges: int
    points_by_category: dict[str, int]


class LeaderboardEntry(BaseModel):
    rank: int
    github_login: str
    avatar_url: str | None
    points: int
    merges: int


class LeaderboardResponse(BaseModel):
    period: Literal["all", "week", "month"]
    category: Category | None
    entries: list[LeaderboardEntry]


@router.post("/me/sync", response_model=SyncResponse)
async def sync_my_merges(
    user: Annotated[CurrentUser, Depends(get_current_user_with_token)],
    inspect_files: Annotated[bool, Query(description="Look at each PR's files for a better category.")] = True,
) -> SyncResponse:
    """Fetch this user's merged PRs from GitHub and store what they earned.

    Safe to call repeatedly: a merge already counted is not counted again, though it is topped up if the issue it
    closed has been given points since the last sync.
    """
    _require_database()

    async with pool().acquire() as connection:
        # A signed-in maintainer's values beat whatever a repo's labels say (feature-seams.md, seam 4).
        stored_rows = await connection.fetch("select repo_full_name, issue_number, points from issue_points")
        stored = {(row["repo_full_name"], row["issue_number"]): row["points"] for row in stored_rows}

        async with httpx.AsyncClient(timeout=30.0) as client:
            try:
                result = await detect_merges(
                    client,
                    user.github_login,
                    user.github_token,
                    inspect_files=inspect_files,
                    stored_issue_points=stored,
                )
            except GitHubAuthError as error:
                raise HTTPException(status.HTTP_401_UNAUTHORIZED, str(error)) from error
            except GitHubRateLimited as error:
                headers = {"Retry-After": str(error.retry_after_seconds)} if error.retry_after_seconds else None
                raise HTTPException(status.HTTP_429_TOO_MANY_REQUESTS, str(error), headers=headers) from error
            except GitHubError as error:
                raise HTTPException(status.HTTP_502_BAD_GATEWAY, str(error)) from error

        async with connection.transaction():
            user_row_id = await upsert_user(connection, user.github_id, user.github_login)
            outcome = await record_merges(connection, user_row_id, result.merges)

        totals = await user_totals(connection, user_row_id)

    return SyncResponse(
        github_login=user.github_login,
        newly_counted=outcome.newly_counted,
        updated=outcome.updated,
        self_merges_skipped=result.self_merges_skipped,
        total_points=totals["points"],
        total_merges=totals["merges"],
    )


@router.get("/me/points", response_model=MyPointsResponse)
async def my_points(user: Annotated[CurrentUser, Depends(get_current_user)]) -> MyPointsResponse:
    """This user's points. Reads what the last sync stored; it does not call GitHub."""
    _require_database()

    async with pool().acquire() as connection:
        user_row_id = await upsert_user(connection, user.github_id, user.github_login)
        totals = await user_totals(connection, user_row_id)
        by_category = await user_points_by_category(connection, user_row_id)

    return MyPointsResponse(
        github_login=user.github_login,
        total_points=totals["points"],
        total_merges=totals["merges"],
        points_by_category=by_category,
    )


_PERIOD_WINDOWS = {"all": None, "week": timedelta(days=7), "month": timedelta(days=30)}


@router.get("/leaderboard", response_model=LeaderboardResponse)
async def get_leaderboard(
    period: Annotated[Literal["all", "week", "month"], Query(description="Time window.")] = "all",
    category: Annotated[Category | None, Query(description="Restrict to one kind of work.")] = None,
    limit: Annotated[int, Query(ge=1, le=100)] = 20,
) -> LeaderboardResponse:
    """The leaderboard. Public: no login needed to see who is winning."""
    _require_database()

    window = _PERIOD_WINDOWS[period]
    since = datetime.now(timezone.utc) - window if window else None

    async with pool().acquire() as connection:
        rows = await leaderboard(
            connection, since=since, category=str(category) if category else None, limit=limit
        )

    return LeaderboardResponse(
        period=period,
        category=category,
        entries=[
            LeaderboardEntry(
                rank=row.rank,
                github_login=row.github_login,
                avatar_url=row.avatar_url,
                points=row.points,
                merges=row.merges,
            )
            for row in rows
        ],
    )
