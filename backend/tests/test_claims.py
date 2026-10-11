"""Unregistered rewards stay private, keep their owner/value, and credit once."""

from app.features.points.allocations import credit, reserve
from app.features.points.store import leaderboard, record_merges, upsert_user, user_totals
from .test_store import bounty, merge


async def test_allocation_registration_claim_and_sync_share_one_award(db):
    award = {
        "kind": "bounty_award", "points": 40, "category": "backend",
        "category_source": "maintainer", "rule_version": "v1", "reason": "Closes #12",
        "github_pr_id": 801, "pr_repo_full_name": "org/project", "pr_number": 801,
        "pr_author_login": "old-name", "merged_at": "2026-10-01T12:00:00+00:00",
        "bounty_repo_full_name": "org/project", "bounty_issue_number": 12,
        "bounty_points_at_award": 40, "maintainer_user_id": None,
    }
    assert await reserve(db, 991, award)
    assert not await reserve(db, 992, {**award, "points": 90})
    assert (await leaderboard(db)).rows == []
    assert await db.fetchval("select count(*) from users") == 0
    allocation = await db.fetchval("select id from reward_allocations where github_id = 991")
    stranger = await upsert_user(db, 992, "old-name")
    assert await credit(db, allocation, stranger) == 0
    owner = await upsert_user(db, 991, "renamed-author")
    assert await credit(db, allocation, owner) == 40
    assert await credit(db, allocation, owner) == 0
    assert (await user_totals(db, owner))["points"] == 40
    assert (await leaderboard(db)).rows[0].github_login == "renamed-author"
    await record_merges(db, owner, [merge(801, on_bounty=bounty(points=90), baseline_eligible=False)])
    assert (await user_totals(db, owner))["points"] == 40
    assert await db.fetchval("select count(*) from points_ledger") == 1
