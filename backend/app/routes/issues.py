"""The issue board.

Reads our own tables. The only thing that talks to GitHub is the sync in
services/issue_sync.py, and it is never triggered by a page load.
"""

from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException, Query

from ..auth import CurrentUser, get_current_user_with_token
from ..categories import CATEGORIES
from ..db import fetch_all
from ..models import (
    ISSUE_LIST_COLUMNS,
    CategoryCounts,
    IssueList,
    SyncResult,
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
    user: CurrentUser = Depends(get_current_user_with_token),
) -> SyncResult:
    """Refresh the board, running against the signed-in user's own rate limit."""
    return SyncResult(**await run_sync(user.github_token, user.github_login))


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
        join issue_points ip on ip.repo_full_name = r.full_name and ip.issue_number = i.number
        left join users u on u.id = ip.set_by_user_id
        where i.state = 'open'
          and ($1::text is null or i.category = $1)
          and ($2::text is null or lower(i.language) = lower($2))
          and ($3::text is null or i.title ilike '%' || $3 || '%')
        order by {order_by}
        limit $4 offset $5
        """,
        category,
        language,
        q,
        per_page + 1,
        (page - 1) * per_page,
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
        from issues i
        join repositories r on r.id = i.repository_id
        join issue_points ip on ip.repo_full_name = r.full_name and ip.issue_number = i.number
        where i.state = 'open'
        group by category
        """
    )
    return CategoryCounts(**{row["category"]: row["count"] for row in rows})
