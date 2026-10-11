"""Refresh discovery state from GitHub without creating or removing awards."""
import asyncio
import logging
import httpx

from ..config import settings
from ..github import _headers

logger = logging.getLogger(__name__)


async def reconcile_issues(client, token, bounties):
    semaphore = asyncio.Semaphore(8)

    async def one(reference):
        repository, number = reference
        async with semaphore:
            try:
                response = await client.get(f"{settings.github_api}/repos/{repository}/issues/{number}", headers=_headers(token))
            except httpx.RequestError:
                logger.warning("Issue state reconciliation deferred: GitHub unavailable")
                return None
        if response.status_code != 200:
            logger.warning("Issue state reconciliation deferred", extra={"status_code": response.status_code})
            return None
        issue = response.json()
        if issue.get("number") != number or "pull_request" in issue or issue.get("state") not in {"open", "closed"}:
            return None
        return repository, number, issue["id"], issue["state"]

    return [item for item in await asyncio.gather(*(one(reference) for reference in bounties)) if item]


async def store_issue_states(connection, states):
    for repository, number, github_id, state in states:
        await connection.execute(
            """update issues i set state = $4, fetched_at = now()
               from repositories r where i.repository_id = r.id and lower(r.full_name) = lower($1)
               and i.number = $2 and i.github_id = $3""", repository, number, github_id, state,
        )
