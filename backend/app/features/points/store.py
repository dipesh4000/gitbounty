"""Reading and writing points.

Plain SQL against the schema in `backend/dev/schema.sql`. Every query is written out in full rather than built,
so that what runs against Nishika's Supabase project is exactly what can be read here.
"""

from __future__ import annotations

from collections.abc import Sequence
from dataclasses import dataclass
from datetime import datetime

import asyncpg

from ..merged_prs.service import DetectedMerge


@dataclass(frozen=True)
class SaveOutcome:
    """What one sync changed."""

    newly_counted: int
    updated: int


@dataclass(frozen=True)
class MergeRow:
    """One stored merge, for showing a contributor where their points came from."""

    repo_full_name: str
    number: int
    title: str
    url: str
    category: str
    merged_at: datetime
    issue_points: int | None
    points: int


@dataclass(frozen=True)
class LeaderboardRow:
    rank: int
    github_login: str
    avatar_url: str | None
    points: int
    merges: int


async def upsert_user(
    connection: asyncpg.Connection,
    github_id: int,
    github_login: str,
    avatar_url: str | None = None,
) -> int:
    """Make sure a user row exists and return its id.

    Keyed on `github_id` rather than the login, because a person can rename their GitHub account and their login
    changes with it -- the numeric id does not.
    """
    return await connection.fetchval(
        """
        insert into users (github_id, github_login, avatar_url)
        values ($1, $2, $3)
        on conflict (github_id) do update
            set github_login = excluded.github_login,
                avatar_url   = coalesce(excluded.avatar_url, users.avatar_url)
        returning id
        """,
        github_id,
        github_login,
        avatar_url,
    )


async def record_merges(
    connection: asyncpg.Connection,
    user_id: int,
    merges: Sequence[DetectedMerge],
) -> SaveOutcome:
    """Store a sync's merges. Safe to run repeatedly.

    A merge already stored is never awarded twice -- that is what the unique (user_id, github_pr_id) constraint
    is for. It *is* updated when the same PR is now worth more than when it was last seen, which happens when a
    maintainer marks an issue with points after the PR was already merged and synced. Points are never reduced by
    a re-sync: a contributor should not lose points they were already shown because a creator edited a label.
    """
    if not merges:
        return SaveOutcome(newly_counted=0, updated=0)

    rows = [
        (
            user_id,
            merge.pr.github_pr_id,
            merge.pr.repo_full_name,
            merge.pr.number,
            merge.pr.title,
            merge.pr.url,
            merge.pr.merged_at,
            str(merge.category),
            merge.closed_issues[0].repo_full_name if merge.closed_issues else None,
            merge.closed_issues[0].number if merge.closed_issues else None,
            merge.issue_points,
            merge.points,
        )
        for merge in merges
    ]

    results = await connection.fetch(
        """
        insert into merged_prs (
            user_id, github_pr_id, repo_full_name, number, title, url, merged_at,
            category, closed_issue_repo, closed_issue_number, issue_points, points
        )
        select * from unnest(
            $1::bigint[], $2::bigint[], $3::text[], $4::int[], $5::text[], $6::text[], $7::timestamptz[],
            $8::text[], $9::text[], $10::int[], $11::int[], $12::int[]
        )
        on conflict (user_id, github_pr_id) do update
            set points       = excluded.points,
                issue_points = excluded.issue_points,
                category     = excluded.category,
                title        = excluded.title
            where excluded.points > merged_prs.points
        returning (xmax = 0) as inserted
        """,
        *[list(column) for column in zip(*rows)],
    )

    newly_counted = sum(1 for row in results if row["inserted"])
    return SaveOutcome(newly_counted=newly_counted, updated=len(results) - newly_counted)


async def user_totals(connection: asyncpg.Connection, user_id: int) -> dict[str, int]:
    """One user's points and merge count."""
    row = await connection.fetchrow(
        """
        select coalesce(sum(points), 0)::int as points,
               count(*)::int                 as merges
        from merged_prs
        where user_id = $1
        """,
        user_id,
    )
    return {"points": row["points"], "merges": row["merges"]}


async def user_points_by_category(connection: asyncpg.Connection, user_id: int) -> dict[str, int]:
    """One user's points, split by category. Only categories they actually have appear."""
    rows = await connection.fetch(
        """
        select category, sum(points)::int as points
        from merged_prs
        where user_id = $1
        group by category
        order by points desc, category asc
        """,
        user_id,
    )
    return {row["category"]: row["points"] for row in rows}


async def leaderboard(
    connection: asyncpg.Connection,
    *,
    since: datetime | None = None,
    category: str | None = None,
    limit: int = 20,
) -> list[LeaderboardRow]:
    """Ranked users, most points first.

    `since` gives the weekly board, `category` the per-category one, and both together a weekly per-category one.
    Ties break on merge count and then login, so the same data always produces the same order -- a leaderboard
    that reshuffles between refreshes looks broken.
    """
    rows = await connection.fetch(
        """
        select u.github_login,
               u.avatar_url,
               sum(m.points)::int as points,
               count(*)::int      as merges
        from merged_prs m
        join users u on u.id = m.user_id
        where ($1::timestamptz is null or m.merged_at >= $1)
          and ($2::text is null or m.category = $2)
        group by u.id, u.github_login, u.avatar_url
        order by points desc, merges desc, u.github_login asc
        limit $3
        """,
        since,
        category,
        limit,
    )

    return [
        LeaderboardRow(
            rank=index,
            github_login=row["github_login"],
            avatar_url=row["avatar_url"],
            points=row["points"],
            merges=row["merges"],
        )
        for index, row in enumerate(rows, start=1)
    ]


async def recent_merges(
    connection: asyncpg.Connection, user_id: int, limit: int = 25
) -> list[MergeRow]:
    """A user's most recent counted merges, newest first."""
    rows = await connection.fetch(
        """
        select repo_full_name, number, title, url, category, merged_at, issue_points, points
        from merged_prs
        where user_id = $1
        order by merged_at desc
        limit $2
        """,
        user_id,
        limit,
    )
    return [
        MergeRow(
            repo_full_name=row["repo_full_name"],
            number=row["number"],
            title=row["title"],
            url=row["url"],
            category=row["category"],
            merged_at=row["merged_at"],
            issue_points=row["issue_points"],
            points=row["points"],
        )
        for row in rows
    ]
