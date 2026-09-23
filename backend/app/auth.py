"""Signing in with GitHub.

The flow, end to end:

  1. The site sends the user to GET /auth/github
  2. We redirect to GitHub with a one-time `state` value kept in the session
  3. GitHub sends the user back to GET /auth/github/callback with a code
  4. We check `state` matches, swap the code for a token, read the profile,
     store the user, and put only their row id in the session cookie
  5. The user lands back on the site, logged in

The access token is encrypted before it is stored and is never returned by the
API.
"""

from __future__ import annotations

import secrets
from typing import Any
from urllib.parse import urlencode

from fastapi import APIRouter, Depends, HTTPException, Request
from fastapi.responses import RedirectResponse

from . import github
from .config import GITHUB_OAUTH_AUTHORIZE_URL, GITHUB_OAUTH_SCOPE, get_settings
from .crypto import decrypt, encrypt
from .db import fetch_one

router = APIRouter()

_STATE_KEY = "oauth_state"
_USER_KEY = "user_id"

# The columns that are safe to send to a browser. The token column is not here
# and must never be added to it.
_PUBLIC_USER_COLUMNS = "id, github_id, github_login, name, avatar_url, created_at, last_login_at"


@router.get("/auth/github", tags=["auth"])
async def github_login(request: Request) -> RedirectResponse:
    """Start the OAuth flow."""
    settings = get_settings()
    state = secrets.token_urlsafe(32)
    request.session[_STATE_KEY] = state

    query = urlencode(
        {
            "client_id": settings.github_client_id,
            "redirect_uri": settings.github_callback_url,
            "scope": GITHUB_OAUTH_SCOPE,
            "state": state,
        }
    )
    return RedirectResponse(f"{GITHUB_OAUTH_AUTHORIZE_URL}?{query}", status_code=302)


@router.get("/auth/github/callback", tags=["auth"])
async def github_callback(request: Request, code: str = "", state: str = "") -> RedirectResponse:
    """Finish the OAuth flow and start a session."""
    settings = get_settings()
    expected_state = request.session.pop(_STATE_KEY, None)

    # A mismatched or missing state means this callback did not come from a
    # flow we started, so it is rejected before the code is used for anything.
    if not state or not expected_state or not secrets.compare_digest(state, expected_state):
        raise HTTPException(status_code=400, detail="Invalid OAuth state. Start the login again.")
    if not code:
        raise HTTPException(status_code=400, detail="GitHub did not return a code.")

    try:
        token = await github.exchange_code_for_token(code)
        profile = await github.get_authenticated_user(token)
    except github.GitHubError as exc:
        raise HTTPException(status_code=502, detail=f"GitHub sign-in failed: {exc}") from exc

    row = await fetch_one(
        f"""
        insert into users (github_id, github_login, name, avatar_url, github_access_token, last_login_at)
        values (%s, %s, %s, %s, %s, now())
        on conflict (github_id) do update set
            github_login        = excluded.github_login,
            name                = excluded.name,
            avatar_url          = excluded.avatar_url,
            github_access_token = excluded.github_access_token,
            updated_at          = now(),
            last_login_at       = now()
        returning {_PUBLIC_USER_COLUMNS}
        """,
        (
            profile["id"],
            profile["login"],
            profile.get("name"),
            profile.get("avatar_url"),
            encrypt(token),
        ),
    )
    if row is None:
        raise HTTPException(status_code=500, detail="Could not save the signed-in user.")

    request.session[_USER_KEY] = row["id"]
    return RedirectResponse(settings.frontend_url, status_code=302)


@router.post("/auth/logout", tags=["auth"])
async def logout(request: Request) -> dict:
    """Clear the session. The stored token is kept so a re-login is one click."""
    request.session.clear()
    return {"status": "logged out"}


async def current_user(request: Request) -> dict[str, Any]:
    """Dependency: the signed-in user, or 401."""
    user_id = request.session.get(_USER_KEY)
    if not user_id:
        raise HTTPException(status_code=401, detail="Not signed in.")

    row = await fetch_one(
        f"select {_PUBLIC_USER_COLUMNS} from users where id = %s", (user_id,)
    )
    if row is None:
        # The row was removed while the cookie was still valid.
        request.session.clear()
        raise HTTPException(status_code=401, detail="Not signed in.")
    return row


async def current_user_token(request: Request) -> str:
    """Dependency: the signed-in user's GitHub token, decrypted.

    Used by anything that has to call GitHub as the user. A token that cannot be
    decrypted means the encryption key changed, so the user signs in again.
    """
    user_id = request.session.get(_USER_KEY)
    if not user_id:
        raise HTTPException(status_code=401, detail="Not signed in.")

    row = await fetch_one("select github_access_token from users where id = %s", (user_id,))
    token = decrypt(row["github_access_token"]) if row else None
    if not token:
        request.session.clear()
        raise HTTPException(status_code=401, detail="Sign in with GitHub again.")
    return token


@router.get("/api/me", tags=["auth"])
async def me(user: dict = Depends(current_user)) -> dict:
    """The signed-in user's public profile."""
    return user
