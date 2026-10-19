from contextlib import asynccontextmanager
from unittest.mock import AsyncMock

import pytest
from cryptography.fernet import Fernet
from eth_account import Account
from fastapi import HTTPException
from pydantic import SecretStr

from app.config import settings
from app.managed_wallets import decrypt_key, encrypt_key, ensure_wallet


@pytest.fixture
def custody(monkeypatch):
    monkeypatch.setattr(settings, "managed_wallets_enabled", True)
    monkeypatch.setattr(settings, "wallet_encryption_key", SecretStr(Fernet.generate_key().decode()))


def test_keys_are_encrypted_and_bound_to_numeric_identity(custody):
    account = Account.create()
    address = account.address.lower()
    encrypted = encrypt_key(42, account)
    assert account.key.hex() not in encrypted
    assert decrypt_key(42, address, encrypted).address == account.address
    with pytest.raises(HTTPException):
        decrypt_key(43, address, encrypted)
    with pytest.raises(HTTPException):
        decrypt_key(42, "0x" + "11" * 20, encrypted)


def test_wrong_key_fails_closed_without_leaking_payload(custody, monkeypatch):
    account = Account.create()
    encrypted = encrypt_key(42, account)
    monkeypatch.setattr(settings, "wallet_encryption_key", SecretStr(Fernet.generate_key().decode()))
    with pytest.raises(HTTPException) as error:
        decrypt_key(42, account.address.lower(), encrypted)
    assert account.key.hex() not in str(error.value)


def test_custody_requires_a_separate_secret(monkeypatch):
    shared = Fernet.generate_key().decode()
    monkeypatch.setattr(settings, "token_encryption_key", shared)
    monkeypatch.setattr(settings, "wallet_encryption_key", SecretStr(shared))
    with pytest.raises(HTTPException, match="separate wallet"):
        encrypt_key(42, Account.create())


class Connection:
    def __init__(self, existing=None):
        self.existing = existing
        self.execute = AsyncMock()
        self.fetchval = AsyncMock(return_value=42)

    @asynccontextmanager
    async def transaction(self):
        yield

    async def fetchrow(self, *_args):
        return self.existing


async def test_repeat_signin_preserves_managed_wallet(custody):
    existing = {"address": "0x" + "11" * 20, "managed": True}
    connection = Connection(existing)
    assert await ensure_wallet(connection, 42) == existing
    connection.execute.assert_not_awaited()


async def test_new_managed_signer_does_not_replace_external_receiving_address(custody):
    existing = {"address": "0x" + "11" * 20, "managed": False}
    connection = Connection(existing)
    wallet = await ensure_wallet(connection, 42)
    assert wallet["managed"] is True and wallet["address"] != existing["address"]
    assert connection.execute.await_count == 1
    assert "insert into managed_wallet_keys" in connection.execute.await_args.args[0]


async def test_provision_stores_only_ciphertext(custody):
    connection = Connection()
    wallet = await ensure_wallet(connection, 42)
    assert wallet["managed"] is True
    args = connection.execute.await_args_list[1].args
    assert decrypt_key(42, wallet["address"], args[3]).address.lower() == wallet["address"]
    assert connection.execute.await_count == 2
