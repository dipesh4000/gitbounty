"""The maintainer workspace: repository authorization, publishing, and the bounty lifecycle.

Against the real database, with GitHub faked. The previous version of these tests used a hand-written fake
connection object, which meant the SQL was never actually executed and a schema change could not break
them. Authorization and auditing are the whole point of these endpoints, so they are tested end to end.
"""

from __future__ import annotations

import asyncio

import asyncpg
import httpx
import pytest
import respx
from fastapi.testclient import TestClient

from .conftest import API_TEST_DATABASE_URL, DEV_LOGIN

REPO = f"{DEV_LOGIN}/gitbounty"
REPO_URL = f"https://api.github.com/repos/{REPO}"
ISSUES_URL = f"{REPO_URL}/issues"
USER_REPOS_URL = "https://api.github.com/user/repos"


def repo(
    *,
    full_name: str = REPO,
    owner_login: str = DEV_LOGIN,
    owner_type: str = "User",
    permissions: dict | None = None,
    private: bool = False,
    archived: bool = False,
    has_issues: bool = True,
    open_issues_count: int = 1,
    repo_id: int = 100,
) -> dict:
    return {
        "id": repo_id,
        "full_name": full_name,
        "private": private,
        "archived": archived,
        "owner": {"login": owner_login, "type": owner_type},
        "permissions": permissions if permissions is not None else {"admin": True, "push": True},
        "language": "Python",
        "description": "Reward open-source work",
        "stargazers_count": 12,
        "created_at": "2026-01-01T00:00:00Z",
        "has_issues": has_issues,
        "open_issues_count": open_issues_count,
    }


def issue(number: int = 12, *, labels: list[str] | None = None, title: str | None = None) -> dict:
    return {
        "id": 900 + number,
        "number": number,
        "title": title or f"Add repository bounty controls #{number}",
        "html_url": f"https://github.com/{REPO}/issues/{number}",
        "labels": [{"name": name} for name in (labels if labels is not None else ["backend"])],
        "comments": 2,
        "created_at": "2026-09-01T00:00:00Z",
        "updated_at": "2026-09-25T00:00:00Z",
    }


def publish(api: TestClient, *, number: int = 12, points: int = 40, category: str = "backend") -> httpx.Response:
    respx.get(REPO_URL).mock(return_value=httpx.Response(200, json=repo()))
    respx.get(ISSUES_URL).mock(return_value=httpx.Response(200, json=[issue(number)]))
    return api.post(
        "/api/maintainer/bounties",
        json={"issues": [{"repository": REPO, "number": number, "points": points, "category": category}]},
    )


def query(sql: str, *args: object) -> list[asyncpg.Record]:
    async def run() -> list[asyncpg.Record]:
        connection = await asyncpg.connect(API_TEST_DATABASE_URL)
        try:
            return await connection.fetch(sql, *args)
        finally:
            await connection.close()

    return asyncio.run(run())


# --- repository authorization ---------------------------------------------


@respx.mock
def test_repositories_the_user_administers_are_listed(api: TestClient) -> None:
    respx.get(USER_REPOS_URL).mock(return_value=httpx.Response(200, json=[repo()]))

    body = api.get("/api/maintainer/repositories").json()

    assert body["total"] == 1
    assert body["items"][0]["full_name"] == REPO
    assert body["items"][0]["permission"] == "admin"
    assert body["items"][0]["publishable"] is True


@respx.mock
def test_an_organisation_repository_is_listed_when_github_grants_maintain(api: TestClient) -> None:
    """Organisation support, without assuming every member of an organisation may publish."""
    org_repo = repo(
        full_name="some-org/project",
        owner_login="some-org",
        owner_type="Organization",
        permissions={"admin": False, "maintain": True, "push": True},
        repo_id=200,
    )
    respx.get(USER_REPOS_URL).mock(return_value=httpx.Response(200, json=[org_repo]))

    body = api.get("/api/maintainer/repositories").json()

    assert [item["full_name"] for item in body["items"]] == ["some-org/project"]
    assert body["items"][0]["permission"] == "maintain"


@respx.mock
def test_a_repository_the_user_only_has_push_on_is_not_listed(api: TestClient) -> None:
    """Somebody who can both set a bounty's value and merge the pull request claiming it is the collusion
    case with one person in it, so write access alone is not enough."""
    pushable = repo(
        full_name="some-org/other",
        owner_login="some-org",
        owner_type="Organization",
        permissions={"admin": False, "maintain": False, "push": True},
        repo_id=300,
    )
    respx.get(USER_REPOS_URL).mock(return_value=httpx.Response(200, json=[pushable]))

    assert api.get("/api/maintainer/repositories").json()["items"] == []


@respx.mock
@pytest.mark.parametrize(
    ("kwargs", "expected"),
    [
        ({"private": True}, "Private repositories"),
        ({"archived": True}, "archived on GitHub"),
        ({"has_issues": False}, "Issues are turned off"),
        ({"open_issues_count": 0}, "no open issues"),
    ],
)
def test_a_repository_that_cannot_carry_a_bounty_is_listed_with_the_reason(
    api: TestClient, kwargs: dict, expected: str
) -> None:
    """Hiding it would leave the maintainer asking why their repository is missing."""
    respx.get(USER_REPOS_URL).mock(return_value=httpx.Response(200, json=[repo(**kwargs)]))

    item = api.get("/api/maintainer/repositories").json()["items"][0]

    assert item["publishable"] is False
    assert expected in item["blocked_reason"]


@respx.mock
def test_repositories_can_be_searched_and_paged(api: TestClient) -> None:
    repositories = [
        repo(full_name=f"{DEV_LOGIN}/alpha", repo_id=1),
        repo(full_name=f"{DEV_LOGIN}/beta", repo_id=2),
        repo(full_name=f"{DEV_LOGIN}/gamma", repo_id=3),
    ]
    respx.get(USER_REPOS_URL).mock(return_value=httpx.Response(200, json=repositories))

    searched = api.get("/api/maintainer/repositories", params={"q": "bet"}).json()
    assert [item["full_name"] for item in searched["items"]] == [f"{DEV_LOGIN}/beta"]

    paged = api.get("/api/maintainer/repositories", params={"per_page": 2, "page": 2}).json()
    assert len(paged["items"]) == 1
    assert paged["total"] == 3
    assert paged["has_more"] is False


@respx.mock
def test_github_rate_limiting_is_reported_as_recoverable(api: TestClient) -> None:
    respx.get(USER_REPOS_URL).mock(
        return_value=httpx.Response(403, headers={"retry-after": "25", "x-ratelimit-remaining": "0"}, json={})
    )

    response = api.get("/api/maintainer/repositories")

    assert response.status_code == 429
    assert response.headers["retry-after"] == "25"


# --- issues in one repository ---------------------------------------------


@respx.mock
def test_issues_in_an_authorised_repository_are_listed_with_suggestions(api: TestClient) -> None:
    respx.get(REPO_URL).mock(return_value=httpx.Response(200, json=repo()))
    respx.get(ISSUES_URL).mock(
        return_value=httpx.Response(200, json=[issue(12, labels=["backend", "gitbounty:70"])])
    )

    body = api.get(f"/api/maintainer/repositories/{REPO}/issues").json()

    assert body["repository"] == REPO
    assert body["items"][0]["number"] == 12
    assert body["items"][0]["suggested_category"] == "backend"
    assert body["items"][0]["suggested_points"] == 70, "the label is a suggestion, not an award"
    assert body["items"][0]["existing"] is None


@respx.mock
def test_a_label_above_the_maximum_is_suggested_clamped(api: TestClient) -> None:
    respx.get(REPO_URL).mock(return_value=httpx.Response(200, json=repo()))
    respx.get(ISSUES_URL).mock(
        return_value=httpx.Response(200, json=[issue(12, labels=["gitbounty:50000"])])
    )

    body = api.get(f"/api/maintainer/repositories/{REPO}/issues").json()

    assert body["items"][0]["suggested_points"] == 1000


@respx.mock
def test_issues_can_be_searched(api: TestClient) -> None:
    respx.get(REPO_URL).mock(return_value=httpx.Response(200, json=repo()))
    respx.get(ISSUES_URL).mock(
        return_value=httpx.Response(200, json=[
            issue(12, title="Keyboard navigation"),
            issue(13, title="Database migration"),
        ])
    )

    by_title = api.get(f"/api/maintainer/repositories/{REPO}/issues", params={"q": "keyboard"}).json()
    assert [item["number"] for item in by_title["items"]] == [12]

    by_number = api.get(f"/api/maintainer/repositories/{REPO}/issues", params={"q": "#13"}).json()
    assert [item["number"] for item in by_number["items"]] == [13]


@respx.mock
def test_an_issue_that_already_has_a_bounty_says_so(api: TestClient) -> None:
    assert publish(api).status_code == 200
    respx.get(ISSUES_URL).mock(return_value=httpx.Response(200, json=[issue(12)]))

    body = api.get(f"/api/maintainer/repositories/{REPO}/issues").json()

    assert body["items"][0]["existing"]["points"] == 40
    assert body["items"][0]["existing"]["status"] == "published"


@respx.mock
def test_a_repository_that_has_been_renamed_or_deleted_is_reported_clearly(api: TestClient) -> None:
    respx.get("https://api.github.com/repos/gone/away").mock(return_value=httpx.Response(404, json={}))

    response = api.get("/api/maintainer/repositories/gone/away/issues")

    assert response.status_code == 404
    assert "renamed, transferred or deleted" in response.json()["detail"]


# --- publishing -----------------------------------------------------------


@respx.mock
def test_publishing_writes_the_bounty_the_issue_and_an_audit_entry(api: TestClient) -> None:
    assert publish(api, points=40, category="docs").json() == {"published": 1, "repositories": 1}

    bounties = query("select repo_full_name, issue_number, points, status from issue_points")
    assert [tuple(row) for row in bounties] == [(REPO, 12, 40, "published")]

    issues = query("select number, category, category_source from issues")
    assert [tuple(row) for row in issues] == [(12, "docs", "maintainer")]

    history = query("select action, points_before, points_after, actor_login from issue_points_history")
    assert [tuple(row) for row in history] == [("published", None, 40, DEV_LOGIN)]


@respx.mock
def test_the_bounty_appears_in_the_public_explorer_only_while_published(api: TestClient) -> None:
    publish(api)
    assert [item["number"] for item in api.get("/api/issues").json()["items"]] == [12]

    respx.get(REPO_URL).mock(return_value=httpx.Response(200, json=repo()))
    api.patch(f"/api/maintainer/bounties/{REPO}/12", json={"status": "unpublished"})

    assert api.get("/api/issues").json()["items"] == []


@respx.mock
def test_an_organisation_maintainer_can_publish(api: TestClient) -> None:
    org_repo = repo(
        full_name="some-org/project",
        owner_login="some-org",
        owner_type="Organization",
        permissions={"admin": False, "maintain": True, "push": True},
        repo_id=200,
    )
    respx.get("https://api.github.com/repos/some-org/project").mock(
        return_value=httpx.Response(200, json=org_repo)
    )
    respx.get("https://api.github.com/repos/some-org/project/issues").mock(
        return_value=httpx.Response(200, json=[issue(5)])
    )

    response = api.post(
        "/api/maintainer/bounties",
        json={"issues": [{"repository": "some-org/project", "number": 5, "points": 40, "category": "backend"}]},
    )

    assert response.status_code == 200


@respx.mock
def test_someone_without_maintain_permission_cannot_publish(api: TestClient) -> None:
    pushable = repo(
        full_name="some-org/project",
        owner_login="some-org",
        owner_type="Organization",
        permissions={"admin": False, "maintain": False, "push": True},
        repo_id=200,
    )
    respx.get("https://api.github.com/repos/some-org/project").mock(
        return_value=httpx.Response(200, json=pushable)
    )

    response = api.post(
        "/api/maintainer/bounties",
        json={"issues": [{"repository": "some-org/project", "number": 5, "points": 40, "category": "backend"}]},
    )

    assert response.status_code == 403
    assert "admin or maintain" in response.json()["detail"]


@respx.mock
def test_the_client_cannot_assert_ownership_it_does_not_have(api: TestClient) -> None:
    """GitHub decides. A repository GitBounty has never heard of is refused on GitHub's answer alone."""
    respx.get("https://api.github.com/repos/torvalds/linux").mock(return_value=httpx.Response(404, json={}))

    response = api.post(
        "/api/maintainer/bounties",
        json={"issues": [{"repository": "torvalds/linux", "number": 1, "points": 1000, "category": "backend"}]},
    )

    assert response.status_code == 404
    assert query("select count(*) from issue_points")[0][0] == 0


@respx.mock
def test_an_issue_that_is_no_longer_open_is_refused(api: TestClient) -> None:
    respx.get(REPO_URL).mock(return_value=httpx.Response(200, json=repo()))
    respx.get(ISSUES_URL).mock(return_value=httpx.Response(200, json=[]))

    response = api.post(
        "/api/maintainer/bounties",
        json={"issues": [{"repository": REPO, "number": 12, "points": 40, "category": "backend"}]},
    )

    assert response.status_code == 400
    assert "no longer open" in response.json()["detail"]


@respx.mock
def test_a_private_repository_is_refused_with_an_explanation(api: TestClient) -> None:
    respx.get(REPO_URL).mock(return_value=httpx.Response(200, json=repo(private=True)))

    response = api.post(
        "/api/maintainer/bounties",
        json={"issues": [{"repository": REPO, "number": 12, "points": 40, "category": "backend"}]},
    )

    assert response.status_code == 400
    assert "Private repositories" in response.json()["detail"]


@pytest.mark.parametrize("points", [0, -1, 1001, 100_000])
def test_a_bounty_value_outside_the_bounds_is_refused_by_the_api(api: TestClient, points: int) -> None:
    """MAX_ISSUE_POINTS used to be None. 100,000 points on a trivial issue was the documented cheat."""
    response = api.post(
        "/api/maintainer/bounties",
        json={"issues": [{"repository": REPO, "number": 12, "points": points, "category": "backend"}]},
    )
    assert response.status_code == 422


@pytest.mark.parametrize(
    "repository",
    ["notarepo", "a/b/c", "../../etc/passwd", "owner/repo?x=1", "owner /repo"],
)
def test_a_repository_name_that_is_not_owner_slash_name_is_refused(api: TestClient, repository: str) -> None:
    response = api.post(
        "/api/maintainer/bounties",
        json={"issues": [{"repository": repository, "number": 1, "points": 10, "category": "backend"}]},
    )
    assert response.status_code == 422


def test_the_same_issue_cannot_be_selected_twice_in_one_batch(api: TestClient) -> None:
    response = api.post(
        "/api/maintainer/bounties",
        json={"issues": [
            {"repository": REPO, "number": 12, "points": 40, "category": "backend"},
            {"repository": REPO.upper(), "number": 12, "points": 90, "category": "docs"},
        ]},
    )
    assert response.status_code == 400
    assert "only once" in response.json()["detail"]


# --- the lifecycle --------------------------------------------------------


@respx.mock
def test_a_bounty_can_be_repriced_and_the_change_is_audited(api: TestClient) -> None:
    publish(api, points=40)
    respx.get(REPO_URL).mock(return_value=httpx.Response(200, json=repo()))

    response = api.patch(f"/api/maintainer/bounties/{REPO}/12", json={"points": 75, "reason": "Bigger than it looked."})

    assert response.status_code == 200
    assert response.json()["points"] == 75
    history = query(
        "select action, points_before, points_after, reason from issue_points_history order by id"
    )
    assert [tuple(row) for row in history] == [
        ("published", None, 40, "Published from the maintainer workspace."),
        ("repriced", 40, 75, "Bigger than it looked."),
    ]


@respx.mock
def test_a_bounty_can_be_unpublished_and_republished(api: TestClient) -> None:
    publish(api)
    respx.get(REPO_URL).mock(return_value=httpx.Response(200, json=repo()))

    unpublished = api.patch(f"/api/maintainer/bounties/{REPO}/12", json={"status": "unpublished"})
    assert unpublished.json()["status"] == "unpublished"

    republished = api.patch(f"/api/maintainer/bounties/{REPO}/12", json={"status": "published"})
    assert republished.json()["status"] == "published"

    actions = [row["action"] for row in query("select action from issue_points_history order by id")]
    assert actions == ["published", "unpublished", "republished"]


@respx.mock
def test_archiving_keeps_the_row_rather_than_deleting_it(api: TestClient) -> None:
    publish(api)
    respx.get(REPO_URL).mock(return_value=httpx.Response(200, json=repo()))

    api.patch(f"/api/maintainer/bounties/{REPO}/12", json={"status": "archived"})

    rows = query("select status from issue_points")
    assert [row["status"] for row in rows] == ["archived"], "nothing is deleted"


@respx.mock
def test_changing_a_category_records_it_as_the_maintainers_choice(api: TestClient) -> None:
    publish(api, category="backend")
    respx.get(REPO_URL).mock(return_value=httpx.Response(200, json=repo()))

    response = api.patch(f"/api/maintainer/bounties/{REPO}/12", json={"category": "design"})

    assert response.json()["category"] == "design"
    rows = query("select category, category_source from issues")
    assert [tuple(row) for row in rows] == [("design", "maintainer")]


@respx.mock
def test_a_change_that_changes_nothing_is_refused(api: TestClient) -> None:
    publish(api, points=40)
    respx.get(REPO_URL).mock(return_value=httpx.Response(200, json=repo()))

    response = api.patch(f"/api/maintainer/bounties/{REPO}/12", json={"points": 40})

    assert response.status_code == 400
    assert "Nothing to change" in response.json()["detail"]


@respx.mock
def test_editing_a_bounty_for_a_repository_you_no_longer_maintain_is_refused(api: TestClient) -> None:
    """Losing maintain permission on an organisation repository ends the ability to change its bounties.

    An organisation repository, because for a repository you personally own GitHub saying "not admin" would
    contradict itself -- `can_publish_bounties` treats personal ownership as sufficient on purpose.
    """
    org = "some-org/project"
    org_url = f"https://api.github.com/repos/{org}"
    maintaining = repo(
        full_name=org, owner_login="some-org", owner_type="Organization",
        permissions={"admin": False, "maintain": True, "push": True}, repo_id=200,
    )
    respx.get(org_url).mock(return_value=httpx.Response(200, json=maintaining))
    respx.get(f"{org_url}/issues").mock(return_value=httpx.Response(200, json=[issue(12)]))
    assert api.post(
        "/api/maintainer/bounties",
        json={"issues": [{"repository": org, "number": 12, "points": 40, "category": "backend"}]},
    ).status_code == 200

    respx.get(org_url).mock(
        return_value=httpx.Response(
            200,
            json=repo(
                full_name=org, owner_login="some-org", owner_type="Organization",
                permissions={"admin": False, "maintain": False, "push": True}, repo_id=200,
            ),
        )
    )

    response = api.patch(f"/api/maintainer/bounties/{org}/12", json={"points": 900})

    assert response.status_code == 403
    assert query("select points from issue_points")[0]["points"] == 40


@respx.mock
def test_editing_a_bounty_that_does_not_exist_is_a_404(api: TestClient) -> None:
    respx.get(REPO_URL).mock(return_value=httpx.Response(200, json=repo()))

    response = api.patch(f"/api/maintainer/bounties/{REPO}/999", json={"points": 10})

    assert response.status_code == 404


@respx.mock
@pytest.mark.parametrize("points", [0, 1001])
def test_an_edit_cannot_put_the_value_outside_the_bounds(api: TestClient, points: int) -> None:
    publish(api)
    respx.get(REPO_URL).mock(return_value=httpx.Response(200, json=repo()))

    assert api.patch(f"/api/maintainer/bounties/{REPO}/12", json={"points": points}).status_code == 422


# --- listing and history --------------------------------------------------


@respx.mock
def test_a_maintainer_sees_the_bounties_they_published(api: TestClient) -> None:
    publish(api, number=12, points=40)
    respx.get(REPO_URL).mock(return_value=httpx.Response(200, json=repo(open_issues_count=2)))
    respx.get(ISSUES_URL).mock(return_value=httpx.Response(200, json=[issue(13)]))
    api.post(
        "/api/maintainer/bounties",
        json={"issues": [{"repository": REPO, "number": 13, "points": 10, "category": "docs"}]},
    )

    body = api.get("/api/maintainer/bounties").json()

    assert body["total"] == 2
    assert {item["issue_number"] for item in body["items"]} == {12, 13}
    assert all(item["awarded"] is False for item in body["items"])

    published_only = api.get("/api/maintainer/bounties", params={"status": "published"}).json()
    assert published_only["total"] == 2


@respx.mock
def test_the_bounty_history_is_readable_by_its_maintainer(api: TestClient) -> None:
    publish(api, points=40)
    respx.get(REPO_URL).mock(return_value=httpx.Response(200, json=repo()))
    api.patch(f"/api/maintainer/bounties/{REPO}/12", json={"points": 60, "reason": "Scope grew."})

    body = api.get(f"/api/maintainer/bounties/{REPO}/12/history").json()

    assert [entry["action"] for entry in body["entries"]] == ["repriced", "published"]
    assert body["entries"][0]["points_before"] == 40
    assert body["entries"][0]["points_after"] == 60
    assert body["entries"][0]["actor_login"] == DEV_LOGIN


@respx.mock
def test_the_history_of_a_repository_you_do_not_maintain_is_refused(api: TestClient) -> None:
    respx.get("https://api.github.com/repos/some-org/project").mock(
        return_value=httpx.Response(
            200,
            json=repo(
                full_name="some-org/project", owner_login="some-org", owner_type="Organization",
                permissions={"admin": False, "maintain": False, "push": True}, repo_id=200,
            ),
        )
    )

    response = api.get("/api/maintainer/bounties/some-org/project/12/history")

    assert response.status_code == 403
