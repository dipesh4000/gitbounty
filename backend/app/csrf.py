"""Cross-site request forgery protection for the cookie-authenticated write endpoints.

The problem. The session is a cookie, and a browser attaches cookies to a request whatever page caused it.
A page on another site can submit a form to `POST /api/maintainer/bounties` and the browser will send the
GitBounty session cookie with it. CORS does not prevent that: it governs whether the *response* may be
read, not whether the request is made, and a form post needs no preflight at all.

The defence. A token kept in the signed session cookie, which the website reads from `GET /api/csrf` and
echoes in the `X-GitBounty-CSRF` header. An attacker's page cannot read the response of a cross-origin
request to `/api/csrf` (CORS does stop that), so it cannot learn the value. And a custom header cannot be
set on a plain form post at all -- adding one makes the request preflighted, which CORS then refuses for an
origin that is not on the allowlist.

Why not SameSite alone. `SameSite=Lax` already blocks a cross-site POST carrying the cookie in current
browsers, and it is set. This is the second lock: Lax depends on every supported browser getting it right,
on the cookie never being relaxed to `None` for an embedded surface, and on nobody adding a state-changing
GET. Defence in depth is cheap here.

What is exempt, and why:

  - Safe methods (GET, HEAD, OPTIONS). They must not change state; if one does, that is the bug.
  - `/auth/github` and `/auth/github/callback`. The callback is a top-level GET navigation from GitHub and
    cannot carry a header. OAuth `state` is what protects that flow, and it is verified.
  - `/auth/logout`. Forging a logout achieves nothing an attacker wants, and failing it would leave people
    unable to sign out from a stale page. (Still rejected for a request with no session at all.)
  - Requests with no session cookie. There is nothing to ride on.
"""

from __future__ import annotations

import secrets

from starlette.middleware.base import BaseHTTPMiddleware, RequestResponseEndpoint
from starlette.requests import Request
from starlette.responses import JSONResponse, Response

CSRF_HEADER = "X-GitBounty-CSRF"
SESSION_CSRF_KEY = "csrf_token"
SAFE_METHODS = frozenset({"GET", "HEAD", "OPTIONS", "TRACE"})
EXEMPT_PATHS = frozenset({"/auth/github", "/auth/github/callback", "/auth/logout", "/webhooks/github"})


class CsrfMiddleware(BaseHTTPMiddleware):
    """Reject a state-changing request from a session that cannot prove it meant to make it."""

    async def dispatch(self, request: Request, call_next: RequestResponseEndpoint) -> Response:
        if request.method in SAFE_METHODS or request.url.path in EXEMPT_PATHS:
            return await call_next(request)

        session = request.scope.get("session") or {}
        expected = session.get(SESSION_CSRF_KEY)
        if not session.get("user_id"):
            # No cookie session to forge against. Such a request is either unauthenticated (and will be
            # rejected on its own merits) or uses the development login stub, which has no cookie.
            return await call_next(request)

        provided = request.headers.get(CSRF_HEADER, "")
        if not expected or not provided or not secrets.compare_digest(provided, expected):
            return JSONResponse(
                {"detail": f"Missing or invalid {CSRF_HEADER} header. Fetch /api/csrf first."},
                status_code=403,
            )
        return await call_next(request)
