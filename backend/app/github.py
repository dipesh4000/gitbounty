"""A thin async client for the GitHub REST API.

Only the calls GitBounty actually makes live here. Every function takes the
token it should act with, so nothing reaches for a global "app token" by
accident.
"""

from __future__ import annotations

import time
from typing import Any

import httpx

from .config import (
    GITHUB_API_URL,
    GITHUB_OAUTH_TOKEN_URL,
    get_settings,
)

_TIMEOUT = httpx.Timeout(15.0)


class GitHubError(RuntimeError):
    """A GitHub request failed. The message is safe to log, not to show a user."""


class RateLimited(GitHubError):
    """GitHub refused the call for rate limiting. `retry_after` is in seconds."""

    def __init__(self, retry_after: int) -> None:
        super().__init__(f"rate limited, retry in {retry_after}s")
        self.retry_after = retry_after


def _retry_after_seconds(response: httpx.Response) -> int:
    """How long GitHub says to wait, from whichever header it used."""
    if (header := response.headers.get("retry-after")):
        try:
            return max(1, int(header))
        except ValueError:
            pass
    reset = response.headers.get("x-ratelimit-reset")
    if reset:
        try:
            return max(1, int(float(reset) - time.time()) + 1)
        except ValueError:
            pass
    return 60


def _headers(token: str | None = None) -> dict[str, str]:
    headers = {
        "Accept": "application/vnd.github+json",
        "X-GitHub-Api-Version": "2022-11-28",
        "User-Agent": "GitBounty",
    }
    if token:
        headers["Authorization"] = f"Bearer {token}"
    return headers


async def exchange_code_for_token(code: str) -> str:
    """Swap the OAuth callback code for an access token."""
    settings = get_settings()
    async with httpx.AsyncClient(timeout=_TIMEOUT) as client:
        response = await client.post(
            GITHUB_OAUTH_TOKEN_URL,
            headers={"Accept": "application/json", "User-Agent": "GitBounty"},
            data={
                "client_id": settings.github_client_id,
                "client_secret": settings.github_client_secret,
                "code": code,
                "redirect_uri": settings.github_callback_url,
            },
        )
    if response.status_code != 200:
        raise GitHubError(f"token exchange returned {response.status_code}")

    payload = response.json()
    token = payload.get("access_token")
    if not token:
        # GitHub reports OAuth problems in the body with a 200 status.
        raise GitHubError(f"token exchange failed: {payload.get('error', 'no access_token')}")
    return token


async def get_authenticated_user(token: str) -> dict[str, Any]:
    """Return the profile of whoever owns this token."""
    async with httpx.AsyncClient(timeout=_TIMEOUT) as client:
        response = await client.get(f"{GITHUB_API_URL}/user", headers=_headers(token))
    if response.status_code != 200:
        raise GitHubError(f"GET /user returned {response.status_code}")
    return response.json()


async def search_issues(token: str, query: str, per_page: int = 50, page: int = 1) -> list[dict[str, Any]]:
    """Run one issue search.

    Rate limit note: this endpoint allows about 30 requests per minute for an
    authenticated user. It is only ever called by the sync job, never on a page
    load.
    """
    async with httpx.AsyncClient(timeout=_TIMEOUT) as client:
        response = await client.get(
            f"{GITHUB_API_URL}/search/issues",
            headers=_headers(token),
            params={
                "q": query,
                "per_page": min(per_page, 100),
                "page": page,
                "sort": "updated",
                "order": "desc",
            },
        )
    if response.status_code in (403, 429):
        raise RateLimited(_retry_after_seconds(response))
    if response.status_code != 200:
        raise GitHubError(f"issue search returned {response.status_code}")
    return response.json().get("items", [])


async def get_repo(token: str, full_name: str) -> dict[str, Any] | None:
    """Fetch one repository's metadata. Returns None if it is gone or private."""
    async with httpx.AsyncClient(timeout=_TIMEOUT) as client:
        response = await client.get(
            f"{GITHUB_API_URL}/repos/{full_name}", headers=_headers(token)
        )
    if response.status_code in (404, 403):
        return None
    if response.status_code != 200:
        raise GitHubError(f"GET /repos/{full_name} returned {response.status_code}")
    return response.json()
