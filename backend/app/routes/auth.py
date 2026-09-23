"""Signing in with GitHub.

The flow, end to end:

  1. The site sends the user to GET /auth/github
  2. We redirect to GitHub with a one-time `state` value kept in the session
  3. GitHub sends the user back to GET /auth/github/callback with a code
  4. We check `state` matches, swap the code for a token, read the profile,
     store the user, and put only their row id in the session cookie
  5. The user lands back on the site, signed in

The access token is encrypted before it is stored, and UserPublic does not
declare it, so it cannot leave through this API.
"""

from __future__ import annotations

import secrets
from urllib.parse import urlencode

from fastapi import APIRouter, Depends, HTTPException, Request
from fastapi.responses import RedirectResponse

from .. import github
from ..config import GITHUB_OAUTH_AUTHORIZE_URL, GITHUB_OAUTH_SCOPE, get_settings
from ..crypto import encrypt
from ..db import fetch_one
from ..dependencies import SESSION_STATE_KEY, SESSION_USER_KEY, current_user
from ..models import USER_PUBLIC_COLUMNS, Message, UserPublic

router = APIRouter(tags=["auth"])


@router.get("/auth/github")
async def github_login(request: Request) -> RedirectResponse:
    """Start the OAuth flow."""
    settings = get_settings()
    state = secrets.token_urlsafe(32)
    request.session[SESSION_STATE_KEY] = state

    query = urlencode(
        {
            "client_id": settings.github_client_id,
            "redirect_uri": settings.github_callback_url,
            "scope": GITHUB_OAUTH_SCOPE,
            "state": state,
        }
    )
    return RedirectResponse(f"{GITHUB_OAUTH_AUTHORIZE_URL}?{query}", status_code=302)


@router.get("/auth/github/callback")
async def github_callback(request: Request, code: str = "", state: str = "") -> RedirectResponse:
    """Finish the OAuth flow and start a session."""
    settings = get_settings()
    expected_state = request.session.pop(SESSION_STATE_KEY, None)

    # A mismatched or missing state means this callback did not come from a flow
    # we started, so it is rejected before the code is used for anything.
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
        returning {USER_PUBLIC_COLUMNS}
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

    request.session[SESSION_USER_KEY] = row["id"]
    return RedirectResponse(settings.frontend_url, status_code=302)


@router.post("/auth/logout", response_model=Message)
async def logout(request: Request) -> Message:
    """Clear the session. The stored token is kept so a re-login is one click."""
    request.session.clear()
    return Message(status="logged out")


@router.get("/api/me", response_model=UserPublic)
async def me(user: UserPublic = Depends(current_user)) -> UserPublic:
    """The signed-in user's public profile."""
    return user
