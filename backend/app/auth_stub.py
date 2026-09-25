"""A stand-in for the GitHub Login feature, which is Nishika's and isn't built yet.

This exists so Merged PR Detection can be built and run now instead of waiting. It is deliberately crude: it reads
one user out of the environment and calls them logged in. It authenticates nobody.

When the real login lands, `get_current_user` is replaced by the real dependency and this file is deleted. The
shape returned here is the shape agreed in feature-seams.md, seam 1, so nothing that depends on it has to change.

It is inert unless DEV_GITHUB_LOGIN is set, which no deployed build should ever do. DEV_GITHUB_TOKEN is separate
and optional: reading someone's stored points needs no GitHub token, and only the endpoints that actually call
GitHub ask for one.
"""

from __future__ import annotations

import logging
from dataclasses import dataclass

from fastapi import HTTPException, status

from .config import settings

logger = logging.getLogger(__name__)


@dataclass(frozen=True)
class CurrentUser:
    """The logged-in user, as the rest of the app expects to see them.

    `github_id` is the stable identifier -- a person can rename their GitHub account and `github_login` follows
    them, so anything stored long-term keys off the id.
    """

    id: int
    github_id: int
    github_login: str
    github_token: str


def dev_login_is_enabled() -> bool:
    return settings.dev_login_stub_enabled and bool(settings.dev_github_login)


def warn_if_dev_login_enabled() -> None:
    """Say so loudly at startup. A stub that authenticates nobody must never be running unnoticed."""
    if dev_login_is_enabled():
        logger.warning(
            "DEV LOGIN STUB IS ON: every request is treated as GitHub user %r. "
            "This authenticates nobody and must not be enabled outside local development.",
            settings.dev_github_login,
        )


def get_current_user() -> CurrentUser:
    """FastAPI dependency: the logged-in user, or 503 while there is no way to log in."""
    if not dev_login_is_enabled():
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail=(
                "GitHub login isn't built yet. For local development, set DEV_GITHUB_LOGIN in "
                "backend/.env (see .env.example)."
            ),
        )

    return CurrentUser(
        id=0,                      # the database row id is resolved from github_id where it's needed
        github_id=settings.dev_github_id,
        github_login=settings.dev_github_login,
        github_token=settings.dev_github_token,
    )


def get_current_user_with_token() -> CurrentUser:
    """The logged-in user, and a usable GitHub token.

    Separate from `get_current_user` because most endpoints only read what a previous sync stored and need no
    token at all. Only the ones that call GitHub should fail when there isn't one.
    """
    user = get_current_user()
    if not user.github_token:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail=(
                "No GitHub token for this user, so GitHub can't be queried. For local development, set "
                "DEV_GITHUB_TOKEN in backend/.env (see .env.example)."
            ),
        )
    return user
