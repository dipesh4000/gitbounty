"""The shapes the API returns, and the columns the SQL selects to fill them.

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

# The select list behind IssueOut. Kept next to the model so the two cannot
# drift apart unnoticed.
ISSUE_LIST_COLUMNS = """
    i.id, i.number, i.title, i.html_url, i.category, i.language,
    i.labels, i.comments_count, i.issue_created_at, i.issue_updated_at,
    r.full_name        as repository,
    r.description      as repository_description,
    r.stargazers_count as stars
"""


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


class IssueList(BaseModel):
    """A page of the board. `has_more` is cheaper than a total count."""

    items: list[IssueOut]
    page: int
    per_page: int
    sort: str
    has_more: bool


class CategoryCounts(BaseModel):
    """Open issues per category. Drives the filter chips."""

    frontend: int = 0
    backend: int = 0
    fullstack: int = 0
    docs: int = 0


class SyncResult(BaseModel):
    """What one refresh of the board actually did.

    queries_failed and errors are part of the response on purpose: a run that
    loses most of its searches to rate limiting must not look like a clean one.
    """

    synced_by: str
    queries_run: int
    queries_failed: int
    issues_found: int
    issues_stored: int
    skipped_low_star_repos: int = 0
    repositories_known: int
    errors: list[str] = Field(default_factory=list)


# --- misc -----------------------------------------------------------------

class Health(BaseModel):
    status: str
    database: str


class Message(BaseModel):
    status: str
