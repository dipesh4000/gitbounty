"""Rate limiting, and what it must never do.

Two things matter beyond "it counts": that a signed-in caller is limited by identity rather than by
address, and that a health probe is never the thing that trips.
"""

from __future__ import annotations

import pytest
from fastapi.testclient import TestClient

from app.config import settings
from app.main import app
from app.ratelimit import RULES, FixedWindowLimiter, Limit, caller_for, limiter, rule_for


# --- the counter itself ---------------------------------------------------


def test_it_allows_the_limit_and_refuses_the_next_one() -> None:
    counter = FixedWindowLimiter()
    limit = Limit(3, 60)

    assert [counter.check("/x", "a", limit, now=0) for _ in range(3)] == [None, None, None]
    retry = counter.check("/x", "a", limit, now=0)

    assert retry is not None and 1 <= retry <= 61


def test_the_window_rolls_over() -> None:
    counter = FixedWindowLimiter()
    limit = Limit(1, 60)

    assert counter.check("/x", "a", limit, now=0) is None
    assert counter.check("/x", "a", limit, now=1) is not None, "still inside the window"
    assert counter.check("/x", "a", limit, now=61) is None, "a new window"


def test_one_caller_running_out_does_not_affect_another() -> None:
    counter = FixedWindowLimiter()
    limit = Limit(1, 60)

    counter.check("/x", "a", limit, now=0)
    assert counter.check("/x", "a", limit, now=0) is not None
    assert counter.check("/x", "b", limit, now=0) is None, "a different caller has their own budget"


def test_each_endpoint_has_its_own_budget() -> None:
    counter = FixedWindowLimiter()
    limit = Limit(1, 60)

    counter.check("/api/me/sync", "a", limit, now=0)
    assert counter.check("/api/me/sync", "a", limit, now=0) is not None
    assert counter.check("/api/issues", "a", limit, now=0) is None


def test_the_retry_after_is_the_time_left_in_the_window() -> None:
    counter = FixedWindowLimiter()
    limit = Limit(1, 60)

    counter.check("/x", "a", limit, now=100)
    retry = counter.check("/x", "a", limit, now=145)

    assert retry is not None and 15 <= retry <= 17, "about fifteen seconds left"


# --- which rule applies ---------------------------------------------------


@pytest.mark.parametrize(
    ("path", "expected_prefix"),
    [
        ("/api/me/sync", "/api/me/sync"),
        ("/api/me/sync?full=true", "/api/me/sync"),
        ("/api/me/points", "/api/me"),
        ("/api/me/pull-requests", "/api/me"),
        ("/api/issues/sync", "/api/issues/sync"),
        ("/api/issues", "/api/issues"),
        ("/api/leaderboard", "/api/leaderboard"),
        ("/api/maintainer/bounties", "/api/maintainer/bounties"),
        ("/auth/github/callback", "/auth/github"),
    ],
)
def test_the_most_specific_rule_wins(path: str, expected_prefix: str) -> None:
    rule = rule_for(path)
    assert rule is not None, path
    assert rule[0] == expected_prefix


def test_syncing_is_limited_more_tightly_than_reading() -> None:
    """A sync makes one GitHub request per pull request, against the user's own GitHub budget."""
    sync = dict(RULES)["/api/me/sync"]
    read = dict(RULES)["/api/leaderboard"]
    assert sync.requests < read.requests


def test_an_unknown_path_is_not_limited() -> None:
    assert rule_for("/something/else") is None


# --- who gets limited -----------------------------------------------------


class _Request:
    def __init__(self, session=None, host="10.0.0.1", forwarded=None):
        self.scope = {"session": session or {}}
        self.client = type("C", (), {"host": host})()
        self.headers = {"X-Forwarded-For": forwarded} if forwarded else {}


def test_a_signed_in_caller_is_limited_by_identity_not_address() -> None:
    """Identity cannot be changed by reconnecting, and a shared office address is not one bucket."""
    assert caller_for(_Request(session={"user_id": 17})) == "user:17"
    assert caller_for(_Request(session={"user_id": 17}, host="203.0.113.9")) == "user:17"


def test_an_anonymous_caller_falls_back_to_the_address() -> None:
    assert caller_for(_Request()) == "ip:10.0.0.1"


def test_a_forwarded_for_header_is_ignored() -> None:
    """It is attacker-controlled unless a proxy is known to rewrite it. Trusting it would let anybody
    reset their own counter at will."""
    assert caller_for(_Request(forwarded="1.2.3.4")) == "ip:10.0.0.1"


# --- through the app ------------------------------------------------------


@pytest.fixture
def client(monkeypatch: pytest.MonkeyPatch) -> TestClient:
    monkeypatch.setattr(settings, "dev_login_stub_enabled", False)
    monkeypatch.setattr(settings, "dev_github_login", "")
    limiter.reset()
    with TestClient(app) as test_client:
        yield test_client
    limiter.reset()


def test_a_health_probe_is_never_the_thing_that_trips(client: TestClient) -> None:
    for _ in range(300):
        assert client.get("/health").status_code == 200


def test_too_many_requests_gets_a_429_a_retry_after_and_a_readable_reason(client: TestClient) -> None:
    limit = dict(RULES)["/api/leaderboard"]

    last = None
    for _ in range(limit.requests + 1):
        last = client.get("/api/leaderboard")

    assert last is not None and last.status_code == 429
    assert int(last.headers["Retry-After"]) >= 1
    assert last.headers["X-RateLimit-Limit"] == str(limit.requests)
    body = last.json()
    assert "Too many requests" in body["detail"]
    assert str(limit.requests) in body["detail"], "the reason names the actual limit"
    assert body["retry_after_seconds"] >= 1


def test_a_rejection_names_no_caller_and_leaks_nothing(client: TestClient) -> None:
    limit = dict(RULES)["/api/leaderboard"]
    for _ in range(limit.requests + 1):
        response = client.get("/api/leaderboard")

    text = response.text
    assert "testclient" not in text and "127.0.0.1" not in text


def test_the_limit_is_per_endpoint_through_the_app(client: TestClient) -> None:
    limit = dict(RULES)["/api/leaderboard"]
    for _ in range(limit.requests + 1):
        client.get("/api/leaderboard")

    assert client.get("/api/leaderboard").status_code == 429
    # A different endpoint has its own budget, and answers on its own merits.
    assert client.get("/health").status_code == 200


def test_a_preflight_is_never_rate_limited(client: TestClient) -> None:
    """A browser sends one before many requests; counting them would halve every real limit."""
    for _ in range(300):
        response = client.options(
            "/api/leaderboard",
            headers={"Origin": "http://localhost:3000", "Access-Control-Request-Method": "GET"},
        )
        assert response.status_code != 429
