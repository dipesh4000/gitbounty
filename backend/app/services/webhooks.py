"""Postgres-backed webhook worker. Row locks provide recovery and concurrent-worker safety."""

import asyncio
import json
import logging

import httpx

from .. import github_app
from ..config import settings
from ..db import pool
from ..features.merged_prs.categorise import categorise
from ..features.merged_prs.github import _parse_any_item, fetch_changed_paths
from ..features.merged_prs.lifecycle import assess
from ..features.merged_prs.service import DetectedMerge
from ..features.points.store import published_bounties, record_merges, record_pull_requests

logger = logging.getLogger(__name__)


async def apply_delivery(connection, event: str, payload: dict) -> str:
    installation = payload.get("installation") or {}
    installation_id = installation.get("id")
    if event == "installation" and payload.get("action") in {"deleted", "suspend"}:
        if str(installation.get("app_id")) == settings.github_app_id:
            await connection.execute(
                "update connected_repositories set active = false where installation_id = $1", installation_id,
            )
        return "processed"
    if event == "installation_repositories" and payload.get("action") == "removed":
        removed = [repo["id"] for repo in payload.get("repositories_removed", [])]
        await connection.execute(
            "update connected_repositories set active = false where installation_id = $1 and github_id = any($2::bigint[])",
            installation_id, removed,
        )
        return "processed"
    if event != "pull_request" or payload.get("action") != "closed":
        return "ignored"
    sent_pr = payload.get("pull_request") or {}
    repository = payload.get("repository") or {}
    if not sent_pr.get("merged") or repository.get("private", True):
        return "ignored"
    connected = await connection.fetchrow(
        "select * from connected_repositories where github_id = $1 and installation_id = $2 and active",
        repository.get("id"), installation_id,
    )
    if connected is None or connected["full_name"].casefold() != repository.get("full_name", "").casefold():
        return "ignored"
    full_name = connected["full_name"]
    async with httpx.AsyncClient(timeout=30) as client:
        current = await github_app.installation_for(client, full_name)
        if current["id"] != installation_id:
            return "ignored"
        token = await github_app.installation_token(client, installation_id, connected["github_id"])
        repo = await github_app.request(client, "GET", f"/repos/{full_name}", token)
        if repo["id"] != connected["github_id"] or repo.get("private", True):
            return "ignored"
        number = int(sent_pr["number"])
        pr_data = await github_app.request(client, "GET", f"/repos/{full_name}/pulls/{number}", token)
        author = pr_data["user"]
        if (not pr_data.get("merged") or not pr_data.get("merged_at") or
                pr_data["id"] != sent_pr["id"] or author["id"] != sent_pr["user"]["id"] or
                pr_data["base"]["repo"]["id"] != repo["id"] or not isinstance(author["id"], int) or author["id"] <= 0):
            return "ignored"
        if author["id"] == repo["owner"]["id"]:
            return "ignored"
        # Never create a users row for somebody who has not registered.
        user_id = await connection.fetchval("select id from users where github_id = $1", author["id"])
        pr = _parse_any_item({**pr_data, "repository_url": f"https://api.github.com/repos/{full_name}",
                              "pull_request": {"merged_at": pr_data["merged_at"]}})
        if user_id is not None:
            pr = pr.with_author_user_id(user_id)
        bounties = await published_bounties(connection)
        paths = await fetch_changed_paths(client, full_name, number, token)
        tracked = assess(pr, review=None, inferred_category=categorise(pr, paths), published=bounties,
                         tracked_repositories=frozenset(repo for repo, _ in bounties))
        if not tracked.eligible:
            return "ignored"
        if user_id is not None:
            await record_pull_requests(connection, user_id, [tracked])
        merge = DetectedMerge(pr.as_merged(), tracked.category, tuple(pr.closed_issues),
                              tracked.bounty, tracked.baseline_eligible)
        await record_merges(connection, user_id, [merge], github_id=author["id"])
    return "processed"


async def process_one(connection) -> bool:
    # ponytail: one delivery per transaction, including GitHub reads; split fetch/lease phases if throughput requires it.
    async with connection.transaction():
        row = await connection.fetchrow(
            """select * from webhook_deliveries where status in ('pending', 'failed') and next_attempt_at <= now()
               order by received_at for update skip locked limit 1""",
        )
        if row is None:
            return False
        try:
            async with connection.transaction():
                state = await apply_delivery(connection, row["event"], json.loads(row["payload"]))
        except Exception as error:
            # Save only the error type, not a payload, header, key path or token.
            await connection.execute(
                """update webhook_deliveries set status = 'failed', attempts = attempts + 1, error = $2,
                   next_attempt_at = now() + make_interval(secs => $3) where delivery_id = $1""",
                row["delivery_id"], type(error).__name__, min(3600, 60 * 2 ** min(row["attempts"], 6)),
            )
            logger.warning("Webhook delivery failed: %s", type(error).__name__)
        else:
            await connection.execute(
                """update webhook_deliveries set status = $2, attempts = attempts + 1,
                   error = null, processed_at = now() where delivery_id = $1""", row["delivery_id"], state,
            )
    return True


async def run_worker():
    while True:
        try:
            async with pool().acquire() as connection:
                worked = await process_one(connection)
            if worked:
                continue
        except Exception as error:
            logger.warning("Webhook worker unavailable: %s", type(error).__name__)
        await asyncio.sleep(5)
