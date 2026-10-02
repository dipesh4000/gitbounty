"""The sync, points and leaderboard endpoints, against a real database.

These use their own database (`gitbounty_api_test`), never the dev one, because they clear tables between
tests and nothing that clears tables should point anywhere near data someone is using.

Synchronisation now runs as a background task. `TestClient` runs background tasks to completion before
returning from the request, so a POST followed by a GET in these tests sees a finished sync -- which is the
behaviour the website gets too, just not in one round trip.
"""

from __future__ import annotations

import asyncio

import asyncpg
import httpx
import pytest
import respx
from fastapi.testclient import TestClient

from app.config import settings
from app.main import app

from .conftest import API_TEST_DATABASE_URL, DEV_LOGIN
from .test_github import SEARCH_URL, search_item


def files_url(repo: str, number: int) -> str:
    return f"https://api.github.com/repos/{repo}/pulls/{number}/files"


def publish_bounty(
    repository: str,
    issue_number: int,
    points: int,
    *,
    category: str = "backend",
    maintainer_login: str = "the-maintainer",
    maintainer_github_id: int = 9001,
    status: str = "published",
) -> None:
    """Put a published bounty in the database directly, the way the maintainer endpoints would.

    Written out rather than going through the API because these tests are about what the *sync* does with a
    published bounty; the publishing endpoints have their own tests.
    """

    async def write() -> None:
        connection = await asyncpg.connect(API_TEST_DATABASE_URL)
        try:
            maintainer_id = await connection.fetchval(
                """
                insert into users (github_id, github_login) values ($1, $2)
                on conflict (github_id) do update set github_login = excluded.github_login
                returning id
                """,
                maintainer_github_id, maintainer_login,
            )
            repository_id = await connection.fetchval(
                """
                insert into repositories (github_id, full_name, owner_login)
                values ($1, $2, $3)
                on conflict (full_name) do update set owner_login = excluded.owner_login
                returning id
                """,
                abs(hash(repository)) % 1_000_000, repository, repository.split("/")[0],
            )
            await connection.execute(
                """
                insert into issues (
                    github_id, repository_id, number, title, html_url, category, category_source
                ) values ($1, $2, $3, $4, $5, $6, 'maintainer')
                on conflict (github_id) do update set category = excluded.category
                """,
                abs(hash((repository, issue_number))) % 1_000_000,
                repository_id, issue_number, f"Issue {issue_number}",
                f"https://github.com/{repository}/issues/{issue_number}", category,
            )
            await connection.execute(
                """
                insert into issue_points (repo_full_name, issue_number, points, set_by_user_id, status)
                values ($1, $2, $3, $4, $5)
                on conflict (repo_full_name, issue_number) do update set
                    points = excluded.points, status = excluded.status
                """,
                repository, issue_number, points, maintainer_id, status,
            )
        finally:
            await connection.close()

    asyncio.run(write())


def sync(api: TestClient, **params: object) -> dict:
    """Start a sync and return the points payload once it has finished."""
    started = api.post("/api/me/sync", params=params)
    assert started.status_code == 202, started.text
    return api.get("/api/me/points").json()


# --- synchronisation ------------------------------------------------------


@respx.mock
def test_sync_awards_a_published_bounty_and_the_baseline(api: TestClient) -> None:
    publish_bounty("org/a", 12, 40, category="backend")
    respx.get(SEARCH_URL).mock(
        return_value=httpx.Response(200, json={"items": [
            search_item(pr_id=1, repo="org/a", number=1, author=DEV_LOGIN, body="Closes #12", title="Fix planner"),
            search_item(pr_id=2, repo="org/a", number=2, author=DEV_LOGIN),
            search_item(pr_id=3, repo=f"{DEV_LOGIN}/toy", number=3, author=DEV_LOGIN),
        ]})
    )
    for number in (1, 2):
        respx.get(files_url("org/a", number)).mock(return_value=httpx.Response(200, json=[]))

    body = sync(api)

    assert body["total_points"] == 40 + 5 + 5
    assert body["total_merges"] == 2, "the self-merge is not counted"
    assert body["sync"]["state"] == "succeeded"
    assert body["sync"]["self_merges_skipped"] == 1
    assert body["sync"]["newly_counted"] == 2
    assert body["sync"]["points_awarded"] == 50
    assert body["sync"]["error"] is None


@respx.mock
def test_sync_is_reported_as_never_having_run_before_it_does(api: TestClient) -> None:
    """"You have no merged pull requests" and "we have never looked" are different answers."""
    body = api.get("/api/me/points").json()
    assert body["sync"]["state"] == "never"
    assert body["total_points"] == 0


@respx.mock
def test_syncing_twice_awards_nothing_the_second_time(api: TestClient) -> None:
    publish_bounty("org/a", 12, 40)
    respx.get(SEARCH_URL).mock(
        return_value=httpx.Response(200, json={"items": [
            search_item(pr_id=1, repo="org/a", number=1, author=DEV_LOGIN, body="Closes #12"),
        ]})
    )
    respx.get(files_url("org/a", 1)).mock(return_value=httpx.Response(200, json=[]))

    first = sync(api)
    second = sync(api)

    assert first["total_points"] == 45
    assert second["total_points"] == 45
    assert second["sync"]["newly_counted"] == 0
    assert second["sync"]["points_awarded"] == 0


@respx.mock
def test_a_merge_in_a_repository_with_no_bounties_earns_nothing(api: TestClient) -> None:
    respx.get(SEARCH_URL).mock(
        return_value=httpx.Response(200, json={"items": [
            search_item(pr_id=1, repo="some/stranger", number=1, author=DEV_LOGIN),
        ]})
    )
    respx.get(files_url("some/stranger", 1)).mock(return_value=httpx.Response(200, json=[]))

    body = sync(api)

    assert body["total_points"] == 0
    assert body["total_merges"] == 1, "the pull request is still recorded"
    assert body["recent_merges"][0]["points"] == 0


@respx.mock
def test_a_gitbounty_label_on_github_awards_nothing(api: TestClient) -> None:
    """A label is a suggestion. Only a bounty published by a verified maintainer awards its value."""
    label_lookup = respx.get("https://api.github.com/repos/org/a/issues/12").mock(
        return_value=httpx.Response(200, json={"labels": [{"name": "gitbounty:900"}]})
    )
    respx.get(SEARCH_URL).mock(
        return_value=httpx.Response(200, json={"items": [
            search_item(pr_id=1, repo="org/a", number=1, author=DEV_LOGIN, body="Closes #12"),
        ]})
    )
    respx.get(files_url("org/a", 1)).mock(return_value=httpx.Response(200, json=[]))

    body = sync(api)

    assert body["total_points"] == 0
    assert label_lookup.call_count == 0


@respx.mock
def test_an_unpublished_bounty_awards_nothing(api: TestClient) -> None:
    publish_bounty("org/a", 12, 40, status="unpublished")
    respx.get(SEARCH_URL).mock(
        return_value=httpx.Response(200, json={"items": [
            search_item(pr_id=1, repo="org/a", number=1, author=DEV_LOGIN, body="Closes #12"),
        ]})
    )
    respx.get(files_url("org/a", 1)).mock(return_value=httpx.Response(200, json=[]))

    assert sync(api)["total_points"] == 0


@respx.mock
def test_a_bounty_published_after_the_merge_is_still_awarded_on_the_next_sync(api: TestClient) -> None:
    """The realistic case: the contributor syncs, then the maintainer publishes the bounty."""
    respx.get(SEARCH_URL).mock(
        return_value=httpx.Response(200, json={"items": [
            search_item(pr_id=1, repo="org/a", number=1, author=DEV_LOGIN, body="Closes #12"),
        ]})
    )
    respx.get(files_url("org/a", 1)).mock(return_value=httpx.Response(200, json=[]))

    assert sync(api)["total_points"] == 0

    publish_bounty("org/a", 12, 40)
    body = sync(api, full=True)

    assert body["total_points"] == 45
    history = api.get("/api/me/points/history").json()
    assert {entry["kind"] for entry in history["entries"]} == {"bounty_award", "baseline_award"}


@respx.mock
def test_a_rate_limited_sync_is_recorded_as_a_recoverable_failure(api: TestClient) -> None:
    respx.get(SEARCH_URL).mock(
        return_value=httpx.Response(403, headers={"retry-after": "42", "x-ratelimit-remaining": "0"}, json={})
    )

    body = sync(api)

    assert body["sync"]["state"] == "failed"
    assert body["sync"]["retry_after_seconds"] == 42
    assert "rate limit" in body["sync"]["error"].lower()


@respx.mock
def test_a_rejected_token_is_recorded_as_needing_a_new_sign_in(api: TestClient) -> None:
    respx.get(SEARCH_URL).mock(return_value=httpx.Response(401, json={"message": "Bad credentials"}))

    body = sync(api)

    assert body["sync"]["state"] == "failed"
    assert "sign in again" in body["sync"]["error"].lower()


@respx.mock
def test_a_broken_github_is_recorded_as_a_failure_not_an_empty_history(api: TestClient) -> None:
    respx.get(SEARCH_URL).mock(return_value=httpx.Response(500, json={}))

    body = sync(api)

    assert body["sync"]["state"] == "failed"
    assert body["total_points"] == 0


# --- the points history ---------------------------------------------------


@respx.mock
def test_the_points_history_explains_every_entry(api: TestClient) -> None:
    publish_bounty("org/a", 12, 40, category="docs")
    respx.get(SEARCH_URL).mock(
        return_value=httpx.Response(200, json={"items": [
            search_item(pr_id=1, repo="org/a", number=1, author=DEV_LOGIN, body="Closes #12"),
        ]})
    )
    respx.get(files_url("org/a", 1)).mock(return_value=httpx.Response(200, json=[]))
    sync(api)

    body = api.get("/api/me/points/history").json()

    assert body["total_points"] == 45
    assert body["total"] == 2
    assert body["rules"] == {
        "rule_version": "points-v1",
        "baseline_per_merge": 5,
        "min_bounty_points": 1,
        "max_bounty_points": 1000,
    }
    award = next(entry for entry in body["entries"] if entry["kind"] == "bounty_award")
    assert award["points"] == 40
    assert award["bounty_repo_full_name"] == "org/a"
    assert award["bounty_issue_number"] == 12
    assert award["bounty_points_at_award"] == 40
    assert award["category"] == "docs"
    assert award["category_source"] == "maintainer"
    assert award["rule_version"] == "points-v1"
    assert award["reason"]
    assert award["pr_number"] == 1
    assert award["pr_url"] == "https://github.com/org/a/pull/1"


def test_the_points_history_pages(api: TestClient) -> None:
    body = api.get("/api/me/points/history", params={"per_page": 1}).json()
    assert body["entries"] == []
    assert body["has_more"] is False


@respx.mock
def test_my_points_lists_the_merges_that_earned_them(api: TestClient) -> None:
    publish_bounty("org/a", 12, 40)
    respx.get(SEARCH_URL).mock(
        return_value=httpx.Response(200, json={"items": [
            search_item(pr_id=1, repo="org/a", number=1, author=DEV_LOGIN, body="Closes #12", title="Fix planner"),
        ]})
    )
    respx.get(files_url("org/a", 1)).mock(return_value=httpx.Response(200, json=[]))

    body = sync(api)

    merges = body["recent_merges"]
    assert len(merges) == 1
    assert merges[0]["title"] == "Fix planner"
    assert merges[0]["points"] == 45
    assert merges[0]["bounty_points"] == 40
    assert merges[0]["bounty_repo_full_name"] == "org/a"
    assert merges[0]["bounty_issue_number"] == 12
    assert merges[0]["url"] == "https://github.com/org/a/pull/1"


@respx.mock
def test_points_land_on_the_existing_user_row_not_a_new_one(
    api: TestClient, monkeypatch: pytest.MonkeyPatch
) -> None:
    """The stub's github_id must match an existing row, or a sync lands on a new placeholder user."""
    monkeypatch.setattr(settings, "dev_github_id", 4242)
    publish_bounty("org/a", 12, 10)
    respx.get(SEARCH_URL).mock(
        return_value=httpx.Response(200, json={"items": [
            search_item(pr_id=1, repo="org/a", number=1, author=DEV_LOGIN, body="Closes #12"),
        ]})
    )
    respx.get(files_url("org/a", 1)).mock(return_value=httpx.Response(200, json=[]))

    sync(api)
    again = sync(api)

    assert again["total_points"] == 15

    async def count_users() -> int:
        connection = await asyncpg.connect(API_TEST_DATABASE_URL)
        try:
            return await connection.fetchval(
                "select count(*) from users where github_login = $1", DEV_LOGIN
            )
        finally:
            await connection.close()

    assert asyncio.run(count_users()) == 1


# --- leaderboards ---------------------------------------------------------


@respx.mock
def test_the_leaderboard_is_public_filterable_and_pageable(api: TestClient) -> None:
    publish_bounty("org/a", 12, 40, category="docs")
    respx.get(SEARCH_URL).mock(
        return_value=httpx.Response(200, json={"items": [
            search_item(pr_id=1, repo="org/a", number=1, author=DEV_LOGIN, body="Closes #12"),
        ]})
    )
    respx.get(files_url("org/a", 1)).mock(return_value=httpx.Response(200, json=[]))
    sync(api)

    overall = api.get("/api/leaderboard").json()
    assert [entry["github_login"] for entry in overall["entries"]] == [DEV_LOGIN]
    assert overall["entries"][0]["points"] == 45
    assert overall["total"] == 1
    assert overall["has_more"] is False
    assert overall["me"]["rank"] == 1, "the signed-in user's own position is reported"

    docs = api.get("/api/leaderboard", params={"category": "docs"}).json()
    assert [entry["points"] for entry in docs["entries"]] == [45]

    frontend = api.get("/api/leaderboard", params={"category": "frontend"}).json()
    assert frontend["entries"] == []
    assert frontend["me"] is None, "no points in this category means no position in it"

    week = api.get("/api/leaderboard", params={"period": "week"}).json()
    assert week["period"] == "week"


def test_an_empty_leaderboard_is_not_an_error(api: TestClient) -> None:
    response = api.get("/api/leaderboard")
    assert response.status_code == 200
    assert response.json()["entries"] == []
    assert response.json()["total"] == 0


def test_an_unknown_category_is_rejected(api: TestClient) -> None:
    assert api.get("/api/leaderboard", params={"category": "frontendd"}).status_code == 422


def test_leaderboard_paging_arguments_are_validated(api: TestClient) -> None:
    assert api.get("/api/leaderboard", params={"page": 0}).status_code == 422
    assert api.get("/api/leaderboard", params={"per_page": 101}).status_code == 422
    assert api.get("/api/leaderboard", params={"per_page": 0}).status_code == 422


def test_the_published_rules_are_readable_without_signing_in(api: TestClient) -> None:
    body = api.get("/api/points/rules").json()
    assert body["max_bounty_points"] == 1000
    assert body["min_bounty_points"] == 1
    assert body["baseline_per_merge"] == 5


# --- plumbing -------------------------------------------------------------


def test_endpoints_needing_the_database_say_so_when_there_is_none(
    monkeypatch: pytest.MonkeyPatch
) -> None:
    monkeypatch.setattr(settings, "database_url", "")
    monkeypatch.setattr(settings, "dev_login_stub_enabled", True)
    monkeypatch.setattr(settings, "dev_github_login", DEV_LOGIN)
    monkeypatch.setattr(settings, "dev_github_token", "not-a-real-token")

    with TestClient(app) as client:
        assert client.get("/api/leaderboard").status_code == 503
        assert client.get("/api/me/points").status_code == 503
        assert client.get("/api/me/points/history").status_code == 503


def test_the_website_origin_is_allowed_but_a_stranger_is_not(api: TestClient) -> None:
    """The site is a separate origin, so it must be allowed -- but only the listed ones."""
    allowed = api.get("/api/leaderboard", headers={"Origin": "http://127.0.0.1:5500"})
    assert allowed.headers.get("access-control-allow-origin") == "http://127.0.0.1:5500"

    stranger = api.get("/api/leaderboard", headers={"Origin": "https://evil.example"})
    assert "access-control-allow-origin" not in stranger.headers


@respx.mock
def test_the_pull_request_list_agrees_with_the_award_after_a_late_publish(api: TestClient) -> None:
    """End to end for the publish-after-merge case, through the API the website actually reads.

    The award is written on the second sync. If the pull-request row still said "no bounty" the website
    would show "Baseline awarded" next to a figure of 45 -- two statements that cannot both be true.
    """
    respx.get(SEARCH_URL).mock(
        return_value=httpx.Response(200, json={"items": [
            search_item(pr_id=1, repo="org/a", number=1, author=DEV_LOGIN, body="Closes #12"),
        ]})
    )
    respx.get(files_url("org/a", 1)).mock(return_value=httpx.Response(200, json=[]))

    first = sync(api)
    assert first["recent_merges"][0]["points"] == 0
    assert first["recent_merges"][0]["bounty_issue_number"] is None

    publish_bounty("org/a", 12, 40, category="docs")
    second = sync(api, full=True)

    merge = second["recent_merges"][0]
    assert merge["points"] == 45
    assert merge["bounty_repo_full_name"] == "org/a"
    assert merge["bounty_issue_number"] == 12
    assert merge["bounty_points"] == 40
    assert merge["category"] == "docs", "the maintainer's category, now that there is a bounty"
