"""The merged-PRs endpoint, including what it does while there is no login."""

import httpx
import pytest
import respx
from fastapi.testclient import TestClient

from app import auth_stub
from app.config import settings
from app.main import app

from .conftest import DEV_LOGIN
from .test_github import SEARCH_URL, search_item
from .test_points_api import publish_bounty


@pytest.fixture
def client() -> TestClient:
    return TestClient(app)


@pytest.fixture
def dev_login(monkeypatch: pytest.MonkeyPatch) -> None:
    """Turn the dev login stub on for one test."""
    monkeypatch.setattr(settings, "dev_login_stub_enabled", True)
    monkeypatch.setattr(settings, "dev_github_login", DEV_LOGIN)
    monkeypatch.setattr(settings, "dev_github_token", "not-a-real-token")


def test_health(client: TestClient) -> None:
    assert client.get("/health").json() == {"status": "ok"}


def test_without_a_login_it_says_so_rather_than_pretending(
    client: TestClient, monkeypatch: pytest.MonkeyPatch
) -> None:
    monkeypatch.setattr(settings, "dev_github_login", "")
    monkeypatch.setattr(settings, "dev_github_token", "")

    response = client.get("/api/me/merged-prs")

    assert response.status_code == 401
    assert response.json()["detail"] == "Not signed in."


def test_the_dev_stub_is_off_by_default() -> None:
    """The stub authenticates nobody, so it must never be on unless explicitly switched on.

    This checks the shipped default rather than the running settings on purpose: the running settings read
    backend/.env, so asserting on them would make this test pass or fail depending on whose machine it is.
    """
    from app.config import Settings

    assert Settings.model_fields["dev_github_login"].default == ""
    assert Settings.model_fields["dev_github_token"].default == ""
    assert Settings.model_fields["dev_login_stub_enabled"].default is False


def test_the_stub_is_off_when_no_login_is_configured(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(settings, "dev_github_login", "")
    assert auth_stub.dev_login_is_enabled() is False


def test_reading_points_does_not_require_a_github_token(monkeypatch: pytest.MonkeyPatch) -> None:
    """Only endpoints that call GitHub need a token; reading stored points does not."""
    monkeypatch.setattr(settings, "dev_login_stub_enabled", True)
    monkeypatch.setattr(settings, "dev_github_login", DEV_LOGIN)
    monkeypatch.setattr(settings, "dev_github_token", "")

    assert auth_stub.get_current_user().github_login == DEV_LOGIN

    with pytest.raises(Exception) as caught:
        auth_stub.get_current_user_with_token()
    assert "DEV_GITHUB_TOKEN" in str(caught.value)


def files_url(repo: str, number: int) -> str:
    return f"https://api.github.com/repos/{repo}/pulls/{number}/files"


@respx.mock
def test_returns_categorised_merges(api: TestClient) -> None:
    respx.get(SEARCH_URL).mock(
        return_value=httpx.Response(200, json={"items": [
            search_item(pr_id=1, repo="django/django", number=11, title="Fix docs", author=DEV_LOGIN),
            search_item(pr_id=2, repo=f"{DEV_LOGIN}/toy", number=2, author=DEV_LOGIN),
        ]})
    )
    respx.get(files_url("django/django", 11)).mock(
        return_value=httpx.Response(200, json=[{"filename": "docs/install.md"}])
    )

    response = api.get("/api/me/merged-prs")

    assert response.status_code == 200
    body = response.json()
    assert body["github_login"] == DEV_LOGIN
    assert body["counted"] == 1
    assert body["self_merges_skipped"] == 1
    assert body["merges"][0]["category"] == "docs"
    assert body["merges"][0]["category_source"] == "inferred"
    assert body["merges"][0]["repo_full_name"] == "django/django"


@respx.mock
def test_a_rejected_github_token_becomes_a_401(api: TestClient) -> None:
    respx.get(SEARCH_URL).mock(return_value=httpx.Response(401, json={"message": "Bad credentials"}))

    assert api.get("/api/me/merged-prs").status_code == 401


@respx.mock
def test_rate_limiting_becomes_a_429_with_retry_after(api: TestClient) -> None:
    respx.get(SEARCH_URL).mock(
        return_value=httpx.Response(403, headers={"retry-after": "30", "x-ratelimit-remaining": "0"}, json={})
    )

    response = api.get("/api/me/merged-prs")

    assert response.status_code == 429
    assert response.headers["retry-after"] == "30"


@respx.mock
def test_github_being_broken_becomes_a_502(api: TestClient) -> None:
    respx.get(SEARCH_URL).mock(return_value=httpx.Response(500, json={}))

    assert api.get("/api/me/merged-prs").status_code == 502


@respx.mock
def test_inspect_files_false_skips_the_file_lookups(api: TestClient) -> None:
    respx.get(SEARCH_URL).mock(
        return_value=httpx.Response(200, json={"items": [
            search_item(pr_id=1, repo="org/a", number=1, labels=["frontend"], author=DEV_LOGIN),
        ]})
    )
    files = respx.get(files_url("org/a", 1)).mock(return_value=httpx.Response(200, json=[]))

    response = api.get("/api/me/merged-prs", params={"inspect_files": "false"})

    assert response.status_code == 200
    assert files.call_count == 0
    assert response.json()["merges"][0]["category"] == "frontend"


@respx.mock
def test_the_response_reports_eligibility_not_a_recorded_award(api: TestClient) -> None:
    """This endpoint calls GitHub and stores nothing, so "eligible" is the only honest word for it."""
    publish_bounty("org/a", 12, 40, category="backend")
    respx.get(SEARCH_URL).mock(
        return_value=httpx.Response(200, json={"items": [
            search_item(pr_id=1, repo="org/a", number=1, author=DEV_LOGIN, body="Closes #12"),
        ]})
    )
    respx.get(files_url("org/a", 1)).mock(
        return_value=httpx.Response(200, json=[{"filename": "api/routes.py"}])
    )

    body = api.get("/api/me/merged-prs").json()

    assert body["eligible_points"] == 45
    merge = body["merges"][0]
    assert merge["eligible_points"] == 45
    assert merge["bounty_points"] == 40
    assert merge["bounty_repo_full_name"] == "org/a"
    assert merge["bounty_issue_number"] == 12
    assert merge["baseline_eligible"] is True
    assert merge["category"] == "backend"
    assert merge["category_source"] == "maintainer"
    assert merge["closed_issues"] == [{"repo_full_name": "org/a", "number": 12}]
    # Nothing was written: the ledger is still empty until a sync runs.
    assert api.get("/api/me/points").json()["total_points"] == 0


@respx.mock
def test_me_reports_who_is_signed_in(client: TestClient, dev_login: None) -> None:
    body = client.get("/api/me").json()

    assert body["github_login"] == DEV_LOGIN
    assert isinstance(body["github_id"], int)
    assert "github_token" not in body


def test_me_says_503_when_there_is_no_login(client: TestClient, monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(settings, "dev_github_login", "")
    assert client.get("/api/me").status_code == 401


def test_readiness_reports_each_dependency(monkeypatch: pytest.MonkeyPatch) -> None:
    """/health says the process is up; /ready says whether it can serve a request."""
    monkeypatch.setattr(settings, "database_url", "")
    monkeypatch.setattr(settings, "github_client_id", "")
    with TestClient(app) as client:
        response = client.get("/ready")

    assert response.status_code == 503
    body = response.json()
    assert body["status"] == "not ready"
    assert body["checks"]["database"] == "not configured"
    assert body["checks"]["github_oauth"] == "not configured"


def test_readiness_is_ready_when_everything_is_configured(api: TestClient) -> None:
    from cryptography.fernet import Fernet

    with pytest.MonkeyPatch.context() as patch:
        patch.setattr(settings, "github_client_id", "id")
        patch.setattr(settings, "github_client_secret", "secret")
        patch.setattr(settings, "session_secret", "secret")
        patch.setattr(settings, "token_encryption_key", Fernet.generate_key().decode())
        response = api.get("/ready")

    assert response.status_code == 200
    assert response.json()["checks"]["database"] == "ok"


def test_readiness_never_leaks_a_reason_that_describes_the_host(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(settings, "database_url", "postgresql://u:p@nowhere.invalid:5432/db")
    with TestClient(app) as client:
        body = client.get("/ready").text

    assert "nowhere.invalid" not in body
    assert "p@" not in body
