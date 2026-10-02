"""Storing and ranking points, against a real Postgres.

The behaviour these protect is the integrity of the ledger: an award happens once, a total is the sum of
immutable entries, and a correction is a new entry rather than an edit.
"""

from datetime import datetime, timedelta, timezone

import asyncpg
import pytest

from app.features.merged_prs.issue_links import IssueReference
from app.features.merged_prs.models import Category, MergedPR
from app.features.merged_prs.service import DetectedMerge, PublishedBounty
from app.features.points.rules import FLAT_POINTS_PER_MERGE
from app.features.points.store import (
    leaderboard,
    leaderboard_position,
    points_history,
    published_bounties,
    record_adjustment,
    record_merges,
    recent_merges,
    upsert_user,
    user_points_by_category,
    user_points_since,
    user_totals,
)

NOW = datetime(2026, 9, 20, tzinfo=timezone.utc)


def bounty(
    *,
    repo: str = "org/project",
    number: int = 12,
    points: int = 40,
    category: Category = Category.BACKEND,
    maintainer_user_id: int | None = None,
) -> PublishedBounty:
    return PublishedBounty(
        repo_full_name=repo,
        issue_number=number,
        points=points,
        category=category,
        maintainer_user_id=maintainer_user_id,
    )


def merge(
    pr_id: int,
    *,
    repo: str = "org/project",
    author: str = "aastha-malik",
    author_user_id: int | None = None,
    inferred_category: Category = Category.BACKEND,
    merged_at: datetime = NOW,
    on_bounty: PublishedBounty | None = None,
    baseline_eligible: bool = True,
) -> DetectedMerge:
    closed = (
        (IssueReference(on_bounty.repo_full_name, on_bounty.issue_number),) if on_bounty else ()
    )
    return DetectedMerge(
        pr=MergedPR(
            github_pr_id=pr_id,
            repo_full_name=repo,
            number=pr_id,
            title=f"PR {pr_id}",
            url=f"https://github.com/{repo}/pull/{pr_id}",
            merged_at=merged_at,
            author_login=author,
            author_user_id=author_user_id,
        ),
        inferred_category=inferred_category,
        closed_issues=closed,
        bounty=on_bounty,
        baseline_eligible=baseline_eligible,
    )


# --- identity -------------------------------------------------------------


async def test_upsert_user_is_keyed_on_github_id_not_login(db: asyncpg.Connection) -> None:
    first = await upsert_user(db, github_id=99, github_login="old-name")
    second = await upsert_user(db, github_id=99, github_login="new-name")
    assert first == second
    assert await db.fetchval("select github_login from users where id = $1", first) == "new-name"


# --- awards ---------------------------------------------------------------


async def test_a_merge_in_a_participating_repository_earns_the_baseline(
    db: asyncpg.Connection, user_id: int
) -> None:
    outcome = await record_merges(db, user_id, [merge(1)])

    assert outcome.newly_counted == 1
    assert outcome.awards_written == 1
    assert outcome.points_awarded == FLAT_POINTS_PER_MERGE
    assert (await user_totals(db, user_id))["points"] == FLAT_POINTS_PER_MERGE


async def test_a_merge_in_an_unparticipating_repository_earns_nothing(
    db: asyncpg.Connection, user_id: int
) -> None:
    """The baseline used to be paid for a merge into *any* repository, which a throwaway repository and a
    second account could farm. It is now for repositories that have a published bounty."""
    outcome = await record_merges(db, user_id, [merge(1, baseline_eligible=False)])

    assert outcome.newly_counted == 1, "the pull request is still recorded"
    assert outcome.awards_written == 0
    assert (await user_totals(db, user_id))["points"] == 0
    assert (await user_totals(db, user_id))["merges"] == 1


async def test_closing_a_published_bounty_earns_its_value_and_the_baseline(
    db: asyncpg.Connection, user_id: int
) -> None:
    await record_merges(db, user_id, [merge(1, on_bounty=bounty(points=40))])

    assert (await user_totals(db, user_id))["points"] == 40 + FLAT_POINTS_PER_MERGE
    entries, _ = await points_history(db, user_id)
    assert {entry.kind for entry in entries} == {"bounty_award", "baseline_award"}


async def test_a_bounty_award_records_its_whole_provenance(
    db: asyncpg.Connection, user_id: int
) -> None:
    maintainer = await upsert_user(db, github_id=777, github_login="the-maintainer")
    await record_merges(db, user_id, [merge(1, on_bounty=bounty(points=40, maintainer_user_id=maintainer))])

    row = await db.fetchrow("select * from points_ledger where kind = 'bounty_award'")
    assert row["points"] == 40
    assert row["bounty_points_at_award"] == 40
    assert row["bounty_repo_full_name"] == "org/project"
    assert row["bounty_issue_number"] == 12
    assert row["maintainer_user_id"] == maintainer
    assert row["pr_repo_full_name"] == "org/project"
    assert row["pr_number"] == 1
    assert row["pr_author_login"] == "aastha-malik"
    assert row["rule_version"] == "points-v1"
    assert row["category"] == "backend"
    assert row["category_source"] == "maintainer"
    assert row["reason"]


# --- idempotency ----------------------------------------------------------


async def test_a_resync_never_awards_the_same_pull_request_twice(
    db: asyncpg.Connection, user_id: int
) -> None:
    merges = [merge(1, on_bounty=bounty(points=40)), merge(2)]

    first = await record_merges(db, user_id, merges)
    second = await record_merges(db, user_id, merges)
    third = await record_merges(db, user_id, merges)

    assert first.newly_counted == 2
    assert second.newly_counted == 0 and second.already_counted == 2
    assert second.awards_written == 0 and third.awards_written == 0
    assert (await user_totals(db, user_id))["points"] == 40 + 2 * FLAT_POINTS_PER_MERGE
    assert await db.fetchval("select count(*) from points_ledger where user_id = $1", user_id) == 3


async def test_one_bounty_is_awarded_once_however_many_pull_requests_close_it(
    db: asyncpg.Connection, user_id: int
) -> None:
    """Two pull requests both saying "Closes #12" must not collect the bounty twice."""
    the_bounty = bounty(points=60)
    outcome = await record_merges(db, user_id, [merge(1, on_bounty=the_bounty), merge(2, on_bounty=the_bounty)])

    assert outcome.bounties_already_claimed == 1
    assert await db.fetchval("select count(*) from points_ledger where kind = 'bounty_award'") == 1
    # 60 once, plus the baseline for each of the two merges.
    assert (await user_totals(db, user_id))["points"] == 60 + 2 * FLAT_POINTS_PER_MERGE


async def test_two_people_cannot_both_be_paid_for_one_bounty(db: asyncpg.Connection, user_id: int) -> None:
    other = await upsert_user(db, github_id=1234, github_login="someone-else")
    the_bounty = bounty(points=100)

    first = await record_merges(db, user_id, [merge(1, on_bounty=the_bounty)])
    second = await record_merges(db, other, [merge(2, author="someone-else", on_bounty=the_bounty)])

    assert first.points_awarded == 100 + FLAT_POINTS_PER_MERGE
    assert second.points_awarded == FLAT_POINTS_PER_MERGE, "the baseline only"
    assert second.bounties_already_claimed == 1
    assert await db.fetchval("select count(*) from points_ledger where kind = 'bounty_award'") == 1


async def test_the_bounty_match_is_case_insensitive_in_the_database_too(
    db: asyncpg.Connection, user_id: int
) -> None:
    """GitHub repository names differ only in case; the same bounty must not be awarded twice because of it."""
    await record_merges(db, user_id, [merge(1, on_bounty=bounty(repo="Org/Project", points=25))])
    outcome = await record_merges(db, user_id, [merge(2, on_bounty=bounty(repo="org/project", points=25))])

    assert outcome.bounties_already_claimed == 1
    assert await db.fetchval("select count(*) from points_ledger where kind = 'bounty_award'") == 1


async def test_a_recorded_award_is_not_changed_by_the_maintainer_repricing_the_bounty(
    db: asyncpg.Connection, user_id: int
) -> None:
    """The value is frozen at the moment of the award. Re-syncing with a higher value changes nothing."""
    await record_merges(db, user_id, [merge(1, on_bounty=bounty(points=40))])
    before = (await user_totals(db, user_id))["points"]

    await record_merges(db, user_id, [merge(1, on_bounty=bounty(points=900))])

    assert (await user_totals(db, user_id))["points"] == before
    assert await db.fetchval("select bounty_points_at_award from points_ledger where kind='bounty_award'") == 40


# --- corrections ----------------------------------------------------------


async def test_a_correction_is_a_new_negative_entry_not_an_edit(
    db: asyncpg.Connection, user_id: int
) -> None:
    await record_merges(db, user_id, [merge(1, on_bounty=bounty(points=40))])
    original = (await user_totals(db, user_id))["points"]

    await record_adjustment(
        db, user_id=user_id, points=-40, reason="Bounty awarded in error; the pull request was reverted.",
        category="backend",
    )

    assert (await user_totals(db, user_id))["points"] == original - 40
    entries, total = await points_history(db, user_id)
    assert total == 3, "the two awards are still there, plus the correction"
    assert entries[0].kind == "adjustment" and entries[0].points == -40
    assert "reverted" in entries[0].reason


async def test_a_correction_without_a_reason_is_refused(db: asyncpg.Connection, user_id: int) -> None:
    with pytest.raises(ValueError, match="reason"):
        await record_adjustment(db, user_id=user_id, points=-5, reason="   ")


@pytest.mark.parametrize(
    ("columns", "values", "why"),
    [
        (
            "kind, points, category, rule_version, reason, github_pr_id",
            "'baseline_award', -5, 'backend', 'points-v1', '', 99",
            "an award is never negative",
        ),
        (
            "kind, points, category, rule_version, reason",
            "'adjustment', -5, 'backend', 'points-v1', '   '",
            "a correction without a reason is a mystery, not a correction",
        ),
        (
            "kind, points, category, rule_version, reason",
            "'baseline_award', 5, 'backend', 'points-v1', 'no pull request'",
            "an award always says which pull request earned it",
        ),
        (
            "kind, points, category, rule_version, reason, github_pr_id",
            "'bounty_award', 40, 'backend', 'points-v1', 'no bounty named', 99",
            "a bounty award always says which bounty and what it was worth",
        ),
        (
            "kind, points, category, rule_version, reason, github_pr_id",
            "'baseline_award', 5, 'not-a-category', 'points-v1', '', 99",
            "the category vocabulary is shared, so a typo must not split a leaderboard",
        ),
        (
            "kind, points, category, rule_version, reason, github_pr_id",
            "'something_else', 5, 'backend', 'points-v1', '', 99",
            "an unknown kind of entry is refused",
        ),
    ],
)
async def test_a_malformed_ledger_entry_is_refused_by_the_database(
    db: asyncpg.Connection, user_id: int, columns: str, values: str, why: str
) -> None:
    """The constraints, not the application, are what make an entry well-formed.

    Each attempt gets its own savepoint, because the first failure would otherwise abort the transaction
    the fixture is holding and every later statement would fail for the wrong reason.
    """
    await record_merges(db, user_id, [merge(1)])

    transaction = db.transaction()
    await transaction.start()
    try:
        with pytest.raises(asyncpg.CheckViolationError, match="points_ledger"):
            await db.execute(
                f"insert into points_ledger (user_id, {columns}) values ($1, {values})", user_id
            )
    finally:
        await transaction.rollback()


# --- reads ----------------------------------------------------------------


async def test_the_recent_merge_list_shows_what_was_actually_credited(
    db: asyncpg.Connection, user_id: int
) -> None:
    await record_merges(db, user_id, [merge(1, on_bounty=bounty(points=40))])
    rows = await recent_merges(db, user_id)
    assert [row.points for row in rows] == [45]

    await record_adjustment(
        db, user_id=user_id, points=-40, reason="Reverted.", github_pr_id=1, category="backend"
    )
    rows = await recent_merges(db, user_id)
    assert [row.points for row in rows] == [5], "the correction is reflected, not hidden"


async def test_points_split_by_category_uses_the_maintainers_category_for_a_bounty(
    db: asyncpg.Connection, user_id: int
) -> None:
    """A bounty published as Docs scores as Docs even if the changed files looked like backend work."""
    await record_merges(db, user_id, [
        merge(1, inferred_category=Category.BACKEND, on_bounty=bounty(number=1, category=Category.DOCS, points=20)),
        merge(2, inferred_category=Category.FRONTEND),
    ])

    assert await user_points_by_category(db, user_id) == {
        "docs": 20 + FLAT_POINTS_PER_MERGE,
        "frontend": FLAT_POINTS_PER_MERGE,
    }


async def test_a_category_that_nets_to_zero_disappears(db: asyncpg.Connection, user_id: int) -> None:
    await record_merges(db, user_id, [merge(1, inferred_category=Category.DESIGN)])
    await record_adjustment(
        db, user_id=user_id, points=-FLAT_POINTS_PER_MERGE, reason="Withdrawn.", category="design", kind="void"
    )
    assert "design" not in await user_points_by_category(db, user_id)


async def test_the_weekly_window_includes_a_correction_made_this_week(
    db: asyncpg.Connection, user_id: int
) -> None:
    long_ago = datetime.now(timezone.utc) - timedelta(days=90)
    await record_merges(db, user_id, [merge(1, merged_at=long_ago, on_bounty=bounty(points=40))])
    week_ago = datetime.now(timezone.utc) - timedelta(days=7)

    assert await user_points_since(db, user_id, week_ago) == 0

    await record_adjustment(db, user_id=user_id, points=-40, reason="Reverted today.", category="backend")
    assert await user_points_since(db, user_id, week_ago) == -40


# --- leaderboards ---------------------------------------------------------


async def _seed_leaderboard(db: asyncpg.Connection) -> dict[str, int]:
    people = {}
    for index, (login, bounty_points) in enumerate(
        [("alpha", 100), ("bravo", 60), ("charlie", 60), ("delta", None)], start=1
    ):
        user = await upsert_user(db, github_id=1000 + index, github_login=login)
        people[login] = user
        on = bounty(number=index * 10, points=bounty_points) if bounty_points else None
        await record_merges(db, user, [merge(index * 100, repo=f"org/{login}", author=login, on_bounty=on)])
    return people


async def test_the_leaderboard_ranks_by_points_and_breaks_ties_deterministically(
    db: asyncpg.Connection
) -> None:
    await _seed_leaderboard(db)

    first = await leaderboard(db)
    again = await leaderboard(db)

    assert [row.github_login for row in first.rows] == ["alpha", "bravo", "charlie", "delta"]
    assert [row.points for row in first.rows] == [105, 65, 65, 5]
    assert [row.github_login for row in again.rows] == [row.github_login for row in first.rows]
    # bravo and charlie tie on points and merges, so the login decides. The login is part of the ordering,
    # so positions stay distinct and stable rather than two people sharing rank 2 and nobody being 3rd.
    assert [row.rank for row in first.rows] == [1, 2, 3, 4]
    assert first.total == 4


async def test_the_leaderboard_pages_and_reports_the_total(db: asyncpg.Connection) -> None:
    await _seed_leaderboard(db)

    page_one = await leaderboard(db, limit=2, offset=0)
    page_two = await leaderboard(db, limit=2, offset=2)

    assert [row.github_login for row in page_one.rows] == ["alpha", "bravo"]
    assert [row.github_login for row in page_two.rows] == ["charlie", "delta"]
    assert page_one.total == page_two.total == 4


async def test_a_user_outside_the_first_page_can_still_be_told_their_rank(
    db: asyncpg.Connection
) -> None:
    people = await _seed_leaderboard(db)
    page_one = await leaderboard(db, limit=1)
    assert [row.github_login for row in page_one.rows] == ["alpha"]

    delta = await leaderboard_position(db, people["delta"])
    assert delta is not None
    assert delta.rank == 4 and delta.points == 5


async def test_someone_with_no_points_has_no_leaderboard_position(db: asyncpg.Connection) -> None:
    nobody = await upsert_user(db, github_id=4242, github_login="nobody")
    assert await leaderboard_position(db, nobody) is None


async def test_a_user_whose_points_were_withdrawn_leaves_the_board(db: asyncpg.Connection) -> None:
    people = await _seed_leaderboard(db)
    await record_adjustment(
        db, user_id=people["delta"], points=-FLAT_POINTS_PER_MERGE,
        reason="Farmed merges.", kind="void", category="backend",
    )

    page = await leaderboard(db)
    assert "delta" not in [row.github_login for row in page.rows]
    assert page.total == 3


async def test_the_per_category_leaderboard_only_counts_that_category(db: asyncpg.Connection) -> None:
    alpha = await upsert_user(db, github_id=11, github_login="alpha")
    bravo = await upsert_user(db, github_id=12, github_login="bravo")
    await record_merges(db, alpha, [
        merge(1, repo="org/a", author="alpha", on_bounty=bounty(number=1, category=Category.DOCS, points=50)),
    ])
    await record_merges(db, bravo, [
        merge(2, repo="org/b", author="bravo", on_bounty=bounty(number=2, category=Category.FRONTEND, points=70)),
    ])

    docs = await leaderboard(db, category="docs")
    assert [(row.github_login, row.points) for row in docs.rows] == [("alpha", 55)]

    frontend = await leaderboard(db, category="frontend")
    assert [(row.github_login, row.points) for row in frontend.rows] == [("bravo", 75)]


async def test_the_weekly_leaderboard_only_counts_recent_merges(db: asyncpg.Connection) -> None:
    recent = await upsert_user(db, github_id=21, github_login="recent")
    old = await upsert_user(db, github_id=22, github_login="old")
    now = datetime.now(timezone.utc)
    await record_merges(db, recent, [merge(1, repo="org/a", author="recent", merged_at=now - timedelta(days=1))])
    await record_merges(db, old, [merge(2, repo="org/b", author="old", merged_at=now - timedelta(days=60))])

    week = await leaderboard(db, since=now - timedelta(days=7))
    assert [row.github_login for row in week.rows] == ["recent"]


async def test_an_empty_leaderboard_is_empty_not_an_error(db: asyncpg.Connection) -> None:
    page = await leaderboard(db)
    assert page.rows == [] and page.total == 0


# --- published bounties ---------------------------------------------------


async def test_only_published_bounties_are_offered_to_the_sync(db: asyncpg.Connection) -> None:
    maintainer = await upsert_user(db, github_id=31, github_login="maintainer")
    repository_id = await db.fetchval(
        """
        insert into repositories (github_id, full_name, owner_login) values (1, 'org/app', 'org')
        returning id
        """
    )
    await db.execute(
        """
        insert into issues (github_id, repository_id, number, title, html_url, category, category_source)
        values (10, $1, 7, 'Fix it', 'https://github.com/org/app/issues/7', 'docs', 'maintainer'),
               (11, $1, 8, 'Other',  'https://github.com/org/app/issues/8', 'devops', 'maintainer')
        """,
        repository_id,
    )
    await db.execute(
        """
        insert into issue_points (repo_full_name, issue_number, points, set_by_user_id, status)
        values ('org/app', 7, 40, $1, 'published'),
               ('org/app', 8, 90, $1, 'unpublished')
        """,
        maintainer,
    )

    found = await published_bounties(db)

    assert set(found) == {("org/app", 7)}
    offered = found[("org/app", 7)]
    assert offered.points == 40
    assert offered.category == Category.DOCS, "the maintainer's category, not an inferred one"
    assert offered.maintainer_user_id == maintainer


async def test_a_bounty_published_after_the_merge_shows_on_the_pull_request(
    db: asyncpg.Connection, user_id: int
) -> None:
    """The realistic order of events: the contributor syncs, then the maintainer publishes the bounty.

    The award is written on the next sync. What a contributor is *shown* for that pull request has to agree
    with it -- saying "baseline awarded" next to a row worth 45 would be its own kind of lie.
    """
    await record_merges(db, user_id, [merge(1)])                       # no bounty yet
    assert (await recent_merges(db, user_id))[0].points == FLAT_POINTS_PER_MERGE

    await record_merges(db, user_id, [merge(1, on_bounty=bounty(points=40))])   # published since

    row = (await recent_merges(db, user_id))[0]
    assert row.points == 40 + FLAT_POINTS_PER_MERGE
    assert row.bounty_repo_full_name == "org/project"
    assert row.bounty_issue_number == 12
    assert row.bounty_points == 40
