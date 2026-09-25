"""Security and browser-contract tests for Nishika's GitHub OAuth flow."""

from urllib.parse import parse_qs, urlparse

import pytest
from cryptography.fernet import Fernet
from fastapi.testclient import TestClient

from app import auth
from app.config import settings
from app.crypto import decrypt, encrypt
from app.main import app


@pytest.fixture
def oauth_config(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(settings, "github_client_id", "client-id")
    monkeypatch.setattr(settings, "github_client_secret", "client-secret")
    monkeypatch.setattr(settings, "session_secret", "test-session-secret")
    monkeypatch.setattr(settings, "token_encryption_key", Fernet.generate_key().decode())
    monkeypatch.setattr(settings, "frontend_url", "http://localhost:8000")
    monkeypatch.setattr(auth, "_require_oauth_configuration", lambda: None)


def test_login_redirect_uses_read_user_scope_and_one_time_state(oauth_config: None) -> None:
    with TestClient(app) as client:
        response = client.get("/auth/github", follow_redirects=False)

    assert response.status_code == 302
    query = parse_qs(urlparse(response.headers["location"]).query)
    assert query["client_id"] == ["client-id"]
    assert query["scope"] == ["read:user"]
    assert len(query["state"][0]) >= 32


def test_callback_rejects_missing_or_mismatched_state_before_using_code(oauth_config: None) -> None:
    with TestClient(app) as client:
        assert client.get("/auth/github/callback?code=code&state=attacker").status_code == 400

        login = client.get("/auth/github", follow_redirects=False)
        expected = parse_qs(urlparse(login.headers["location"]).query)["state"][0]
        assert client.get("/auth/github/callback?code=code&state=wrong").status_code == 400
        # The expected state was consumed, so replaying it is rejected too.
        assert client.get(f"/auth/github/callback?code=code&state={expected}").status_code == 400


def test_callback_stores_user_and_returns_to_workspace(
    oauth_config: None, monkeypatch: pytest.MonkeyPatch
) -> None:
    class FakeConnection:
        async def fetchrow(self, *_args: object) -> dict[str, int]:
            return {"id": 17}

    class FakeAcquire:
        async def __aenter__(self) -> FakeConnection:
            return FakeConnection()

        async def __aexit__(self, *_args: object) -> None:
            return None

    class FakePool:
        def acquire(self) -> FakeAcquire:
            return FakeAcquire()

    async def exchange_code_for_token(_code: str) -> str:
        return "github-token"

    async def get_authenticated_user(_token: str) -> dict[str, object]:
        return {"id": 42, "login": "aasha-malik", "name": "Aasha Malik", "avatar_url": None}

    monkeypatch.setattr(auth, "pool", lambda: FakePool())
    monkeypatch.setattr(auth.github_oauth, "exchange_code_for_token", exchange_code_for_token)
    monkeypatch.setattr(auth.github_oauth, "get_authenticated_user", get_authenticated_user)

    with TestClient(app) as client:
        login = client.get("/auth/github", follow_redirects=False)
        expected = parse_qs(urlparse(login.headers["location"]).query)["state"][0]
        callback = client.get(
            f"/auth/github/callback?code=code&state={expected}", follow_redirects=False
        )

    assert callback.status_code == 302
    assert callback.headers["location"] == "http://localhost:8000/explore"


def test_github_token_is_encrypted_at_rest(oauth_config: None) -> None:
    ciphertext = encrypt("gho_secret")
    assert ciphertext != "gho_secret"
    assert "gho_secret" not in ciphertext
    assert decrypt(ciphertext) == "gho_secret"


def test_me_never_returns_the_dev_token(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(settings, "dev_login_stub_enabled", True)
    monkeypatch.setattr(settings, "dev_github_login", "nishika")
    monkeypatch.setattr(settings, "dev_github_id", 42)
    monkeypatch.setattr(settings, "dev_github_token", "never-send-this")
    with TestClient(app) as client:
        response = client.get("/api/me")

    assert response.status_code == 200
    assert response.json() == {
        "id": 0,
        "github_id": 42,
        "github_login": "nishika",
        "name": None,
        "avatar_url": None,
    }
    assert "never-send-this" not in response.text
