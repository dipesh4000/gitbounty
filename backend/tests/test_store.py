"""Storing and ranking points, against a real Postgres."""

from datetime import datetime, timedelta, timezone

import asyncpg
import pytest

from app.features.merged_prs.issue_links import IssueReference
from app.features.merged_prs.models import Category, MergedPR
from app.features.merged_prs.service import DetectedMerge
from app.features.points.store import (
    leaderboard,
    record_merges,
    upsert_user,
    user_points_by_category,
    user_totals,
)

NOW = datetime(2026, 9, 20, tzinfo=timezone.utc)


def merge(
    pr_id: int,
    *,
    points: int = 5,
    issue_points: int | None = None,
    category: Category = Category.BACKEND,
    merged_at: datetime = NOW,
    issue: IssueReference | None = None,
) -> DetectedMerge:
    return DetectedMerge(
        pr=MergedPR(
            github_pr_id=pr_id,
            repo_full_name="org/project",
            number=pr_id,
            title=f"PR {pr_id}",
            url=f"https://github.com/org/project/pull/{pr_id}",
            merged_at=merged_at,
            author_login="aastha-malik",
        ),
        category=category,
        closed_issues=(issue,) if issue else (),
        issue_points=issue_points,
        points=points,
    )


async def test_upsert_user_is_keyed_on_github_id_not_login(db: asyncpg.Connection) -> None:
    first = await upsert_user(db, github_id=99, github_login="old-name")
    second = await upsert_user(db, github_id=99, github_login="new-name")

    assert first == second
    assert await db.fetchval("select github_login from users where id = $1", first) == "new-name"


async def test_records_merges_and_totals_them(db: asyncpg.Connection, user_id: int) -> None:
    outcome = await record_merges(db, user_id, [merge(1, points=45), merge(2, points=5)])

    assert outcome.newly_counted == 2
    assert outcome.updated == 0
    assert await user_totals(db, user_id) == {"points": 50, "merges": 2}


async def test_a_resync_never_counts_the_same_pr_twice(db: asyncpg.Connection, user_id: int) -> None:
    await record_merges(db, user_id, [merge(1, points=45)])
    outcome = await record_merges(db, user_id, [merge(1, points=45)])

    assert outcome.newly_counted == 0
    assert await user_totals(db, user_id) == {"points": 45, "merges": 1}


async def test_a_pr_marked_with_points_after_merging_is_topped_up(
    db: asyncpg.Connection, user_id: int
) -> None:
    """The maintainer saw a good PR and only then put points on the issue."""
    await record_merges(db, user_id, [merge(1, points=5)])
    outcome = await record_merges(db, user_id, [merge(1, points=45, issue_points=40)])

    assert outcome.newly_counted == 0
    assert outcome.updated == 1
    assert await user_totals(db, user_id) == {"points": 45, "merges": 1}


async def test_points_are_never_reduced_by_a_resync(db: asyncpg.Connection, user_id: int) -> None:
    """A creator lowering a label shouldn't take back points a contributor has already been shown."""
    await record_merges(db, user_id, [merge(1, points=45, issue_points=40)])
    await record_merges(db, user_id, [merge(1, points=5)])

    assert await user_totals(db, user_id) == {"points": 45, "merges": 1}


async def test_recording_nothing_is_harmless(db: asyncpg.Connection, user_id: int) -> None:
    outcome = await record_merges(db, user_id, [])
    assert outcome.newly_counted == 0


async def test_the_closed_issue_is_kept(db: asyncpg.Connection, user_id: int) -> None:
    await record_merges(
        db, user_id, [merge(1, points=45, issue_points=40, issue=IssueReference("org/project", 12))]
    )
    row = await db.fetchrow("select closed_issue_repo, closed_issue_number, issue_points from merged_prs")

    assert row["closed_issue_repo"] == "org/project"
    assert row["closed_issue_number"] == 12
    assert row["issue_points"] == 40


async def test_points_split_by_category(db: asyncpg.Connection, user_id: int) -> None:
    await record_merges(db, user_id, [
        merge(1, points=10, category=Category.BACKEND),
        merge(2, points=30, category=Category.BACKEND),
        merge(3, points=5, category=Category.DOCS),
    ])

    assert await user_points_by_category(db, user_id) == {"backend": 40, "docs": 5}


async def test_an_invalid_category_is_refused_by_the_database(
    db: asyncpg.Connection, user_id: int
) -> None:
    """The check constraint is what stops the two halves of the product drifting apart."""
    with pytest.raises(asyncpg.CheckViolationError):
        await db.execute(
            """
            insert into merged_prs (user_id, github_pr_id, repo_full_name, number, title, url,
                                    merged_at, category, points)
            values ($1, 1, 'org/p', 1, 't', 'u', $2, 'frontendd', 5)
            """,
            user_id,
            NOW,
        )


async def test_leaderboard_ranks_by_points(db: asyncpg.Connection) -> None:
    quiet = await upsert_user(db, github_id=1, github_login="quiet-dev")
    busy = await upsert_user(db, github_id=2, github_login="busy-dev")
    await record_merges(db, quiet, [merge(1, points=10)])
    await record_merges(db, busy, [merge(2, points=50)])

    rows = await leaderboard(db)

    assert [(row.rank, row.github_login, row.points) for row in rows] == [
        (1, "busy-dev", 50),
        (2, "quiet-dev", 10),
    ]


async def test_leaderboard_ties_break_the_same_way_every_time(db: asyncpg.Connection) -> None:
    """A board that reshuffles between refreshes looks broken."""
    zoe = await upsert_user(db, github_id=1, github_login="zoe")
    amy = await upsert_user(db, github_id=2, github_login="amy")
    await record_merges(db, zoe, [merge(1, points=20)])
    await record_merges(db, amy, [merge(2, points=20)])

    first = [row.github_login for row in await leaderboard(db)]
    second = [row.github_login for row in await leaderboard(db)]

    assert first == second == ["amy", "zoe"]


async def test_weekly_leaderboard_only_counts_recent_merges(db: asyncpg.Connection) -> None:
    recent = await upsert_user(db, github_id=1, github_login="recent-dev")
    old = await upsert_user(db, github_id=2, github_login="old-dev")
    await record_merges(db, recent, [merge(1, points=10, merged_at=NOW)])
    await record_merges(db, old, [merge(2, points=500, merged_at=NOW - timedelta(days=30))])

    rows = await leaderboard(db, since=NOW - timedelta(days=7))

    assert [row.github_login for row in rows] == ["recent-dev"]


async def test_per_category_leaderboard(db: asyncpg.Connection) -> None:
    backend_dev = await upsert_user(db, github_id=1, github_login="backend-dev")
    docs_dev = await upsert_user(db, github_id=2, github_login="docs-dev")
    await record_merges(db, backend_dev, [merge(1, points=10, category=Category.BACKEND)])
    await record_merges(db, docs_dev, [merge(2, points=99, category=Category.DOCS)])

    rows = await leaderboard(db, category="backend")

    assert [row.github_login for row in rows] == ["backend-dev"]


async def test_leaderboard_respects_the_limit(db: asyncpg.Connection) -> None:
    for i in range(5):
        uid = await upsert_user(db, github_id=i, github_login=f"dev-{i}")
        await record_merges(db, uid, [merge(i + 1, points=(i + 1) * 10)])

    assert len(await leaderboard(db, limit=3)) == 3


async def test_an_empty_leaderboard_is_empty_not_an_error(db: asyncpg.Connection) -> None:
    assert await leaderboard(db) == []
