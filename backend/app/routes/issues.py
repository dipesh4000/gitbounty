"""The issue board.

Reads our own tables. The only thing that talks to GitHub is the sync in
services/issue_sync.py, and it is never triggered by a page load.
"""

from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException, Query

from ..categories import CATEGORIES
from ..db import fetch_all
from ..dependencies import current_user, current_user_token
from ..models import (
    ISSUE_LIST_COLUMNS,
    CategoryCounts,
    IssueList,
    SyncResult,
    UserPublic,
)
from ..services.issue_sync import run_sync

router = APIRouter(tags=["issues"])

# Whitelisted, because the chosen value goes into an order-by clause.
_ORDER_BY = {
    "updated": "i.issue_updated_at desc nulls last",
    "stars": "r.stargazers_count desc, i.issue_updated_at desc",
}


@router.post("/api/issues/sync", response_model=SyncResult)
async def sync_issues(
    user: UserPublic = Depends(current_user),
    token: str = Depends(current_user_token),
) -> SyncResult:
    """Refresh the board, running against the signed-in user's own rate limit."""
    return SyncResult(**await run_sync(token, user.github_login))


@router.get("/api/issues", response_model=IssueList)
async def browse_issues(
    category: str | None = Query(default=None, description="frontend, backend, fullstack or docs"),
    language: str | None = Query(default=None),
    q: str | None = Query(default=None, description="search the issue title"),
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

    # Fetch one extra row to find out whether another page exists, without
    # paying for a second count query.
    rows = await fetch_all(
        f"""
        select {ISSUE_LIST_COLUMNS}
        from issues i
        join repositories r on r.id = i.repository_id
        where i.state = 'open'
          and (%(category)s::text is null or i.category = %(category)s)
          and (%(language)s::text is null or lower(i.language) = lower(%(language)s))
          and (%(q)s::text is null or i.title ilike '%%' || %(q)s || '%%')
        order by {order_by}
        limit %(limit)s offset %(offset)s
        """,
        {
            "category": category,
            "language": language,
            "q": q,
            "limit": per_page + 1,
            "offset": (page - 1) * per_page,
        },
    )

    return IssueList(
        items=rows[:per_page],
        page=page,
        per_page=per_page,
        sort=sort,
        has_more=len(rows) > per_page,
    )


@router.get("/api/issues/categories", response_model=CategoryCounts)
async def category_counts() -> CategoryCounts:
    """How many open issues sit in each category. Drives the filter chips."""
    rows = await fetch_all(
        """
        select category, count(*) as count
        from issues
        where state = 'open'
        group by category
        """
    )
    return CategoryCounts(**{row["category"]: row["count"] for row in rows})
