"""Reserve awards by GitHub identity; credit them only to that identity's account."""

import json

from fastapi import APIRouter, Depends

from ...auth import CurrentUser, get_current_user
from ...db import pool

router = APIRouter(prefix="/api/me/claims", tags=["points"])

# Frozen ledger fields shared by sync, webhook allocation, and claim.
AWARD_COLUMNS = (
    "kind, points, category, category_source, rule_version, reason, github_pr_id, "
    "pr_repo_full_name, pr_number, pr_author_login, merged_at, bounty_repo_full_name, "
    "bounty_issue_number, bounty_points_at_award, maintainer_user_id"
)


async def reserve(connection, github_id: int, award: dict, user_id: int | None = None) -> bool:
    """A conflicting reservation stays with its original owner and frozen value."""
    async with connection.transaction():
        allocation_id = await connection.fetchval(
            """insert into reward_allocations
               (github_id, github_pr_id, kind, bounty_repo_full_name, bounty_issue_number, award)
               values ($1, $2, $3, $4, $5, $6::jsonb)
               on conflict do nothing returning id""",
            github_id, award["github_pr_id"], award["kind"],
            award.get("bounty_repo_full_name"), award.get("bounty_issue_number"),
            json.dumps(award, default=str),
        )
        if allocation_id is None:
            return False
        if user_id is not None:
            await credit(connection, allocation_id, user_id)
        return True


async def credit(connection, allocation_id: int, user_id: int) -> int:
    """Caller holds the reservation lock; SQL verifies numeric identity again."""
    row = await connection.fetchrow(
        """select a.award from reward_allocations a join users u on u.github_id = a.github_id
           where a.id = $1 and u.id = $2 and a.ledger_entry_id is null for update of a""",
        allocation_id, user_id,
    )
    if row is None:
        return 0
    entry = await connection.fetchrow(
        f"""insert into points_ledger (user_id, {AWARD_COLUMNS})
            select $1, {AWARD_COLUMNS} from jsonb_populate_record(null::points_ledger, $2::jsonb)
            returning id, points""",
        user_id, row["award"],
    )
    await connection.execute(
        "update reward_allocations set ledger_entry_id = $2 where id = $1",
        allocation_id, entry["id"],
    )
    await connection.execute(
        """insert into merged_prs
           (user_id, github_pr_id, repo_full_name, number, title, url, merged_at, category,
            closed_issue_repo, closed_issue_number, issue_points, points)
           select $1, r.github_pr_id, r.pr_repo_full_name, r.pr_number,
                  coalesce($2::jsonb->>'title', 'Merged pull request'),
                  coalesce($2::jsonb->>'url', 'https://github.com/' || r.pr_repo_full_name || '/pull/' || r.pr_number),
                  r.merged_at, r.category, r.bounty_repo_full_name, r.bounty_issue_number,
                  r.bounty_points_at_award, r.points
           from jsonb_populate_record(null::points_ledger, $2::jsonb) r
           on conflict (user_id, github_pr_id) do nothing""",
        user_id, row["award"],
    )
    return entry["points"]


@router.get("")
async def pending_claims(user: CurrentUser = Depends(get_current_user)):
    async with pool().acquire() as connection:
        rows = await connection.fetch(
            """select id, award->>'kind' as kind, (award->>'points')::int as points,
                      award->>'pr_repo_full_name' as repository,
                      (award->>'pr_number')::int as pr_number
               from reward_allocations where github_id = $1 and ledger_entry_id is null order by id""",
            user.github_id,
        )
    return {"items": [dict(row) for row in rows], "points": sum(row["points"] for row in rows)}


@router.post("")
async def claim_points(user: CurrentUser = Depends(get_current_user)):
    async with pool().acquire() as connection, connection.transaction():
        user_id = await connection.fetchval("select id from users where github_id = $1", user.github_id)
        rows = await connection.fetch(
            """select id from reward_allocations
               where github_id = $1 and ledger_entry_id is null order by id for update""",
            user.github_id,
        )
        points = 0
        for row in rows:
            points += await credit(connection, row["id"], user_id)
    return {"claimed_points": points}
