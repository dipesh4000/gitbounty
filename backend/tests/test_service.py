"""Merged pull request detection end to end, against faked GitHub responses.

The rule these are mostly about: a pull request earns a bounty's value only when a verified maintainer
published that bounty on GitBounty. A `gitbounty:N` label on a GitHub issue awards nothing by itself.
"""

import httpx
import respx

from app.features.merged_prs.github import GITHUB_API
from app.features.merged_prs.models import Category
from app.features.merged_prs.service import PublishedBounty, detect_merges

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


def bounty(repo: str, number: int, points: int, *, category: Category = Category.OTHER,
           maintainer_user_id: int | None = None) -> PublishedBounty:
    return PublishedBounty(
        repo_full_name=repo,
        issue_number=number,
        points=points,
        category=category,
        maintainer_user_id=maintainer_user_id,
    )


def published(*bounties: PublishedBounty) -> dict[tuple[str, int], PublishedBounty]:
    return {b.key: b for b in bounties}


@respx.mock
async def test_a_pull_request_closing_a_published_bounty_is_eligible_for_its_value() -> None:
    respx.get(SEARCH_URL).mock(
        return_value=httpx.Response(200, json={"items": [
            search_item(pr_id=1, repo="org/a", number=1, body="Closes #12"),
        ]})
    )
    respx.get(files_url("org/a", 1)).mock(return_value=httpx.Response(200, json=[]))

    async with httpx.AsyncClient() as client:
        result = await detect_merges(
            client, "aastha-malik", FAKE_TOKEN,
            published_bounties=published(bounty("org/a", 12, 40, category=Category.DOCS)),
        )

    merge = result.merges[0]
    assert merge.bounty is not None and merge.bounty.points == 40
    assert merge.baseline_eligible is True
    assert merge.eligible_points == 45          # 40 on the bounty + the flat 5
    assert merge.category == Category.DOCS, "the maintainer's category is authoritative"
    assert merge.category_source == "maintainer"
    assert [(ref.repo_full_name, ref.number) for ref in merge.closed_issues] == [("org/a", 12)]


@respx.mock
async def test_a_gitbounty_label_alone_awards_nothing_and_is_never_fetched() -> None:
    """The old behaviour read `gitbounty:40` off any GitHub issue and paid it. Nobody we authenticated
    stood behind that number, and anyone with write access to a repository could set it."""
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
        result = await detect_merges(client, "aastha-malik", FAKE_TOKEN, published_bounties={})

    merge = result.merges[0]
    assert merge.bounty is None
    assert merge.baseline_eligible is False, "no published bounty anywhere means the repo does not take part"
    assert merge.eligible_points == 0
    assert label_lookup.call_count == 0, "GitHub is not asked about labels at all any more"


@respx.mock
async def test_the_bounty_match_ignores_repository_case() -> None:
    respx.get(SEARCH_URL).mock(
        return_value=httpx.Response(200, json={"items": [
            search_item(pr_id=1, repo="Org/App", number=1, body="Closes #7"),
        ]})
    )
    respx.get(files_url("Org/App", 1)).mock(return_value=httpx.Response(200, json=[]))

    async with httpx.AsyncClient() as client:
        result = await detect_merges(
            client, "aastha-malik", FAKE_TOKEN,
            published_bounties=published(bounty("org/app", 7, 30)),
        )

    assert result.merges[0].bounty is not None
    assert result.merges[0].baseline_eligible is True


@respx.mock
async def test_a_merge_in_a_participating_repository_with_no_bounty_earns_the_baseline() -> None:
    respx.get(SEARCH_URL).mock(
        return_value=httpx.Response(200, json={"items": [
            search_item(pr_id=1, repo="org/a", number=1),
        ]})
    )
    respx.get(files_url("org/a", 1)).mock(return_value=httpx.Response(200, json=[]))

    async with httpx.AsyncClient() as client:
        result = await detect_merges(
            client, "aastha-malik", FAKE_TOKEN,
            published_bounties=published(bounty("org/a", 99, 50)),  # a bounty on a different issue
        )

    merge = result.merges[0]
    assert merge.bounty is None
    assert merge.baseline_eligible is True
    assert merge.eligible_points == 5


@respx.mock
async def test_a_merge_in_a_repository_with_no_bounties_earns_nothing() -> None:
    respx.get(SEARCH_URL).mock(
        return_value=httpx.Response(200, json={"items": [
            search_item(pr_id=1, repo="some/stranger", number=1),
        ]})
    )
    respx.get(files_url("some/stranger", 1)).mock(return_value=httpx.Response(200, json=[]))

    async with httpx.AsyncClient() as client:
        result = await detect_merges(
            client, "aastha-malik", FAKE_TOKEN,
            published_bounties=published(bounty("org/a", 1, 10)),
        )

    assert result.merges[0].eligible_points == 0


@respx.mock
async def test_a_maintainer_cannot_collect_their_own_bounty() -> None:
    """The self-merge rule covers their own repositories. This covers publishing a bounty and then fixing
    it in somebody else's repository."""
    respx.get(SEARCH_URL).mock(
        return_value=httpx.Response(200, json={"items": [
            search_item(pr_id=1, repo="org/a", number=1, body="Closes #12"),
        ]})
    )
    respx.get(files_url("org/a", 1)).mock(return_value=httpx.Response(200, json=[]))

    async with httpx.AsyncClient() as client:
        result = await detect_merges(
            client, "aastha-malik", FAKE_TOKEN,
            published_bounties=published(bounty("org/a", 12, 40, maintainer_user_id=7)),
            author_user_id=7,
        )

    merge = result.merges[0]
    assert merge.bounty is None, "the maintainer who set the value does not collect it"
    assert merge.baseline_eligible is True
    assert merge.eligible_points == 5


@respx.mock
async def test_a_pull_request_closing_several_bounties_is_credited_with_the_first() -> None:
    """Awarding all of them would let one pull request collect several maintainers' budgets at once."""
    respx.get(SEARCH_URL).mock(
        return_value=httpx.Response(200, json={"items": [
            search_item(pr_id=1, repo="org/a", number=1, body="Closes #1 and fixes #2"),
        ]})
    )
    respx.get(files_url("org/a", 1)).mock(return_value=httpx.Response(200, json=[]))

    async with httpx.AsyncClient() as client:
        result = await detect_merges(
            client, "aastha-malik", FAKE_TOKEN,
            published_bounties=published(bounty("org/a", 1, 10), bounty("org/a", 2, 30)),
        )

    merge = result.merges[0]
    assert merge.bounty is not None and merge.bounty.issue_number == 1
    assert merge.eligible_points == 15


@respx.mock
async def test_an_unreachable_closed_issue_does_not_lose_the_merge() -> None:
    respx.get(SEARCH_URL).mock(
        return_value=httpx.Response(200, json={"items": [
            search_item(pr_id=1, repo="org/a", number=1, body="Closes org/private#5"),
        ]})
    )
    respx.get(files_url("org/a", 1)).mock(return_value=httpx.Response(200, json=[]))

    async with httpx.AsyncClient() as client:
        result = await detect_merges(
            client, "aastha-malik", FAKE_TOKEN,
            published_bounties=published(bounty("org/a", 99, 10)),
        )

    assert len(result.merges) == 1
    assert result.merges[0].eligible_points == 5


@respx.mock
async def test_eligible_points_add_up_across_a_whole_sync() -> None:
    respx.get(SEARCH_URL).mock(
        return_value=httpx.Response(200, json={"items": [
            search_item(pr_id=1, repo="org/a", number=1, body="Closes #1"),
            search_item(pr_id=2, repo="org/a", number=2),
            search_item(pr_id=3, repo="aastha-malik/toy", number=3, body="Closes #1"),
        ]})
    )
    respx.get(files_url("org/a", 1)).mock(return_value=httpx.Response(200, json=[]))
    respx.get(files_url("org/a", 2)).mock(return_value=httpx.Response(200, json=[]))

    async with httpx.AsyncClient() as client:
        result = await detect_merges(
            client, "aastha-malik", FAKE_TOKEN,
            published_bounties=published(bounty("org/a", 1, 20)),
        )

    assert result.eligible_points == 30       # (20 + 5) for the bounty, 5 for the plain merge
    assert result.self_merges_skipped == 1


@respx.mock
async def test_an_incremental_sync_narrows_the_search_to_recent_merges() -> None:
    from datetime import datetime, timezone

    route = respx.get(SEARCH_URL).mock(return_value=httpx.Response(200, json={"items": []}))

    async with httpx.AsyncClient() as client:
        await detect_merges(
            client, "aastha-malik", FAKE_TOKEN,
            since=datetime(2026, 5, 10, 23, 0, tzinfo=timezone.utc),
        )

    query = route.calls[0].request.url.params["q"]
    assert "merged:>=2026-05-09" in query, "a day back, because GitHub's merged:>= takes a date"
