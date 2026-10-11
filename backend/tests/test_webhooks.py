"""One App journey: connect, reject forgery, retry, allocate, claim, replay."""

import asyncio
import base64
import hashlib
import hmac
import json
from uuid import uuid4

import asyncpg
import httpx
import respx
from cryptography.hazmat.primitives import hashes, serialization
from cryptography.hazmat.primitives.asymmetric import padding, rsa

from app import github_app
from app.config import settings
from app.services.webhooks import process_one
from .conftest import API_TEST_DATABASE_URL
from .test_maintainer_api import REPO, REPO_URL, publish, query, repo


def test_app_jwt_is_short_lived_and_rsa_signed(monkeypatch, tmp_path):
    key = rsa.generate_private_key(public_exponent=65537, key_size=2048)
    key_path = tmp_path / "test-key.pem"
    key_path.write_bytes(key.private_bytes(serialization.Encoding.PEM, serialization.PrivateFormat.PKCS8,
                                          serialization.NoEncryption()))
    for name, value in {"github_app_id": "123", "github_app_slug": "test-app",
                        "github_app_private_key_path": str(key_path), "github_webhook_secret": "test-secret"}.items():
        monkeypatch.setattr(settings, name, value)
    token = github_app.app_jwt()
    header, payload, signature = token.split(".")
    decode = lambda value: base64.urlsafe_b64decode(value + "=" * (-len(value) % 4))
    claims = json.loads(decode(payload))
    assert claims["iss"] == "123" and claims["exp"] - claims["iat"] == 600
    key.public_key().verify(decode(signature), f"{header}.{payload}".encode(), padding.PKCS1v15(), hashes.SHA256())


@respx.mock
def test_connect_webhook_retry_claim_and_replay(api, monkeypatch):
    monkeypatch.setattr(settings, "github_app_id", "123")
    monkeypatch.setattr(settings, "github_webhook_secret", "test-webhook-secret")
    monkeypatch.setattr(github_app, "app_jwt", lambda: "test-app-jwt")
    assert publish(api).status_code == 200
    repository = {**repo(), "owner": {"id": 7, "login": REPO.split('/')[0]}}
    respx.get(REPO_URL).respond(200, json=repository)
    installation = {"id": 10, "app_id": 123, "suspended_at": None}
    respx.get(REPO_URL + "/installation").respond(200, json=installation)
    respx.post("https://api.github.com/app/installations/10/access_tokens").respond(201, json={"token": "test-installation-token"})
    assert api.post(f"/api/maintainer/repositories/{REPO}/connect").status_code == 200
    pr = {"id": 900, "number": 90, "merged": True, "merged_at": "2026-10-01T12:00:00Z",
          "state": "closed", "title": "Implement feature", "body": "Closes #12",
          "html_url": f"https://github.com/{REPO}/pull/90", "user": {"id": 991, "login": "contributor"},
          "base": {"repo": {"id": 100}}}
    delivery_id = str(uuid4())
    body = json.dumps({"action": "closed", "installation": installation, "repository": repository, "pull_request": pr}).encode()
    headers = {"X-GitHub-Delivery": delivery_id, "X-GitHub-Event": "pull_request",
               "X-Hub-Signature-256": "sha256=" + hmac.new(settings.github_webhook_secret.encode(), body, hashlib.sha256).hexdigest()}
    assert api.post("/webhooks/github", content=body + b" ", headers=headers).status_code == 401
    assert api.post("/webhooks/github", content=body, headers=headers).status_code == 202
    assert api.post("/webhooks/github", content=body, headers=headers).status_code == 202

    async def work():
        connection = await asyncpg.connect(API_TEST_DATABASE_URL)
        try:
            return await process_one(connection)
        finally:
            await connection.close()

    pull = respx.get(REPO_URL + "/pulls/90").respond(503)
    asyncio.run(work())
    assert query("select status from webhook_deliveries where delivery_id = $1::uuid", delivery_id)[0]["status"] == "failed"
    assert query("select count(*) as n from reward_allocations")[0]["n"] == 0
    pull.respond(200, json=pr)
    respx.get(REPO_URL + "/pulls/90/files").respond(200, json=[{"filename": "backend/main.py"}])
    query("update webhook_deliveries set next_attempt_at = now() where delivery_id = $1::uuid returning delivery_id", delivery_id)
    asyncio.run(work())
    assert query("select status from webhook_deliveries where delivery_id = $1::uuid", delivery_id)[0]["status"] == "processed"
    assert query("select count(*) as n from reward_allocations")[0]["n"] == 2
    assert api.get("/api/leaderboard").json()["entries"] == []
    assert api.get("/api/me/claims").json()["points"] == 0
    assert api.post("/api/me/claims").json()["claimed_points"] == 0
    query("insert into users (github_id, github_login) values (991, 'renamed-contributor') returning id")
    monkeypatch.setattr(settings, "dev_github_id", 991)
    monkeypatch.setattr(settings, "dev_github_login", "renamed-contributor")
    assert api.get("/api/me/claims").json()["points"] == 45
    assert api.post("/api/me/claims").json()["claimed_points"] == 45
    assert api.post("/api/me/claims").json()["claimed_points"] == 0
    assert api.get("/api/me/points").json()["total_points"] == 45
    # Same merge under a new delivery ID must not award twice either.
    headers["X-GitHub-Delivery"] = str(uuid4())
    assert api.post("/webhooks/github", content=body, headers=headers).status_code == 202
    asyncio.run(work())
    assert api.get("/api/me/points").json()["total_points"] == 45

    # Signed input alone is insufficient: scope, live merge, and live author must agree.
    for patch in ({"repository": {**repository, "id": 999}},
                  {"repository": {**repository, "private": True}},
                  {"pull_request": {**pr, "merged": False}},
                  {"pull_request": {**pr, "user": {"id": 992, "login": "contributor"}}}):
        rejected = {"action": "closed", "installation": installation,
                    "repository": repository, "pull_request": pr, **patch}
        raw = json.dumps(rejected).encode()
        headers["X-GitHub-Delivery"] = str(uuid4())
        headers["X-Hub-Signature-256"] = "sha256=" + hmac.new(settings.github_webhook_secret.encode(), raw, hashlib.sha256).hexdigest()
        assert api.post("/webhooks/github", content=raw, headers=headers).status_code == 202
        asyncio.run(work())
        state = query("select status from webhook_deliveries where delivery_id = $1::uuid", headers["X-GitHub-Delivery"])[0]["status"]
        assert state == "ignored"
    assert query("select count(*) as n from reward_allocations")[0]["n"] == 2
