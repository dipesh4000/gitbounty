"""CSRF protection on the cookie-authenticated write endpoints.

The attack being prevented: a page on another site submits a form to a GitBounty write endpoint, and the
browser attaches the GitBounty session cookie because that is what browsers do. CORS does not stop the
request from being made, only the response from being read.
"""

from __future__ import annotations

import pytest
from cryptography.fernet import Fernet
from fastapi.testclient import TestClient

from app import auth
from app.config import settings
from app.csrf import CSRF_HEADER
from app.main import app


@pytest.fixture
def signed_in(monkeypatch: pytest.MonkeyPatch) -> TestClient:
    """A client holding a real cookie session, with the development stub off.

    The stub is off on purpose: it authenticates without a cookie, so a stubbed request has nothing for an
    attacker to ride on and is exempt. The protection being tested is the cookie path.
    """
    monkeypatch.setattr(settings, "session_secret", "test-session-secret")
    monkeypatch.setattr(settings, "token_encryption_key", Fernet.generate_key().decode())
    monkeypatch.setattr(settings, "dev_login_stub_enabled", False)
    monkeypatch.setattr(settings, "dev_github_login", "")

    class FakeConnection:
        async def fetchrow(self, sql: str, *args: object) -> dict[str, object]:
            if "insert into users" in sql:
                return {"id": 17}
            return {
                "id": 17,
                "github_id": 42,
                "github_login": "aastha-malik",
                "name": None,
                "avatar_url": None,
                # A readable token, so a request that gets past CSRF is rejected (or not) on its own
                # merits rather than for want of a token.
                "github_access_token": __import__("app.crypto", fromlist=["encrypt"]).encrypt("gho_test"),
            }

        async def execute(self, *_args: object) -> None:
            return None

    class FakeAcquire:
        async def __aenter__(self) -> FakeConnection:
            return FakeConnection()

        async def __aexit__(self, *_args: object) -> None:
            return None

    class FakePool:
        def acquire(self) -> FakeAcquire:
            return FakeAcquire()

    monkeypatch.setattr(auth, "pool", lambda: FakePool())

    async def exchange_code_for_token(_code: str) -> str:
        return "github-token"

    async def get_authenticated_user(_token: str) -> dict[str, object]:
        return {"id": 42, "login": "aastha-malik", "name": None, "avatar_url": None}

    monkeypatch.setattr(auth.github_oauth, "exchange_code_for_token", exchange_code_for_token)
    monkeypatch.setattr(auth.github_oauth, "get_authenticated_user", get_authenticated_user)
    monkeypatch.setattr(settings, "github_client_id", "client-id")
    monkeypatch.setattr(settings, "github_client_secret", "client-secret")

    client = TestClient(app)
    with client:
        from urllib.parse import parse_qs, urlparse

        login = client.get("/auth/github", follow_redirects=False)
        state = parse_qs(urlparse(login.headers["location"]).query)["state"][0]
        client.get(f"/auth/github/callback?code=code&state={state}", follow_redirects=False)
        yield client


def test_a_write_without_the_header_is_refused(signed_in: TestClient) -> None:
    response = signed_in.post("/api/maintainer/bounties", json={"issues": []})

    assert response.status_code == 403
    assert CSRF_HEADER in response.json()["detail"]


def test_a_write_with_the_wrong_token_is_refused(signed_in: TestClient) -> None:
    response = signed_in.post(
        "/api/maintainer/bounties",
        json={"issues": []},
        headers={CSRF_HEADER: "not-the-token"},
    )
    assert response.status_code == 403


def test_a_write_with_the_session_token_gets_past_csrf(signed_in: TestClient) -> None:
    token = signed_in.get("/api/csrf").json()["csrf_token"]

    response = signed_in.post(
        "/api/maintainer/bounties",
        json={"issues": []},
        headers={CSRF_HEADER: token},
    )
    # 422: the empty issue list fails validation, which is exactly the point -- it reached the endpoint.
    assert response.status_code == 422


def test_the_token_is_minted_at_sign_in_and_is_stable(signed_in: TestClient) -> None:
    first = signed_in.get("/api/csrf").json()["csrf_token"]
    second = signed_in.get("/api/csrf").json()["csrf_token"]
    assert first == second
    assert len(first) >= 32


def test_sync_is_also_protected(signed_in: TestClient) -> None:
    assert signed_in.post("/api/me/sync").status_code == 403


def test_reads_need_no_token(signed_in: TestClient) -> None:
    assert signed_in.get("/api/me").status_code == 200


def test_logout_is_exempt_so_a_stale_page_can_still_sign_out(signed_in: TestClient) -> None:
    assert signed_in.post("/auth/logout").status_code == 200


def test_the_oauth_callback_is_exempt_because_it_is_a_navigation(signed_in: TestClient) -> None:
    """A top-level GET from GitHub cannot carry a custom header. OAuth `state` protects that flow."""
    from app.csrf import EXEMPT_PATHS

    assert "/auth/github/callback" in EXEMPT_PATHS
    assert "/auth/github" in EXEMPT_PATHS


def test_an_unauthenticated_write_is_not_blocked_by_csrf_but_by_authentication(
    monkeypatch: pytest.MonkeyPatch
) -> None:
    """There is no session to forge against, so the request is rejected on its own merits."""
    monkeypatch.setattr(settings, "dev_login_stub_enabled", False)
    monkeypatch.setattr(settings, "dev_github_login", "")
    with TestClient(app) as client:
        response = client.post("/api/me/sync")
    assert response.status_code == 401
