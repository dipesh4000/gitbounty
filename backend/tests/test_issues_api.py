"""Public issue-board query behavior used by the website and browser extension."""

import asyncio

import asyncpg

from app.routes import issues


def test_browse_issues_filters_an_exact_repository(monkeypatch) -> None:
    captured: dict[str, object] = {}

    async def fake_fetch_all(sql: str, *args):
        captured["sql"] = sql
        captured["args"] = args
        return []

    monkeypatch.setattr(issues, "fetch_all", fake_fetch_all)

    result = asyncio.run(issues.browse_issues(
        category=None,
        language=None,
        q=None,
        repository="aasha-malik/gitbounty",
        sort="updated",
        page=1,
        per_page=100,
    ))

    assert result.items == []
    assert "lower(r.full_name) = lower($4)" in captured["sql"]
    assert captured["args"] == (None, None, None, "aasha-malik/gitbounty", 101, 0)


# --- category provenance --------------------------------------------------


async def test_refreshing_the_board_does_not_overwrite_a_maintainers_category(
    db: asyncpg.Connection,
) -> None:
    """An inference may fill in a blank; it may not overrule a person.

    `POST /api/issues/sync` classifies from the repository language and the issue's labels. A maintainer
    publishing a bounty chooses the category deliberately. The refresh used to overwrite it and leave
    category_source saying 'maintainer', so the row claimed a provenance it no longer had.
    """
    from app.services.issue_sync import _ISSUE_UPSERT_SQL

    repository_id = await db.fetchval(
        "insert into repositories (github_id, full_name, owner_login) values (1,'org/app','org') returning id"
    )
    maintainer_id = await db.fetchval(
        "insert into users (github_id, github_login) values (7,'maintainer') returning id"
    )
    await db.execute(
        """
        insert into issues (github_id, repository_id, number, title, html_url, category, category_source)
        values (10, $1, 5, 'Chosen by a person', 'https://github.com/org/app/issues/5', 'docs', 'maintainer'),
               (11, $1, 6, 'Never published',    'https://github.com/org/app/issues/6', 'other', 'inferred')
        """,
        repository_id,
    )
    await db.execute(
        """
        insert into issue_points (repo_full_name, issue_number, points, set_by_user_id)
        values ('org/app', 5, 40, $1)
        """,
        maintainer_id,
    )

    # The refresh arrives with an inferred category that disagrees with both rows.
    for github_id, number in ((10, 5), (11, 6)):
        await db.execute(
            _ISSUE_UPSERT_SQL,
            github_id, repository_id, number, "Refreshed title",
            f"https://github.com/org/app/issues/{number}", "open",
            "backend", "Python", ["bug"], 0, None, None,
        )

    rows = {
        row["number"]: (row["category"], row["category_source"], row["title"])
        for row in await db.fetch("select number, category, category_source, title from issues")
    }

    assert rows[5] == ("docs", "maintainer", "Refreshed title"), (
        "the maintainer's category survives; everything else about the issue is refreshed"
    )
    assert rows[6] == ("backend", "inferred", "Refreshed title"), (
        "an inferred category is free to be re-inferred"
    )
