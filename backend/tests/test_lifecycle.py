"""The pull request lifecycle: what state a pull request is in, and what it may earn.

Every state here is decided from something GitHub actually reports -- the draft flag, the open/closed
state, the merge timestamp, and the reviews endpoint. These tests exist mostly to hold that line: none of
them should ever need a rule that GitHub does not supply the evidence for.
"""

from __future__ import annotations

from datetime import datetime, timedelta, timezone

import httpx
import pytest
import respx

from app.features.merged_prs.github import GITHUB_API
from app.features.merged_prs.lifecycle import assess
from app.features.merged_prs.models import (
    AuthoredPR,
    Category,
    PublishedBounty,
    PullRequestState,
    ReviewState,
    pull_request_state,
)
from app.features.merged_prs.service import detect_pull_requests

from .test_github import FAKE_TOKEN, SEARCH_URL

NOW = datetime(2026, 10, 1, tzinfo=timezone.utc)


def pr(**overrides) -> AuthoredPR:
    return AuthoredPR(**{
        "github_pr_id": 1, "repo_full_name": "org/app", "number": 7,
        "title": "Fix the thing", "url": "https://github.com/org/app/pull/7",
        "author_login": "aastha-malik", "created_at": NOW, "updated_at": NOW,
        **overrides,
    })


def bounty(**overrides) -> PublishedBounty:
    return PublishedBounty(**{
        "repo_full_name": "org/app", "issue_number": 12, "points": 40,
        "category": Category.BACKEND, "maintainer_user_id": None, **overrides,
    })


# --- state --------------------------------------------------------------------


@pytest.mark.parametrize(
    ("overrides", "review", "expected"),
    [
        ({"merged_at": NOW}, None, PullRequestState.MERGED),
        ({"merged_at": NOW, "is_closed": True}, None, PullRequestState.MERGED),
        ({"is_closed": True}, None, PullRequestState.CLOSED_UNMERGED),
        ({"is_draft": True}, None, PullRequestState.DRAFT),
        ({}, None, PullRequestState.OPEN),
        ({}, ReviewState(), PullRequestState.OPEN),
        ({}, ReviewState(reviewed=True), PullRequestState.IN_REVIEW),
        ({}, ReviewState(approved=True), PullRequestState.APPROVED),
        ({}, ReviewState(changes_requested=True), PullRequestState.CHANGES_REQUESTED),
    ],
)
def test_the_state_follows_what_github_reports(overrides, review, expected) -> None:
    assert pull_request_state(pr(**overrides), review) is expected


def test_a_merge_outranks_everything_else() -> None:
    """A merged pull request is merged, whatever its reviews said on the way."""
    merged = pr(merged_at=NOW)
    assert pull_request_state(merged, ReviewState(changes_requested=True)) is PullRequestState.MERGED


def test_an_outstanding_change_request_outranks_an_approval() -> None:
    """Two reviewers, one of each: the change is still outstanding, so it is not approved."""
    state = pull_request_state(pr(), ReviewState(approved=True, changes_requested=True))
    assert state is PullRequestState.CHANGES_REQUESTED


def test_a_draft_stays_a_draft_even_when_somebody_has_approved_it() -> None:
    """A draft is not asking to be merged yet; an approval does not change that."""
    assert pull_request_state(pr(is_draft=True), ReviewState(approved=True)) is PullRequestState.DRAFT


def test_not_looking_up_reviews_yields_open_rather_than_a_guess() -> None:
    assert pull_request_state(pr(), None) is PullRequestState.OPEN


# --- the reviews endpoint -----------------------------------------------------


def reviews_url(repo: str, number: int) -> str:
    return f"{GITHUB_API}/repos/{repo}/pulls/{number}/reviews"


def review(login: str, state: str) -> dict:
    return {"user": {"login": login}, "state": state}


@respx.mock
async def test_only_a_reviewers_most_recent_verdict_counts() -> None:
    """GitHub's own rule: a reviewer who requested changes and then approved has approved."""
    from app.features.merged_prs.github import fetch_review_state

    respx.get(reviews_url("org/app", 7)).mock(return_value=httpx.Response(200, json=[
        review("carol", "CHANGES_REQUESTED"),
        review("carol", "APPROVED"),
    ]))

    async with httpx.AsyncClient() as client:
        state = await fetch_review_state(client, "org/app", 7, FAKE_TOKEN)

    assert state == ReviewState(approved=True, changes_requested=False, reviewed=True)


@respx.mock
async def test_an_approval_followed_by_a_change_request_is_not_an_approval() -> None:
    from app.features.merged_prs.github import fetch_review_state

    respx.get(reviews_url("org/app", 7)).mock(return_value=httpx.Response(200, json=[
        review("carol", "APPROVED"),
        review("carol", "CHANGES_REQUESTED"),
    ]))

    async with httpx.AsyncClient() as client:
        state = await fetch_review_state(client, "org/app", 7, FAKE_TOKEN)

    assert state.changes_requested is True
    assert state.approved is False


@respx.mock
async def test_a_comment_review_shows_someone_looked_without_being_a_verdict() -> None:
    from app.features.merged_prs.github import fetch_review_state

    respx.get(reviews_url("org/app", 7)).mock(return_value=httpx.Response(200, json=[
        review("carol", "COMMENTED"),
    ]))

    async with httpx.AsyncClient() as client:
        state = await fetch_review_state(client, "org/app", 7, FAKE_TOKEN)

    assert state == ReviewState(approved=False, changes_requested=False, reviewed=True)


@respx.mock
async def test_two_reviewers_disagreeing_leaves_the_change_outstanding() -> None:
    from app.features.merged_prs.github import fetch_review_state

    respx.get(reviews_url("org/app", 7)).mock(return_value=httpx.Response(200, json=[
        review("carol", "APPROVED"),
        review("dan", "CHANGES_REQUESTED"),
    ]))

    async with httpx.AsyncClient() as client:
        state = await fetch_review_state(client, "org/app", 7, FAKE_TOKEN)

    assert state.approved is True and state.changes_requested is True
    assert pull_request_state(pr(), state) is PullRequestState.CHANGES_REQUESTED


# --- eligibility --------------------------------------------------------------


def assess_one(authored: AuthoredPR, *, published=None, review=None):
    published = published or {}
    return assess(
        authored,
        review=review,
        inferred_category=Category.FRONTEND,
        published=published,
        tracked_repositories=frozenset(repo for repo, _ in published),
    )


def test_an_open_pull_request_on_a_bounty_is_eligible_and_not_yet_awarded() -> None:
    """Being open is not a reason to be ineligible; it has simply not been merged yet."""
    tracked = assess_one(pr(body="Closes #12"), published={("org/app", 12): bounty()})

    assert tracked.state is PullRequestState.OPEN
    assert tracked.eligible is True
    assert tracked.ineligible_reason is None
    assert tracked.expected_points == 45
    assert tracked.category is Category.BACKEND, "the maintainer's category, not the inferred one"
    assert tracked.category_source == "maintainer"


def test_a_self_merge_is_kept_but_marked_ineligible_with_a_reason() -> None:
    """The award path drops these. The contributor's own list must not: somebody whose work does not
    appear deserves to be told why rather than left wondering."""
    tracked = assess_one(pr(repo_full_name="aastha-malik/toy", merged_at=NOW))

    assert tracked.state is PullRequestState.MERGED
    assert tracked.eligible is False
    assert "repository you own" in tracked.ineligible_reason
    assert tracked.expected_points == 0


def test_a_repository_that_does_not_take_part_says_so() -> None:
    tracked = assess_one(pr(repo_full_name="some/stranger"))

    assert tracked.eligible is False
    assert "no bounties published on GitBounty" in tracked.ineligible_reason
    assert "some/stranger" in tracked.ineligible_reason


def test_a_participating_repository_with_no_bounty_on_the_issue_is_still_eligible() -> None:
    tracked = assess_one(pr(), published={("org/app", 99): bounty(issue_number=99)})

    assert tracked.eligible is True
    assert tracked.bounty is None
    assert tracked.expected_points == 5, "the baseline"


def test_a_maintainer_cannot_expect_to_collect_their_own_bounty() -> None:
    tracked = assess_one(
        pr(body="Closes #12", author_user_id=7),
        published={("org/app", 12): bounty(maintainer_user_id=7)},
    )

    assert tracked.bounty is None
    assert tracked.eligible is True, "the baseline still applies"
    assert tracked.expected_points == 5


def test_every_ineligible_pull_request_has_a_reason() -> None:
    """The database enforces this too; it is the one thing an ineligible row must carry."""
    for authored in (pr(repo_full_name="aastha-malik/toy"), pr(repo_full_name="some/stranger")):
        tracked = assess_one(authored)
        assert tracked.eligible is False
        assert tracked.ineligible_reason, f"no reason given for {authored.repo_full_name}"


# --- end to end against a faked GitHub ----------------------------------------


def search_pr(pr_id: int, *, repo="org/app", number=7, draft=False, state="open",
              merged_at=None, closed_at=None, body="", title="Fix the thing") -> dict:
    return {
        "id": pr_id,
        "number": number,
        "title": title,
        "html_url": f"https://github.com/{repo}/pull/{number}",
        "repository_url": f"{GITHUB_API}/repos/{repo}",
        "user": {"login": "aastha-malik"},
        "labels": [],
        "body": body,
        "draft": draft,
        "state": state,
        "created_at": "2026-09-01T00:00:00Z",
        "updated_at": "2026-09-20T00:00:00Z",
        "closed_at": closed_at,
        "pull_request": {"merged_at": merged_at},
    }


@respx.mock
async def test_the_sync_reports_every_state_in_one_pass() -> None:
    respx.get(SEARCH_URL).mock(return_value=httpx.Response(200, json={"items": [
        search_pr(1, number=1, draft=True),
        search_pr(2, number=2),
        search_pr(3, number=3),
        search_pr(4, number=4),
        search_pr(5, number=5, state="closed", merged_at="2026-09-19T00:00:00Z"),
        search_pr(6, number=6, state="closed", closed_at="2026-09-19T00:00:00Z"),
    ]}))
    respx.get(reviews_url("org/app", 2)).mock(return_value=httpx.Response(200, json=[]))
    respx.get(reviews_url("org/app", 3)).mock(
        return_value=httpx.Response(200, json=[review("carol", "APPROVED")])
    )
    respx.get(reviews_url("org/app", 4)).mock(
        return_value=httpx.Response(200, json=[review("carol", "CHANGES_REQUESTED")])
    )
    for number in range(1, 7):
        respx.get(f"{GITHUB_API}/repos/org/app/pulls/{number}/files").mock(
            return_value=httpx.Response(200, json=[])
        )

    async with httpx.AsyncClient() as client:
        result = await detect_pull_requests(
            client, "aastha-malik", FAKE_TOKEN,
            published_bounties={("org/app", 12): bounty()},
        )

    states = {item.pr.number: item.state for item in result.tracked}
    assert states == {
        1: PullRequestState.DRAFT,
        2: PullRequestState.OPEN,
        3: PullRequestState.APPROVED,
        4: PullRequestState.CHANGES_REQUESTED,
        5: PullRequestState.MERGED,
        6: PullRequestState.CLOSED_UNMERGED,
    }
    assert [item.pr.number for item in result.merged] == [5]


@respx.mock
async def test_reviews_are_only_fetched_for_work_still_in_flight() -> None:
    """One request per pull request is the expensive part. A merged, closed or draft one does not need it."""
    respx.get(SEARCH_URL).mock(return_value=httpx.Response(200, json={"items": [
        search_pr(1, number=1, draft=True),
        search_pr(2, number=2, state="closed", merged_at="2026-09-19T00:00:00Z"),
        search_pr(3, number=3, state="closed", closed_at="2026-09-19T00:00:00Z"),
        search_pr(4, number=4),
    ]}))
    routes = {
        number: respx.get(reviews_url("org/app", number)).mock(return_value=httpx.Response(200, json=[]))
        for number in range(1, 5)
    }

    async with httpx.AsyncClient() as client:
        await detect_pull_requests(client, "aastha-malik", FAKE_TOKEN, inspect_files=False)

    assert routes[4].call_count == 1, "the open one is asked about"
    assert routes[1].call_count == 0, "a draft is a draft whatever anybody said"
    assert routes[2].call_count == 0, "a merged pull request's state is already decided"
    assert routes[3].call_count == 0, "so is a closed one's"


@respx.mock
async def test_an_unreadable_reviews_endpoint_does_not_lose_the_pull_request() -> None:
    respx.get(SEARCH_URL).mock(return_value=httpx.Response(200, json={"items": [search_pr(1)]}))
    respx.get(reviews_url("org/app", 7)).mock(return_value=httpx.Response(404, json={}))

    async with httpx.AsyncClient() as client:
        result = await detect_pull_requests(client, "aastha-malik", FAKE_TOKEN, inspect_files=False)

    assert len(result.tracked) == 1
    assert result.tracked[0].state is PullRequestState.OPEN, "a less precise label, not a lost row"


@respx.mock
async def test_an_incremental_lifecycle_sync_narrows_on_updated_not_merged() -> None:
    """An open pull request has no merge date; what changes about it is its last update."""
    route = respx.get(SEARCH_URL).mock(return_value=httpx.Response(200, json={"items": []}))

    async with httpx.AsyncClient() as client:
        await detect_pull_requests(
            client, "aastha-malik", FAKE_TOKEN,
            since=datetime(2026, 5, 10, 23, 0, tzinfo=timezone.utc),
        )

    query = route.calls[0].request.url.params["q"]
    assert "updated:>=2026-05-09" in query
    assert "is:merged" not in query, "every state, not only merged ones"
