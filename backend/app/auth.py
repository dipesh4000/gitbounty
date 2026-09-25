"""GitHub OAuth routes and the authenticated-user dependencies.

Ported from Nishika's OAuth work on ``origin/main`` and adapted to this
branch's asyncpg connection pool. The browser session contains only a signed
user id; GitHub tokens are encrypted in Postgres and never returned by the API.
"""

from __future__ import annotations

import secrets
from dataclasses import dataclass
from urllib.parse import urlencode

from fastapi import APIRouter, Depends, HTTPException, Request, status
from fastapi.responses import RedirectResponse
from pydantic import BaseModel

from . import github_oauth
from .auth_stub import dev_login_is_enabled, get_current_user as get_dev_user
from .config import settings
from .crypto import decrypt, encrypt
from .db import DatabaseNotConfigured, pool

SESSION_USER_KEY = "user_id"
SESSION_STATE_KEY = "oauth_state"

router = APIRouter(tags=["auth"])


@dataclass(frozen=True)
class CurrentUser:
    id: int
    github_id: int
    github_login: str
    github_token: str
    name: str | None = None
    avatar_url: str | None = None


class UserPublic(BaseModel):
    id: int
    github_id: int
    github_login: str
    name: str | None = None
    avatar_url: str | None = None


class Message(BaseModel):
    status: str


def _require_oauth_configuration() -> None:
    missing = [
        name
        for name, value in (
            ("GITHUB_CLIENT_ID", settings.github_client_id),
            ("GITHUB_CLIENT_SECRET", settings.github_client_secret),
            ("SESSION_SECRET", settings.session_secret),
            ("TOKEN_ENCRYPTION_KEY", settings.token_encryption_key),
        )
        if not value
    ]
    if missing:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail=f"GitHub login is not configured. Missing: {', '.join(missing)}.",
        )
    try:
        pool()
    except DatabaseNotConfigured as error:
        raise HTTPException(status.HTTP_503_SERVICE_UNAVAILABLE, str(error)) from error


async def get_current_user(request: Request) -> CurrentUser:
    """Return the signed-in user, retaining the old local-only stub as a fallback."""
    user_id = request.session.get(SESSION_USER_KEY)
    if not user_id:
        if dev_login_is_enabled():
            dev_user = get_dev_user()
            return CurrentUser(**dev_user.__dict__)
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Not signed in.")

    try:
        db_pool = pool()
    except DatabaseNotConfigured as error:
        raise HTTPException(status.HTTP_503_SERVICE_UNAVAILABLE, str(error)) from error
    async with db_pool.acquire() as connection:
        row = await connection.fetchrow(
            """
            select id, github_id, github_login, name, avatar_url, github_access_token
            from users where id = $1
            """,
            user_id,
        )
    if row is None:
        request.session.clear()
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Not signed in.")
    return CurrentUser(
        id=row["id"],
        github_id=row["github_id"],
        github_login=row["github_login"],
        github_token=decrypt(row["github_access_token"]) or "",
        name=row["name"],
        avatar_url=row["avatar_url"],
    )


async def get_current_user_with_token(request: Request) -> CurrentUser:
    user = await get_current_user(request)
    if not user.github_token:
        request.session.clear()
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Sign in with GitHub again.")
    return user


@router.get("/auth/github")
async def github_login(request: Request) -> RedirectResponse:
    _require_oauth_configuration()
    state = secrets.token_urlsafe(32)
    request.session[SESSION_STATE_KEY] = state
    query = urlencode(
        {
            "client_id": settings.github_client_id,
            "redirect_uri": settings.github_callback_url,
            "scope": github_oauth.GITHUB_SCOPE,
            "state": state,
        }
    )
    return RedirectResponse(f"{github_oauth.GITHUB_AUTHORIZE_URL}?{query}", status_code=302)


@router.get("/auth/github/callback")
async def github_callback(request: Request, code: str = "", state: str = "") -> RedirectResponse:
    _require_oauth_configuration()
    expected_state = request.session.pop(SESSION_STATE_KEY, None)
    if not state or not expected_state or not secrets.compare_digest(state, expected_state):
        raise HTTPException(status_code=400, detail="Invalid OAuth state. Start the login again.")
    if not code:
        raise HTTPException(status_code=400, detail="GitHub did not return a code.")

    try:
        token = await github_oauth.exchange_code_for_token(code)
        profile = await github_oauth.get_authenticated_user(token)
    except github_oauth.GitHubOAuthError as error:
        raise HTTPException(status_code=502, detail=f"GitHub sign-in failed: {error}") from error

    async with pool().acquire() as connection:
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
            profile["id"],
            profile["login"],
            profile.get("name"),
            profile.get("avatar_url"),
            encrypt(token),
        )
    if row is None:
        raise HTTPException(status_code=500, detail="Could not save the signed-in user.")
    request.session[SESSION_USER_KEY] = row["id"]
    return RedirectResponse(f"{settings.frontend_url.rstrip('/')}/explore", status_code=302)


@router.post("/auth/logout", response_model=Message)
async def logout(request: Request) -> Message:
    request.session.clear()
    return Message(status="logged out")


@router.get("/api/me", response_model=UserPublic)
async def me(user: CurrentUser = Depends(get_current_user)) -> UserPublic:
    return UserPublic(
        id=user.id,
        github_id=user.github_id,
        github_login=user.github_login,
        name=user.name,
        avatar_url=user.avatar_url,
    )
