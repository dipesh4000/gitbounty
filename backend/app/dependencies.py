"""Shared FastAPI dependencies.

These live outside routes/ because both the auth routes and the issue routes
need them, and importing one route module from another gets circular quickly.
"""

from __future__ import annotations

from fastapi import HTTPException, Request

from .crypto import decrypt
from .db import fetch_one
from .models import USER_PUBLIC_COLUMNS, UserPublic

# Keys inside the signed session cookie. The cookie holds nothing else.
SESSION_USER_KEY = "user_id"
SESSION_STATE_KEY = "oauth_state"


async def current_user(request: Request) -> UserPublic:
    """The signed-in user, or 401."""
    user_id = request.session.get(SESSION_USER_KEY)
    if not user_id:
        raise HTTPException(status_code=401, detail="Not signed in.")

    row = await fetch_one(
        f"select {USER_PUBLIC_COLUMNS} from users where id = %s", (user_id,)
    )
    if row is None:
        # The row was removed while the cookie was still valid.
        request.session.clear()
        raise HTTPException(status_code=401, detail="Not signed in.")
    return UserPublic(**row)


async def current_user_token(request: Request) -> str:
    """The signed-in user's GitHub token, decrypted.

    Used by anything that has to call GitHub as the user. A token that cannot be
    decrypted means the encryption key changed since it was stored, so the user
    is sent through the login again rather than hitting a confusing failure.
    """
    user_id = request.session.get(SESSION_USER_KEY)
    if not user_id:
        raise HTTPException(status_code=401, detail="Not signed in.")

    row = await fetch_one("select github_access_token from users where id = %s", (user_id,))
    token = decrypt(row["github_access_token"]) if row else None
    if not token:
        request.session.clear()
        raise HTTPException(status_code=401, detail="Sign in with GitHub again.")
    return token
