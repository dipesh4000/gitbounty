"""Ask GitHub which of a user's pull requests have been merged.

Why this asks per user instead of listening for webhooks: GitBounty doesn't own the repositories whose issues it
lists, so it can't ask every maintainer to install a webhook. Instead each user's own account is queried with each
user's own token -- exactly the data GitHub would show that person anyway.

The token is a secret. It is put in an Authorization header and never logged, never returned in a response, and
never written anywhere except the caller's database column.
"""

from __future__ import annotations

from datetime import datetime

import httpx

from .models import MergedPR

GITHUB_API = "https://api.github.com"

# GitHub's search endpoint refuses to return more than 1000 results however many pages are asked for, and each
# page is one request against a 30-per-minute limit. 10 pages of 100 is the whole of what search will ever give.
_PER_PAGE = 100
_MAX_PAGES = 10


class GitHubError(RuntimeError):
    """GitHub answered, but not with what was asked for."""


class GitHubAuthError(GitHubError):
    """The token was missing, expired or revoked. The user has to sign in again."""


class GitHubRateLimited(GitHubError):
    """Too many requests. `retry_after_seconds` is GitHub's own advice when it gave any."""

    def __init__(self, message: str, retry_after_seconds: int | None = None) -> None:
        super().__init__(message)
        self.retry_after_seconds = retry_after_seconds


def _headers(token: str) -> dict[str, str]:
    return {
        "Authorization": f"Bearer {token}",
        "Accept": "application/vnd.github+json",
        "X-GitHub-Api-Version": "2022-11-28",
    }


def _raise_for_status(response: httpx.Response) -> None:
    """Turn GitHub's failures into something a caller can act on, without leaking the token into the message."""
    if response.status_code == 401:
        raise GitHubAuthError("GitHub rejected the token; the user needs to sign in again.")
    if response.status_code in (403, 429):
        retry_after = response.headers.get("retry-after")
        remaining = response.headers.get("x-ratelimit-remaining")
        if retry_after or remaining == "0":
            raise GitHubRateLimited(
                "GitHub rate limit reached.",
                retry_after_seconds=int(retry_after) if retry_after and retry_after.isdigit() else None,
            )
        raise GitHubError("GitHub refused the request (403).")
    if response.status_code >= 400:
        raise GitHubError(f"GitHub returned {response.status_code}.")


def _repo_full_name(repository_url: str) -> str:
    """"https://api.github.com/repos/owner/name" -> "owner/name"."""
    _, _, tail = repository_url.partition("/repos/")
    return tail


def _parse_item(item: dict) -> MergedPR | None:
    """Turn one search result into a MergedPR, or None if it isn't a merged PR after all."""
    pull_request = item.get("pull_request") or {}
    merged_at = pull_request.get("merged_at")
    if not merged_at:
        return None  # closed without merging

    return MergedPR(
        github_pr_id=item["id"],
        repo_full_name=_repo_full_name(item.get("repository_url", "")),
        number=item["number"],
        title=item.get("title", ""),
        url=item.get("html_url", ""),
        merged_at=datetime.fromisoformat(merged_at.replace("Z", "+00:00")),
        author_login=(item.get("user") or {}).get("login", ""),
        labels=tuple(label["name"] for label in item.get("labels", []) if "name" in label),
    )


async def fetch_merged_prs(
    client: httpx.AsyncClient,
    login: str,
    token: str,
    *,
    max_pages: int = _MAX_PAGES,
) -> list[MergedPR]:
    """Every merged PR GitHub will report for `login`, newest first.

    Self-merges are included here on purpose -- this function reports what GitHub says, and the decision to
    discard them belongs to whatever awards points, where it can be seen and changed.
    """
    found: list[MergedPR] = []

    for page in range(1, max_pages + 1):
        response = await client.get(
            f"{GITHUB_API}/search/issues",
            params={
                "q": f"is:pr author:{login} is:merged",
                "per_page": _PER_PAGE,
                "page": page,
                "sort": "updated",
                "order": "desc",
            },
            headers=_headers(token),
        )
        _raise_for_status(response)
        items = response.json().get("items", [])

        found.extend(pr for item in items if (pr := _parse_item(item)) is not None)

        if len(items) < _PER_PAGE:
            break  # last page

    return found


async def fetch_changed_paths(
    client: httpx.AsyncClient,
    repo_full_name: str,
    number: int,
    token: str,
    *,
    limit: int = 100,
) -> list[str]:
    """The file paths a PR changed, for categorising it.

    One request per PR, against the ordinary 5000-per-hour limit rather than the tight search one. `limit` caps a
    single page, which is plenty: a PR touching more than 100 files is already clearly categorised by the first 100.
    """
    response = await client.get(
        f"{GITHUB_API}/repos/{repo_full_name}/pulls/{number}/files",
        params={"per_page": limit},
        headers=_headers(token),
    )
    _raise_for_status(response)
    return [entry["filename"] for entry in response.json() if "filename" in entry]
