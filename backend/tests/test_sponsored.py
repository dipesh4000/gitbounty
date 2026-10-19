import pytest
from eth_abi import decode
from eth_account import Account
from eth_account.messages import encode_defunct
from cryptography.fernet import Fernet
from pydantic import SecretStr
from unittest.mock import AsyncMock
from types import SimpleNamespace
import httpx
import respx
from fastapi import HTTPException

from app import smoothsend
from app.sponsored import Action, batch_call, operation_segment
from app.sponsored import signed_operation
from app.config import settings
from app.managed_wallets import encrypt_key

ACCOUNT = {"address": "0x" + "11" * 20, "paymaster": "0x" + "22" * 20}
HASH = "0x" + "33" * 32


def receipt(success=1):
    return {"status": "0x1", "to": smoothsend.ENTRY_POINT, "logs": [
        {"address": "0x" + "44" * 20, "topics": [], "data": "0x"},
        {"address": smoothsend.ENTRY_POINT,
         "topics": [smoothsend.USEROP_EVENT, HASH, "0x" + "0" * 24 + ACCOUNT["address"][2:], "0x" + "0" * 24 + ACCOUNT["paymaster"][2:]],
         "data": "0x" + "".join(f"{n:064x}" for n in (7, success, 100, 200))},
    ]}


def test_batch_has_only_exact_requested_destinations_values_and_data():
    target = "0x" + "55" * 20
    data = batch_call([(target, "0x1234"), (target, "0xabcd")])
    addresses, values, calls = decode(["address[]", "uint256[]", "bytes[]"], bytes.fromhex(data[10:]))
    assert addresses == (target, target)
    assert values == (0, 0)
    assert calls == (bytes.fromhex("1234"), bytes.fromhex("abcd"))


def test_inner_success_and_exact_nonce_are_required():
    success, segment = operation_segment(receipt(), HASH, ACCOUNT, 7)
    assert success and len(segment["logs"]) == 1
    assert operation_segment(receipt(0), HASH, ACCOUNT, 7)[0] is False
    with pytest.raises(HTTPException):
        operation_segment(receipt(), HASH, ACCOUNT, 8)
    with pytest.raises(HTTPException):
        operation_segment(receipt(), "0x" + "00" * 32, ACCOUNT, 7)
    with pytest.raises(HTTPException):
        operation_segment(receipt(2), HASH, ACCOUNT, 7)


def test_client_cannot_supply_amount_recipient_or_calldata():
    for field in ("amount", "recipient", "calldata", "chain_id"):
        with pytest.raises(ValueError):
            Action.model_validate({"kind": "fund", field: "attacker-controlled"})


async def test_sponsor_builder_persists_signed_exact_call_before_broadcast(monkeypatch):
    import json
    from app import sponsored
    owner = Account.create()
    monkeypatch.setattr(settings, "wallet_encryption_key", SecretStr(Fernet.generate_key().decode()))
    monkeypatch.setattr(settings, "smoothsend_secret_key", "sk_nogas_fixture")
    cipher = encrypt_key(42, owner)
    connection = SimpleNamespace(fetchrow=AsyncMock(side_effect=[
        {"owner_address": owner.address.lower(), "encrypted_key": cipher},
        {"id": 1, "status": "signed"},
    ]))
    async def rpc(method, _params):
        return {"eth_chainId": "0xa869", "eth_gasPrice": "0x10", "eth_getCode": "0x1234"}[method]
    monkeypatch.setattr(sponsored, "rpc", rpc)
    monkeypatch.setattr(smoothsend, "account_nonce", AsyncMock(return_value=7))
    gateway = AsyncMock(return_value={"callGasLimit": "0x10000", "verificationGasLimit": "0x20000", "preVerificationGas": "0x3000"})
    monkeypatch.setattr(smoothsend, "gateway_rpc", gateway)
    pm = ACCOUNT["paymaster"] + "00" * 64
    with respx.mock() as mock:
        route = mock.post(smoothsend.GATEWAY + "/api/v1/bundler/paymaster/sign").mock(return_value=httpx.Response(200, json={"success": True, "data": {"success": True, "paymasterAndData": pm}}))
        await signed_operation(connection, SimpleNamespace(github_id=42), 9, "fund", [("0x"+"55"*20, "0x1234")], {**ACCOUNT, "factory": "0x"+"66"*20})
    request = route.calls[0].request
    assert request.headers["X-Sponsorship-Mode"] == "developer-sponsored"
    assert json.loads(request.content)["mode"] == "developer-sponsored"
    args = connection.fetchrow.await_args_list[-1].args
    op = json.loads(args[5])
    assert op["nonce"] == "0x7"
    assert op["paymasterAndData"] == pm
    digest = smoothsend.operation_hash(op, 43113, smoothsend.ENTRY_POINT)
    assert args[4] == digest
    assert Account.recover_message(encode_defunct(hexstr=digest), signature=op["signature"]) == owner.address
    assert all(call.args[0] != "eth_sendUserOperation" for call in gateway.await_args_list)
