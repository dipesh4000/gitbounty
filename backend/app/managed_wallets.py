"""Opt-in Fuji custody provisioning. No private key or generic signing API is exposed."""

import json

from cryptography.fernet import Fernet, InvalidToken
from eth_account import Account
from fastapi import APIRouter, Depends, HTTPException

from .auth import CurrentUser, get_current_user
from .config import settings
from .db import pool

router = APIRouter(tags=["wallet"])


def key_cipher() -> Fernet:
    secret = settings.wallet_encryption_key.get_secret_value()
    if not secret or secret == settings.token_encryption_key:
        raise HTTPException(503, "A separate wallet encryption secret must be configured.")
    try:
        return Fernet(secret.encode())
    except (ValueError, TypeError):
        raise HTTPException(503, "Wallet encryption configuration is invalid.") from None


def encrypt_key(github_id: int, account) -> str:
    # Bind the encrypted payload to its GitHub identity to detect ciphertext swaps.
    payload = json.dumps({"github_id": github_id, "address": account.address.lower(),
                          "key": account.key.hex()})
    return key_cipher().encrypt(payload.encode()).decode()


def decrypt_key(github_id: int, address: str, ciphertext: str):
    try:
        payload = json.loads(key_cipher().decrypt(ciphertext.encode()))
        account = Account.from_key(payload["key"])
        if payload["github_id"] != github_id or payload["address"] != address or account.address.lower() != address:
            raise ValueError("Wallet binding mismatch")
        return account
    except (InvalidToken, ValueError, TypeError, KeyError):
        raise HTTPException(503, "Managed wallet could not be unlocked. Contact the operator.") from None


async def ensure_wallet(connection, github_id: int) -> dict:
    if not settings.managed_wallets_enabled or settings.escrow_chain_id != 43113:
        raise HTTPException(503, "Managed Fuji wallets are not enabled.")
    key_cipher()  # Fail before generating or writing any wallet when custody is misconfigured.
    async with connection.transaction():
        # Serialize first-login provisioning on the stable identity across API processes.
        user = await connection.fetchval("select github_id from users where github_id = $1 for update", github_id)
        if user is None:
            raise HTTPException(401, "Sign in with GitHub again.")
        existing = await connection.fetchrow(
            """select coalesce(k.owner_address,w.address) as address, k.github_id is not null as managed
               from wallets w left join managed_wallet_keys k on k.github_id = w.github_id
               where w.github_id = $1""", github_id,
        )
        if existing and existing["managed"]:
            return dict(existing)
        account = Account.create()
        address = account.address.lower()
        ciphertext = encrypt_key(github_id, account)
        if existing is None:
            await connection.execute("insert into wallets (github_id, address) values ($1,$2)", github_id, address)
        await connection.execute(
            "insert into managed_wallet_keys (github_id, owner_address, encrypted_key) values ($1,$2,$3)",
            github_id, address, ciphertext,
        )
    return {"address": address, "managed": True}


@router.get("/api/me/wallet")
async def wallet_status(user: CurrentUser = Depends(get_current_user)):
    async with pool().acquire() as connection:
        row = await connection.fetchrow(
            """select coalesce(k.owner_address,w.address) as address, k.github_id is not null as managed
               from wallets w left join managed_wallet_keys k on k.github_id = w.github_id
               where w.github_id = $1""", user.github_id,
        )
    return {"wallet": dict(row) if row else None, "auto_creation_enabled": settings.managed_wallets_enabled,
            "chain_id": 43113}
