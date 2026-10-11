"""The shapes the API returns.

These are Pydantic models, not ORM models. `migrations/` is the record of what
the database looks like (rules.md section 4), and nothing in this file creates,
alters or reflects a table.

Declaring them buys two things:

  - **A response model is a filter.** FastAPI drops any field the model does not
    declare, so the encrypted GitHub token cannot reach a client even if someone
    later changes a query to select it. Before this, the only thing standing
    there was a hand-written column list and a comment asking people not to.
  - **/docs shows the real response shape**, so the website and the extension
    have a contract instead of a guess.
"""

from __future__ import annotations

from datetime import datetime

from pydantic import BaseModel, Field

# --- users ----------------------------------------------------------------

# The only user columns that may be read for an API response.
# github_access_token is deliberately absent, and must stay that way.
USER_PUBLIC_COLUMNS = "id, github_id, github_login, name, avatar_url, created_at, last_login_at"


class UserPublic(BaseModel):
    """A signed-in user, as the browser is allowed to see them."""

    id: int
    github_id: int
    github_login: str
    name: str | None = None
    avatar_url: str | None = None
    created_at: datetime | None = None
    last_login_at: datetime | None = None


# --- issues ---------------------------------------------------------------

class IssueOut(BaseModel):
    """One row on the issue board."""

    id: int
    number: int
    title: str
    html_url: str
    category: str
    language: str | None = None
    labels: list[str] = Field(default_factory=list)
    comments_count: int = 0
    issue_created_at: datetime | None = None
    issue_updated_at: datetime | None = None
    repository: str
    repository_description: str | None = None
    stars: int = 0
    points: int
    posted_by: str | None = None
    reward_avax: str | None = None
    reward_usdc: str | None = None
    reward_chain_id: int | None = None


class IssueList(BaseModel):
    """A page of the board. `has_more` is cheaper than a total count."""

    items: list[IssueOut]
    page: int
    per_page: int
    sort: str
    has_more: bool


# --- misc -----------------------------------------------------------------

class Health(BaseModel):
    status: str
    database: str


class Message(BaseModel):
    status: str
