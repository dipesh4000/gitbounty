"""Refreshing the issue board from GitHub.

This is the only thing in the backend that talks to GitHub's search API. The
board itself reads Postgres, because search allows roughly 30 requests a minute
and a live call per page load would rate-limit the site as soon as two people
opened it at once.

run_sync takes a token and an actor name rather than reading the session, so a
scheduled job can keep the board fresh with nobody signed in.
"""

from __future__ import annotations

import asyncio
from typing import Any

from .. import github
from ..categories import classify, sync_queries
from ..db import execute_many, fetch_all, fetch_one

# How many previously unseen repositories one sync will look up. Each one is a
# separate GitHub call, so this caps how long a sync runs and how much of the
# hourly rate limit it can spend.
_MAX_NEW_REPOS_PER_SYNC = 60

# Repositories below this many stars are skipped. Issue search surfaces a lot of
# days-old repositories that label everything "good first issue"; they crowd out
# the board and are exactly what someone farming points would target.
_MIN_STARS = 20

# Seconds between searches. GitHub allows roughly 30 a minute and applies a
# stricter limit to bursts, so the sync paces itself instead of firing all of
# its queries at once.
_SEARCH_SPACING_SECONDS = 4

# Longest single wait when GitHub asks us to back off.
_MAX_BACKOFF_SECONDS = 70


def _repo_full_name(issue: dict[str, Any]) -> str | None:
    """Pull "owner/name" out of a search result's repository_url."""
    url = issue.get("repository_url") or ""
    parts = url.rstrip("/").split("/")
    if len(parts) < 2:
        return None
    return f"{parts[-2]}/{parts[-1]}"


async def _upsert_repository(repo: dict[str, Any]) -> int:
    row = await fetch_one(
        """
        insert into repositories (
            github_id, full_name, owner_login, owner_type,
            primary_language, description, stargazers_count, repo_created_at, fetched_at
        )
        values ($1, $2, $3, $4, $5, $6, $7, $8, now())
        on conflict (github_id) do update set
            full_name        = excluded.full_name,
            owner_login      = excluded.owner_login,
            owner_type       = excluded.owner_type,
            primary_language = excluded.primary_language,
            description      = excluded.description,
            stargazers_count = excluded.stargazers_count,
            repo_created_at  = excluded.repo_created_at,
            fetched_at       = now()
        returning id
        """,
        repo["id"],
        repo["full_name"],
        repo["owner"]["login"],
        repo["owner"].get("type"),
        repo.get("language"),
        repo.get("description"),
        repo.get("stargazers_count", 0),
        repo.get("created_at"),
    )
    return row["id"]


_ISSUE_UPSERT_SQL = """
    insert into issues (
        github_id, repository_id, number, title, html_url, state,
        category, language, labels, comments_count,
        issue_created_at, issue_updated_at, fetched_at
    )
    values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, now())
    on conflict (github_id) do update set
        title            = excluded.title,
        state            = excluded.state,
        category         = excluded.category,
        language         = excluded.language,
        labels           = excluded.labels,
        comments_count   = excluded.comments_count,
        issue_updated_at = excluded.issue_updated_at,
        fetched_at       = now()
"""


def _issue_row(issue: dict[str, Any], repository_id: int, language: str | None) -> tuple:
    labels = [label["name"] for label in issue.get("labels", []) if label.get("name")]
    return (
        issue["id"],
        repository_id,
        issue["number"],
        issue["title"],
        issue["html_url"],
        issue.get("state", "open"),
        classify(language, labels),
        language,
        labels,
        issue.get("comments", 0),
        issue.get("created_at"),
        issue.get("updated_at"),
    )


async def _search_with_backoff(token: str, query: str, errors: list[str]) -> list[dict[str, Any]]:
    """Run one search, waiting once if GitHub says we are going too fast."""
    for attempt in (1, 2):
        try:
            return await github.search_issues(token, query, per_page=30)
        except github.RateLimited as limit:
            if attempt == 2:
                errors.append(f"rate limited after retry: {query}")
                return []
            await asyncio.sleep(min(limit.retry_after, _MAX_BACKOFF_SECONDS))
        except github.GitHubError as exc:
            errors.append(f"{exc}: {query}")
            return []
    return []


async def run_sync(token: str, actor: str) -> dict:
    """Refresh the issue board from GitHub.

    Takes a token rather than reading the session, so a scheduled job can call
    this with a service token and keep the board fresh with nobody signed in.
    Deliberately never called on a page load.

    Failures are reported, not swallowed. An earlier version skipped a failing
    query silently, which meant a run could miss most of its searches to rate
    limiting and still look like it succeeded.
    """
    seen_issues: dict[int, dict[str, Any]] = {}
    repo_names: set[str] = set()
    errors: list[str] = []

    queries = sync_queries()
    for index, query in enumerate(queries):
        if index:
            await asyncio.sleep(_SEARCH_SPACING_SECONDS)
        for item in await _search_with_backoff(token, query, errors):
            # The search endpoint returns pull requests too; we only want issues.
            if "pull_request" in item:
                continue
            full_name = _repo_full_name(item)
            if not full_name:
                continue
            seen_issues[item["id"]] = item
            repo_names.add(full_name)

    if not repo_names:
        return {
            "synced_by": actor,
            "queries_run": len(queries),
            "queries_failed": len(errors),
            "issues_found": 0,
            "issues_stored": 0,
            "repositories_known": 0,
            "errors": errors,
        }

    known = await fetch_all(
        "select id, full_name, primary_language, stargazers_count"
        " from repositories where full_name = any($1::text[])",
        list(repo_names),
    )
    repos = {
        row["full_name"]: (row["id"], row["primary_language"], row["stargazers_count"])
        for row in known
    }

    missing = [name for name in repo_names if name not in repos]
    for full_name in missing[:_MAX_NEW_REPOS_PER_SYNC]:
        try:
            repo = await github.get_repo(token, full_name)
        except github.GitHubError as exc:
            errors.append(f"{exc}: {full_name}")
            continue
        if repo is None:
            continue
        repo_id = await _upsert_repository(repo)
        repos[full_name] = (repo_id, repo.get("language"), repo.get("stargazers_count", 0))

    rows, too_small = [], 0
    for item in seen_issues.values():
        entry = repos.get(_repo_full_name(item))
        if entry is None:
            continue  # repository lookup was skipped or failed this run
        repo_id, language, stars = entry
        if (stars or 0) < _MIN_STARS:
            too_small += 1
            continue
        rows.append(_issue_row(item, repo_id, language))

    stored = await execute_many(_ISSUE_UPSERT_SQL, rows)

    return {
        "synced_by": actor,
        "queries_run": len(queries),
        "queries_failed": len(errors),
        "issues_found": len(seen_issues),
        "issues_stored": stored,
        "skipped_low_star_repos": too_small,
        "repositories_known": len(repos),
        "errors": errors,
    }
