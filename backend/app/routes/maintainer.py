"""Maintainer repository inspection and bounty publication."""

from __future__ import annotations

import asyncio
from datetime import datetime
from typing import Any, Literal

import asyncpg
from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel, Field

from .. import github
from ..auth import CurrentUser, get_current_user_with_token
from ..categories import classify
from ..db import DatabaseNotConfigured, pool

Category = Literal[
    "frontend", "backend", "fullstack", "docs", "testing",
    "devops", "design", "mobile", "other",
]

router = APIRouter(prefix="/api/maintainer", tags=["maintainer"])


class BountyInput(BaseModel):
    repository: str = Field(min_length=3, max_length=300)
    number: int = Field(gt=0)
    points: int = Field(gt=0)
    category: Category


class PublishRequest(BaseModel):
    issues: list[BountyInput] = Field(min_length=1, max_length=100)


class RepositoryIssue(BaseModel):
    repository: str
    repository_description: str | None
    number: int
    title: str
    html_url: str
    labels: list[str]
    suggested_category: Category


class OwnedIssuesResponse(BaseModel):
    items: list[RepositoryIssue]
    repository_count: int
    truncated: bool = False


class PublishResponse(BaseModel):
    published: int
    repositories: int


def _labels(issue: dict[str, Any]) -> list[str]:
    return [
        str(label["name"] if isinstance(label, dict) else label)
        for label in issue.get("labels", [])
        if (isinstance(label, str) and label) or (isinstance(label, dict) and label.get("name"))
    ]


def _is_personal_owner(repo: dict[str, Any], user: CurrentUser) -> bool:
    owner = repo.get("owner") or {}
    return owner.get("type") == "User" and str(owner.get("login", "")).casefold() == user.github_login.casefold()


def _github_error(error: Exception) -> HTTPException:
    if isinstance(error, github.RateLimited):
        return HTTPException(status.HTTP_429_TOO_MANY_REQUESTS, "GitHub rate limit reached. Try again shortly.")
    return HTTPException(status.HTTP_502_BAD_GATEWAY, "GitHub could not load that repository. Try again.")


async def _load_owned_repository(full_name: str, user: CurrentUser) -> tuple[dict[str, Any], list[dict[str, Any]]]:
    try:
        repo = await github.get_repo(user.github_token, full_name)
        if repo is None:
            raise HTTPException(status.HTTP_404_NOT_FOUND, "Repository not found or unavailable to this GitHub account.")
        if repo.get("private"):
            raise HTTPException(status.HTTP_400_BAD_REQUEST, "This first version supports public repositories only.")
        if not _is_personal_owner(repo, user):
            raise HTTPException(status.HTTP_403_FORBIDDEN, "You can only publish bounties for repositories owned by your GitHub account.")
        issues = await github.list_repo_issues(user.github_token, repo["full_name"])
    except HTTPException:
        raise
    except github.GitHubError as error:
        raise _github_error(error) from error
    return repo, issues


def _issue_out(issue: dict[str, Any], repo: dict[str, Any]) -> RepositoryIssue:
    labels = _labels(issue)
    return RepositoryIssue(
        repository=repo["full_name"],
        repository_description=repo.get("description"),
        number=issue["number"],
        title=issue["title"],
        html_url=issue["html_url"],
        labels=labels,
        suggested_category=classify(repo.get("language"), labels),
    )


def _as_datetime(value: str | None) -> datetime | None:
    return datetime.fromisoformat(value.replace("Z", "+00:00")) if value else None


@router.get("/issues", response_model=OwnedIssuesResponse)
async def list_owned_issues(
    user: CurrentUser = Depends(get_current_user_with_token),
) -> OwnedIssuesResponse:
    try:
        repositories = await github.list_user_repositories(user.github_token, user.github_login)
        repositories = [
            repo for repo in repositories
            if not repo.get("private")
            and repo.get("has_issues", True)
            and repo.get("open_issues_count", 0) > 0
            and _is_personal_owner(repo, user)
        ]
        semaphore = asyncio.Semaphore(6)

        async def load(repo: dict[str, Any]) -> tuple[dict[str, Any], list[dict[str, Any]]]:
            async with semaphore:
                return repo, await github.list_repo_issues(user.github_token, repo["full_name"])

        loaded = await asyncio.gather(*(load(repo) for repo in repositories))
    except github.GitHubError as error:
        raise _github_error(error) from error

    items = [
        _issue_out(issue, repo)
        for repo, issues in loaded
        for issue in issues
    ]
    items.sort(key=lambda item: item.repository.casefold())
    return OwnedIssuesResponse(
        items=items,
        repository_count=len(repositories),
        truncated=len(repositories) >= 500 or any(len(issues) >= 500 for _, issues in loaded),
    )


@router.post("/bounties", response_model=PublishResponse)
async def publish_bounties(
    request: PublishRequest,
    user: CurrentUser = Depends(get_current_user_with_token),
) -> PublishResponse:
    issue_keys = {(item.repository.casefold(), item.number) for item in request.issues}
    if len(issue_keys) != len(request.issues):
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Select each issue only once.")

    requested_by_repo: dict[str, list[BountyInput]] = {}
    for item in request.issues:
        requested_by_repo.setdefault(item.repository, []).append(item)

    verified: list[tuple[dict[str, Any], list[tuple[BountyInput, dict[str, Any]]]]] = []
    for reference, requested in requested_by_repo.items():
        repo, open_issues = await _load_owned_repository(reference, user)
        by_number = {issue["number"]: issue for issue in open_issues}
        missing = [item.number for item in requested if item.number not in by_number]
        if missing:
            missing_text = ", ".join(f"#{number}" for number in missing)
            raise HTTPException(status.HTTP_400_BAD_REQUEST, f"These issues are no longer open in {repo['full_name']}: {missing_text}")
        verified.append((repo, [(item, by_number[item.number]) for item in requested]))

    try:
        db_pool = pool()
    except DatabaseNotConfigured as error:
        raise HTTPException(status.HTTP_503_SERVICE_UNAVAILABLE, str(error)) from error

    try:
        async with db_pool.acquire() as connection, connection.transaction():
            for repo, selected in verified:
                repository_id = await connection.fetchval(
                    """
                    insert into repositories (
                        github_id, full_name, owner_login, owner_type, primary_language,
                        description, stargazers_count, repo_created_at, fetched_at
                    ) values ($1, $2, $3, $4, $5, $6, $7, $8, now())
                    on conflict (github_id) do update set
                        full_name = excluded.full_name,
                        owner_login = excluded.owner_login,
                        owner_type = excluded.owner_type,
                        primary_language = excluded.primary_language,
                        description = excluded.description,
                        stargazers_count = excluded.stargazers_count,
                        fetched_at = now()
                    returning id
                    """,
                    repo["id"], repo["full_name"], repo["owner"]["login"], repo["owner"].get("type"),
                    repo.get("language"), repo.get("description"), repo.get("stargazers_count", 0),
                    _as_datetime(repo.get("created_at")),
                )
                for item, issue in selected:
                    labels = _labels(issue)
                    await connection.execute(
                        """
                        insert into issues (
                            github_id, repository_id, number, title, html_url, state, category,
                            language, labels, comments_count, issue_created_at, issue_updated_at, fetched_at
                        ) values ($1, $2, $3, $4, $5, 'open', $6, $7, $8, $9, $10, $11, now())
                        on conflict (github_id) do update set
                            repository_id = excluded.repository_id,
                            title = excluded.title,
                            html_url = excluded.html_url,
                            state = 'open',
                            category = excluded.category,
                            language = excluded.language,
                            labels = excluded.labels,
                            comments_count = excluded.comments_count,
                            issue_updated_at = excluded.issue_updated_at,
                            fetched_at = now()
                        """,
                        issue["id"], repository_id, issue["number"], issue["title"], issue["html_url"],
                        item.category, repo.get("language"), labels, issue.get("comments", 0),
                        _as_datetime(issue.get("created_at")), _as_datetime(issue.get("updated_at")),
                    )
                    await connection.execute(
                        """
                        insert into issue_points (repo_full_name, issue_number, points, set_by_user_id)
                        values ($1, $2, $3, $4)
                        on conflict (repo_full_name, issue_number) do update set
                            points = excluded.points,
                            set_by_user_id = excluded.set_by_user_id,
                            updated_at = now()
                        """,
                        repo["full_name"], issue["number"], item.points, user.id,
                    )
    except asyncpg.UndefinedTableError as error:
        raise HTTPException(status_code=503, detail="Bounty publishing is awaiting database migration 0004.") from error

    return PublishResponse(published=len(request.issues), repositories=len(verified))
