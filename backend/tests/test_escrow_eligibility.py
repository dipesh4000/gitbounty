from datetime import UTC, datetime, timedelta
from unittest.mock import AsyncMock

import httpx
import pytest

from app.services.escrow_rewards import EscrowIneligible, _closed_event, validate_cash_eligibility


class Connection:
    def __init__(self, rows):
        self.rows = rows

    async def fetch(self, *_args):
        return self.rows


def repo():
    return {"id": 100, "full_name": "org/repo", "default_branch": "main", "owner": {"id": 9}}


def pr(body="Closes #7", base="main"):
    return {
        "id": 300, "number": 12, "body": body, "merged": True, "merged_at": "2026-10-17T10:00:00Z",
        "base": {"ref": base, "repo": {"id": 100, "full_name": "org/repo"}},
        "user": {"id": 2, "login": "contributor"},
    }


@pytest.mark.asyncio
async def test_cash_rules_reject_title_only_and_non_default_branch() -> None:
    async with httpx.AsyncClient() as client:
        with pytest.raises(EscrowIneligible, match="exactly one funded"):
            await validate_cash_eligibility(Connection([]), client, "token", repo(), pr(body=""), 2, 7)
        with pytest.raises(EscrowIneligible, match="default branch"):
            await validate_cash_eligibility(Connection([]), client, "token", repo(), pr(base="release"), 2, 7)


@pytest.mark.asyncio
async def test_cash_rules_keep_numeric_ids_timing_and_closed_event(monkeypatch) -> None:
    funded_at = datetime(2026, 10, 17, 9, tzinfo=UTC)
    terms = {
        "bounty_id": 1, "repository_github_id": 100, "issue_github_id": 200,
        "payer_github_id": 1, "funded_at": funded_at,
        "work_ends_at": funded_at + timedelta(hours=2),
    }
    responses = [
        {"id": 200, "number": 7, "state": "closed"},
        {"data": {"repository": {"issue": {"timelineItems": {
            "pageInfo": {"hasPreviousPage": False, "startCursor": None},
            "nodes": [{"id": "event-1", "createdAt": "2026-10-17T10:00:01Z",
                       "closer": {"__typename": "PullRequest", "databaseId": 300}}],
        }}}}},
    ]
    request = AsyncMock(side_effect=responses)
    monkeypatch.setattr("app.services.escrow_rewards.github_app.request", request)
    async with httpx.AsyncClient() as client:
        evidence = await validate_cash_eligibility(Connection([terms]), client, "token", repo(), pr(), 2, 7)
    assert evidence.closed_event["id"] == "event-1"
    assert evidence.closing_reference == "org/repo#7"
    assert request.await_count == 2


@pytest.mark.asyncio
async def test_closed_event_rejects_ambiguous_matches(monkeypatch) -> None:
    result = {"data": {"repository": {"issue": {"timelineItems": {
        "pageInfo": {"hasPreviousPage": False, "startCursor": None},
        "nodes": [
            {"id": "one", "closer": {"__typename": "PullRequest", "databaseId": 300}},
            {"id": "two", "closer": {"__typename": "PullRequest", "databaseId": 300}},
        ],
    }}}}}
    monkeypatch.setattr("app.services.escrow_rewards.github_app.request", AsyncMock(return_value=result))
    async with httpx.AsyncClient() as client:
        with pytest.raises(EscrowIneligible, match="ambiguous"):
            await _closed_event(client, "token", "org/repo", 7, 300)
