import asyncio
from unittest.mock import AsyncMock

import httpx
import respx

from app.services.issue_state import reconcile_issues, store_issue_states
from app.services.webhooks import apply_delivery
from app import github_app


@respx.mock
def test_reconciliation_updates_verified_states_and_preserves_unavailable_issues():
    respx.get("https://api.github.com/repos/org/repo/issues/1").respond(200, json={"id": 101, "number": 1, "state": "closed"})
    respx.get("https://api.github.com/repos/org/repo/issues/2").respond(404)
    respx.get("https://api.github.com/repos/org/repo/issues/3").respond(200, json={"id": 103, "number": 3, "state": "open"})

    async def run():
        async with httpx.AsyncClient() as client:
            states = await reconcile_issues(client, "test-token", [("org/repo", 1), ("org/repo", 2), ("org/repo", 3)])
        assert states == [("org/repo", 1, 101, "closed"), ("org/repo", 3, 103, "open")]
        connection = AsyncMock()
        await store_issue_states(connection, states)
        assert connection.execute.await_count == 2
        assert connection.execute.call_args_list[0].args[1:] == ("org/repo", 1, 101, "closed")
    asyncio.run(run())


def test_issue_webhook_uses_live_state_and_never_allocates_rewards(monkeypatch):
    monkeypatch.setattr(github_app, "installation_for", AsyncMock(return_value={"id": 10}))
    monkeypatch.setattr(github_app, "installation_token", AsyncMock(return_value="test-token"))
    monkeypatch.setattr(github_app, "request", AsyncMock(side_effect=[
        {"id": 100, "private": False}, {"id": 101, "number": 1, "state": "open"},
    ]))
    connection = AsyncMock()
    connection.fetchrow.return_value = {"github_id": 100, "full_name": "org/repo"}
    payload = {"action": "closed", "installation": {"id": 10},
               "repository": {"id": 100, "full_name": "org/repo", "private": False},
               "issue": {"id": 101, "number": 1, "state": "closed"}}
    assert asyncio.run(apply_delivery(connection, "issues", payload)) == "processed"
    assert connection.execute.call_args.args[1:] == ("org/repo", 1, 101, "open")
    connection.fetchval.assert_not_awaited()


def test_issue_webhook_rejects_unconnected_repository():
    connection = AsyncMock()
    connection.fetchrow.return_value = None
    payload = {"action": "closed", "installation": {"id": 10},
               "repository": {"id": 100, "full_name": "org/repo", "private": False},
               "issue": {"id": 101, "number": 1}}
    assert asyncio.run(apply_delivery(connection, "issues", payload)) == "ignored"
    connection.execute.assert_not_awaited()
