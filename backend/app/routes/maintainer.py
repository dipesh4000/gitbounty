"""Maintainer repository inspection and bounty publication."""

from __future__ import annotations

import re
from datetime import datetime
from typing import Any, Literal
from urllib.parse import urlparse

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
_REPO_PART = re.compile(r"^[A-Za-z0-9_.-]+$")


class RepositoryRequest(BaseModel):
    repository: str = Field(min_length=3, max_length=300)


class BountyInput(BaseModel):
    number: int = Field(gt=0)
    points: int = Field(gt=0)
    category: Category


class PublishRequest(RepositoryRequest):
    issues: list[BountyInput] = Field(min_length=1, max_length=100)


class RepositoryIssue(BaseModel):
    number: int
    title: str
    html_url: str
    labels: list[str]
    suggested_category: Category


class RepositoryInspection(BaseModel):
    full_name: str
    owner_type: str
    description: str | None
    open_issues: list[RepositoryIssue]
    truncated: bool = False


class PublishResponse(BaseModel):
    repository: str
    published: int


def normalize_repository(value: str) -> str:
    """Accept owner/repo or a github.com URL and return owner/repo."""
    candidate = value.strip()
    if "://" in candidate:
        parsed = urlparse(candidate)
        if parsed.scheme not in {"http", "https"} or parsed.netloc.lower() not in {"github.com", "www.github.com"}:
            raise ValueError("Enter a github.com repository URL.")
        candidate = parsed.path.strip("/")
    candidate = candidate.removesuffix(".git").strip("/")
    parts = candidate.split("/")
    if len(parts) != 2 or not all(_REPO_PART.fullmatch(part) for part in parts):
        raise ValueError("Enter a repository as owner/name or a github.com URL.")
    return f"{parts[0]}/{parts[1]}"


def _labels(issue: dict[str, Any]) -> list[str]:
    return [
        str(label["name"] if isinstance(label, dict) else label)
        for label in issue.get("labels", [])
        if (isinstance(label, str) and label) or (isinstance(label, dict) and label.get("name"))
    ]


def _can_manage(repo: dict[str, Any], user: CurrentUser) -> bool:
    owner = repo.get("owner") or {}
    if owner.get("type") == "User" and str(owner.get("login", "")).casefold() == user.github_login.casefold():
        return True
    permissions = repo.get("permissions") or {}
    return any(bool(permissions.get(level)) for level in ("admin", "maintain", "push"))


def _github_error(error: Exception) -> HTTPException:
    if isinstance(error, github.RateLimited):
        return HTTPException(status.HTTP_429_TOO_MANY_REQUESTS, "GitHub rate limit reached. Try again shortly.")
    return HTTPException(status.HTTP_502_BAD_GATEWAY, "GitHub could not load that repository. Try again.")


async def _load_repository(reference: str, user: CurrentUser) -> tuple[dict[str, Any], list[dict[str, Any]]]:
    try:
        full_name = normalize_repository(reference)
    except ValueError as error:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, str(error)) from error
    try:
        repo = await github.get_repo(user.github_token, full_name)
        if repo is None:
            raise HTTPException(status.HTTP_404_NOT_FOUND, "Repository not found or unavailable to this GitHub account.")
        if repo.get("private"):
            raise HTTPException(status.HTTP_400_BAD_REQUEST, "This first version supports public repositories only.")
        if not _can_manage(repo, user):
            raise HTTPException(status.HTTP_403_FORBIDDEN, "You need write or maintainer access to publish bounties for this repository.")
        issues = await github.list_repo_issues(user.github_token, repo["full_name"])
    except HTTPException:
        raise
    except github.GitHubError as error:
        raise _github_error(error) from error
    return repo, issues


def _issue_out(issue: dict[str, Any], language: str | None) -> RepositoryIssue:
    labels = _labels(issue)
    return RepositoryIssue(
        number=issue["number"],
        title=issue["title"],
        html_url=issue["html_url"],
        labels=labels,
        suggested_category=classify(language, labels),
    )


def _as_datetime(value: str | None) -> datetime | None:
    return datetime.fromisoformat(value.replace("Z", "+00:00")) if value else None


@router.post("/repositories/inspect", response_model=RepositoryInspection)
async def inspect_repository(
    request: RepositoryRequest,
    user: CurrentUser = Depends(get_current_user_with_token),
) -> RepositoryInspection:
    repo, issues = await _load_repository(request.repository, user)
    return RepositoryInspection(
        full_name=repo["full_name"],
        owner_type=repo.get("owner", {}).get("type", "Unknown"),
        description=repo.get("description"),
        open_issues=[_issue_out(issue, repo.get("language")) for issue in issues],
        truncated=len(issues) >= 500,
    )


@router.post("/bounties", response_model=PublishResponse)
async def publish_bounties(
    request: PublishRequest,
    user: CurrentUser = Depends(get_current_user_with_token),
) -> PublishResponse:
    repo, open_issues = await _load_repository(request.repository, user)
    by_number = {issue["number"]: issue for issue in open_issues}
    if len({item.number for item in request.issues}) != len(request.issues):
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Select each issue only once.")
    missing = [item.number for item in request.issues if item.number not in by_number]
    if missing:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, f"These issues are no longer open: {', '.join(f'#{number}' for number in missing)}")

    try:
        db_pool = pool()
    except DatabaseNotConfigured as error:
        raise HTTPException(status.HTTP_503_SERVICE_UNAVAILABLE, str(error)) from error

    async with db_pool.acquire() as connection, connection.transaction():
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
        for item in request.issues:
            issue = by_number[item.number]
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

    return PublishResponse(repository=repo["full_name"], published=len(request.issues))
