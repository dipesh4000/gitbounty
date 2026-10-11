"""Structured logging and request-id boundaries."""

import json
import logging

import pytest
from fastapi.testclient import TestClient

from app.config import settings
from app.main import app
from app.observability import REQUEST_ID_HEADER, JsonFormatter, request_id, scrub


def _record(message: str = "hello", **extra) -> logging.LogRecord:
    result = logging.LogRecord(
        "gitbounty.test", logging.INFO, __file__, 1, message, (), None
    )
    for key, value in extra.items():
        setattr(result, key, value)
    return result


def test_formatter_emits_one_structured_line_with_context_and_errors() -> None:
    token = request_id.set("abc123")
    try:
        line = JsonFormatter().format(
            _record("done", event="sync.succeeded", points=45)
        )
    finally:
        request_id.reset(token)
    payload = json.loads(line)
    assert "\n" not in line
    assert {"level", "logger", "message", "time", "request_id"} <= payload.keys()
    assert (
        payload["message"],
        payload["event"],
        payload["points"],
        payload["request_id"],
    ) == ("done", "sync.succeeded", 45, "abc123")
    try:
        raise ValueError("failed safely")
    except ValueError:
        import sys

        record = _record("failed")
        record.exc_info = sys.exc_info()
    error = json.loads(JsonFormatter().format(record))
    assert (error["error_type"], error["error"]) == ("ValueError", "failed safely")
    assert "Traceback" not in json.dumps(error)


def test_scrub_redacts_sensitive_keys_strings_and_nested_values() -> None:
    cleaned = scrub(
        {
            "Cookie": "session=value",
            "outer": {"github_access_token": "gho_abcdefghijklmnopqrstuvwxyz012345"},
            "message": "connecting to postgresql://user:hunter2@db.example.com/x",
        }
    )
    assert cleaned["Cookie"] == "[redacted]"
    assert cleaned["outer"]["github_access_token"] == "[redacted]"
    assert "hunter2" not in cleaned["message"]


@pytest.fixture
def client(monkeypatch: pytest.MonkeyPatch) -> TestClient:
    from app.ratelimit import limiter

    monkeypatch.setattr(settings, "dev_login_stub_enabled", False)
    monkeypatch.setattr(settings, "dev_github_login", "")
    limiter.reset()
    with TestClient(app) as test_client:
        yield test_client


def test_request_ids_are_unique_honor_valid_input_and_replace_hostile_input(
    client: TestClient,
) -> None:
    first = client.get("/health").headers[REQUEST_ID_HEADER]
    second = client.get("/health").headers[REQUEST_ID_HEADER]
    assert first and first != second
    assert (
        client.get("/health", headers={REQUEST_ID_HEADER: "trace-abc-123"}).headers[
            REQUEST_ID_HEADER
        ]
        == "trace-abc-123"
    )
    for hostile in ("a b", "x" * 100, "a\nb", "<script>"):
        assert (
            client.get("/health", headers={REQUEST_ID_HEADER: hostile}).headers[
                REQUEST_ID_HEADER
            ]
            != hostile
        )


def test_request_log_keeps_path_status_and_duration_without_query(
    client: TestClient, caplog
) -> None:
    with caplog.at_level(logging.INFO, logger="gitbounty.request"):
        client.get("/api/leaderboard?category=docs&period=week")
    entry = next(
        record
        for record in caplog.records
        if getattr(record, "event", None) == "request"
    )
    assert (entry.path, entry.method) == ("/api/leaderboard", "GET")
    assert isinstance(entry.status, int)
    assert isinstance(entry.duration_ms, float)
    assert "category=docs" not in json.dumps(vars(entry), default=str)


def test_health_and_readiness_do_not_leak_connection_details(
    client: TestClient,
) -> None:
    assert client.get("/health").json() == {"status": "ok"}
    ready = client.get("/ready")
    assert set(ready.json()["checks"]) >= {
        "database",
        "github_oauth",
        "session_secret",
        "token_encryption",
    }
    assert not any(
        value in ready.text
        for value in (
            "postgres://",
            "postgresql://",
            "Traceback",
            "asyncpg",
            "localhost:5440",
        )
    )


async def test_readiness_detects_the_missing_reward_schema(monkeypatch):
    from contextlib import asynccontextmanager
    from fastapi import Response
    import app.main as main

    class Connection:
        async def fetchval(self, query):
            assert "reward_allocations" in query and "webhook_deliveries" in query
            return False

    class Pool:
        @asynccontextmanager
        async def acquire(self):
            yield Connection()

    monkeypatch.setattr(main, "is_configured", lambda: True)
    monkeypatch.setattr(main, "pool", lambda: Pool())
    response = Response()
    result = await main.ready(response)
    assert response.status_code == 503
    assert result["checks"]["database"] == "schema incomplete"
