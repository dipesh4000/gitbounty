"""The sync, points and leaderboard endpoints, against a real database.

These use their own database (`gitbounty_api_test`), never the dev one, because they clear tables between tests
and nothing that clears tables should point anywhere near data someone is using.
"""

from __future__ import annotations

import os
from collections.abc import Iterator

import asyncpg
import httpx
import pytest
import respx
from fastapi.testclient import TestClient

from app.config import settings
from app.main import app

from .test_github import SEARCH_URL, search_item

API_TEST_DATABASE_URL = os.environ.get(
    "API_TEST_DATABASE_URL",
    "postgresql://gitbounty:gitbounty_local_dev@localhost:5440/gitbounty_api_test",
)
DEV_LOGIN = "aastha-malik"


@pytest.fixture
def api(monkeypatch: pytest.MonkeyPatch) -> Iterator[TestClient]:
    """A client with the database connected and the dev login stub on."""
    import asyncio

    async def prepare() -> None:
        connection = await asyncpg.connect(API_TEST_DATABASE_URL, timeout=3)
        await connection.execute("truncate merged_prs, issue_points, users restart identity cascade")
        await connection.close()

    try:
        asyncio.run(prepare())
    except Exception as error:
        pytest.skip(f"No API test database ({type(error).__name__}). See backend/dev/README.md")

    monkeypatch.setattr(settings, "database_url", API_TEST_DATABASE_URL)
    monkeypatch.setattr(settings, "dev_github_login", DEV_LOGIN)
    monkeypatch.setattr(settings, "dev_github_token", "not-a-real-token")

    with TestClient(app) as client:
        yield client


@respx.mock
def test_sync_stores_points_and_reports_them(api: TestClient) -> None:
    respx.get(SEARCH_URL).mock(
        return_value=httpx.Response(200, json={"items": [
            search_item(pr_id=1, repo="org/a", number=1, author=DEV_LOGIN, body="Closes #12"),
            search_item(pr_id=2, repo="org/b", number=2, author=DEV_LOGIN),
            search_item(pr_id=3, repo=f"{DEV_LOGIN}/toy", number=3, author=DEV_LOGIN),
        ]})
    )
    respx.get("https://api.github.com/repos/org/a/pulls/1/files").mock(
        return_value=httpx.Response(200, json=[{"filename": "api/routes.py"}])
    )
    respx.get("https://api.github.com/repos/org/b/pulls/2/files").mock(
        return_value=httpx.Response(200, json=[{"filename": "docs/readme.md"}])
    )
    respx.get("https://api.github.com/repos/org/a/issues/12").mock(
        return_value=httpx.Response(200, json={"labels": [{"name": "gitbounty:40"}]})
    )

    body = api.post("/api/me/sync").json()

    assert body["newly_counted"] == 2
    assert body["self_merges_skipped"] == 1
    assert body["total_points"] == 50      # (40 + 5) + 5

    points = api.get("/api/me/points").json()
    assert points["total_points"] == 50
    assert points["points_by_category"] == {"backend": 45, "docs": 5}


@respx.mock
def test_syncing_twice_does_not_double_count(api: TestClient) -> None:
    respx.get(SEARCH_URL).mock(
        return_value=httpx.Response(200, json={"items": [
            search_item(pr_id=1, repo="org/a", number=1, author=DEV_LOGIN),
        ]})
    )
    respx.get("https://api.github.com/repos/org/a/pulls/1/files").mock(
        return_value=httpx.Response(200, json=[])
    )

    first = api.post("/api/me/sync").json()
    second = api.post("/api/me/sync").json()

    assert first["newly_counted"] == 1
    assert second["newly_counted"] == 0
    assert second["total_points"] == first["total_points"] == 5


@respx.mock
def test_a_website_set_value_is_used_by_sync(api: TestClient) -> None:
    """Seam 4 end to end: a maintainer's stored value beats the repo's label."""
    import asyncio

    async def store_value() -> None:
        connection = await asyncpg.connect(API_TEST_DATABASE_URL)
        await connection.execute(
            "insert into issue_points (repo_full_name, issue_number, points) values ($1, $2, $3)",
            "org/a", 12, 100,
        )
        await connection.close()

    asyncio.run(store_value())

    respx.get(SEARCH_URL).mock(
        return_value=httpx.Response(200, json={"items": [
            search_item(pr_id=1, repo="org/a", number=1, author=DEV_LOGIN, body="Closes #12"),
        ]})
    )
    respx.get("https://api.github.com/repos/org/a/pulls/1/files").mock(
        return_value=httpx.Response(200, json=[])
    )
    label = respx.get("https://api.github.com/repos/org/a/issues/12").mock(
        return_value=httpx.Response(200, json={"labels": [{"name": "gitbounty:1"}]})
    )

    body = api.post("/api/me/sync").json()

    assert body["total_points"] == 105     # 100 stored + the flat 5
    assert label.call_count == 0


@respx.mock
def test_leaderboard_is_public_and_filterable(api: TestClient) -> None:
    respx.get(SEARCH_URL).mock(
        return_value=httpx.Response(200, json={"items": [
            search_item(pr_id=1, repo="org/a", number=1, author=DEV_LOGIN),
        ]})
    )
    respx.get("https://api.github.com/repos/org/a/pulls/1/files").mock(
        return_value=httpx.Response(200, json=[{"filename": "api/routes.py"}])
    )
    api.post("/api/me/sync")

    overall = api.get("/api/leaderboard").json()
    assert overall["entries"][0]["github_login"] == DEV_LOGIN
    assert overall["entries"][0]["rank"] == 1

    backend = api.get("/api/leaderboard", params={"category": "backend"}).json()
    assert len(backend["entries"]) == 1

    docs = api.get("/api/leaderboard", params={"category": "docs"}).json()
    assert docs["entries"] == []


def test_an_empty_leaderboard_is_not_an_error(api: TestClient) -> None:
    response = api.get("/api/leaderboard")
    assert response.status_code == 200
    assert response.json()["entries"] == []


def test_an_unknown_category_is_rejected(api: TestClient) -> None:
    assert api.get("/api/leaderboard", params={"category": "frontendd"}).status_code == 422


def test_endpoints_needing_the_database_say_so_when_there_is_none(
    monkeypatch: pytest.MonkeyPatch
) -> None:
    monkeypatch.setattr(settings, "database_url", "")
    monkeypatch.setattr(settings, "dev_github_login", DEV_LOGIN)
    monkeypatch.setattr(settings, "dev_github_token", "not-a-real-token")

    with TestClient(app) as client:
        assert client.get("/api/leaderboard").status_code == 503
        assert client.get("/api/me/points").status_code == 503


@respx.mock
def test_points_are_found_for_an_existing_user_row(api: TestClient, monkeypatch: pytest.MonkeyPatch) -> None:
    """The stub's github_id must match an existing row, or a sync silently lands on a new placeholder user."""
    import asyncio

    async def seed() -> None:
        connection = await asyncpg.connect(API_TEST_DATABASE_URL)
        await connection.execute(
            "insert into users (github_id, github_login) values (4242, $1)", DEV_LOGIN
        )
        await connection.close()

    asyncio.run(seed())
    monkeypatch.setattr(settings, "dev_github_id", 4242)

    respx.get(SEARCH_URL).mock(
        return_value=httpx.Response(200, json={"items": [
            search_item(pr_id=1, repo="org/a", number=1, author=DEV_LOGIN),
        ]})
    )
    respx.get("https://api.github.com/repos/org/a/pulls/1/files").mock(
        return_value=httpx.Response(200, json=[])
    )

    api.post("/api/me/sync")

    import asyncio as _asyncio

    async def count_users() -> int:
        connection = await asyncpg.connect(API_TEST_DATABASE_URL)
        try:
            return await connection.fetchval("select count(*) from users")
        finally:
            await connection.close()

    assert _asyncio.run(count_users()) == 1     # no duplicate placeholder row
    assert api.get("/api/me/points").json()["total_points"] == 5


@respx.mock
def test_my_points_lists_the_merges_that_earned_them(api: TestClient) -> None:
    respx.get(SEARCH_URL).mock(
        return_value=httpx.Response(200, json={"items": [
            search_item(pr_id=1, repo="org/a", number=1, title="Fix planner",
                        author=DEV_LOGIN, body="Closes #12"),
        ]})
    )
    respx.get("https://api.github.com/repos/org/a/pulls/1/files").mock(
        return_value=httpx.Response(200, json=[{"filename": "api/routes.py"}])
    )
    respx.get("https://api.github.com/repos/org/a/issues/12").mock(
        return_value=httpx.Response(200, json={"labels": [{"name": "gitbounty:40"}]})
    )
    api.post("/api/me/sync")

    merges = api.get("/api/me/points").json()["recent_merges"]

    assert len(merges) == 1
    assert merges[0]["title"] == "Fix planner"
    assert merges[0]["points"] == 45
    assert merges[0]["issue_points"] == 40
    assert merges[0]["category"] == "backend"
    assert merges[0]["url"] == "https://github.com/org/a/pull/1"


def test_the_website_origin_is_allowed_but_a_stranger_is_not(api: TestClient) -> None:
    """The site is a separate origin, so it must be allowed -- but only the listed ones."""
    allowed = api.get("/api/leaderboard", headers={"Origin": "http://127.0.0.1:5500"})
    assert allowed.headers.get("access-control-allow-origin") == "http://127.0.0.1:5500"

    stranger = api.get("/api/leaderboard", headers={"Origin": "https://evil.example"})
    assert "access-control-allow-origin" not in stranger.headers
