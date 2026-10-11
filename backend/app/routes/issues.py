"""The public issue board, backed by maintainer-published bounties."""

from __future__ import annotations

from sqlalchemy import and_, func, select
from sqlalchemy.exc import ProgrammingError
from fastapi import APIRouter, HTTPException, Query

from ..categories import CATEGORIES
from ..db import DatabaseNotConfigured, session
from ..orm import AvaxRewardTerms, Issue, IssuePoints, Repository, User
from ..avax import reward_fields
from ..models import (
    IssueList,
    IssueOut,
)

router = APIRouter(tags=["issues"])

# Whitelisted, because the chosen value goes into an order-by clause.
_ORDER_BY = {
    "updated": (Issue.issue_updated_at.desc().nulls_last(),),
    "stars": (Repository.stargazers_count.desc(), Issue.issue_updated_at.desc()),
}


@router.get("/api/issues", response_model=IssueList)
async def browse_issues(
    category: str | None = Query(default=None, description="frontend, backend, fullstack or docs"),
    language: str | None = Query(default=None),
    q: str | None = Query(default=None, description="search the issue title"),
    repository: str | None = Query(default=None, description="exact owner/repository name"),
    beginner: bool = Query(default=False, description="only maintainer-labeled good first issues"),
    sort: str = Query(default="updated", description="updated or stars"),
    page: int = Query(default=1, ge=1),
    per_page: int = Query(default=25, ge=1, le=100),
) -> IssueList:
    """The issue board. Reads our own tables, never GitHub."""
    if category is not None and category not in CATEGORIES:
        raise HTTPException(
            status_code=400, detail=f"category must be one of {', '.join(CATEGORIES)}"
        )
    order_by = _ORDER_BY.get(sort)
    if order_by is None:
        raise HTTPException(status_code=400, detail="sort must be updated or stars")

    query = _published_issues(select(
        Issue.id, Issue.number, Issue.title, Issue.html_url, Issue.category, Issue.language,
        Issue.labels, Issue.comments_count, Issue.issue_created_at, Issue.issue_updated_at,
        Repository.full_name.label("repository"),
        Repository.description.label("repository_description"),
        Repository.stargazers_count.label("stars"), IssuePoints.points,
        User.github_login.label("posted_by"),
        AvaxRewardTerms.amount_wei.label("reward_wei"),
        AvaxRewardTerms.chain_id.label("reward_chain_id"),
    )).outerjoin(User, User.id == IssuePoints.set_by_user_id).outerjoin(
        AvaxRewardTerms, AvaxRewardTerms.bounty_id == IssuePoints.id,
    )
    if category is not None:
        query = query.where(Issue.category == category)
    if language is not None:
        query = query.where(func.lower(Issue.language) == language.lower())
    if q is not None:
        query = query.where(Issue.title.ilike(f"%{q}%"))
    if repository is not None:
        query = query.where(func.lower(Repository.full_name) == repository.lower())
    if beginner:
        label = func.unnest(Issue.labels).column_valued("issue_label")
        query = query.where(select(1).where(func.lower(label).in_(
            ("good first issue", "good-first-issue", "good first contribution", "good-first-contribution"),
        )).exists())
    # One extra row answers has_more without a second count query.
    query = query.order_by(*order_by, Issue.id.asc()).limit(per_page + 1).offset((page - 1) * per_page)
    rows = await _read(query)

    return IssueList(
        items=[IssueOut(**{
            **dict(row), **reward_fields(row["reward_wei"], row["reward_chain_id"]),
        }) for row in rows[:per_page]],
        page=page,
        per_page=per_page,
        sort=sort,
        has_more=len(rows) > per_page,
    )


def _published_issues(query):
    return (
        query.select_from(Issue)
        .join(Repository, Repository.id == Issue.repository_id)
        .join(IssuePoints, and_(
            func.lower(IssuePoints.repo_full_name) == func.lower(Repository.full_name),
            IssuePoints.issue_number == Issue.number,
            IssuePoints.status == "published",
        ))
        .where(Issue.state == "open")
    )


async def _read(query):
    try:
        async with session() as db_session:
            # This single SELECT needs no transaction. Avoid remote BEGIN/ROLLBACK round trips.
            await db_session.connection(execution_options={"isolation_level": "AUTOCOMMIT"})
            return (await db_session.execute(query)).mappings().all()
    except DatabaseNotConfigured as error:
        raise HTTPException(status_code=503, detail=str(error)) from error
    except ProgrammingError as error:
        if getattr(error.orig, "sqlstate", None) != "42P01":
            raise
        raise HTTPException(
            status_code=503,
            detail=(
                "The database is missing a table this needs. Apply the migrations: "
                "`uv run python dev/migrate.py up` (see migrations/README.md)."
            ),
        ) from error
