"""HTTP endpoints for points, synchronisation and leaderboards."""

from __future__ import annotations

import logging
from datetime import datetime, timedelta, timezone
from typing import Annotated, Literal

import httpx
from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException, Query, status
from pydantic import BaseModel, Field

from ...auth import (
    CurrentUser,
    get_current_user,
    get_current_user_optional,
    get_current_user_with_token,
)
from ...db import DatabaseNotConfigured, pool
from ..merged_prs.github import GitHubAuthError, GitHubError, GitHubRateLimited
from ..merged_prs.models import Category
from ..merged_prs.service import detect_merges
from . import sync_state
from .rules import FLAT_POINTS_PER_MERGE, MAX_ISSUE_POINTS, MIN_ISSUE_POINTS, RULE_VERSION
from .store import (
    leaderboard,
    leaderboard_position,
    points_history,
    published_bounties,
    record_merges,
    recent_merges,
    upsert_user,
    user_points_by_category,
    user_points_since,
    user_totals,
)

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api", tags=["points"])


def _require_database() -> None:
    try:
        pool()
    except DatabaseNotConfigured as error:
        raise HTTPException(status.HTTP_503_SERVICE_UNAVAILABLE, str(error)) from error


# --- schemas --------------------------------------------------------------


class SyncStatusResponse(BaseModel):
    """Enough for the website to tell "never synced" from "syncing" from "failed" from "empty"."""

    state: Literal["never", "running", "succeeded", "failed"]
    started_at: datetime | None = None
    finished_at: datetime | None = None
    prs_seen: int = 0
    self_merges_skipped: int = 0
    newly_counted: int = 0
    points_awarded: int = 0
    error: str | None = None
    retry_after_seconds: int | None = None


class SyncStartedResponse(BaseModel):
    """A sync runs in the background, so the request returns immediately with where to look."""

    state: Literal["running", "already-running"]
    message: str


class MergeSummary(BaseModel):
    github_pr_id: int
    repo_full_name: str
    number: int
    title: str
    url: str
    category: Category
    merged_at: datetime
    bounty_repo_full_name: str | None
    bounty_issue_number: int | None
    bounty_points: int | None
    points: int
    """What the ledger has actually credited for this pull request, corrections included."""


class MyPointsResponse(BaseModel):
    github_login: str
    total_points: int
    week_points: int
    total_merges: int
    points_by_category: dict[str, int]
    recent_merges: list[MergeSummary]
    sync: SyncStatusResponse


class LedgerEntry(BaseModel):
    id: int
    kind: Literal["bounty_award", "baseline_award", "adjustment", "void"]
    points: int
    category: Category
    category_source: Literal["maintainer", "inferred"]
    rule_version: str
    reason: str
    pr_repo_full_name: str | None
    pr_number: int | None
    pr_url: str | None
    bounty_repo_full_name: str | None
    bounty_issue_number: int | None
    bounty_points_at_award: int | None
    merged_at: datetime | None
    created_at: datetime


class PointsHistoryResponse(BaseModel):
    github_login: str
    total_points: int
    entries: list[LedgerEntry]
    page: int
    per_page: int
    total: int
    has_more: bool
    rules: "PointsRules"


class PointsRules(BaseModel):
    """The rules that produced these numbers, so a history can be read without the documentation."""

    rule_version: str
    baseline_per_merge: int
    min_bounty_points: int
    max_bounty_points: int


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
    page: int
    per_page: int
    total: int
    has_more: bool
    me: LeaderboardEntry | None = None
    """Where the signed-in user sits, even when that is outside this page. Null when not signed in."""


PointsHistoryResponse.model_rebuild()

_PERIOD_WINDOWS = {"all": None, "week": timedelta(days=7), "month": timedelta(days=30)}


def _sync_status(run: sync_state.SyncRun | None) -> SyncStatusResponse:
    if run is None:
        return SyncStatusResponse(state="never")
    return SyncStatusResponse(
        state=run.status,  # type: ignore[arg-type]
        started_at=run.started_at,
        finished_at=run.finished_at,
        prs_seen=run.prs_seen,
        self_merges_skipped=run.self_merges_skipped,
        newly_counted=run.newly_counted,
        points_awarded=run.points_awarded,
        error=run.error,
        retry_after_seconds=run.retry_after_seconds,
    )


# --- synchronisation ------------------------------------------------------


async def run_sync(user: CurrentUser, *, inspect_files: bool = True, full: bool = False) -> None:
    """Fetch this user's merged pull requests from GitHub and write what they earned.

    Runs as a background task: a full history import makes one GitHub request per pull request, which is
    not something a page load should wait on. Progress and failure are recorded in `sync_runs`, which is
    what the website reads.

    Safe to run repeatedly. Nothing is awarded twice -- the database's partial unique indexes decide that,
    not this function (see store.record_merges).
    """
    db_pool = pool()
    async with db_pool.acquire() as connection:
        await sync_state.release_stale(connection)
        user_row_id = await upsert_user(connection, user.github_id, user.github_login, user.avatar_url)
        try:
            run_id = await sync_state.begin(connection, user_row_id)
        except sync_state.SyncAlreadyRunning:
            return
        since = None if full else await sync_state.last_successful_cursor(connection, user_row_id)
        bounties = await published_bounties(connection)

    try:
        async with httpx.AsyncClient(timeout=30.0) as client:
            result = await detect_merges(
                client,
                user.github_login,
                user.github_token,
                inspect_files=inspect_files,
                published_bounties=bounties,
                author_user_id=user_row_id,
                since=since,
            )
    except GitHubRateLimited as error:
        async with db_pool.acquire() as connection:
            await sync_state.fail(
                connection, run_id,
                error="GitHub's rate limit was reached before the sync finished.",
                retry_after_seconds=error.retry_after_seconds,
            )
        return
    except GitHubAuthError:
        async with db_pool.acquire() as connection:
            await sync_state.fail(connection, run_id, error="GitHub rejected the stored token. Sign in again.")
        return
    except GitHubError as error:
        async with db_pool.acquire() as connection:
            await sync_state.fail(connection, run_id, error=f"GitHub could not be read: {error}")
        return
    except Exception:
        # Never let an unexpected failure leave the run marked 'running' forever.
        logger.exception("sync failed for user_id=%s", user_row_id)
        async with db_pool.acquire() as connection:
            await sync_state.fail(connection, run_id, error="The sync failed unexpectedly. Try again.")
        return

    newest = max((merge.pr.merged_at for merge in result.merges), default=None)
    async with db_pool.acquire() as connection:
        async with connection.transaction():
            outcome = await record_merges(connection, user_row_id, result.merges)
        await sync_state.succeed(
            connection, run_id,
            prs_seen=len(result.merges),
            self_merges_skipped=result.self_merges_skipped,
            newly_counted=outcome.newly_counted,
            points_awarded=outcome.points_awarded,
            # Only advance the cursor when a merge was actually seen, or an empty run would pin it.
            cursor_merged_at=newest or since,
        )


@router.post("/me/sync", response_model=SyncStartedResponse, status_code=status.HTTP_202_ACCEPTED)
async def start_sync(
    background: BackgroundTasks,
    user: Annotated[CurrentUser, Depends(get_current_user_with_token)],
    inspect_files: Annotated[bool, Query(description="Look at each pull request's files for a better category.")] = True,
    full: Annotated[bool, Query(description="Re-walk the whole history instead of continuing from the last sync.")] = False,
) -> SyncStartedResponse:
    """Start a synchronisation and return immediately.

    The work happens in the background; `GET /api/me/points` reports its progress and its outcome. Calling
    this while a sync is running is harmless and does nothing.
    """
    _require_database()
    async with pool().acquire() as connection:
        user_row_id = await upsert_user(connection, user.github_id, user.github_login, user.avatar_url)
        await sync_state.release_stale(connection)
        existing = await sync_state.latest(connection, user_row_id)
    if existing is not None and existing.status == "running":
        return SyncStartedResponse(state="already-running", message="A sync is already running.")

    background.add_task(run_sync, user, inspect_files=inspect_files, full=full)
    return SyncStartedResponse(state="running", message="Reading your merged pull requests from GitHub.")


# --- reads ----------------------------------------------------------------


@router.get("/me/points", response_model=MyPointsResponse)
async def my_points(user: Annotated[CurrentUser, Depends(get_current_user)]) -> MyPointsResponse:
    """This user's points. Reads the ledger; it does not call GitHub."""
    _require_database()

    async with pool().acquire() as connection:
        user_row_id = await upsert_user(connection, user.github_id, user.github_login, user.avatar_url)
        totals = await user_totals(connection, user_row_id)
        week_points = await user_points_since(
            connection, user_row_id, datetime.now(timezone.utc) - timedelta(days=7)
        )
        by_category = await user_points_by_category(connection, user_row_id)
        merges = await recent_merges(connection, user_row_id)
        run = await sync_state.latest(connection, user_row_id)

    return MyPointsResponse(
        github_login=user.github_login,
        total_points=totals["points"],
        week_points=week_points,
        total_merges=totals["merges"],
        points_by_category=by_category,
        recent_merges=[
            MergeSummary(
                github_pr_id=merge.github_pr_id,
                repo_full_name=merge.repo_full_name,
                number=merge.number,
                title=merge.title,
                url=merge.url,
                category=Category(merge.category),
                merged_at=merge.merged_at,
                bounty_repo_full_name=merge.bounty_repo_full_name,
                bounty_issue_number=merge.bounty_issue_number,
                bounty_points=merge.bounty_points,
                points=merge.points,
            )
            for merge in merges
        ],
        sync=_sync_status(run),
    )


@router.get("/me/points/history", response_model=PointsHistoryResponse)
async def my_points_history(
    user: Annotated[CurrentUser, Depends(get_current_user)],
    page: Annotated[int, Query(ge=1)] = 1,
    per_page: Annotated[int, Query(ge=1, le=100)] = 25,
) -> PointsHistoryResponse:
    """Every ledger entry behind this user's total, newest first.

    This is the auditable history: each entry names the pull request, the bounty, the rule version and the
    reason. A correction appears as its own negative entry rather than as a changed number.
    """
    _require_database()

    async with pool().acquire() as connection:
        user_row_id = await upsert_user(connection, user.github_id, user.github_login, user.avatar_url)
        entries, total = await points_history(
            connection, user_row_id, limit=per_page, offset=(page - 1) * per_page
        )
        totals = await user_totals(connection, user_row_id)

    return PointsHistoryResponse(
        github_login=user.github_login,
        total_points=totals["points"],
        entries=[LedgerEntry(**vars(entry)) for entry in entries],
        page=page,
        per_page=per_page,
        total=total,
        has_more=page * per_page < total,
        rules=PointsRules(
            rule_version=RULE_VERSION,
            baseline_per_merge=FLAT_POINTS_PER_MERGE,
            min_bounty_points=MIN_ISSUE_POINTS,
            max_bounty_points=MAX_ISSUE_POINTS,
        ),
    )


@router.get("/leaderboard", response_model=LeaderboardResponse)
async def get_leaderboard(
    period: Annotated[Literal["all", "week", "month"], Query(description="Time window.")] = "all",
    category: Annotated[Category | None, Query(description="Restrict to one kind of work.")] = None,
    page: Annotated[int, Query(ge=1)] = 1,
    per_page: Annotated[int, Query(ge=1, le=100)] = 20,
    user: Annotated[CurrentUser | None, Depends(get_current_user_optional)] = None,
) -> LeaderboardResponse:
    """The leaderboard. Public: no login needed to see who is winning.

    Signed in, `me` reports where you sit even if that is far past the last page.
    """
    _require_database()

    window = _PERIOD_WINDOWS[period]
    since = datetime.now(timezone.utc) - window if window else None
    category_value = str(category) if category else None

    async with pool().acquire() as connection:
        page_result = await leaderboard(
            connection,
            since=since,
            category=category_value,
            limit=per_page,
            offset=(page - 1) * per_page,
        )
        mine = None
        if user is not None:
            user_row_id = await upsert_user(connection, user.github_id, user.github_login, user.avatar_url)
            mine = await leaderboard_position(connection, user_row_id, since=since, category=category_value)

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
            for row in page_result.rows
        ],
        page=page,
        per_page=per_page,
        total=page_result.total,
        has_more=page * per_page < page_result.total,
        me=(
            LeaderboardEntry(
                rank=mine.rank,
                github_login=mine.github_login,
                avatar_url=mine.avatar_url,
                points=mine.points,
                merges=mine.merges,
            )
            if mine
            else None
        ),
    )


class PointsRulesResponse(PointsRules):
    """The published rules, so the website and the extension state the same numbers the backend enforces."""


@router.get("/points/rules", response_model=PointsRulesResponse)
def get_points_rules() -> PointsRulesResponse:
    return PointsRulesResponse(
        rule_version=RULE_VERSION,
        baseline_per_merge=FLAT_POINTS_PER_MERGE,
        min_bounty_points=MIN_ISSUE_POINTS,
        max_bounty_points=MAX_ISSUE_POINTS,
    )
