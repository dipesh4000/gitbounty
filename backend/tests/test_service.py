"""Merged PR Detection end to end, against faked GitHub responses."""

import httpx
import respx

from app.features.merged_prs.github import GITHUB_API
from app.features.merged_prs.models import Category
from app.features.merged_prs.service import detect_merges

from .test_github import FAKE_TOKEN, SEARCH_URL, search_item


def files_url(repo: str, number: int) -> str:
    return f"{GITHUB_API}/repos/{repo}/pulls/{number}/files"


@respx.mock
async def test_self_merges_are_dropped_and_counted() -> None:
    respx.get(SEARCH_URL).mock(
        return_value=httpx.Response(200, json={"items": [
            search_item(pr_id=1, repo="django/django", number=1),
            search_item(pr_id=2, repo="aastha-malik/toy", number=2),
            search_item(pr_id=3, repo="Aastha-Malik/other", number=3),
        ]})
    )
    respx.get(files_url("django/django", 1)).mock(
        return_value=httpx.Response(200, json=[{"filename": "django/db/models.py"}])
    )

    async with httpx.AsyncClient() as client:
        result = await detect_merges(client, "aastha-malik", FAKE_TOKEN)

    assert [merge.pr.github_pr_id for merge in result.merges] == [1]
    assert result.self_merges_skipped == 2
    assert result.total_found == 3


@respx.mock
async def test_categorises_from_the_files_each_pr_changed() -> None:
    respx.get(SEARCH_URL).mock(
        return_value=httpx.Response(200, json={"items": [
            search_item(pr_id=1, repo="org/a", number=1),
            search_item(pr_id=2, repo="org/b", number=2),
        ]})
    )
    respx.get(files_url("org/a", 1)).mock(
        return_value=httpx.Response(200, json=[{"filename": "styles/main.css"}])
    )
    respx.get(files_url("org/b", 2)).mock(
        return_value=httpx.Response(200, json=[{"filename": "api/routes.py"}])
    )

    async with httpx.AsyncClient() as client:
        result = await detect_merges(client, "aastha-malik", FAKE_TOKEN)

    by_id = {merge.pr.github_pr_id: merge.category for merge in result.merges}
    assert by_id == {1: Category.FRONTEND, 2: Category.BACKEND}


@respx.mock
async def test_a_pr_whose_files_cannot_be_read_still_counts() -> None:
    """A deleted or private repo shouldn't cost someone the merge -- fall back to labels."""
    respx.get(SEARCH_URL).mock(
        return_value=httpx.Response(200, json={"items": [
            search_item(pr_id=1, repo="org/gone", number=1, labels=["documentation"]),
        ]})
    )
    respx.get(files_url("org/gone", 1)).mock(return_value=httpx.Response(404, json={}))

    async with httpx.AsyncClient() as client:
        result = await detect_merges(client, "aastha-malik", FAKE_TOKEN)

    assert len(result.merges) == 1
    assert result.merges[0].category == Category.DOCS


@respx.mock
async def test_inspect_files_false_makes_no_file_requests() -> None:
    respx.get(SEARCH_URL).mock(
        return_value=httpx.Response(200, json={"items": [
            search_item(pr_id=1, repo="org/a", number=1, labels=["frontend"]),
        ]})
    )
    files_route = respx.get(files_url("org/a", 1)).mock(return_value=httpx.Response(200, json=[]))

    async with httpx.AsyncClient() as client:
        result = await detect_merges(client, "aastha-malik", FAKE_TOKEN, inspect_files=False)

    assert files_route.call_count == 0
    assert result.merges[0].category == Category.FRONTEND


@respx.mock
async def test_a_user_with_no_merges() -> None:
    respx.get(SEARCH_URL).mock(return_value=httpx.Response(200, json={"items": []}))

    async with httpx.AsyncClient() as client:
        result = await detect_merges(client, "nobody", FAKE_TOKEN)

    assert result.merges == []
    assert result.total_found == 0


def issue_url(repo: str, number: int) -> str:
    return f"{GITHUB_API}/repos/{repo}/issues/{number}"


@respx.mock
async def test_points_come_from_the_issue_the_pr_closed() -> None:
    respx.get(SEARCH_URL).mock(
        return_value=httpx.Response(200, json={"items": [
            search_item(pr_id=1, repo="org/a", number=1, body="Closes #12"),
        ]})
    )
    respx.get(files_url("org/a", 1)).mock(return_value=httpx.Response(200, json=[]))
    issue = respx.get(issue_url("org/a", 12)).mock(
        return_value=httpx.Response(200, json={"labels": [{"name": "gitbounty:40"}]})
    )

    async with httpx.AsyncClient() as client:
        result = await detect_merges(client, "aastha-malik", FAKE_TOKEN)

    assert issue.called
    merge = result.merges[0]
    assert merge.issue_points == 40
    assert merge.points == 45          # 40 allocated + the flat 5
    assert [(ref.repo_full_name, ref.number) for ref in merge.closed_issues] == [("org/a", 12)]


@respx.mock
async def test_a_merge_closing_no_marked_issue_earns_the_flat_amount() -> None:
    respx.get(SEARCH_URL).mock(
        return_value=httpx.Response(200, json={"items": [search_item(pr_id=1, repo="org/a", number=1)]})
    )
    respx.get(files_url("org/a", 1)).mock(return_value=httpx.Response(200, json=[]))

    async with httpx.AsyncClient() as client:
        result = await detect_merges(client, "aastha-malik", FAKE_TOKEN)

    assert result.merges[0].issue_points is None
    assert result.merges[0].points == 5


@respx.mock
async def test_an_issue_with_no_points_label_earns_only_the_flat_amount() -> None:
    respx.get(SEARCH_URL).mock(
        return_value=httpx.Response(200, json={"items": [
            search_item(pr_id=1, repo="org/a", number=1, body="Fixes #3"),
        ]})
    )
    respx.get(files_url("org/a", 1)).mock(return_value=httpx.Response(200, json=[]))
    respx.get(issue_url("org/a", 3)).mock(
        return_value=httpx.Response(200, json={"labels": [{"name": "bug"}]})
    )

    async with httpx.AsyncClient() as client:
        result = await detect_merges(client, "aastha-malik", FAKE_TOKEN)

    assert result.merges[0].points == 5


@respx.mock
async def test_a_website_set_value_beats_the_label() -> None:
    """Seam 4: a signed-in maintainer's value wins, because a label can be edited by anyone with write access."""
    respx.get(SEARCH_URL).mock(
        return_value=httpx.Response(200, json={"items": [
            search_item(pr_id=1, repo="org/a", number=1, body="Closes #12"),
        ]})
    )
    respx.get(files_url("org/a", 1)).mock(return_value=httpx.Response(200, json=[]))
    label_lookup = respx.get(issue_url("org/a", 12)).mock(
        return_value=httpx.Response(200, json={"labels": [{"name": "gitbounty:999"}]})
    )

    async with httpx.AsyncClient() as client:
        result = await detect_merges(
            client, "aastha-malik", FAKE_TOKEN, stored_issue_points={("org/a", 12): 20}
        )

    assert result.merges[0].issue_points == 20
    assert label_lookup.call_count == 0  # no need to ask GitHub at all


@respx.mock
async def test_a_pr_closing_several_marked_issues_earns_all_of_them() -> None:
    respx.get(SEARCH_URL).mock(
        return_value=httpx.Response(200, json={"items": [
            search_item(pr_id=1, repo="org/a", number=1, body="Closes #1 and fixes #2"),
        ]})
    )
    respx.get(files_url("org/a", 1)).mock(return_value=httpx.Response(200, json=[]))
    respx.get(issue_url("org/a", 1)).mock(
        return_value=httpx.Response(200, json={"labels": [{"name": "gitbounty:10"}]})
    )
    respx.get(issue_url("org/a", 2)).mock(
        return_value=httpx.Response(200, json={"labels": [{"name": "gitbounty:30"}]})
    )

    async with httpx.AsyncClient() as client:
        result = await detect_merges(client, "aastha-malik", FAKE_TOKEN)

    assert result.merges[0].issue_points == 40
    assert result.merges[0].points == 45


@respx.mock
async def test_an_unreadable_issue_does_not_lose_the_merge() -> None:
    respx.get(SEARCH_URL).mock(
        return_value=httpx.Response(200, json={"items": [
            search_item(pr_id=1, repo="org/a", number=1, body="Closes org/private#5"),
        ]})
    )
    respx.get(files_url("org/a", 1)).mock(return_value=httpx.Response(200, json=[]))
    respx.get(issue_url("org/private", 5)).mock(return_value=httpx.Response(404, json={}))

    async with httpx.AsyncClient() as client:
        result = await detect_merges(client, "aastha-malik", FAKE_TOKEN)

    assert len(result.merges) == 1
    assert result.merges[0].points == 5


@respx.mock
async def test_total_points_adds_up_what_counted() -> None:
    respx.get(SEARCH_URL).mock(
        return_value=httpx.Response(200, json={"items": [
            search_item(pr_id=1, repo="org/a", number=1, body="Closes #1"),
            search_item(pr_id=2, repo="org/b", number=2),
            search_item(pr_id=3, repo="aastha-malik/toy", number=3, body="Closes #1"),
        ]})
    )
    respx.get(files_url("org/a", 1)).mock(return_value=httpx.Response(200, json=[]))
    respx.get(files_url("org/b", 2)).mock(return_value=httpx.Response(200, json=[]))
    respx.get(issue_url("org/a", 1)).mock(
        return_value=httpx.Response(200, json={"labels": [{"name": "gitbounty:20"}]})
    )

    async with httpx.AsyncClient() as client:
        result = await detect_merges(client, "aastha-malik", FAKE_TOKEN)

    assert result.total_points == 30       # (20 + 5) for the marked one, 5 for the plain one
    assert result.self_merges_skipped == 1
