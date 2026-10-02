"""A sign-in path that exists only for automated tests.

An end-to-end test has to get past the front door, and it cannot complete a real GitHub authorization --
that needs a human at github.com. This gives a test harness a way in **without** reintroducing the
hard-coded demo login that was deleted, and without any path to it from a deployed build.

Three independent conditions must all hold, and the default of each is the safe one:

  1. ``GITBOUNTY_ENVIRONMENT`` must be exactly ``test``. It defaults to ``production``, so an unset
     variable is not a test environment -- a typo, a missing value or an empty string all fail closed.
  2. ``GITBOUNTY_TEST_AUTH_SECRET`` must be set to something at least 16 characters long. It defaults to empty.
  3. The request must present that secret in the ``X-GitBounty-Test-Auth`` header, compared in constant
     time.

If any one of them fails the route answers **404**, not 403: a deployed build should not even admit the
endpoint exists. The router is also only mounted when the first two hold, so in any other configuration
the path is not routed at all.

This differs from the old demo login in the ways that matter. It authenticates a *real database row*
rather than a hard-coded identity; it is not reachable from the website, which has no code that calls it;
it cannot be switched on by one variable; and it issues an ordinary session, so everything downstream --
CSRF, authorization, the ledger -- behaves exactly as it does for a real user. It grants no GitHub token
unless the caller supplies one, so it cannot be used to reach GitHub as somebody else.
"""

from __future__ import annotations

import logging
import secrets

from fastapi import APIRouter, Header, HTTPException, Request, status
from pydantic import BaseModel, Field

from .auth import SESSION_CSRF_KEY, SESSION_USER_KEY
from .config import settings
from .crypto import encrypt
from .db import DatabaseNotConfigured, pool

logger = logging.getLogger(__name__)

TEST_AUTH_HEADER = "X-GitBounty-Test-Auth"
MINIMUM_SECRET_LENGTH = 16

router = APIRouter(tags=["test only"], include_in_schema=False)


def is_enabled() -> bool:
    """Whether the test sign-in path may be mounted at all.

    Both conditions are explicit and both default to the safe answer. There is deliberately no way to
    satisfy this by accident: "production" is not "test", and an empty secret is not a secret.
    """
    return (
        settings.environment == "test"
        and len(settings.test_auth_secret) >= MINIMUM_SECRET_LENGTH
    )


def warn_if_enabled() -> None:
    """Say so loudly at startup, the same way the development login stub does."""
    if is_enabled():
        logger.warning(
            "TEST SIGN-IN IS MOUNTED: POST /test-auth/session can create a session for any GitHub id. "
            "This exists for automated tests and must never be reachable outside one."
        )
    elif settings.test_auth_secret and settings.environment != "test":
        # Somebody set the secret but not the environment. Tell them, rather than silently doing nothing.
        logger.warning(
            "GITBOUNTY_TEST_AUTH_SECRET is set but GITBOUNTY_ENVIRONMENT is %r, not 'test'. "
            "The test sign-in path is NOT mounted.",
            settings.environment,
        )


class TestSessionRequest(BaseModel):
    """Who to sign in. A real users row is created or updated, exactly as OAuth would."""

    github_id: int = Field(gt=0)
    github_login: str = Field(min_length=1, max_length=100)
    name: str | None = None
    avatar_url: str | None = None
    #: A GitHub token for this session. Omitted means no token, so nothing can reach GitHub as this user.
    github_token: str | None = None


class TestSessionResponse(BaseModel):
    id: int
    github_login: str
    csrf_token: str


def _authorise(provided: str | None) -> None:
    if not is_enabled():
        # Not 403. A build that is not a test environment should not admit this exists.
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Not Found")
    if not provided or not secrets.compare_digest(provided, settings.test_auth_secret):
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Not Found")


@router.post("/test-auth/session", response_model=TestSessionResponse)
async def create_test_session(
    request: Request,
    body: TestSessionRequest,
    test_auth: str | None = Header(default=None, alias=TEST_AUTH_HEADER),
) -> TestSessionResponse:
    """Create a real session for a real user row. Test environments only."""
    _authorise(test_auth)

    try:
        db_pool = pool()
    except DatabaseNotConfigured as error:
        raise HTTPException(status.HTTP_503_SERVICE_UNAVAILABLE, str(error)) from error

    async with db_pool.acquire() as connection:
        row = await connection.fetchrow(
            """
            insert into users (github_id, github_login, name, avatar_url, github_access_token, last_login_at)
            values ($1, $2, $3, $4, $5, now())
            on conflict (github_id) do update set
                github_login = excluded.github_login,
                name = excluded.name,
                avatar_url = excluded.avatar_url,
                github_access_token = excluded.github_access_token,
                updated_at = now(),
                last_login_at = now()
            returning id
            """,
            body.github_id,
            body.github_login,
            body.name,
            body.avatar_url,
            encrypt(body.github_token) if body.github_token else None,
        )

    # The same session shape OAuth produces, so everything downstream behaves identically.
    request.session.clear()
    request.session[SESSION_USER_KEY] = row["id"]
    csrf = secrets.token_urlsafe(32)
    request.session[SESSION_CSRF_KEY] = csrf

    logger.warning("test sign-in used for github_login=%s", body.github_login)
    return TestSessionResponse(id=row["id"], github_login=body.github_login, csrf_token=csrf)
