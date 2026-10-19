"""The maintainer workspace: which repositories you may publish bounties on, which issues are open in
them, and the full lifecycle of a published bounty.

Two rules shape all of it.

**Authorization is verified server-side on every write, against GitHub, per request.** The client never
asserts that it owns a repository; `github.can_publish_bounties` asks GitHub what permissions this person
actually has. The same function decides both what is listed and what may be written, so a repository
missing from the list cannot be published to with a hand-made request either.

**Nothing is destroyed.** Unpublishing and archiving set a status; they do not delete a row. Every change
is appended to `issue_points_history` with who made it and what it was before, because a points change
without provenance is not auditable.
"""

from __future__ import annotations

from datetime import UTC, datetime, timedelta
import secrets
from typing import Any, Literal

import asyncpg
from fastapi import APIRouter, Depends, HTTPException, Query, status
from pydantic import BaseModel, Field, field_validator

import logging

from .. import github
from ..avax import avax_to_wei, wei_to_avax, amount_to_units, units_to_amount, reward_fields
from ..config import settings
from ..auth import CurrentUser, get_current_user_with_token
from ..categories import classify
from ..db import DatabaseNotConfigured, pool
from ..features.points.rules import MAX_ISSUE_POINTS, MIN_ISSUE_POINTS, suggested_bounty_points
from ..escrow_chain import derive_bounty_id

Category = Literal[
    "frontend", "backend", "fullstack", "docs", "testing",
    "devops", "design", "mobile", "other",
]

BountyStatus = Literal["published", "unpublished", "archived"]

# "owner/name", the only shape GitHub uses. Validated rather than trusted: the value reaches a GitHub URL
# and several SQL parameters, and "../" or a query string in it is not a repository name.
REPOSITORY_PATTERN = r"^[A-Za-z0-9._-]+/[A-Za-z0-9._-]+$"

logger = logging.getLogger("gitbounty.maintainer")

router = APIRouter(prefix="/api/maintainer", tags=["maintainer"])


# --- schemas --------------------------------------------------------------


class BountyInput(BaseModel):
    repository: str = Field(pattern=REPOSITORY_PATTERN, max_length=300)
    number: int = Field(gt=0, le=2_000_000_000)
    points: int = Field(ge=MIN_ISSUE_POINTS, le=MAX_ISSUE_POINTS)
    category: Category
    reward_avax: str | None = Field(default=None, max_length=79)

    reward_usdc: str | None = Field(default=None, max_length=67)
    escrow_work_ends_at: datetime | None = None

    @field_validator("reward_usdc")
    @classmethod
    def exact_usdc(cls, value: str | None) -> str | None:
        return units_to_amount(amount_to_units(value, 6), 6) if value is not None else None

    @field_validator("reward_avax")
    @classmethod
    def exact_avax(cls, value: str | None) -> str | None:
        return wei_to_avax(avax_to_wei(value)) if value is not None else None

    @field_validator("escrow_work_ends_at")
    @classmethod
    def aware_deadline(cls, value: datetime | None) -> datetime | None:
        if value is not None and value.tzinfo is None:
            raise ValueError("Use a timezone-aware escrow work deadline.")
        return value.astimezone(UTC) if value is not None else None


class PublishRequest(BaseModel):
    issues: list[BountyInput] = Field(min_length=1, max_length=50)


class UpdateBountyRequest(BaseModel):
    """A change to one published bounty. Omitted fields are left alone."""

    points: int | None = Field(default=None, ge=MIN_ISSUE_POINTS, le=MAX_ISSUE_POINTS)
    category: Category | None = None
    status: BountyStatus | None = None
    reason: str = Field(default="", max_length=500)


class Repository(BaseModel):
    full_name: str
    description: str | None
    owner_login: str
    owner_type: str | None
    private: bool
    language: str | None
    stargazers_count: int
    open_issues_count: int
    has_issues: bool
    permission: Literal["admin", "maintain", "owner"]
    publishable: bool
    #: Why not, when `publishable` is false. Shown to the maintainer instead of hiding the repository.
    blocked_reason: str | None = None


class RepositoryList(BaseModel):
    items: list[Repository]
    page: int
    per_page: int
    total: int
    has_more: bool


class RepositoryIssue(BaseModel):
    repository: str
    repository_description: str | None
    number: int
    title: str
    html_url: str
    labels: list[str]
    suggested_category: Category
    #: From a `gitbounty:N` label, clamped into the publishable range. A suggestion only -- a label awards
    #: nothing on its own.
    suggested_points: int | None
    #: The bounty already on this issue, if there is one, so the UI never offers to publish a duplicate.
    existing: "PublishedBounty | None" = None


class IssueList(BaseModel):
    items: list[RepositoryIssue]
    page: int
    per_page: int
    total: int
    has_more: bool
    repository: str


class PublishedBounty(BaseModel):
    repository: str
    issue_number: int
    points: int
    category: Category
    status: BountyStatus
    issue_title: str | None
    issue_state: str | None
    issue_url: str | None
    set_by: str | None
    created_at: datetime
    updated_at: datetime
    #: Whether a contributor has already been awarded this bounty. Once true, the value is frozen in the
    #: ledger and editing the bounty cannot change what was awarded.
    awarded: bool = False
    reward_avax: str | None = None
    reward_usdc: str | None = None
    reward_chain_id: int | None = None
    reward_mode: Literal["points_only", "legacy_payment", "escrow"] = "points_only"
    work_ends_at: datetime | None = None
    claim_until: datetime | None = None


class BountyList(BaseModel):
    items: list[PublishedBounty]
    page: int
    per_page: int
    total: int
    has_more: bool


class BountyHistoryEntry(BaseModel):
    action: str
    points_before: int | None
    points_after: int | None
    status_before: str | None
    status_after: str | None
    category_before: str | None
    category_after: str | None
    actor_login: str
    reason: str
    created_at: datetime


class BountyHistoryResponse(BaseModel):
    repository: str
    issue_number: int
    entries: list[BountyHistoryEntry]


class PublishResponse(BaseModel):
    published: int
    repositories: int


RepositoryIssue.model_rebuild()


# --- helpers --------------------------------------------------------------


def _labels(issue: dict[str, Any]) -> list[str]:
    return [
        str(label["name"] if isinstance(label, dict) else label)
        for label in issue.get("labels", [])
        if (isinstance(label, str) and label) or (isinstance(label, dict) and label.get("name"))
    ]


def _permission(repo: dict[str, Any], user: CurrentUser) -> Literal["admin", "maintain", "owner"]:
    permissions = repo.get("permissions") or {}
    if permissions.get("admin"):
        return "admin"
    if permissions.get("maintain"):
        return "maintain"
    return "owner"


def _github_error(error: Exception) -> HTTPException:
    if isinstance(error, github.GitHubAuthError):
        return HTTPException(status.HTTP_401_UNAUTHORIZED, "Sign in with GitHub again.")
    if isinstance(error, github.RateLimited):
        return HTTPException(
            status.HTTP_429_TOO_MANY_REQUESTS,
            "GitHub's rate limit was reached. Try again shortly.",
            headers={"Retry-After": str(error.retry_after)},
        )
    return HTTPException(status.HTTP_502_BAD_GATEWAY, "GitHub could not be read. Try again.")


def _blocked_reason(repo: dict[str, Any]) -> str | None:
    """Why a repository this person *can* administer still cannot carry a bounty."""
    if repo.get("private"):
        return (
            "Private repositories are not supported yet: GitBounty asks GitHub only for public data, and "
            "private-repository access is outside the current scope. See docs/architecture.md."
        )
    if repo.get("archived"):
        return "This repository is archived on GitHub, so its issues cannot be worked on."
    if not repo.get("has_issues", True):
        return "Issues are turned off for this repository."
    if not repo.get("open_issues_count", 0):
        return "There are no open issues to publish."
    return None


async def _authorized_repository(full_name: str, user: CurrentUser) -> dict[str, Any]:
    """Fetch one repository and confirm, with GitHub, that this person may publish bounties on it."""
    try:
        repo = await github.get_repo(user.github_token, full_name)
    except github.GitHubError as error:
        raise _github_error(error) from error
    if repo is None:
        raise HTTPException(
            status.HTTP_404_NOT_FOUND,
            "That repository was not found, or is not available to your GitHub account. It may have been "
            "renamed, transferred or deleted.",
        )
    if not github.can_publish_bounties(repo, user.github_login):
        logger.warning("authorization refused", extra={
            "event": "authz.refused", "github_login": user.github_login,
            "repository": repo.get("full_name"), "required": "admin or maintain",
        })
        raise HTTPException(
            status.HTTP_403_FORBIDDEN,
            "You need admin or maintain permission on a repository to publish bounties on it.",
        )
    blocked = _blocked_reason(repo)
    if blocked and not repo.get("open_issues_count", 0) == 0:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, blocked)
    if repo.get("private"):
        raise HTTPException(status.HTTP_400_BAD_REQUEST, _blocked_reason(repo) or "Public repositories only.")
    return repo


async def _open_issues(full_name: str, token: str) -> list[dict[str, Any]]:
    try:
        return await github.list_repo_issues(token, full_name)
    except github.GitHubError as error:
        raise _github_error(error) from error


def _issue_out(
    issue: dict[str, Any],
    repo: dict[str, Any],
    existing: PublishedBounty | None = None,
) -> RepositoryIssue:
    labels = _labels(issue)
    return RepositoryIssue(
        repository=repo["full_name"],
        repository_description=repo.get("description"),
        number=issue["number"],
        title=issue["title"],
        html_url=issue["html_url"],
        labels=labels,
        suggested_category=classify(repo.get("language"), labels),
        suggested_points=suggested_bounty_points(labels),
        existing=existing,
    )


def _as_datetime(value: str | None) -> datetime | None:
    return datetime.fromisoformat(value.replace("Z", "+00:00")) if value else None


def _db() -> Any:
    try:
        return pool()
    except DatabaseNotConfigured as error:
        raise HTTPException(status.HTTP_503_SERVICE_UNAVAILABLE, str(error)) from error


def _missing_table(error: asyncpg.UndefinedTableError) -> HTTPException:
    return HTTPException(
        status.HTTP_503_SERVICE_UNAVAILABLE,
        "The database is missing a table this needs. Apply the migrations: "
        "`python dev/migrate.py up` (see migrations/README.md).",
    )


async def _record_history(
    connection: asyncpg.Connection,
    *,
    repository: str,
    issue_number: int,
    action: str,
    user: CurrentUser,
    actor_user_id: int,
    points_before: int | None = None,
    points_after: int | None = None,
    status_before: str | None = None,
    status_after: str | None = None,
    category_before: str | None = None,
    category_after: str | None = None,
    reason: str = "",
) -> None:
    await connection.execute(
        """
        insert into issue_points_history (
            repo_full_name, issue_number, action, points_before, points_after,
            status_before, status_after, category_before, category_after,
            actor_user_id, actor_login, reason
        ) values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
        """,
        repository, issue_number, action, points_before, points_after,
        status_before, status_after, category_before, category_after,
        actor_user_id, user.github_login, reason,
    )


async def _actor_id(connection: asyncpg.Connection, user: CurrentUser) -> int:
    """The `users.id` to attribute a change to.

    `CurrentUser.id` is 0 under the development login stub, which has no database row, so the row is
    resolved (and created if need be) from the stable GitHub id.
    """
    from ..features.points.store import upsert_user

    if user.id:
        return user.id
    return await upsert_user(connection, user.github_id, user.github_login, user.avatar_url)


# --- repositories ---------------------------------------------------------


@router.get("/repositories", response_model=RepositoryList)
async def list_repositories(
    user: CurrentUser = Depends(get_current_user_with_token),
    q: str | None = Query(default=None, max_length=200, description="Filter by name or description."),
    page: int = Query(default=1, ge=1),
    per_page: int = Query(default=30, ge=1, le=100),
) -> RepositoryList:
    """The repositories this person may publish bounties on.

    Includes organisation repositories where GitHub says they have admin or maintain. Repositories they can
    administer but that cannot carry a bounty yet -- private, archived, issues disabled, no open issues --
    are listed with `publishable: false` and the reason, rather than silently omitted: "my repository isn't
    there" is a worse experience than "here is why".
    """
    try:
        repositories = await github.list_authorized_repositories(user.github_token)
    except github.GitHubError as error:
        raise _github_error(error) from error

    allowed = [repo for repo in repositories if github.can_publish_bounties(repo, user.github_login)]
    if q:
        needle = q.casefold()
        allowed = [
            repo for repo in allowed
            if needle in str(repo.get("full_name", "")).casefold()
            or needle in str(repo.get("description") or "").casefold()
        ]

    total = len(allowed)
    window = allowed[(page - 1) * per_page : page * per_page]
    items = []
    for repo in window:
        blocked = _blocked_reason(repo)
        items.append(
            Repository(
                full_name=repo["full_name"],
                description=repo.get("description"),
                owner_login=(repo.get("owner") or {}).get("login", ""),
                owner_type=(repo.get("owner") or {}).get("type"),
                private=bool(repo.get("private")),
                language=repo.get("language"),
                stargazers_count=repo.get("stargazers_count", 0),
                open_issues_count=repo.get("open_issues_count", 0),
                has_issues=bool(repo.get("has_issues", True)),
                permission=_permission(repo, user),
                publishable=blocked is None,
                blocked_reason=blocked,
            )
        )
    return RepositoryList(
        items=items, page=page, per_page=per_page, total=total, has_more=page * per_page < total
    )


@router.get("/repositories/{owner}/{name}/issues", response_model=IssueList)
async def list_repository_issues(
    owner: str,
    name: str,
    user: CurrentUser = Depends(get_current_user_with_token),
    q: str | None = Query(default=None, max_length=200, description="Filter by title, number or label."),
    page: int = Query(default=1, ge=1),
    per_page: int = Query(default=30, ge=1, le=100),
) -> IssueList:
    """Open issues in one repository the user may publish on, with any bounty already on them."""
    full_name = f"{owner}/{name}"
    repo = await _authorized_repository(full_name, user)
    issues = await _open_issues(repo["full_name"], user.github_token)

    if q:
        needle = q.casefold().lstrip("#")
        issues = [
            issue for issue in issues
            if needle in str(issue.get("title", "")).casefold()
            or needle == str(issue.get("number"))
            or any(needle in label.casefold() for label in _labels(issue))
        ]

    existing = await _existing_bounties(repo["full_name"])
    total = len(issues)
    window = issues[(page - 1) * per_page : page * per_page]
    return IssueList(
        items=[_issue_out(issue, repo, existing.get(issue["number"])) for issue in window],
        page=page,
        per_page=per_page,
        total=total,
        has_more=page * per_page < total,
        repository=repo["full_name"],
    )


async def _existing_bounties(repository: str) -> dict[int, PublishedBounty]:
    """Bounties already recorded for one repository, in any status."""
    try:
        db_pool = _db()
    except HTTPException:
        return {}
    try:
        rows = await db_pool.fetch(
            """
            select ip.repo_full_name, ip.issue_number, ip.points, ip.status, ip.reward_mode,
                   coalesce((select amount_wei::text from avax_reward_terms where bounty_id = ip.id),
                            (select amount_units::text from escrow_reward_terms where bounty_id = ip.id)) as reward_wei,
                   coalesce((select chain_id from avax_reward_terms where bounty_id = ip.id),
                            (select chain_id from escrow_reward_terms where bounty_id = ip.id)) as reward_chain_id,
                   (select work_ends_at from escrow_reward_terms where bounty_id = ip.id) as work_ends_at,
                   (select claim_until from escrow_reward_terms where bounty_id = ip.id) as claim_until,
                   ip.created_at, ip.updated_at,
                   u.github_login as set_by,
                   i.title as issue_title, i.state as issue_state, i.html_url as issue_url,
                   coalesce(i.category, 'other') as category,
                   exists (
                       select 1 from points_ledger l
                       where l.kind = 'bounty_award'
                         and lower(l.bounty_repo_full_name) = lower(ip.repo_full_name)
                         and l.bounty_issue_number = ip.issue_number
                   ) as awarded
            from issue_points ip
            left join users u on u.id = ip.set_by_user_id
            left join repositories r on lower(r.full_name) = lower(ip.repo_full_name)
            left join issues i on i.repository_id = r.id and i.number = ip.issue_number
            where lower(ip.repo_full_name) = lower($1)
            """,
            repository,
        )
    except asyncpg.UndefinedTableError:
        return {}
    return {row["issue_number"]: PublishedBounty(**{
        **dict(row), "repository": row["repo_full_name"],
        **reward_fields(row["reward_wei"], row["reward_chain_id"]),
    }) for row in rows}


# --- publishing -----------------------------------------------------------


@router.post("/bounties", response_model=PublishResponse)
async def publish_bounties(
    request: PublishRequest,
    user: CurrentUser = Depends(get_current_user_with_token),
) -> PublishResponse:
    """Publish the selected issues as bounties.

    Every repository named is re-verified against GitHub in this request, and every issue is confirmed still
    open, before anything is written. The whole batch is one transaction: a partial publish would leave the
    maintainer guessing which half went through.
    """
    issue_keys = {(item.repository.casefold(), item.number) for item in request.issues}
    if len(issue_keys) != len(request.issues):
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Select each issue only once.")

    requested_by_repo: dict[str, list[BountyInput]] = {}
    for item in request.issues:
        requested_by_repo.setdefault(item.repository, []).append(item)

    verified: list[tuple[dict[str, Any], list[tuple[BountyInput, dict[str, Any]]]]] = []
    for reference, requested in requested_by_repo.items():
        repo = await _authorized_repository(reference, user)
        open_issues = await _open_issues(repo["full_name"], user.github_token)
        by_number = {issue["number"]: issue for issue in open_issues}
        missing = [item.number for item in requested if item.number not in by_number]
        if missing:
            missing_text = ", ".join(f"#{number}" for number in missing)
            raise HTTPException(
                status.HTTP_400_BAD_REQUEST,
                f"These issues are no longer open in {repo['full_name']}: {missing_text}",
            )
        verified.append((repo, [(item, by_number[item.number]) for item in requested]))

    db_pool = _db()
    try:
        async with db_pool.acquire() as connection, connection.transaction():
            actor_id = await _actor_id(connection, user)
            for repo, selected in verified:
                repository_id = await _upsert_repository(connection, repo)
                for item, issue in selected:
                    await _upsert_issue(connection, repository_id, repo, issue, item.category)
                    before = await connection.fetchrow(
                        """
                        select points, status from issue_points
                        where lower(repo_full_name) = lower($1) and issue_number = $2
                        """,
                        repo["full_name"], issue["number"],
                    )
                    bounty_id = await connection.fetchval(
                        """
                        insert into issue_points (repo_full_name, issue_number, points, set_by_user_id, status)
                        values ($1, $2, $3, $4, 'published')
                        on conflict (repo_full_name, issue_number) do update set
                            points = excluded.points,
                            set_by_user_id = excluded.set_by_user_id,
                            status = 'published',
                            updated_at = now()
                        returning id
                        """,
                        repo["full_name"], issue["number"], item.points, actor_id,
                    )
                    terms = await connection.fetchrow(
                        "select amount_wei, payer_github_id, chain_id from avax_reward_terms where bounty_id = $1",
                        bounty_id,
                    )
                    cash = item.reward_usdc if item.reward_usdc is not None else item.reward_avax
                    if settings.escrow_execution_mode == "sponsored" and cash is not None and item.escrow_work_ends_at is None:
                        raise HTTPException(422, "Set a work deadline for the sponsored escrow reward.")
                    chain_id = 43113 if item.reward_usdc is not None else 43114
                    if item.reward_usdc is not None and item.reward_avax is not None:
                        raise HTTPException(422, "Choose one reward asset.")
                    if item.escrow_work_ends_at is not None:
                        if item.reward_usdc is None or item.reward_avax is not None:
                            raise HTTPException(422, "Escrow rewards require a Fuji USDC amount only.")
                        if before is not None:
                            raise HTTPException(409, "Escrow must be fixed on first publication. Create a fresh issue bounty.")
                        if not settings.escrow_enabled or not settings.escrow_contract_address:
                            raise HTTPException(503, "Escrow publishing is not enabled.")
                        if item.escrow_work_ends_at <= datetime.now(UTC) + timedelta(minutes=15):
                            raise HTTPException(422, "The escrow work deadline must be more than 15 minutes away.")
                        payer_address = await connection.fetchval(
                            "select address from wallets where github_id = $1", user.github_id,
                        )
                        if payer_address is None:
                            raise HTTPException(409, "Link the funding wallet before publishing an escrow bounty.")
                        if settings.escrow_execution_mode == "sponsored":
                            from ..sponsored import smart_account
                            payer_address = (await smart_account(connection, user.github_id))["address"]
                        amount = amount_to_units(item.reward_usdc, 6)
                        reference_id = "0x" + secrets.token_hex(32)
                        contract = settings.escrow_contract_address.lower()
                        payer_address = payer_address.lower()
                        onchain_bounty_id = derive_bounty_id(
                            settings.escrow_chain_id, contract, payer_address, reference_id,
                        )
                        await connection.execute(
                            "update issue_points set reward_mode = 'escrow' where id = $1", bounty_id,
                        )
                        await connection.execute(
                            """insert into escrow_reward_terms
                               (bounty_id, chain_id, contract_address, token_address, reference_id,
                                onchain_bounty_id, repository_github_id, issue_github_id,
                                payer_github_id, payer_address, amount_units, work_ends_at, claim_until)
                               values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13)""",
                            bounty_id, settings.escrow_chain_id, contract,
                            settings.escrow_token_address.lower(), reference_id, onchain_bounty_id,
                            repo["id"], issue["id"], user.github_id, payer_address, amount,
                            item.escrow_work_ends_at, item.escrow_work_ends_at + timedelta(days=7),
                        )
                    elif cash is not None:
                        amount = amount_to_units(cash, 6 if chain_id == 43113 else 18)
                        if terms and (int(terms["amount_wei"]) != amount or terms["chain_id"] != chain_id):
                            raise HTTPException(409, "The published payment promise cannot be changed.")
                        if terms is None:
                            active_chain = 43113 if settings.payment_mode == "usdc_fuji" else 43114
                            if chain_id != active_chain:
                                raise HTTPException(409, "The reward asset does not match the configured payment mode.")
                            if before is not None:
                                raise HTTPException(409, "Cash rewards must be agreed on first publication. Create a new bounty.")
                            await connection.execute(
                                "update issue_points set reward_mode = 'legacy_payment' where id = $1",
                                bounty_id,
                            )
                            await connection.execute(
                                "insert into avax_reward_terms (bounty_id, payer_github_id, amount_wei, chain_id) values ($1, $2, $3, $4)",
                                bounty_id, user.github_id, amount, chain_id,
                            )
                    await _record_history(
                        connection,
                        repository=repo["full_name"],
                        issue_number=issue["number"],
                        action="published" if before is None else "repriced",
                        user=user,
                        actor_user_id=actor_id,
                        points_before=before["points"] if before else None,
                        points_after=item.points,
                        status_before=before["status"] if before else None,
                        status_after="published",
                        category_after=item.category,
                        reason=(f"Published with {'Fuji USDC escrow terms' if item.escrow_work_ends_at else 'owner-promised ' + str(cash)}"
                                f"{' USDC (Fuji testnet)' if not item.escrow_work_ends_at and chain_id == 43113 else ' AVAX' if not item.escrow_work_ends_at else ''}."
                                if cash else "Published from the maintainer workspace."),
                    )
    except asyncpg.UndefinedTableError as error:
        raise _missing_table(error) from error

    logger.info("bounties published", extra={
        "event": "bounty.published", "actor": user.github_login,
        "count": len(request.issues), "repositories": len(verified),
        "points": [item.points for item in request.issues],
    })
    return PublishResponse(published=len(request.issues), repositories=len(verified))


async def _upsert_repository(connection: asyncpg.Connection, repo: dict[str, Any]) -> int:
    return await connection.fetchval(
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


async def _upsert_issue(
    connection: asyncpg.Connection,
    repository_id: int,
    repo: dict[str, Any],
    issue: dict[str, Any],
    category: str,
) -> None:
    """Store the issue with the maintainer's category, marked as the maintainer's choice.

    `category_source = 'maintainer'` is what stops a later automated pass from silently reclassifying a
    bounty the maintainer categorised deliberately.
    """
    await connection.execute(
        """
        insert into issues (
            github_id, repository_id, number, title, html_url, state, category, category_source,
            language, labels, comments_count, issue_created_at, issue_updated_at, fetched_at
        ) values ($1, $2, $3, $4, $5, 'open', $6, 'maintainer', $7, $8, $9, $10, $11, now())
        on conflict (github_id) do update set
            repository_id = excluded.repository_id,
            title = excluded.title,
            html_url = excluded.html_url,
            state = 'open',
            category = excluded.category,
            category_source = 'maintainer',
            language = excluded.language,
            labels = excluded.labels,
            comments_count = excluded.comments_count,
            issue_updated_at = excluded.issue_updated_at,
            fetched_at = now()
        """,
        issue["id"], repository_id, issue["number"], issue["title"], issue["html_url"],
        category, repo.get("language"), _labels(issue), issue.get("comments", 0),
        _as_datetime(issue.get("created_at")), _as_datetime(issue.get("updated_at")),
    )


# --- the bounties a maintainer has published ------------------------------


@router.get("/bounties", response_model=BountyList)
async def my_bounties(
    user: CurrentUser = Depends(get_current_user_with_token),
    bounty_status: BountyStatus | None = Query(default=None, alias="status"),
    page: int = Query(default=1, ge=1),
    per_page: int = Query(default=25, ge=1, le=100),
) -> BountyList:
    """Every bounty this maintainer has published, in any status, newest change first."""
    db_pool = _db()
    try:
        async with db_pool.acquire() as connection:
            actor_id = await _actor_id(connection, user)
            rows = await connection.fetch(
                """
                select ip.repo_full_name as repository, ip.issue_number, ip.points, ip.status,
                       (select amount_wei::text from avax_reward_terms where bounty_id = ip.id) as reward_wei,
                   (select chain_id from avax_reward_terms where bounty_id = ip.id) as reward_chain_id,
                       ip.created_at, ip.updated_at,
                       u.github_login as set_by,
                       i.title as issue_title, i.state as issue_state, i.html_url as issue_url,
                       coalesce(i.category, 'other') as category,
                       exists (
                           select 1 from points_ledger l
                           where l.kind = 'bounty_award'
                             and lower(l.bounty_repo_full_name) = lower(ip.repo_full_name)
                             and l.bounty_issue_number = ip.issue_number
                       ) as awarded,
                       count(*) over () as total
                from issue_points ip
                left join users u on u.id = ip.set_by_user_id
                left join repositories r on lower(r.full_name) = lower(ip.repo_full_name)
                left join issues i on i.repository_id = r.id and i.number = ip.issue_number
                where ip.set_by_user_id = $1
                  and ($2::text is null or ip.status = $2)
                order by ip.updated_at desc, ip.issue_number
                limit $3 offset $4
                """,
                actor_id, bounty_status, per_page, (page - 1) * per_page,
            )
    except asyncpg.UndefinedTableError as error:
        raise _missing_table(error) from error

    total = rows[0]["total"] if rows else 0
    items = [PublishedBounty(**{
        **dict(row),
        **reward_fields(row["reward_wei"], row["reward_chain_id"]),
    }) for row in rows]
    return BountyList(
        items=items, page=page, per_page=per_page, total=total, has_more=page * per_page < total
    )


@router.patch("/bounties/{owner}/{name}/{number}", response_model=PublishedBounty)
async def update_bounty(
    owner: str,
    name: str,
    number: int,
    request: UpdateBountyRequest,
    user: CurrentUser = Depends(get_current_user_with_token),
) -> PublishedBounty:
    """Change one bounty's value, category or status.

    Authorization is re-checked against GitHub, so losing maintain permission on a repository ends the
    ability to change its bounties. Every change is appended to `issue_points_history`.

    A bounty that has already been awarded can still be edited -- a maintainer may want to correct or
    archive it -- but the award itself does not move. `bounty_points_at_award` in the ledger is what the
    bounty was worth when it was awarded, and that entry is immutable. The response says `awarded: true` so
    the UI can say as much.
    """
    full_name = f"{owner}/{name}"
    if number <= 0:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "An issue number is a positive integer.")
    await _authorized_repository(full_name, user)

    db_pool = _db()
    try:
        async with db_pool.acquire() as connection, connection.transaction():
            actor_id = await _actor_id(connection, user)
            before = await connection.fetchrow(
                """
                select ip.points, ip.status, coalesce(i.category, 'other') as category
                from issue_points ip
                left join repositories r on lower(r.full_name) = lower(ip.repo_full_name)
                left join issues i on i.repository_id = r.id and i.number = ip.issue_number
                where lower(ip.repo_full_name) = lower($1) and ip.issue_number = $2
                for update of ip
                """,
                full_name, number,
            )
            if before is None:
                raise HTTPException(status.HTTP_404_NOT_FOUND, "No bounty is recorded for that issue.")

            points = request.points if request.points is not None else before["points"]
            new_status = request.status or before["status"]
            category = request.category or before["category"]

            if (points, new_status, category) == (before["points"], before["status"], before["category"]):
                raise HTTPException(status.HTTP_400_BAD_REQUEST, "Nothing to change.")

            await connection.execute(
                """
                update issue_points set points = $3, status = $4, updated_at = now()
                where lower(repo_full_name) = lower($1) and issue_number = $2
                """,
                full_name, number, points, new_status,
            )
            if request.category:
                await connection.execute(
                    """
                    update issues set category = $3, category_source = 'maintainer', fetched_at = now()
                    where repository_id = (select id from repositories where lower(full_name) = lower($1))
                      and number = $2
                    """,
                    full_name, number, category,
                )

            action = _action_for(before, points, new_status, category)
            await _record_history(
                connection,
                repository=full_name,
                issue_number=number,
                action=action,
                user=user,
                actor_user_id=actor_id,
                points_before=before["points"],
                points_after=points,
                status_before=before["status"],
                status_after=new_status,
                category_before=before["category"],
                category_after=category,
                reason=request.reason or f"Changed from the maintainer workspace ({action}).",
            )
    except asyncpg.UndefinedTableError as error:
        raise _missing_table(error) from error

    logger.info("bounty changed", extra={
        "event": "bounty.changed", "actor": user.github_login,
        "repository": full_name, "issue_number": number,
    })
    updated = (await _existing_bounties(full_name)).get(number)
    if updated is None:
        raise HTTPException(status.HTTP_500_INTERNAL_SERVER_ERROR, "The bounty could not be read back.")
    return updated


def _action_for(before: asyncpg.Record, points: int, new_status: str, category: str) -> str:
    """Name the change, for the history. The status change is the most significant, so it wins."""
    if new_status != before["status"]:
        return {
            "unpublished": "unpublished",
            "archived": "archived",
            "published": "republished",
        }[new_status]
    if points != before["points"]:
        return "repriced"
    if category != before["category"]:
        return "recategorised"
    return "repriced"


@router.get("/bounties/{owner}/{name}/{number}/history", response_model=BountyHistoryResponse)
async def bounty_history(
    owner: str,
    name: str,
    number: int,
    user: CurrentUser = Depends(get_current_user_with_token),
) -> BountyHistoryResponse:
    """Every change ever made to one bounty, newest first. Only a maintainer of the repository may read it."""
    full_name = f"{owner}/{name}"
    await _authorized_repository(full_name, user)

    db_pool = _db()
    try:
        rows = await db_pool.fetch(
            """
            select action, points_before, points_after, status_before, status_after,
                   category_before, category_after, actor_login, reason, created_at
            from issue_points_history
            where lower(repo_full_name) = lower($1) and issue_number = $2
            order by created_at desc, id desc
            limit 200
            """,
            full_name, number,
        )
    except asyncpg.UndefinedTableError as error:
        raise _missing_table(error) from error

    return BountyHistoryResponse(
        repository=full_name,
        issue_number=number,
        entries=[BountyHistoryEntry(**dict(row)) for row in rows],
    )
