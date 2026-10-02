"""Structured logging, request ids, and the things that must never reach a log line."""

from __future__ import annotations

import json
import logging

import pytest
from fastapi.testclient import TestClient

from app.config import settings
from app.main import app
from app.observability import REQUEST_ID_HEADER, JsonFormatter, request_id, scrub


def record(message: str = "hello", **extra) -> logging.LogRecord:
    made = logging.LogRecord("gitbounty.test", logging.INFO, __file__, 1, message, (), None)
    for key, value in extra.items():
        setattr(made, key, value)
    return made


def formatted(message: str = "hello", **extra) -> dict:
    return json.loads(JsonFormatter().format(record(message, **extra)))


# --- the format -----------------------------------------------------------


def test_every_line_is_one_json_object_with_the_fields_a_log_aggregator_needs() -> None:
    line = JsonFormatter().format(record())
    assert "\n" not in line, "one line per record, or a parser cannot split them"

    payload = json.loads(line)
    assert payload["level"] == "INFO"
    assert payload["logger"] == "gitbounty.test"
    assert payload["message"] == "hello"
    assert payload["time"].endswith("Z")
    assert "request_id" in payload


def test_structured_fields_a_caller_attaches_are_kept() -> None:
    payload = formatted("sync finished", event="sync.succeeded", user_id=7, points_awarded=45)

    assert payload["event"] == "sync.succeeded"
    assert payload["user_id"] == 7
    assert payload["points_awarded"] == 45


def test_the_request_id_is_attached_from_the_context() -> None:
    token = request_id.set("abc123")
    try:
        assert formatted()["request_id"] == "abc123"
    finally:
        request_id.reset(token)


def test_an_exception_is_recorded_by_type_and_message_not_as_a_traceback() -> None:
    try:
        raise ValueError("something went wrong")
    except ValueError:
        import sys

        made = record("failed")
        made.exc_info = sys.exc_info()
        payload = json.loads(JsonFormatter().format(made))

    assert payload["error_type"] == "ValueError"
    assert payload["error"] == "something went wrong"
    assert "Traceback" not in json.dumps(payload)


# --- what must never be logged --------------------------------------------


@pytest.mark.parametrize(
    "key",
    ["authorization", "Cookie", "token", "github_token", "github_access_token", "code",
     "client_secret", "database_url", "csrf_token", "test_auth_secret", "password"],
)
def test_a_sensitive_field_is_replaced_whatever_its_case(key: str) -> None:
    assert scrub({key: "the-real-value"})[key] == "[redacted]"


def test_a_credential_shaped_string_is_replaced_even_inside_a_message() -> None:
    for secret, text in [
        ("gho_abcdefghijklmnopqrstuvwxyz012345", "token is gho_abcdefghijklmnopqrstuvwxyz012345 ok"),
        ("postgresql://user:hunter2@db.example.com/x", "connecting to postgresql://user:hunter2@db.example.com/x"),
        ("Bearer abcdefghijklmnop", "sent Bearer abcdefghijklmnop"),
    ]:
        cleaned = scrub(text)
        assert secret not in cleaned
        assert "[redacted]" in cleaned


def test_redaction_reaches_inside_nested_structures() -> None:
    cleaned = scrub({"outer": {"headers": {"cookie": "a=b"}, "list": ["gho_abcdefghijklmnopqrstuvwxyz012345"]}})

    assert cleaned["outer"]["headers"]["cookie"] == "[redacted]"
    assert "gho_" not in json.dumps(cleaned)


def test_a_record_carrying_a_token_in_a_field_is_redacted_on_the_way_out() -> None:
    payload = formatted("stored", github_token="gho_abcdefghijklmnopqrstuvwxyz012345")
    assert payload["github_token"] == "[redacted]"


# --- through the app ------------------------------------------------------


@pytest.fixture
def client(monkeypatch: pytest.MonkeyPatch) -> TestClient:
    from app.ratelimit import limiter

    monkeypatch.setattr(settings, "dev_login_stub_enabled", False)
    monkeypatch.setattr(settings, "dev_github_login", "")
    limiter.reset()
    with TestClient(app) as test_client:
        yield test_client


def test_every_response_carries_a_request_id(client: TestClient) -> None:
    response = client.get("/health")

    identifier = response.headers[REQUEST_ID_HEADER]
    assert identifier and identifier != "-"


def test_each_request_gets_its_own_id(client: TestClient) -> None:
    first = client.get("/health").headers[REQUEST_ID_HEADER]
    second = client.get("/health").headers[REQUEST_ID_HEADER]
    assert first != second


def test_an_inbound_request_id_is_honoured_so_a_request_can_be_followed_across_a_proxy(
    client: TestClient,
) -> None:
    response = client.get("/health", headers={REQUEST_ID_HEADER: "trace-abc-123"})
    assert response.headers[REQUEST_ID_HEADER] == "trace-abc-123"


@pytest.mark.parametrize("hostile", ["a b", "x" * 100, "a\nb", "<script>", "'; drop table users--"])
def test_an_implausible_inbound_id_is_replaced_rather_than_echoed(client: TestClient, hostile: str) -> None:
    """Otherwise an arbitrary header value ends up in every log line for that request."""
    response = client.get("/health", headers={REQUEST_ID_HEADER: hostile})
    assert response.headers[REQUEST_ID_HEADER] != hostile


def test_the_request_log_records_the_path_but_never_the_query_string(
    client: TestClient, caplog: pytest.LogCaptureFixture
) -> None:
    """A query string can carry an OAuth code."""
    with caplog.at_level(logging.INFO, logger="gitbounty.request"):
        client.get("/api/leaderboard?category=docs&period=week")

    entries = [r for r in caplog.records if getattr(r, "event", None) == "request"]
    assert entries, "the request was logged"
    assert entries[0].path == "/api/leaderboard"
    assert "category=docs" not in json.dumps(vars(entries[0]), default=str)


def test_the_request_log_carries_the_status_and_how_long_it_took(
    client: TestClient, caplog: pytest.LogCaptureFixture
) -> None:
    with caplog.at_level(logging.INFO, logger="gitbounty.request"):
        client.get("/health")

    entry = next(r for r in caplog.records if getattr(r, "event", None) == "request")
    assert entry.status == 200
    assert entry.method == "GET"
    assert isinstance(entry.duration_ms, float)


def test_health_and_ready_still_work_and_say_nothing_about_the_host(client: TestClient) -> None:
    assert client.get("/health").json() == {"status": "ok"}

    ready = client.get("/ready")
    body = ready.json()

    # It names each dependency and its state, which is the useful part for an operator...
    assert set(body["checks"]) >= {"database", "github_oauth", "session_secret", "token_encryption"}
    assert set(body["checks"].values()) <= {"ok", "configured", "not configured", "unreachable"}

    # ...and says nothing about the host, the driver, the credentials or the exception. The key
    # "session_secret" is a label; what must never appear is a value.
    text = ready.text
    for leak in ("postgres://", "postgresql://", "@", "Traceback", "asyncpg", "localhost:5440"):
        assert leak not in text, leak
