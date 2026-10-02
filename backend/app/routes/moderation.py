"""Moderation: reporting something, reviewing it, and correcting the ledger without rewriting it.

Deliberately small. There is no admin dashboard, no queue, no assignment. One table, three endpoints, and
one rule that matters more than any of them:

    **A resolution never edits or deletes a historical award.**

Withdrawing points writes a new `void` entry in `points_ledger` with the negation of the original value
and a reason. Both rows stay. The history shows what happened *and* that it was undone, which is the whole
reason the ledger is append-only.

Who may moderate. GitBounty has no trustworthy administrator model -- no roles table, no invitation flow,
no way to verify that whoever first signed in should have power over everybody else's points. So the
administrators are a configured list of **stable GitHub numeric ids** (`ADMIN_GITHUB_IDS`), and the list
is empty by default. An empty list means nobody is an administrator and every moderation endpoint answers
403: it fails closed, which is the only safe behaviour for a feature that can take somebody's points away.

Anybody signed in may *report* something. Only an administrator may see the reports or act on one.
"""

from __future__ import annotations

import logging
from datetime import datetime
from typing import Annotated, Literal

import asyncpg
from fastapi import APIRouter, Depends, HTTPException, Query, status
from pydantic import BaseModel, Field

from ..auth import CurrentUser, get_current_user
from ..config import settings
from ..db import DatabaseNotConfigured, pool
from ..features.points.store import record_adjustment, upsert_user

logger = logging.getLogger("gitbounty.moderation")

router = APIRouter(prefix="/api/moderation", tags=["moderation"])

SubjectKind = Literal["bounty", "pull_request", "ledger_entry"]
Resolution = Literal["dismissed", "upheld", "award_withdrawn"]


def is_admin(user: CurrentUser) -> bool:
    """Whether this person may review flags.

    Keyed on the **GitHub numeric id**: a login can be changed by its owner, and an internal row id
    differs between databases, so neither is safe to write in configuration.
    """
    administrators = settings.admin_github_id_list
    return bool(administrators) and user.github_id in administrators


async def require_admin(user: Annotated[CurrentUser, Depends(get_current_user)]) -> CurrentUser:
    """Fail closed. No administrators configured means nobody is one."""
    if not is_admin(user):
        logger.warning("moderation access refused", extra={
            "event": "authz.refused", "area": "moderation",
            "github_login": user.github_login,
            "any_admins_configured": bool(settings.admin_github_id_list),
        })
        raise HTTPException(
            status.HTTP_403_FORBIDDEN,
            "Moderation is restricted to configured administrators.",
        )
    return user


def _db():
    try:
        return pool()
    except DatabaseNotConfigured as error:
        raise HTTPException(status.HTTP_503_SERVICE_UNAVAILABLE, str(error)) from error


# --- schemas --------------------------------------------------------------


class FlagRequest(BaseModel):
    """What is being reported, and why. Exactly one subject must be identified."""

    subject_kind: SubjectKind
    reason: str = Field(min_length=10, max_length=2000)

    bounty_repo_full_name: str | None = Field(default=None, pattern=r"^[A-Za-z0-9._-]+/[A-Za-z0-9._-]+$")
    bounty_issue_number: int | None = Field(default=None, gt=0)
    github_pr_id: int | None = Field(default=None, gt=0)
    ledger_entry_id: int | None = Field(default=None, gt=0)

    def subject_is_identified(self) -> bool:
        if self.subject_kind == "bounty":
            return self.bounty_repo_full_name is not None and self.bounty_issue_number is not None
        if self.subject_kind == "pull_request":
            return self.github_pr_id is not None
        return self.ledger_entry_id is not None


class ResolveRequest(BaseModel):
    resolution: Resolution
    reason: str = Field(min_length=10, max_length=2000)


class Flag(BaseModel):
    id: int
    subject_kind: SubjectKind
    bounty_repo_full_name: str | None
    bounty_issue_number: int | None
    github_pr_id: int | None
    ledger_entry_id: int | None
    reason: str
    reporter_login: str
    status: Literal["open", "upheld", "dismissed"]
    moderator_login: str | None
    resolution: Resolution | None
    resolution_reason: str | None
    resolution_ledger_entry_id: int | None
    resolved_at: datetime | None
    created_at: datetime


class FlagList(BaseModel):
    items: list[Flag]
    page: int
    per_page: int
    total: int
    has_more: bool


_FLAG_COLUMNS = """
    id, subject_kind, bounty_repo_full_name, bounty_issue_number, github_pr_id, ledger_entry_id,
    reason, reporter_login, status, moderator_login, resolution, resolution_reason,
    resolution_ledger_entry_id, resolved_at, created_at
"""


# --- reporting ------------------------------------------------------------


@router.post("/flags", response_model=Flag, status_code=status.HTTP_201_CREATED)
async def raise_flag(
    request: FlagRequest,
    user: Annotated[CurrentUser, Depends(get_current_user)],
) -> Flag:
    """Report a bounty, a contribution or an award. Any signed-in person may do this.

    Raising a flag changes nothing by itself: no points move, nothing is hidden. It records a concern for
    a human to look at. That is the point -- an automatic consequence for an unreviewed report would be a
    denial-of-service tool pointed at other contributors.
    """
    if not request.subject_is_identified():
        raise HTTPException(
            status.HTTP_400_BAD_REQUEST,
            f"A {request.subject_kind.replace('_', ' ')} flag must say which one.",
        )

    async with _db().acquire() as connection:
        actor_id = user.id or await upsert_user(
            connection, user.github_id, user.github_login, user.avatar_url
        )
        try:
            row = await connection.fetchrow(
                f"""
                insert into moderation_flags (
                    subject_kind, bounty_repo_full_name, bounty_issue_number, github_pr_id,
                    ledger_entry_id, reason, reporter_user_id, reporter_login
                ) values ($1, $2, $3, $4, $5, $6, $7, $8)
                returning {_FLAG_COLUMNS}
                """,
                request.subject_kind, request.bounty_repo_full_name, request.bounty_issue_number,
                request.github_pr_id, request.ledger_entry_id, request.reason.strip(),
                actor_id, user.github_login,
            )
        except asyncpg.ForeignKeyViolationError as error:
            raise HTTPException(status.HTTP_404_NOT_FOUND, "No such ledger entry.") from error

    logger.info("flag raised", extra={
        "event": "moderation.flagged", "flag_id": row["id"],
        "subject_kind": request.subject_kind, "reporter": user.github_login,
    })
    return Flag(**dict(row))


# --- reviewing ------------------------------------------------------------


@router.get("/flags", response_model=FlagList)
async def list_flags(
    _: Annotated[CurrentUser, Depends(require_admin)],
    flag_status: Annotated[Literal["open", "upheld", "dismissed"] | None, Query(alias="status")] = "open",
    page: Annotated[int, Query(ge=1)] = 1,
    per_page: Annotated[int, Query(ge=1, le=100)] = 25,
) -> FlagList:
    """The reports, newest first. Administrators only."""
    async with _db().acquire() as connection:
        rows = await connection.fetch(
            f"""
            select {_FLAG_COLUMNS}, count(*) over () as total
            from moderation_flags
            where ($1::text is null or status = $1)
            order by created_at desc, id desc
            limit $2 offset $3
            """,
            flag_status, per_page, (page - 1) * per_page,
        )

    total = rows[0]["total"] if rows else 0
    return FlagList(
        items=[Flag(**{k: v for k, v in dict(row).items() if k != "total"}) for row in rows],
        page=page,
        per_page=per_page,
        total=total,
        has_more=page * per_page < total,
    )


@router.post("/flags/{flag_id}/resolve", response_model=Flag)
async def resolve_flag(
    flag_id: int,
    request: ResolveRequest,
    moderator: Annotated[CurrentUser, Depends(require_admin)],
) -> Flag:
    """Resolve a report. Administrators only.

    `dismissed` and `upheld` record a judgement and move nothing. `award_withdrawn` additionally writes a
    **new** `void` entry in points_ledger for the negation of the flagged award, with the moderator's
    reason attached. The original award is not touched: it is still there, still readable, and the
    withdrawal sits beside it.
    """
    db_pool = _db()
    async with db_pool.acquire() as connection, connection.transaction():
        flag = await connection.fetchrow(
            "select * from moderation_flags where id = $1 for update", flag_id
        )
        if flag is None:
            raise HTTPException(status.HTTP_404_NOT_FOUND, "No such flag.")
        if flag["status"] != "open":
            raise HTTPException(
                status.HTTP_409_CONFLICT,
                f"That flag was already resolved as {flag['resolution']}.",
            )

        moderator_id = moderator.id or await upsert_user(
            connection, moderator.github_id, moderator.github_login, moderator.avatar_url
        )
        void_entry_id: int | None = None

        if request.resolution == "award_withdrawn":
            void_entry_id = await _withdraw_award(connection, flag, request.reason, moderator)

        row = await connection.fetchrow(
            f"""
            update moderation_flags set
                status = $2,
                resolution = $3,
                resolution_reason = $4,
                moderator_user_id = $5,
                moderator_login = $6,
                resolved_at = now(),
                resolution_ledger_entry_id = $7
            where id = $1
            returning {_FLAG_COLUMNS}
            """,
            flag_id,
            "dismissed" if request.resolution == "dismissed" else "upheld",
            request.resolution,
            request.reason.strip(),
            moderator_id,
            moderator.github_login,
            void_entry_id,
        )

    logger.warning("flag resolved", extra={
        "event": "moderation.resolved", "flag_id": flag_id,
        "resolution": request.resolution, "moderator": moderator.github_login,
        "void_entry_id": void_entry_id,
    })
    return Flag(**dict(row))


async def _withdraw_award(
    connection: asyncpg.Connection,
    flag: asyncpg.Record,
    reason: str,
    moderator: CurrentUser,
) -> int:
    """Write the void entry, or explain why there is nothing to withdraw."""
    if flag["subject_kind"] != "ledger_entry" or flag["ledger_entry_id"] is None:
        raise HTTPException(
            status.HTTP_400_BAD_REQUEST,
            "Only a flag against a specific ledger entry can withdraw an award. "
            "Flag the entry itself, from the contributor's points history.",
        )

    award = await connection.fetchrow(
        "select id, user_id, points, category, github_pr_id, bounty_repo_full_name, bounty_issue_number "
        "from points_ledger where id = $1",
        flag["ledger_entry_id"],
    )
    if award is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "That ledger entry no longer exists.")
    if award["points"] <= 0:
        raise HTTPException(
            status.HTTP_400_BAD_REQUEST,
            "That entry is not an award; there is nothing to withdraw.",
        )

    already_void = await connection.fetchval(
        """
        select exists (
            select 1 from points_ledger
            where kind = 'void' and user_id = $1 and github_pr_id is not distinct from $2
              and reason like $3
        )
        """,
        award["user_id"], award["github_pr_id"], f"%entry {award['id']}%",
    )
    if already_void:
        raise HTTPException(status.HTTP_409_CONFLICT, "That award has already been withdrawn.")

    # A new entry, never an edit. Both rows stay.
    return await record_adjustment(
        connection,
        user_id=award["user_id"],
        points=-award["points"],
        kind="void",
        category=award["category"],
        reason=(
            f"Award withdrawn by moderation (@{moderator.github_login}), flag {flag['id']}, "
            f"entry {award['id']}: {reason.strip()}"
        ),
        github_pr_id=award["github_pr_id"],
        bounty_repo_full_name=award["bounty_repo_full_name"],
        bounty_issue_number=award["bounty_issue_number"],
    )
