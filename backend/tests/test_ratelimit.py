"""Rate-limit boundaries: isolation, rule selection, caller identity, and HTTP response."""

import pytest
from fastapi.testclient import TestClient

from app.config import Settings, settings
from app.main import app
from app.ratelimit import (
    RULES,
    FixedWindowLimiter,
    Limit,
    caller_for,
    limiter,
    rule_for,
)


def test_counter_isolates_callers_and_paths_then_rolls_over() -> None:
    counter = FixedWindowLimiter()
    limit = Limit(1, 60)
    assert counter.check("/x", "a", limit, now=0) is None
    assert counter.check("/x", "a", limit, now=1) is not None
    assert counter.check("/x", "b", limit, now=1) is None
    assert counter.check("/y", "a", limit, now=1) is None
    assert counter.check("/x", "a", limit, now=61) is None


@pytest.mark.parametrize(
    ("path", "prefix"),
    [
        ("/api/me/sync?full=true", "/api/me/sync"),
        ("/api/me/points", "/api/me"),
        ("/api/issues", "/api/issues"),
        ("/api/maintainer/bounties", "/api/maintainer/bounties"),
        ("/auth/github/callback", "/auth/github"),
    ],
)
def test_most_specific_rule_wins(path: str, prefix: str) -> None:
    assert rule_for(path)[0] == prefix


class _Request:
    def __init__(self, session=None, host="10.0.0.1", forwarded=None):
        self.scope = {"session": session or {}}
        self.client = type("Client", (), {"host": host})()
        self.headers = {"X-Forwarded-For": forwarded} if forwarded else {}


def test_caller_uses_session_identity_and_ignores_forwarded_headers() -> None:
    assert (
        caller_for(_Request(session={"user_id": 17}, host="203.0.113.9")) == "user:17"
    )
    assert caller_for(_Request(forwarded="1.2.3.4")) == "ip:10.0.0.1"


@pytest.fixture
def client(monkeypatch: pytest.MonkeyPatch) -> TestClient:
    monkeypatch.setattr(settings, "dev_login_stub_enabled", False)
    monkeypatch.setattr(settings, "dev_github_login", "")
    limiter.reset()
    with TestClient(app) as test_client:
        yield test_client
    limiter.reset()


def test_app_returns_a_bounded_429_without_affecting_health(client: TestClient) -> None:
    limit = dict(RULES)["/api/leaderboard"]
    for _ in range(limit.requests + 1):
        response = client.get("/api/leaderboard")
    assert response.status_code == 429
    assert int(response.headers["Retry-After"]) >= 1
    assert response.headers["X-RateLimit-Limit"] == str(limit.requests)
    assert "testclient" not in response.text
    assert client.get("/health").status_code == 200


def test_test_multiplier_only_loosens_limits_in_exact_test_environment() -> None:
    assert Settings(rate_limit_scale=50).rate_limit_multiplier == 1
    assert (
        Settings(
            rate_limit_scale=50, GITBOUNTY_ENVIRONMENT="Test"
        ).rate_limit_multiplier
        == 1
    )
    assert (
        Settings(
            rate_limit_scale=50, GITBOUNTY_ENVIRONMENT="test"
        ).rate_limit_multiplier
        == 50
    )
    assert (
        Settings(rate_limit_scale=0, GITBOUNTY_ENVIRONMENT="test").rate_limit_multiplier
        == 1
    )
