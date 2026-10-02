"""Ask GitHub which of a user's pull requests have been merged.

Why this asks per user instead of listening for webhooks: GitBounty doesn't own the repositories whose issues it
lists, so it can't ask every maintainer to install a webhook. Instead each user's own account is queried with each
user's own token -- exactly the data GitHub would show that person anyway.

The token is a secret. It is put in an Authorization header and never logged, never returned in a response, and
never written anywhere except the caller's database column.
"""

from __future__ import annotations

from datetime import datetime, timedelta

import httpx

from ...config import settings
from .models import AuthoredPR, MergedPR, ReviewState

#: The real GitHub API. Read through `settings.github_api` at call time so the
#: end-to-end test can point it at a local stand-in; see app/config.py.
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


def _timestamp(value: str | None) -> datetime | None:
    return datetime.fromisoformat(value.replace("Z", "+00:00")) if value else None


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
        merged_at=_timestamp(merged_at),
        author_login=(item.get("user") or {}).get("login", ""),
        labels=tuple(label["name"] for label in item.get("labels", []) if "name" in label),
        body=item.get("body") or "",
    )


def _parse_any_item(item: dict) -> AuthoredPR | None:
    """Turn one search result into an AuthoredPR, whatever state it is in.

    Only the fields GitHub actually returns are read. `draft` and `state` come straight from the search
    result; `merged_at` comes from the `pull_request` object. Nothing is inferred here -- the lifecycle
    state is decided later, from reviews GitHub reports, in `models.pull_request_state`.
    """
    if "pull_request" not in item:
        return None  # an issue, not a pull request
    pull_request = item.get("pull_request") or {}

    return AuthoredPR(
        github_pr_id=item["id"],
        repo_full_name=_repo_full_name(item.get("repository_url", "")),
        number=item["number"],
        title=item.get("title", ""),
        url=item.get("html_url", ""),
        author_login=(item.get("user") or {}).get("login", ""),
        labels=tuple(label["name"] for label in item.get("labels", []) if "name" in label),
        body=item.get("body") or "",
        is_draft=bool(item.get("draft")),
        is_closed=item.get("state") == "closed",
        merged_at=_timestamp(pull_request.get("merged_at")),
        created_at=_timestamp(item.get("created_at")),
        updated_at=_timestamp(item.get("updated_at")),
        closed_at=_timestamp(item.get("closed_at")),
    )


async def fetch_merged_prs(
    client: httpx.AsyncClient,
    login: str,
    token: str,
    *,
    max_pages: int = _MAX_PAGES,
    since: datetime | None = None,
) -> list[MergedPR]:
    """Every merged PR GitHub will report for `login`, newest first.

    Self-merges are included here on purpose -- this function reports what GitHub says, and the decision to
    discard them belongs to whatever awards points, where it can be seen and changed.

    `since` narrows the search to pull requests merged on or after that moment, which is how an incremental
    sync avoids re-walking a long history every time. Search caps at 1000 results however many pages are
    requested, so for anyone with more merged pull requests than that, narrowing is not an optimisation --
    it is the only way the newest ones are reachable at all. A day is subtracted because GitHub's
    `merged:>=` takes a date, and a timestamp late in a day would otherwise exclude that same day's work.
    """
    found: list[MergedPR] = []
    query = f"is:pr author:{login} is:merged"
    if since is not None:
        query += f" merged:>={(since - timedelta(days=1)).date().isoformat()}"

    for page in range(1, max_pages + 1):
        response = await client.get(
            f"{settings.github_api}/search/issues",
            params={
                "q": query,
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
        f"{settings.github_api}/repos/{repo_full_name}/pulls/{number}/files",
        params={"per_page": limit},
        headers=_headers(token),
    )
    _raise_for_status(response)
    return [entry["filename"] for entry in response.json() if "filename" in entry]


async def fetch_issue_labels(
    client: httpx.AsyncClient,
    repo_full_name: str,
    number: int,
    token: str,
) -> tuple[str, ...]:
    """The labels on one issue, which is where a creator's points value is read from.

    One request per issue, against the ordinary 5000-per-hour limit.
    """
    response = await client.get(
        f"{settings.github_api}/repos/{repo_full_name}/issues/{number}",
        headers=_headers(token),
    )
    _raise_for_status(response)
    return tuple(label["name"] for label in response.json().get("labels", []) if "name" in label)


async def fetch_authored_prs(
    client: httpx.AsyncClient,
    login: str,
    token: str,
    *,
    max_pages: int = _MAX_PAGES,
    since: datetime | None = None,
) -> list[AuthoredPR]:
    """Every pull request GitHub will report `login` as the author of, in whatever state it is in.

    The merged-only search (`is:merged`) is kept for the award path, which has no use for anything else.
    This one drops that qualifier so the website can show open, draft and closed work too.

    `since` narrows on `updated:>=` rather than `merged:>=`: an open pull request has no merge date, and
    what changes about it is its last update.
    """
    found: list[AuthoredPR] = []
    query = f"is:pr author:{login}"
    if since is not None:
        query += f" updated:>={(since - timedelta(days=1)).date().isoformat()}"

    for page in range(1, max_pages + 1):
        response = await client.get(
            f"{settings.github_api}/search/issues",
            params={
                "q": query,
                "per_page": _PER_PAGE,
                "page": page,
                "sort": "updated",
                "order": "desc",
            },
            headers=_headers(token),
        )
        _raise_for_status(response)
        items = response.json().get("items", [])
        found.extend(pr for item in items if (pr := _parse_any_item(item)) is not None)
        if len(items) < _PER_PAGE:
            break

    return found


async def fetch_review_state(
    client: httpx.AsyncClient,
    repo_full_name: str,
    number: int,
    token: str,
) -> ReviewState:
    """What reviewers have actually said about one pull request.

    GitHub returns every review event in order. Only the **most recent decisive** review per reviewer
    counts -- a reviewer who requested changes and later approved has approved, and one who approved and
    later requested changes has not. A `COMMENTED` review is not decisive and does not replace an earlier
    verdict; it only shows that somebody has looked.

    This mirrors GitHub's own rule rather than inventing one. Nothing is inferred from timing, from the
    number of comments, or from who the reviewer is.
    """
    reviews: list[dict] = []
    for page in range(1, 4):  # 300 reviews is far past the point of usefulness
        response = await client.get(
            f"{settings.github_api}/repos/{repo_full_name}/pulls/{number}/reviews",
            params={"per_page": _PER_PAGE, "page": page},
            headers=_headers(token),
        )
        _raise_for_status(response)
        page_items = response.json()
        reviews.extend(page_items)
        if len(page_items) < _PER_PAGE:
            break

    verdict_by_reviewer: dict[str, str] = {}
    commented = False
    for review in reviews:
        state = str(review.get("state", "")).upper()
        reviewer = ((review.get("user") or {}).get("login") or "").casefold()
        if state in ("APPROVED", "CHANGES_REQUESTED"):
            verdict_by_reviewer[reviewer] = state
        elif state == "COMMENTED":
            commented = True

    verdicts = set(verdict_by_reviewer.values())
    return ReviewState(
        approved="APPROVED" in verdicts,
        changes_requested="CHANGES_REQUESTED" in verdicts,
        reviewed=bool(reviews) or commented,
    )
