"""Cookie-session writes require CSRF; browser preflights cover every routed method."""

from urllib.parse import parse_qs, urlparse

import pytest
from cryptography.fernet import Fernet
from fastapi.testclient import TestClient

from app import auth
from app.config import settings
from app.csrf import CSRF_HEADER
from app.main import app, declared_methods


@pytest.fixture
def signed_in(monkeypatch: pytest.MonkeyPatch) -> TestClient:
    monkeypatch.setattr(settings, "session_secret", "test-session-secret")
    monkeypatch.setattr(
        settings, "token_encryption_key", Fernet.generate_key().decode()
    )
    monkeypatch.setattr(settings, "dev_login_stub_enabled", False)
    monkeypatch.setattr(settings, "dev_github_login", "")

    class FakeConnection:
        async def connection(self, *, execution_options):
            assert execution_options == {"isolation_level": "AUTOCOMMIT"}
            return self

        async def scalar(self, statement):
            from sqlalchemy.sql.dml import Insert
            from app.orm import User

            if isinstance(statement, Insert):
                return 17
            return User(
                id=17,
                github_id=42,
                github_login="aastha-malik",
                name=None,
                avatar_url=None,
                github_access_token=__import__(
                    "app.crypto", fromlist=["encrypt"]
                ).encrypt("gho_test"),
            )

        async def commit(self):
            pass

        async def execute(self, *_args):
            pass

    class FakeAcquire:
        async def __aenter__(self):
            return FakeConnection()

        async def __aexit__(self, *_args):
            pass

    class FakePool:
        def acquire(self):
            return FakeAcquire()

    monkeypatch.setattr(auth, "pool", lambda: FakePool())
    monkeypatch.setattr(auth, "session", lambda: FakeAcquire())

    async def exchange(_code):
        return "github-token"

    async def user(_token):
        return {"id": 42, "login": "aastha-malik", "name": None, "avatar_url": None}

    monkeypatch.setattr(auth.github_oauth, "exchange_code_for_token", exchange)
    monkeypatch.setattr(auth.github_oauth, "get_authenticated_user", user)
    monkeypatch.setattr(settings, "github_client_id", "client-id")
    monkeypatch.setattr(settings, "github_client_secret", "client-secret")

    with TestClient(app) as client:
        login = client.get("/auth/github", follow_redirects=False)
        state = parse_qs(urlparse(login.headers["location"]).query)["state"][0]
        client.get(
            f"/auth/github/callback?code=code&state={state}", follow_redirects=False
        )
        yield client


def test_cookie_writes_require_the_stable_session_token(signed_in: TestClient) -> None:
    path = "/api/maintainer/bounties"
    assert signed_in.post(path, json={"issues": []}).status_code == 403
    assert (
        signed_in.post(
            path, json={"issues": []}, headers={CSRF_HEADER: "wrong"}
        ).status_code
        == 403
    )
    first = signed_in.get("/api/csrf").json()["csrf_token"]
    assert first == signed_in.get("/api/csrf").json()["csrf_token"]
    assert (
        signed_in.post(
            path, json={"issues": []}, headers={CSRF_HEADER: first}
        ).status_code
        == 422
    )
    assert signed_in.get("/api/me").status_code == 200
    assert signed_in.post("/auth/logout").status_code == 200


def test_cors_allows_every_routed_method_and_the_csrf_header() -> None:
    routed = {
        method
        for route in app.routes
        for method in (getattr(route, "methods", None) or ())
        if method not in {"HEAD", "OPTIONS"}
    }
    allowed = set(declared_methods())
    assert routed <= allowed and "OPTIONS" in allowed and "PATCH" in routed
    with TestClient(app) as client:
        for method in ("GET", "POST", "PATCH"):
            response = client.options(
                "/api/maintainer/bounties/owner/name/1",
                headers={
                    "Origin": "http://localhost:3000",
                    "Access-Control-Request-Method": method,
                    "Access-Control-Request-Headers": "content-type,x-gitbounty-csrf",
                },
            )
            assert response.status_code == 200
            assert method in response.headers["access-control-allow-methods"]
            assert (
                "x-gitbounty-csrf"
                in response.headers["access-control-allow-headers"].lower()
            )


def test_cors_does_not_allow_an_unlisted_origin() -> None:
    with TestClient(app) as client:
        response = client.options(
            "/api/maintainer/bounties",
            headers={
                "Origin": "https://evil.example",
                "Access-Control-Request-Method": "POST",
            },
        )
    assert "access-control-allow-origin" not in response.headers
