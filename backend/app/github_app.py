"""GitHub App authentication. Keys and installation tokens never leave the server."""

import base64
import json
import time
from pathlib import Path

import httpx
from cryptography.hazmat.primitives import hashes, serialization
from cryptography.hazmat.primitives.asymmetric import padding, rsa
from fastapi import HTTPException

from .config import settings
from .github import _headers


def configured() -> bool:
    return bool(settings.github_app_id and settings.github_app_slug and
                settings.github_app_private_key_path and settings.github_webhook_secret)


def app_jwt() -> str:
    if not configured():
        raise HTTPException(503, "GitHub App is not configured.")
    key = serialization.load_pem_private_key(Path(settings.github_app_private_key_path).read_bytes(), None)
    if not isinstance(key, rsa.RSAPrivateKey):
        raise ValueError("GitHub App requires an RSA key")
    def encode(value: bytes) -> bytes:
        return base64.urlsafe_b64encode(value).rstrip(b"=")

    now = int(time.time())
    header = encode(b'{"alg":"RS256","typ":"JWT"}')
    claims = encode(json.dumps({"iat": now - 60, "exp": now + 540, "iss": settings.github_app_id}).encode())
    message = header + b"." + claims
    signature = key.sign(message, padding.PKCS1v15(), hashes.SHA256())
    return (message + b"." + encode(signature)).decode()


async def request(client, method, path, token, **kwargs):
    response = await client.request(method, settings.github_api + path, headers=_headers(token), **kwargs)
    if response.status_code >= 400:
        # Never include a response body, key, token or Authorization header in errors.
        raise HTTPException(502, f"GitHub App request failed ({response.status_code}).")
    return response.json()


async def installation_for(client: httpx.AsyncClient, full_name: str) -> dict:
    installation = await request(client, "GET", f"/repos/{full_name}/installation", app_jwt())
    if str(installation["app_id"]) != settings.github_app_id or installation.get("suspended_at"):
        raise HTTPException(403, "This repository needs an active GitBounty App installation.")
    return installation


async def installation_token(client, installation_id: int, repository_id: int) -> str:
    result = await request(client, "POST", f"/app/installations/{installation_id}/access_tokens", app_jwt(),
                           json={"repository_ids": [repository_id],
                                 "permissions": {"contents": "read", "issues": "read", "pull_requests": "read"}})
    return result["token"]
