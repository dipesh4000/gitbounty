"""Maintainer repository inspection and bounty publication."""

from contextlib import contextmanager

import httpx
import pytest
import respx
from fastapi.testclient import TestClient

from app.auth import CurrentUser, get_current_user_with_token
from app.main import app
from app.routes import maintainer

REPO_URL = "https://api.github.com/repos/aasha-malik/gitbounty"
ISSUES_URL = f"{REPO_URL}/issues"
USER_REPOS_URL = "https://api.github.com/users/aasha-malik/repos"


def user() -> CurrentUser:
    return CurrentUser(id=7, github_id=42, github_login="aasha-malik", github_token="token")


@contextmanager
def signed_in_client():
    app.dependency_overrides[get_current_user_with_token] = user
    try:
        yield TestClient(app)
    finally:
        app.dependency_overrides.clear()


def repo(*, owner_type: str = "User", permissions: dict | None = None) -> dict:
    return {
        "id": 100,
        "full_name": "aasha-malik/gitbounty",
        "private": False,
        "owner": {"login": "aasha-malik", "type": owner_type},
        "permissions": permissions or {"admin": True, "push": True},
        "language": "Python",
        "description": "Reward open-source work",
        "stargazers_count": 12,
        "created_at": "2026-01-01T00:00:00Z",
        "has_issues": True,
        "open_issues_count": 1,
    }


def issue(number: int = 12) -> dict:
    return {
        "id": 900 + number,
        "number": number,
        "title": "Add repository bounty controls",
        "html_url": f"https://github.com/aasha-malik/gitbounty/issues/{number}",
        "labels": [{"name": "backend"}],
        "comments": 2,
        "created_at": "2026-09-01T00:00:00Z",
        "updated_at": "2026-09-25T00:00:00Z",
    }


@respx.mock
def test_owner_sees_open_issues_from_personal_repositories() -> None:
    respx.get(USER_REPOS_URL).mock(return_value=httpx.Response(200, json=[repo()]))
    respx.get(ISSUES_URL).mock(return_value=httpx.Response(200, json=[issue()]))

    with signed_in_client() as client:
        response = client.get("/api/maintainer/issues")

    assert response.status_code == 200
    assert response.json()["repository_count"] == 1
    assert response.json()["items"][0]["repository"] == "aasha-malik/gitbounty"
    assert response.json()["items"][0]["suggested_category"] == "backend"


@respx.mock
def test_user_cannot_publish_for_organization_repository() -> None:
    payload = repo(owner_type="Organization", permissions={"admin": True, "maintain": True, "push": True})
    payload["owner"] = {"login": "some-org", "type": "Organization"}
    payload["full_name"] = "some-org/project"
    respx.get("https://api.github.com/repos/some-org/project").mock(return_value=httpx.Response(200, json=payload))

    with signed_in_client() as client:
        response = client.post(
            "/api/maintainer/bounties",
            json={"issues": [{"repository": "some-org/project", "number": 12, "points": 40, "category": "backend"}]},
        )

    assert response.status_code == 403


@respx.mock
def test_publish_refetches_issue_and_writes_bounty(monkeypatch: pytest.MonkeyPatch) -> None:
    respx.get(REPO_URL).mock(return_value=httpx.Response(200, json=repo()))
    respx.get(ISSUES_URL).mock(return_value=httpx.Response(200, json=[issue()]))

    class Transaction:
        async def __aenter__(self):
            return self

        async def __aexit__(self, *_args):
            return None

    class Connection:
        def __init__(self):
            self.executions: list[tuple[str, tuple]] = []

        async def fetchval(self, *_args):
            return 3

        async def execute(self, sql, *args):
            self.executions.append((sql, args))

        def transaction(self):
            return Transaction()

    connection = Connection()

    class Acquire:
        async def __aenter__(self):
            return connection

        async def __aexit__(self, *_args):
            return None

    class Pool:
        def acquire(self):
            return Acquire()

    monkeypatch.setattr(maintainer, "pool", lambda: Pool())

    with signed_in_client() as client:
        response = client.post(
            "/api/maintainer/bounties",
            json={"issues": [{"repository": "aasha-malik/gitbounty", "number": 12, "points": 40, "category": "backend"}]},
        )

    assert response.status_code == 200
    assert response.json() == {"published": 1, "repositories": 1}
    assert len(connection.executions) == 2
    assert connection.executions[1][1] == ("aasha-malik/gitbounty", 12, 40, 7)
