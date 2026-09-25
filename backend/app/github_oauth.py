"""The two GitHub API calls needed by the OAuth login flow."""

from __future__ import annotations

from typing import Any

import httpx

from .config import settings

GITHUB_AUTHORIZE_URL = "https://github.com/login/oauth/authorize"
GITHUB_TOKEN_URL = "https://github.com/login/oauth/access_token"
GITHUB_API_URL = "https://api.github.com"
GITHUB_SCOPE = "read:user"
_TIMEOUT = httpx.Timeout(15.0)


class GitHubOAuthError(RuntimeError):
    """A GitHub OAuth request failed without exposing its response body."""


async def exchange_code_for_token(code: str) -> str:
    async with httpx.AsyncClient(timeout=_TIMEOUT) as client:
        response = await client.post(
            GITHUB_TOKEN_URL,
            headers={"Accept": "application/json", "User-Agent": "GitBounty"},
            data={
                "client_id": settings.github_client_id,
                "client_secret": settings.github_client_secret,
                "code": code,
                "redirect_uri": settings.github_callback_url,
            },
        )
    if response.status_code != 200:
        raise GitHubOAuthError(f"token exchange returned {response.status_code}")
    payload = response.json()
    token = payload.get("access_token")
    if not token:
        raise GitHubOAuthError(f"token exchange failed: {payload.get('error', 'no access_token')}")
    return str(token)


async def get_authenticated_user(token: str) -> dict[str, Any]:
    async with httpx.AsyncClient(timeout=_TIMEOUT) as client:
        response = await client.get(
            f"{GITHUB_API_URL}/user",
            headers={
                "Accept": "application/vnd.github+json",
                "Authorization": f"Bearer {token}",
                "X-GitHub-Api-Version": "2022-11-28",
                "User-Agent": "GitBounty",
            },
        )
    if response.status_code != 200:
        raise GitHubOAuthError(f"GET /user returned {response.status_code}")
    return response.json()
