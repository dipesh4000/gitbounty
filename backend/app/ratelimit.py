"""Rate limiting.

GitBounty had none. A public endpoint without one is a free denial-of-service target, and the expensive
endpoints here are expensive in somebody else's budget: a synchronisation makes one GitHub request per
pull request, against the signed-in user's own GitHub rate limit.

**Identity first, address second.** A signed-in request is limited by its user id, so one person cannot
get more by changing networks and a shared office address is not one bucket for everybody. Only an
unauthenticated request falls back to the client address, and that fallback is deliberately generous:
limiting an address too tightly punishes everybody behind one NAT or one university.

The counter is a fixed window held **in this process**. That is honest for what GitBounty is -- one
instance, not deployed -- and it is written down in docs/security.md: more than one instance
needs a shared store (Redis) or the limit is multiplied by the number of instances. The interface here
does not change if that happens.
"""

from __future__ import annotations

import logging
import time
from dataclasses import dataclass, field

from starlette.middleware.base import BaseHTTPMiddleware, RequestResponseEndpoint
from starlette.requests import Request
from starlette.responses import JSONResponse, Response

from .config import settings

logger = logging.getLogger("gitbounty.ratelimit")


@dataclass(frozen=True)
class Limit:
    """`requests` allowed per `window_seconds`, for one caller."""

    requests: int
    window_seconds: int

    def __str__(self) -> str:
        return f"{self.requests}/{self.window_seconds}s"


#: Per route group. The order matters: the first matching prefix wins, so the specific ones come first.
#:
#: Synchronisation is the tightest: each run makes many GitHub requests, and running it more than a few
#: times a minute achieves nothing because nothing has changed. Publishing is a write with a GitHub
#: round trip behind it. OAuth is limited to blunt a flood of state-generating requests. The list
#: endpoints are generous -- they are reads a page makes several of.
RULES: tuple[tuple[str, Limit], ...] = (
    ("/api/me/sync", Limit(6, 60)),
    ("/api/maintainer/bounties", Limit(30, 60)),
    ("/api/maintainer/repositories", Limit(60, 60)),
    # Reporting is cheap but a flood of reports is its own kind of abuse.
    ("/api/moderation/flags", Limit(20, 60)),
    ("/auth/github", Limit(20, 60)),
    ("/test-auth/", Limit(60, 60)),
    ("/api/leaderboard", Limit(120, 60)),
    ("/api/issues", Limit(120, 60)),
    ("/api/me", Limit(240, 60)),
)

#: Never limited: an operator's health probe must not be the thing that trips.
EXEMPT_PREFIXES = ("/health", "/ready", "/docs", "/openapi.json", "/redoc")


@dataclass
class _Window:
    started: float
    count: int = 0


@dataclass
class FixedWindowLimiter:
    """A fixed-window counter. Small, predictable, and good enough at this size."""

    _windows: dict[tuple[str, str], _Window] = field(default_factory=dict)
    #: Clear out expired entries occasionally so an idle process does not grow without bound.
    _last_swept: float = field(default_factory=time.monotonic)

    def check(self, key: str, caller: str, limit: Limit, now: float | None = None) -> int | None:
        """Count one request. Returns None when allowed, or the seconds to wait when not."""
        now = time.monotonic() if now is None else now
        self._sweep(now)

        window = self._windows.get((key, caller))
        if window is None or now - window.started >= limit.window_seconds:
            self._windows[(key, caller)] = _Window(started=now, count=1)
            return None

        window.count += 1
        if window.count > limit.requests:
            return max(1, int(limit.window_seconds - (now - window.started)) + 1)
        return None

    def _sweep(self, now: float) -> None:
        if now - self._last_swept < 300:
            return
        self._last_swept = now
        longest = max(limit.window_seconds for _, limit in RULES)
        self._windows = {
            key: window for key, window in self._windows.items()
            if now - window.started < longest
        }

    def reset(self) -> None:
        self._windows.clear()


def rule_for(path: str) -> tuple[str, Limit] | None:
    for prefix, limit in RULES:
        if path.startswith(prefix):
            return prefix, limit
    return None


def caller_for(request: Request) -> str:
    """Who is being limited: the signed-in user where there is one, otherwise the client address.

    Identity first, because it is the thing that cannot be changed by reconnecting. The address fallback
    reads the socket's peer, **not** X-Forwarded-For -- that header is attacker-controlled unless a proxy
    is known to rewrite it, and trusting it would let anybody reset their own counter at will. A
    deployment behind a proxy must configure the proxy headers explicitly; see docs/security.md.
    """
    session = request.scope.get("session") or {}
    user_id = session.get("user_id")
    if user_id:
        return f"user:{user_id}"
    client = request.client.host if request.client else "unknown"
    return f"ip:{client}"


#: The process-wide counter. Module level so a test can reset it between cases, and so a future shared
#: store can be swapped in at one place.
limiter = FixedWindowLimiter()


class RateLimitMiddleware(BaseHTTPMiddleware):
    """Refuse a caller who is asking too often, with a Retry-After they can act on."""

    def __init__(self, app, counter: FixedWindowLimiter | None = None) -> None:
        super().__init__(app)
        self.limiter = counter or limiter

    async def dispatch(self, request: Request, call_next: RequestResponseEndpoint) -> Response:
        path = request.url.path
        if request.method == "OPTIONS" or path.startswith(EXEMPT_PREFIXES):
            return await call_next(request)

        rule = rule_for(path)
        if rule is None:
            return await call_next(request)

        prefix, limit = rule
        # Scaled only in a test environment; `rate_limit_multiplier` is 1 anywhere else whatever the
        # setting says. A journey that runs nine syncs in a few seconds is a test, not a person.
        multiplier = settings.rate_limit_multiplier
        if multiplier > 1:
            limit = Limit(limit.requests * multiplier, limit.window_seconds)
        caller = caller_for(request)
        retry_after = self.limiter.check(prefix, caller, limit)
        if retry_after is None:
            return await call_next(request)

        logger.warning(
            "rate limit reached",
            extra={
                "event": "ratelimit.rejected",
                "path": path,
                # The bucket, not the person: a user id is fine, an address is not logged in full.
                "caller_kind": caller.split(":", 1)[0],
                "limit": str(limit),
                "retry_after": retry_after,
            },
        )
        return JSONResponse(
            {
                "detail": (
                    f"Too many requests to this endpoint. The limit is {limit.requests} "
                    f"per {limit.window_seconds} seconds. Try again in {retry_after} seconds."
                ),
                "retry_after_seconds": retry_after,
            },
            status_code=429,
            headers={
                "Retry-After": str(retry_after),
                "X-RateLimit-Limit": str(limit.requests),
                "X-RateLimit-Window": str(limit.window_seconds),
            },
        )
