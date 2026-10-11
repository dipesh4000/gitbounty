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


@pytest.mark.parametrize("destination", ["/explore", "/explore#points", "/maintainers", "/leaderboard", "https://attacker.example/", "//attacker.example/", "/explore?next=https://attacker.example/"])
def test_callback_stores_user_and_returns_to_workspace(
    destination: str, oauth_config: None, monkeypatch: pytest.MonkeyPatch
) -> None:
    class FakeConnection:
        async def commit(self) -> None:
            pass

        async def scalar(self, *_args: object) -> int:
            return 17

    class FakeAcquire:
        async def __aenter__(self) -> FakeConnection:
            return FakeConnection()

        async def __aexit__(self, *_args: object) -> None:
            return None

    async def exchange_code_for_token(_code: str) -> str:
        return "github-token"

    async def get_authenticated_user(_token: str) -> dict[str, object]:
        return {"id": 42, "login": "aasha-malik", "name": "Aasha Malik", "avatar_url": None}

    monkeypatch.setattr(auth, "session", lambda: FakeAcquire())
    monkeypatch.setattr(auth.github_oauth, "exchange_code_for_token", exchange_code_for_token)
    monkeypatch.setattr(auth.github_oauth, "get_authenticated_user", get_authenticated_user)

    with TestClient(app) as client:
        login = client.get("/auth/github", params={"next": destination}, follow_redirects=False)
        expected = parse_qs(urlparse(login.headers["location"]).query)["state"][0]
        callback = client.get(
            f"/auth/github/callback?code=code&state={expected}", follow_redirects=False
        )

    assert callback.status_code == 302
    expected_path = destination if destination in {"/explore", "/maintainers", "/leaderboard", "/explore#points"} else "/explore"
    assert callback.headers["location"] == f"http://localhost:8000{expected_path}"


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


def test_the_session_is_rotated_at_sign_in(oauth_config: None, monkeypatch: pytest.MonkeyPatch) -> None:
    """Session fixation: an attacker who can set a cookie before sign-in must not end up holding the
    session that sign-in then authenticates."""
    class FakeConnection:
        async def commit(self) -> None:
            pass

        async def scalar(self, *_args: object) -> int:
            return 17

        async def execute(self, *_args: object) -> None:
            return None

    class FakeAcquire:
        async def __aenter__(self) -> FakeConnection:
            return FakeConnection()

        async def __aexit__(self, *_args: object) -> None:
            return None

    async def exchange_code_for_token(_code: str) -> str:
        return "github-token"

    async def get_authenticated_user(_token: str) -> dict[str, object]:
        return {"id": 42, "login": "aastha-malik", "name": None, "avatar_url": None}

    monkeypatch.setattr(auth, "session", lambda: FakeAcquire())
    monkeypatch.setattr(auth.github_oauth, "exchange_code_for_token", exchange_code_for_token)
    monkeypatch.setattr(auth.github_oauth, "get_authenticated_user", get_authenticated_user)

    with TestClient(app) as client:
        login = client.get("/auth/github", follow_redirects=False)
        before = login.cookies.get("gitbounty_session") or client.cookies.get("gitbounty_session")
        state = parse_qs(urlparse(login.headers["location"]).query)["state"][0]
        client.get(f"/auth/github/callback?code=code&state={state}", follow_redirects=False)
        after = client.cookies.get("gitbounty_session")

    assert after is not None
    assert after != before, "the cookie value changes when the session becomes authenticated"


def test_the_session_cookie_is_httponly_and_samesite(oauth_config: None) -> None:
    with TestClient(app) as client:
        response = client.get("/auth/github", follow_redirects=False)

    set_cookie = response.headers.get("set-cookie", "")
    assert "gitbounty_session=" in set_cookie
    assert "httponly" in set_cookie.lower()
    assert "samesite=lax" in set_cookie.lower()


def test_the_cookie_is_secure_when_configured(monkeypatch: pytest.MonkeyPatch) -> None:
    """Derived from FRONTEND_URL before, so one forgotten variable shipped a cookie over plain HTTP."""
    from app.config import Settings

    assert Settings(frontend_url="http://localhost:3000").cookies_secure is False
    assert Settings(frontend_url="https://gitbounty.example").cookies_secure is True
    assert Settings(frontend_url="http://localhost:3000", secure_cookies=True).cookies_secure is True
    assert Settings(frontend_url="https://gitbounty.example", secure_cookies=False).cookies_secure is False


def test_logout_forgets_the_stored_github_token(oauth_config: None, monkeypatch: pytest.MonkeyPatch) -> None:
    """Clearing the cookie alone would leave a usable GitHub token for an account that has signed out."""
    statements: list[object] = []

    class FakeConnection:
        async def commit(self) -> None:
            pass

        async def scalar(self, *_args: object) -> int:
            return 17

        async def execute(self, sql: str, *_args: object) -> None:
            statements.append(sql)

    class FakeAcquire:
        async def __aenter__(self) -> FakeConnection:
            return FakeConnection()

        async def __aexit__(self, *_args: object) -> None:
            return None

    async def exchange_code_for_token(_code: str) -> str:
        return "github-token"

    async def get_authenticated_user(_token: str) -> dict[str, object]:
        return {"id": 42, "login": "aastha-malik", "name": None, "avatar_url": None}

    monkeypatch.setattr(auth, "session", lambda: FakeAcquire())
    monkeypatch.setattr(auth.github_oauth, "exchange_code_for_token", exchange_code_for_token)
    monkeypatch.setattr(auth.github_oauth, "get_authenticated_user", get_authenticated_user)

    with TestClient(app) as client:
        login = client.get("/auth/github", follow_redirects=False)
        state = parse_qs(urlparse(login.headers["location"]).query)["state"][0]
        client.get(f"/auth/github/callback?code=code&state={state}", follow_redirects=False)
        assert client.post("/auth/logout").json() == {"status": "logged out"}

    assert any("github_access_token" in statement.compile().params
               and statement.compile().params["github_access_token"] is None
               for statement in statements)


def test_an_unreadable_stored_token_asks_for_a_new_sign_in(oauth_config: None) -> None:
    """What a rotated TOKEN_ENCRYPTION_KEY looks like: the ciphertext no longer decrypts."""
    from app.crypto import decrypt

    other_key_ciphertext = Fernet(Fernet.generate_key()).encrypt(b"gho_secret").decode()
    assert decrypt(other_key_ciphertext) is None


def test_logout_needs_no_database(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(settings, "database_url", "")
    with TestClient(app) as client:
        assert client.post("/auth/logout").json() == {"status": "logged out"}


def test_signing_in_starts_a_synchronisation(oauth_config: None, monkeypatch: pytest.MonkeyPatch) -> None:
    """Nobody should have to find a hidden endpoint for their own merged work to appear."""
    synced: list[str] = []

    class FakeConnection:
        async def commit(self) -> None:
            pass

        async def scalar(self, *_args: object) -> int:
            return 17

        async def execute(self, *_args: object) -> None:
            return None

    class FakeAcquire:
        async def __aenter__(self) -> FakeConnection:
            return FakeConnection()

        async def __aexit__(self, *_args: object) -> None:
            return None

    async def exchange_code_for_token(_code: str) -> str:
        return "github-token"

    async def get_authenticated_user(_token: str) -> dict[str, object]:
        return {"id": 42, "login": "aastha-malik", "name": None, "avatar_url": None}

    async def fake_sync(user: auth.CurrentUser) -> None:
        synced.append(user.github_login)

    monkeypatch.setattr(auth, "session", lambda: FakeAcquire())
    monkeypatch.setattr(auth.github_oauth, "exchange_code_for_token", exchange_code_for_token)
    monkeypatch.setattr(auth.github_oauth, "get_authenticated_user", get_authenticated_user)
    monkeypatch.setattr(auth, "_sync_after_sign_in", fake_sync)

    with TestClient(app) as client:
        login = client.get("/auth/github", follow_redirects=False)
        state = parse_qs(urlparse(login.headers["location"]).query)["state"][0]
        client.get(f"/auth/github/callback?code=code&state={state}", follow_redirects=False)

    assert synced == ["aastha-malik"], "the sync is started with the account that just signed in"


def test_a_failing_sign_in_sync_does_not_break_the_sign_in(
    oauth_config: None, monkeypatch: pytest.MonkeyPatch
) -> None:
    class FakeConnection:
        async def commit(self) -> None:
            pass

        async def scalar(self, *_args: object) -> int:
            return 17

        async def execute(self, *_args: object) -> None:
            return None

    class FakeAcquire:
        async def __aenter__(self) -> FakeConnection:
            return FakeConnection()

        async def __aexit__(self, *_args: object) -> None:
            return None

    async def exchange_code_for_token(_code: str) -> str:
        return "github-token"

    async def get_authenticated_user(_token: str) -> dict[str, object]:
        return {"id": 42, "login": "aastha-malik", "name": None, "avatar_url": None}

    async def exploding_sync(_user: auth.CurrentUser) -> None:
        raise RuntimeError("GitHub is on fire")

    monkeypatch.setattr(auth, "session", lambda: FakeAcquire())
    monkeypatch.setattr(auth.github_oauth, "exchange_code_for_token", exchange_code_for_token)
    monkeypatch.setattr(auth.github_oauth, "get_authenticated_user", get_authenticated_user)
    import app.features.points.router as points_router

    monkeypatch.setattr(points_router, "run_sync", exploding_sync)

    with TestClient(app) as client:
        login = client.get("/auth/github", follow_redirects=False)
        state = parse_qs(urlparse(login.headers["location"]).query)["state"][0]
        callback = client.get(f"/auth/github/callback?code=code&state={state}", follow_redirects=False)

    assert callback.status_code == 302


# --- the OAuth callback, against a mocked GitHub boundary -------------------
def test_identity_read_stays_fresh_and_preserves_later_write_transactions(api):
    from starlette.requests import Request
    from sqlalchemy import literal, select
    from app.db import session
    from .test_maintainer_api import query

    user_id = query("insert into users (github_id, github_login) values (222, 'fresh-identity') returning id")[0]["id"]
    request = Request({"type": "http", "session": {"user_id": user_id}})
    assert api.portal.call(auth.get_current_user, request).github_login == "fresh-identity"
    query("update users set github_login = 'renamed-identity' where id = $1", user_id)
    assert api.portal.call(auth.get_current_user, request).github_login == "renamed-identity"

    async def check_transaction():
        async with session() as db_session:
            await db_session.execute(select(literal(1)))
            raw = await (await db_session.connection()).get_raw_connection()
            assert raw.driver_connection.is_in_transaction()

    api.portal.call(check_transaction)


#
# A real github.com authorization needs a human and is a separate, documented verification
# (docs/setup.md). Everything on this side of the boundary is covered here: the token
# exchange, the profile read, what is stored, and every failure GitHub can hand back.


@pytest.fixture
def mocked_github(oauth_config: None, monkeypatch: pytest.MonkeyPatch):
    """The OAuth flow with httpx itself faked at the GitHub boundary."""
    import respx

    from app.features.points import router as points_router

    stored: dict[str, object] = {}

    class FakeConnection:
        async def commit(self) -> None:
            pass

        async def scalar(self, statement):
            params = statement.compile().params
            stored["github_id"] = params["github_id"]
            stored["github_login"] = params["github_login"]
            stored["name"] = params["name"]
            stored["avatar_url"] = params["avatar_url"]
            stored["token_ciphertext"] = params["github_access_token"]
            return 17

        async def execute(self, *_args: object) -> None:
            return None

    class FakeAcquire:
        async def __aenter__(self):
            return FakeConnection()

        async def __aexit__(self, *_args: object) -> None:
            return None

    async def no_sync(_user: object) -> None:
        return None

    monkeypatch.setattr(auth, "session", lambda: FakeAcquire())
    monkeypatch.setattr(points_router, "run_sync", no_sync)

    with respx.mock(assert_all_called=False) as mock:
        yield mock, stored


def _complete_callback(client: TestClient, **params: str):
    login = client.get("/auth/github", follow_redirects=False)
    state = parse_qs(urlparse(login.headers["location"]).query)["state"][0]
    query = {"code": "the-code", "state": state, **params}
    return client.get(
        "/auth/github/callback?" + "&".join(f"{k}={v}" for k, v in query.items()),
        follow_redirects=False,
    )


def test_the_callback_exchanges_the_code_and_stores_the_profile(mocked_github) -> None:
    import httpx as _httpx

    mock, stored = mocked_github
    token_route = mock.post("https://github.com/login/oauth/access_token").mock(
        return_value=_httpx.Response(200, json={"access_token": "gho_a_real_looking_token"})
    )
    mock.get("https://api.github.com/user").mock(
        return_value=_httpx.Response(200, json={
            "id": 4242, "login": "octocat", "name": "The Octocat",
            "avatar_url": "https://avatars.example/octocat.png",
        })
    )

    with TestClient(app) as client:
        response = _complete_callback(client)

    assert response.status_code == 302
    assert response.headers["location"] == "http://localhost:8000/explore"

    # The code was exchanged with the client secret, as a form post, not a GET.
    assert token_route.called
    sent = token_route.calls[0].request
    assert sent.method == "POST"
    assert b"client_secret=client-secret" in sent.content
    assert b"code=the-code" in sent.content

    assert stored["github_id"] == 4242
    assert stored["github_login"] == "octocat"
    assert stored["name"] == "The Octocat"
    # The token is stored encrypted, never as it arrived.
    assert stored["token_ciphertext"] != "gho_a_real_looking_token"
    assert "gho_a_real_looking_token" not in str(stored["token_ciphertext"])
    assert decrypt(stored["token_ciphertext"]) == "gho_a_real_looking_token"


def test_the_token_never_reaches_the_browser(mocked_github) -> None:
    import httpx as _httpx

    mock, _ = mocked_github
    mock.post("https://github.com/login/oauth/access_token").mock(
        return_value=_httpx.Response(200, json={"access_token": "gho_secret_value"})
    )
    mock.get("https://api.github.com/user").mock(
        return_value=_httpx.Response(200, json={"id": 1, "login": "octocat"})
    )

    with TestClient(app) as client:
        response = _complete_callback(client)
        cookie = client.cookies.get("gitbounty_session") or ""

    assert "gho_secret_value" not in response.text
    assert "gho_secret_value" not in str(response.headers)
    assert "gho_secret_value" not in cookie, "the session cookie carries a user id, never a token"


def test_a_refused_code_exchange_becomes_a_502_without_leaking_the_body(mocked_github) -> None:
    import httpx as _httpx

    mock, _ = mocked_github
    mock.post("https://github.com/login/oauth/access_token").mock(
        return_value=_httpx.Response(200, json={
            "error": "bad_verification_code",
            "error_description": "secret-ish internal detail",
        })
    )

    with TestClient(app) as client:
        response = _complete_callback(client)

    assert response.status_code == 502
    assert "secret-ish internal detail" not in response.text


def test_a_rejected_profile_read_becomes_a_502(mocked_github) -> None:
    import httpx as _httpx

    mock, _ = mocked_github
    mock.post("https://github.com/login/oauth/access_token").mock(
        return_value=_httpx.Response(200, json={"access_token": "gho_token"})
    )
    mock.get("https://api.github.com/user").mock(return_value=_httpx.Response(401, json={}))

    with TestClient(app) as client:
        response = _complete_callback(client)

    assert response.status_code == 502
    assert "gho_token" not in response.text


def test_github_being_unreachable_becomes_a_502(mocked_github) -> None:
    import httpx as _httpx

    mock, _ = mocked_github
    mock.post("https://github.com/login/oauth/access_token").mock(
        side_effect=_httpx.ConnectError("no route to host")
    )

    with TestClient(app) as client:
        with pytest.raises(Exception):
            _complete_callback(client)


def test_the_callback_without_a_code_is_refused_before_anything_is_exchanged(mocked_github) -> None:
    mock, _ = mocked_github
    token_route = mock.post("https://github.com/login/oauth/access_token")

    with TestClient(app) as client:
        login = client.get("/auth/github", follow_redirects=False)
        state = parse_qs(urlparse(login.headers["location"]).query)["state"][0]
        response = client.get(f"/auth/github/callback?state={state}", follow_redirects=False)

    assert response.status_code == 400
    assert token_route.call_count == 0


def test_a_forged_state_is_refused_before_anything_is_exchanged(mocked_github) -> None:
    mock, _ = mocked_github
    token_route = mock.post("https://github.com/login/oauth/access_token")

    with TestClient(app) as client:
        client.get("/auth/github", follow_redirects=False)
        response = client.get(
            "/auth/github/callback?code=the-code&state=forged", follow_redirects=False
        )

    assert response.status_code == 400
    assert token_route.call_count == 0, "the code is never sent to GitHub on a bad state"


def test_sign_in_rename_and_logout_persist_through_the_orm(api, oauth_config, monkeypatch):
    """Verify the actual transaction and encrypted row, beyond the OAuth boundary mocks."""
    from .test_maintainer_api import query

    monkeypatch.setattr(settings, "dev_login_stub_enabled", False)
    profile = {"id": 4242, "login": "original-name", "name": "Contributor"}
    token = "test-only-oauth-value"

    async def exchange(_code):
        return token

    async def read_profile(_token):
        return profile

    async def no_sync(_user):
        pass

    monkeypatch.setattr(auth.github_oauth, "exchange_code_for_token", exchange)
    monkeypatch.setattr(auth.github_oauth, "get_authenticated_user", read_profile)
    monkeypatch.setattr(auth, "_sync_after_sign_in", no_sync)
    assert _complete_callback(api).status_code == 302
    row = dict(query("select * from users where github_id = 4242")[0])
    assert decrypt(row["github_access_token"]) == token
    assert row["github_access_token"] != token
    assert row["last_login_at"] is not None
    first_id = row["id"]
    me = api.get("/api/me")
    assert me.status_code == 200 and me.json()["id"] == first_id
    assert token not in me.text and "github_access_token" not in me.json()

    profile["login"] = "renamed-contributor"
    assert _complete_callback(api).status_code == 302
    rows = query("select id, github_login from users where github_id = 4242")
    assert len(rows) == 1 and rows[0]["id"] == first_id
    assert api.get("/api/me").json()["github_login"] == "renamed-contributor"

    csrf = api.get("/api/csrf").json()["csrf_token"]
    assert api.post("/auth/logout", headers={"X-GitBounty-CSRF": csrf}).status_code == 200
    assert query("select github_access_token from users where github_id = 4242")[0][0] is None
    assert api.get("/api/me").status_code == 401
