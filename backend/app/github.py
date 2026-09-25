"""A thin async client for the GitHub REST API.

Only the calls GitBounty actually makes live here. Every function takes the
token it should act with, so nothing reaches for a global "app token" by
accident.
"""

from __future__ import annotations

import time
from typing import Any

import httpx

GITHUB_API_URL = "https://api.github.com"

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


async def list_repo_issues(token: str, full_name: str, *, max_pages: int = 5) -> list[dict[str, Any]]:
    """Return up to 500 open issues from one repository, excluding pull requests."""
    found: list[dict[str, Any]] = []
    async with httpx.AsyncClient(timeout=_TIMEOUT) as client:
        for page in range(1, max_pages + 1):
            response = await client.get(
                f"{GITHUB_API_URL}/repos/{full_name}/issues",
                headers=_headers(token),
                params={"state": "open", "per_page": 100, "page": page, "sort": "created"},
            )
            if response.status_code in (403, 429):
                raise RateLimited(_retry_after_seconds(response))
            if response.status_code != 200:
                raise GitHubError(f"GET /repos/{full_name}/issues returned {response.status_code}")
            page_items = response.json()
            found.extend(item for item in page_items if "pull_request" not in item)
            if len(page_items) < 100:
                break
    return found
