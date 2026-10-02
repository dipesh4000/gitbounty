"""The record of GitHub synchronisation attempts.

`POST /api/me/sync` existed but nothing recorded that it had run, so "you have no merged pull requests",
"we have never looked" and "the last attempt hit GitHub's rate limit" were the same empty table. These
functions are what lets the website tell them apart.
"""

from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime

import asyncpg


@dataclass(frozen=True)
class SyncRun:
    id: int
    status: str
    started_at: datetime
    finished_at: datetime | None
    prs_seen: int
    self_merges_skipped: int
    newly_counted: int
    points_awarded: int
    cursor_merged_at: datetime | None
    error: str | None
    retry_after_seconds: int | None


class SyncAlreadyRunning(RuntimeError):
    """This user already has a sync in progress. A second one would duplicate the GitHub calls."""


async def begin(connection: asyncpg.Connection, user_id: int) -> int:
    """Open a run, or refuse because one is already open.

    The refusal comes from `sync_runs_one_running_per_user`, a partial unique index, so two requests
    arriving at the same moment cannot both win -- which is what makes a double-clicked Sync button
    harmless.
    """
    try:
        return await connection.fetchval(
            "insert into sync_runs (user_id, status) values ($1, 'running') returning id",
            user_id,
        )
    except asyncpg.UniqueViolationError as error:
        raise SyncAlreadyRunning("A sync is already running for this account.") from error


async def succeed(
    connection: asyncpg.Connection,
    run_id: int,
    *,
    prs_seen: int,
    self_merges_skipped: int,
    newly_counted: int,
    points_awarded: int,
    cursor_merged_at: datetime | None,
) -> None:
    await connection.execute(
        """
        update sync_runs
           set status = 'succeeded',
               finished_at = now(),
               prs_seen = $2,
               self_merges_skipped = $3,
               newly_counted = $4,
               points_awarded = $5,
               cursor_merged_at = $6,
               error = null,
               retry_after_seconds = null
         where id = $1
        """,
        run_id, prs_seen, self_merges_skipped, newly_counted, points_awarded, cursor_merged_at,
    )


async def fail(
    connection: asyncpg.Connection,
    run_id: int,
    *,
    error: str,
    retry_after_seconds: int | None = None,
) -> None:
    """Record a failure in words safe to show a user. Never a token, never a URL with credentials in it."""
    await connection.execute(
        """
        update sync_runs
           set status = 'failed', finished_at = now(), error = $2, retry_after_seconds = $3
         where id = $1
        """,
        run_id, error[:500], retry_after_seconds,
    )


async def latest(connection: asyncpg.Connection, user_id: int) -> SyncRun | None:
    """This user's most recent run, whatever its outcome. None means we have never looked."""
    row = await connection.fetchrow(
        """
        select id, status, started_at, finished_at, prs_seen, self_merges_skipped,
               newly_counted, points_awarded, cursor_merged_at, error, retry_after_seconds
        from sync_runs where user_id = $1 order by started_at desc limit 1
        """,
        user_id,
    )
    return SyncRun(**dict(row)) if row else None


async def last_successful_cursor(connection: asyncpg.Connection, user_id: int) -> datetime | None:
    """The newest merge a successful run has seen, used as the starting point for the next one."""
    return await connection.fetchval(
        """
        select cursor_merged_at from sync_runs
        where user_id = $1 and status = 'succeeded' and cursor_merged_at is not null
        order by cursor_merged_at desc limit 1
        """,
        user_id,
    )


async def release_stale(connection: asyncpg.Connection, older_than_minutes: int = 30) -> int:
    """Close runs left 'running' by a process that died, so Sync is not blocked forever."""
    return await connection.fetchval(
        """
        with closed as (
            update sync_runs
               set status = 'failed', finished_at = now(),
                   error = 'The sync did not finish; it was interrupted.'
             where status = 'running'
               and started_at < now() - make_interval(mins => $1)
            returning 1
        )
        select count(*)::int from closed
        """,
        older_than_minutes,
    )
