"""Structured logging, and a correlation id on every request.

Logging was `logging.basicConfig(level=INFO)`: readable by a person watching a terminal, useless to
anything else and impossible to correlate. This makes every line JSON with a request id attached, so one
request's path through the system can be followed and so a log aggregator can filter on a field rather
than a regular expression.

**What is never logged**: cookies, the `Authorization` header, OAuth codes, GitHub tokens, session
contents, `SESSION_SECRET`, `TOKEN_ENCRYPTION_KEY`, database URLs, or any request or response body. The
redaction below is a backstop, not the primary defence -- the primary defence is that nothing calls
`logger.info(body)`.
"""

from __future__ import annotations

import contextvars
import json
import logging
import re
import time
import uuid
from typing import Any

from starlette.middleware.base import BaseHTTPMiddleware, RequestResponseEndpoint
from starlette.requests import Request
from starlette.responses import Response

#: The current request's id, readable from anywhere without threading it through every call.
request_id: contextvars.ContextVar[str] = contextvars.ContextVar("request_id", default="-")

REQUEST_ID_HEADER = "X-Request-ID"

#: Keys whose values are replaced wherever they appear in a log record's extra fields.
SENSITIVE_KEYS = frozenset({
    "authorization", "cookie", "set-cookie", "token", "access_token", "github_token",
    "github_access_token", "code", "client_secret", "secret", "session", "password",
    "database_url", "csrf_token", "test_auth_secret", "x-gitbounty-test-auth",
})

#: Shapes that must never appear in a message even by accident.
_SECRET_PATTERNS = (
    re.compile(r"gh[pousr]_[A-Za-z0-9]{20,}"),                       # a GitHub token
    re.compile(r"postgres(?:ql)?://[^\s]*:[^\s]*@"),                 # a database URL with a password
    re.compile(r"\bBearer\s+[A-Za-z0-9._\-]{10,}", re.IGNORECASE),   # an Authorization header
)

REDACTED = "[redacted]"


def scrub(value: Any) -> Any:
    """Replace anything that looks like a credential. A backstop, not the primary defence."""
    if isinstance(value, str):
        for pattern in _SECRET_PATTERNS:
            value = pattern.sub(REDACTED, value)
        return value
    if isinstance(value, dict):
        return {
            key: (REDACTED if key.lower() in SENSITIVE_KEYS else scrub(item))
            for key, item in value.items()
        }
    if isinstance(value, (list, tuple)):
        return [scrub(item) for item in value]
    return value


class JsonFormatter(logging.Formatter):
    """One JSON object per line, with the request id and any structured fields the caller attached."""

    #: Everything LogRecord sets itself; anything else was put there by a caller via `extra=`.
    _STANDARD = frozenset(vars(logging.LogRecord("", 0, "", 0, "", (), None)))

    def format(self, record: logging.LogRecord) -> str:
        payload: dict[str, Any] = {
            "time": time.strftime("%Y-%m-%dT%H:%M:%S", time.gmtime(record.created)) + f".{int(record.msecs):03d}Z",
            "level": record.levelname,
            "logger": record.name,
            "message": scrub(record.getMessage()),
            "request_id": request_id.get(),
        }
        for key, value in vars(record).items():
            if key not in self._STANDARD and key not in {"message", "asctime", "taskName"}:
                payload[key] = scrub(value)
        if record.exc_info:
            # The type and the message, not the whole traceback: a traceback in a log line is unreadable
            # and can carry local variables. The traceback goes to stderr through the default handler.
            exception = record.exc_info[1]
            payload["error_type"] = type(exception).__name__ if exception else "unknown"
            payload["error"] = scrub(str(exception)) if exception else ""
        return json.dumps(payload, default=str)


def configure(level: str = "INFO", *, json_logs: bool = True) -> None:
    """Install the formatter on the root logger. Called once, at startup."""
    handler = logging.StreamHandler()
    handler.setFormatter(
        JsonFormatter() if json_logs
        else logging.Formatter("%(levelname)s %(name)s: %(message)s")
    )
    root = logging.getLogger()
    root.handlers.clear()
    root.addHandler(handler)
    root.setLevel(level.upper())
    # uvicorn's access log duplicates what RequestLoggingMiddleware records, without the request id.
    logging.getLogger("uvicorn.access").disabled = True


class RequestLoggingMiddleware(BaseHTTPMiddleware):
    """Give every request an id, log its outcome, and return the id to the caller.

    An inbound `X-Request-ID` is honoured so a request can be followed across a proxy, but only when it
    looks like an id -- an arbitrary header value would otherwise end up in every log line for that
    request, which is a log-injection hole.
    """

    _ID = re.compile(r"^[A-Za-z0-9._-]{1,64}$")

    async def dispatch(self, request: Request, call_next: RequestResponseEndpoint) -> Response:
        inbound = request.headers.get(REQUEST_ID_HEADER, "")
        identifier = inbound if self._ID.match(inbound) else uuid.uuid4().hex[:16]
        token = request_id.set(identifier)
        started = time.perf_counter()
        logger = logging.getLogger("gitbounty.request")

        try:
            response = await call_next(request)
        except Exception:
            logger.exception(
                "request failed",
                extra={
                    "event": "request.error",
                    "method": request.method,
                    # The path only: a query string can carry an OAuth code.
                    "path": request.url.path,
                    "duration_ms": round((time.perf_counter() - started) * 1000, 1),
                },
            )
            request_id.reset(token)
            raise

        duration = round((time.perf_counter() - started) * 1000, 1)
        logger.log(
            logging.WARNING if response.status_code >= 500 else logging.INFO,
            "request",
            extra={
                "event": "request",
                "method": request.method,
                "path": request.url.path,
                "status": response.status_code,
                "duration_ms": duration,
            },
        )
        response.headers[REQUEST_ID_HEADER] = identifier
        request_id.reset(token)
        return response
