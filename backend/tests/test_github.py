"""The GitHub client, tested against faked responses -- no network, no real token."""

from datetime import datetime, timezone

import httpx
import pytest
import respx

from app.features.merged_prs.github import (
    GITHUB_API,
    GitHubAuthError,
    GitHubError,
    GitHubRateLimited,
    fetch_changed_paths,
    fetch_issue_labels,
    fetch_merged_prs,
)

SEARCH_URL = f"{GITHUB_API}/search/issues"
FAKE_TOKEN = "not-a-real-token"


def search_item(
    *,
    pr_id: int = 1,
    repo: str = "django/django",
    number: int = 7,
    title: str = "Fix the thing",
    merged_at: str | None = "2026-09-01T10:00:00Z",
    author: str = "aastha-malik",
    labels: list[str] | None = None,
    body: str = "",
) -> dict:
    return {
        "id": pr_id,
        "number": number,
        "title": title,
        "html_url": f"https://github.com/{repo}/pull/{number}",
        "repository_url": f"{GITHUB_API}/repos/{repo}",
        "user": {"login": author},
        "labels": [{"name": name} for name in (labels or [])],
        "body": body,
        "pull_request": {"merged_at": merged_at},
    }


@pytest.mark.asyncio
@respx.mock
async def test_parses_a_merged_pr() -> None:
    respx.get(SEARCH_URL).mock(
        return_value=httpx.Response(200, json={"items": [search_item(labels=["bug", "backend"])]})
    )

    async with httpx.AsyncClient() as client:
        prs = await fetch_merged_prs(client, "aastha-malik", FAKE_TOKEN)

    assert len(prs) == 1
    pr = prs[0]
    assert pr.github_pr_id == 1
    assert pr.repo_full_name == "django/django"
    assert pr.number == 7
    assert pr.url == "https://github.com/django/django/pull/7"
    assert pr.merged_at == datetime(2026, 9, 1, 10, 0, tzinfo=timezone.utc)
    assert pr.author_login == "aastha-malik"
    assert pr.labels == ("bug", "backend")
    assert pr.is_self_merge is False


@pytest.mark.asyncio
@respx.mock
async def test_sends_the_token_and_asks_for_merged_prs_by_the_user() -> None:
    route = respx.get(SEARCH_URL).mock(return_value=httpx.Response(200, json={"items": []}))

    async with httpx.AsyncClient() as client:
        await fetch_merged_prs(client, "aastha-malik", FAKE_TOKEN)

    request = route.calls.last.request
    assert request.headers["authorization"] == f"Bearer {FAKE_TOKEN}"
    assert "is:pr author:aastha-malik is:merged" in request.url.params["q"]


@pytest.mark.asyncio
@respx.mock
async def test_skips_pull_requests_that_were_closed_without_merging() -> None:
    respx.get(SEARCH_URL).mock(
        return_value=httpx.Response(200, json={"items": [search_item(merged_at=None), search_item(pr_id=2)]})
    )

    async with httpx.AsyncClient() as client:
        prs = await fetch_merged_prs(client, "aastha-malik", FAKE_TOKEN)

    assert [pr.github_pr_id for pr in prs] == [2]


@pytest.mark.asyncio
@respx.mock
async def test_self_merges_are_returned_not_silently_dropped() -> None:
    """Filtering is the points code's decision, so it stays visible there rather than hidden in the fetch."""
    respx.get(SEARCH_URL).mock(
        return_value=httpx.Response(200, json={"items": [search_item(repo="aastha-malik/toy")]})
    )

    async with httpx.AsyncClient() as client:
        prs = await fetch_merged_prs(client, "aastha-malik", FAKE_TOKEN)

    assert len(prs) == 1
    assert prs[0].is_self_merge is True


@pytest.mark.asyncio
@respx.mock
async def test_follows_pages_until_a_short_one() -> None:
    full_page = {"items": [search_item(pr_id=i) for i in range(100)]}
    last_page = {"items": [search_item(pr_id=500)]}
    route = respx.get(SEARCH_URL).mock(
        side_effect=[httpx.Response(200, json=full_page), httpx.Response(200, json=last_page)]
    )

    async with httpx.AsyncClient() as client:
        prs = await fetch_merged_prs(client, "aastha-malik", FAKE_TOKEN)

    assert len(prs) == 101
    assert route.call_count == 2
    assert route.calls[1].request.url.params["page"] == "2"


@pytest.mark.asyncio
@respx.mock
async def test_stops_at_max_pages() -> None:
    full_page = {"items": [search_item(pr_id=i) for i in range(100)]}
    route = respx.get(SEARCH_URL).mock(return_value=httpx.Response(200, json=full_page))

    async with httpx.AsyncClient() as client:
        await fetch_merged_prs(client, "aastha-malik", FAKE_TOKEN, max_pages=3)

    assert route.call_count == 3


@pytest.mark.asyncio
@respx.mock
async def test_a_rejected_token_is_an_auth_error() -> None:
    respx.get(SEARCH_URL).mock(return_value=httpx.Response(401, json={"message": "Bad credentials"}))

    async with httpx.AsyncClient() as client:
        with pytest.raises(GitHubAuthError):
            await fetch_merged_prs(client, "aastha-malik", FAKE_TOKEN)


@pytest.mark.asyncio
@respx.mock
async def test_rate_limiting_carries_githubs_retry_advice() -> None:
    respx.get(SEARCH_URL).mock(
        return_value=httpx.Response(403, headers={"retry-after": "42", "x-ratelimit-remaining": "0"}, json={})
    )

    async with httpx.AsyncClient() as client:
        with pytest.raises(GitHubRateLimited) as caught:
            await fetch_merged_prs(client, "aastha-malik", FAKE_TOKEN)

    assert caught.value.retry_after_seconds == 42


@pytest.mark.asyncio
@respx.mock
async def test_errors_never_contain_the_token() -> None:
    respx.get(SEARCH_URL).mock(return_value=httpx.Response(500, json={"message": "boom"}))

    async with httpx.AsyncClient() as client:
        with pytest.raises(GitHubError) as caught:
            await fetch_merged_prs(client, "aastha-malik", FAKE_TOKEN)

    assert FAKE_TOKEN not in str(caught.value)


@pytest.mark.asyncio
@respx.mock
async def test_fetch_changed_paths() -> None:
    respx.get(f"{GITHUB_API}/repos/django/django/pulls/7/files").mock(
        return_value=httpx.Response(200, json=[{"filename": "docs/a.md"}, {"filename": "django/db/models.py"}])
    )

    async with httpx.AsyncClient() as client:
        paths = await fetch_changed_paths(client, "django/django", 7, FAKE_TOKEN)

    assert paths == ["docs/a.md", "django/db/models.py"]


@pytest.mark.asyncio
@respx.mock
async def test_fetch_issue_labels() -> None:
    respx.get(f"{GITHUB_API}/repos/org/project/issues/12").mock(
        return_value=httpx.Response(200, json={"labels": [{"name": "bug"}, {"name": "gitbounty:40"}]})
    )

    async with httpx.AsyncClient() as client:
        labels = await fetch_issue_labels(client, "org/project", 12, FAKE_TOKEN)

    assert labels == ("bug", "gitbounty:40")


@pytest.mark.asyncio
@respx.mock
async def test_the_pr_body_is_kept_so_closing_references_can_be_read() -> None:
    respx.get(SEARCH_URL).mock(
        return_value=httpx.Response(200, json={"items": [search_item(body="Closes #12")]})
    )

    async with httpx.AsyncClient() as client:
        prs = await fetch_merged_prs(client, "aastha-malik", FAKE_TOKEN)

    assert prs[0].body == "Closes #12"
    assert [(ref.repo_full_name, ref.number) for ref in prs[0].closed_issues] == [("django/django", 12)]
