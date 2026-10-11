"""Connect selected public repositories and durably accept signed GitHub deliveries."""

import hashlib
import hmac
import json
import re
from uuid import UUID

import httpx
from fastapi import APIRouter, Depends, HTTPException, Request

from .. import github_app
from ..auth import CurrentUser, get_current_user, get_current_user_with_token
from ..config import settings
from ..db import pool
from .maintainer import _actor_id, _authorized_repository

router = APIRouter(tags=["GitHub App"])


@router.get("/api/github-app")
async def app_status(user: CurrentUser = Depends(get_current_user)):
    async with pool().acquire() as connection:
        rows = await connection.fetch(
            """select full_name, active from connected_repositories
               where connected_by = (select id from users where github_id = $1)
               order by full_name""",
            user.github_id,
        )
    return {"configured": github_app.configured(),
            "install_url": f"https://github.com/apps/{settings.github_app_slug}/installations/new" if github_app.configured() else None,
            "repositories": [dict(row) for row in rows]}


@router.post("/api/maintainer/repositories/{owner}/{name}/connect")
async def connect_repository(owner: str, name: str, user: CurrentUser = Depends(get_current_user_with_token)):
    full_name = f"{owner}/{name}"
    if not re.fullmatch(r"[\w.-]+/[\w.-]+", full_name):
        raise HTTPException(400, "Invalid repository name.")
    repo = await _authorized_repository(full_name, user)
    async with httpx.AsyncClient(timeout=30) as client:
        installation = await github_app.installation_for(client, repo["full_name"])
        token = await github_app.installation_token(client, installation["id"], repo["id"])
        verified = await github_app.request(client, "GET", f"/repos/{repo['full_name']}", token)
    if verified["id"] != repo["id"] or verified.get("private", True):
        raise HTTPException(403, "Only selected public repositories can be connected.")
    async with pool().acquire() as connection:
        user_id = await _actor_id(connection, user)
        await connection.execute(
            """insert into connected_repositories (github_id, full_name, installation_id, connected_by)
               values ($1,$2,$3,$4) on conflict (github_id) do update set
               full_name = excluded.full_name, installation_id = excluded.installation_id,
               connected_by = excluded.connected_by, active = true""",
            repo["id"], repo["full_name"], installation["id"], user_id,
        )
    return {"repository": repo["full_name"], "connected": True}


@router.post("/webhooks/github", status_code=202)
async def receive_webhook(request: Request):
    if not settings.github_webhook_secret:
        raise HTTPException(503, "GitHub webhooks are not configured.")
    body = bytearray()
    async for chunk in request.stream():
        body.extend(chunk)
        if len(body) > 2 * 1024 * 1024:
            raise HTTPException(413, "Webhook payload too large.")
    expected = "sha256=" + hmac.new(settings.github_webhook_secret.encode(), body, hashlib.sha256).hexdigest()
    signature = request.headers.get("X-Hub-Signature-256", "")
    if not hmac.compare_digest(expected.encode(), signature.encode()):
        raise HTTPException(401, "Invalid webhook signature.")
    try:
        delivery = UUID(request.headers.get("X-GitHub-Delivery", ""))
        payload = json.loads(body)
        if not isinstance(payload, dict):
            raise ValueError()
    except (ValueError, UnicodeDecodeError):
        raise HTTPException(400, "Invalid webhook delivery.") from None
    event = request.headers.get("X-GitHub-Event", "")
    if event not in {"pull_request", "installation", "installation_repositories", "ping"}:
        return {"status": "ignored"}
    async with pool().acquire() as connection:
        await connection.execute(
            """insert into webhook_deliveries (delivery_id, event, payload) values ($1,$2,$3::jsonb)
               on conflict (delivery_id) do nothing""", delivery, event, json.dumps(payload),
        )
    return {"status": "accepted"}
