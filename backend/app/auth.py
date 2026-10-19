"""GitHub OAuth routes and the authenticated-user dependencies.

Ported from Nishika's OAuth work on ``origin/main`` and adapted to this
branch's async SQLAlchemy sessions. The browser session contains only a signed
user id; GitHub tokens are encrypted in Postgres and never returned by the API.
"""

from __future__ import annotations

import logging
import secrets
from dataclasses import dataclass
from urllib.parse import urlencode

from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException, Request, status
from fastapi.responses import RedirectResponse
from pydantic import BaseModel
from sqlalchemy import func, select, update
from sqlalchemy.orm import undefer

from . import github_oauth
from .auth_stub import dev_login_is_enabled, get_current_user as get_dev_user
from .config import settings
from .crypto import decrypt, encrypt
from .db import DatabaseNotConfigured, pool, session
from .orm import User
from .services.users import save_sign_in

SESSION_USER_KEY = "user_id"
SESSION_STATE_KEY = "oauth_state"
SESSION_CSRF_KEY = "csrf_token"

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


class CsrfToken(BaseModel):
    csrf_token: str


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
        async with session() as db_session:
            # Fresh identity on every request; this single SELECT needs no BEGIN/ROLLBACK round trips.
            await db_session.connection(execution_options={"isolation_level": "AUTOCOMMIT"})
            row = await db_session.scalar(
                select(User).options(undefer(User.github_access_token)).where(User.id == user_id)
            )
    except DatabaseNotConfigured as error:
        raise HTTPException(status.HTTP_503_SERVICE_UNAVAILABLE, str(error)) from error
    if row is None:
        request.session.clear()
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Not signed in.")
    return CurrentUser(
        id=row.id,
        github_id=row.github_id,
        github_login=row.github_login,
        github_token=decrypt(row.github_access_token) or "",
        name=row.name,
        avatar_url=row.avatar_url,
    )


async def get_current_user_with_token(request: Request) -> CurrentUser:
    user = await get_current_user(request)
    if not user.github_token:
        # Either the token was cleared at logout, or TOKEN_ENCRYPTION_KEY has been rotated and the stored
        # ciphertext can no longer be read. Both mean the same thing to the person: sign in again.
        request.session.clear()
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Sign in with GitHub again.")
    return user


async def get_current_user_optional(request: Request) -> CurrentUser | None:
    """The signed-in user, or None. For endpoints that are public but say more when you are signed in.

    A 503 from a missing database is still raised: "the database is not configured" is not "nobody is
    signed in", and quietly answering None would hide a broken deployment.
    """
    if not request.session.get(SESSION_USER_KEY) and not dev_login_is_enabled():
        return None
    try:
        return await get_current_user(request)
    except HTTPException as error:
        if error.status_code == status.HTTP_401_UNAUTHORIZED:
            return None
        raise


@router.get("/auth/github")
async def github_login(request: Request, next: str = "/explore") -> RedirectResponse:
    _require_oauth_configuration()
    state = secrets.token_urlsafe(32)
    request.session[SESSION_STATE_KEY] = state
    request.session["oauth_next"] = next if next in {"/explore", "/maintainers", "/leaderboard", "/explore#points"} else "/explore"
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
async def github_callback(
    request: Request,
    background: BackgroundTasks,
    code: str = "",
    state: str = "",
) -> RedirectResponse:
    _require_oauth_configuration()
    expected_state = request.session.pop(SESSION_STATE_KEY, None)
    destination = request.session.pop("oauth_next", "/explore")
    if destination not in {"/explore", "/maintainers", "/leaderboard", "/explore#points"}:
        destination = "/explore"
    if not state or not expected_state or not secrets.compare_digest(state, expected_state):
        raise HTTPException(status_code=400, detail="Invalid OAuth state. Start the login again.")
    if not code:
        raise HTTPException(status_code=400, detail="GitHub did not return a code.")

    try:
        token = await github_oauth.exchange_code_for_token(code)
        profile = await github_oauth.get_authenticated_user(token)
    except github_oauth.GitHubOAuthError as error:
        raise HTTPException(status_code=502, detail=f"GitHub sign-in failed: {error}") from error

    async with session() as db_session:
        user_id = await save_sign_in(
            db_session,
            github_id=profile["id"], github_login=profile["login"],
            name=profile.get("name"), avatar_url=profile.get("avatar_url"),
            encrypted_token=encrypt(token),
        )
        await db_session.commit()
    if user_id is None:
        raise HTTPException(status_code=500, detail="Could not save the signed-in user.")
    if settings.managed_wallets_enabled:
        from .managed_wallets import ensure_wallet
        async with pool().acquire() as connection:
            await ensure_wallet(connection, profile["id"])
    # Rotate the session rather than adopting whatever session the browser arrived with. An attacker who
    # can set a cookie before sign-in otherwise ends up holding a session that is now authenticated.
    request.session.clear()
    request.session[SESSION_USER_KEY] = user_id
    request.session[SESSION_CSRF_KEY] = secrets.token_urlsafe(32)

    # Synchronise straight away, in the background. Nobody should have to find a hidden endpoint for their
    # own merged work to appear: the first thing a new account sees should be its own history, not an empty
    # table and a button. The redirect does not wait for it -- a first import makes one GitHub request per
    # pull request -- and /api/me/points reports its progress.
    background.add_task(
        _sync_after_sign_in,
        CurrentUser(
            id=user_id,
            github_id=profile["id"],
            github_login=profile["login"],
            github_token=token,
            name=profile.get("name"),
            avatar_url=profile.get("avatar_url"),
        ),
    )
    return RedirectResponse(f"{settings.frontend_url.rstrip('/')}{destination}", status_code=302)


async def _sync_after_sign_in(user: CurrentUser) -> None:
    """Run the first synchronisation, swallowing any failure.

    Imported here rather than at module scope because the points feature imports this module; a failure is
    swallowed because a sign-in must not break on it. The failure is recorded in `sync_runs` by the sync
    itself, so the website can still report it.
    """
    from .features.points.router import run_sync

    try:
        await run_sync(user)
    except Exception:  # pragma: no cover - defence in depth; run_sync records its own failures
        logging.getLogger(__name__).exception("the sign-in sync failed for %s", user.github_login)


@router.post("/auth/logout", response_model=Message)
async def logout(request: Request) -> Message:
    """End the session and forget the stored GitHub token.

    Clearing the cookie alone would leave a usable GitHub access token in the database for an account that
    has signed out. The token is dropped as well, so signing out actually removes GitBounty's access; the
    next sign-in stores a fresh one. GitHub's own grant is revoked by the user from their GitHub settings,
    which is the only place that can do it for an OAuth app -- `docs/security.md` says so and the UI links
    to it.
    """
    user_id = request.session.get(SESSION_USER_KEY)
    request.session.clear()
    if user_id:
        try:
            async with session() as db_session:
                await db_session.execute(
                    update(User).where(User.id == user_id).values(
                        github_access_token=None, updated_at=func.now(),
                    )
                )
                await db_session.commit()
        except DatabaseNotConfigured:
            pass  # nothing stored to forget
    return Message(status="logged out")


@router.get("/api/csrf", response_model=CsrfToken)
async def csrf_token(request: Request) -> CsrfToken:
    """The token a browser must echo in `X-GitBounty-CSRF` on any state-changing request.

    Minted at sign-in and kept in the signed session cookie, so the value is one only this browser's
    session can know. See `app/csrf.py` for why the cookie alone is not enough.
    """
    token = request.session.get(SESSION_CSRF_KEY)
    if not token:
        token = secrets.token_urlsafe(32)
        request.session[SESSION_CSRF_KEY] = token
    return CsrfToken(csrf_token=token)


@router.get("/api/me", response_model=UserPublic)
async def me(user: CurrentUser = Depends(get_current_user)) -> UserPublic:
    return UserPublic(
        id=user.id,
        github_id=user.github_id,
        github_login=user.github_login,
        name=user.name,
        avatar_url=user.avatar_url,
    )
