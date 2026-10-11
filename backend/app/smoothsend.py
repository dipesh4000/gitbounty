"""Avalanche-only SmoothSend instructions and independently verified ERC-4337 receipts."""

import re

import httpx
from eth_abi import encode
from eth_utils import keccak
from fastapi import HTTPException

from .avax import asset, transfer_data
from .config import settings

GATEWAY = "https://proxy.smoothsend.xyz"
ENTRY_POINT = "0x0000000071727de22e5e9d8baf0edac6f37da032"
USEROP_EVENT = "0x" + keccak(text="UserOperationEvent(bytes32,address,address,uint256,bool,uint256,uint256)").hex()
TRANSFER_EVENT = "0x" + keccak(text="Transfer(address,address,uint256)").hex()


def configured():
    return bool(re.fullmatch(r"pk_nogas_[A-Za-z0-9_-]+", settings.smoothsend_public_key)
                and (not settings.smoothsend_secret_key or
                     re.fullmatch(r"sk_nogas_[A-Za-z0-9_-]+", settings.smoothsend_secret_key)))


def gateway_key():
    return settings.smoothsend_secret_key or settings.smoothsend_public_key


def call(signature, types, values):
    return "0x" + (keccak(text=signature)[:4] + encode(types, values)).hex()


def fee_token(chain_id):
    return asset(43113)["token_address"] if chain_id == 43113 else "0xb97ef9ef8734c71904d8002f8b6bc66dd9c48a6e"


async def gateway_rpc(method, params, chain_id):
    try:
        async with httpx.AsyncClient(timeout=20) as client:
            r = await client.post(GATEWAY + "/", headers={
                "Authorization": "Bearer " + gateway_key(),
                "X-Chain": "avalanche", "X-Network": "testnet" if chain_id == 43113 else "mainnet",
                "X-Sponsorship-Mode": "user-pays-erc20", "Origin": settings.frontend_url,
            }, json={"jsonrpc": "2.0", "id": 1, "method": method, "params": params})
            r.raise_for_status()
            body = r.json()
        body = body.get("data", body)
        if "error" in body or "result" not in body:
            raise ValueError("Invalid bundler response")
        return body["result"]
    except (httpx.HTTPError, ValueError, TypeError) as error:
        raise HTTPException(502, "SmoothSend could not be verified. Check the dashboard key/origin and retry verification without sending again.") from error


async def account_setup(owner, chain_id, rpc):
    try:
        async with httpx.AsyncClient(timeout=15) as client:
            r = await client.get(GATEWAY + "/api/v1/public/avax-aa-defaults")
            r.raise_for_status()
            defaults = r.json()
        suffix = "Fuji" if chain_id == 43113 else "Mainnet"
        factory, paymaster = (defaults[key + suffix].lower() for key in ("simpleAccountFactory", "paymaster"))
        if not all(re.fullmatch(r"0x[0-9a-f]{40}", a) for a in (factory, paymaster)):
            raise ValueError("Missing AA defaults")
        result = await rpc("eth_call", [{"to": factory, "data": call("getAddress(address,uint256)", ["address", "uint256"], [owner, 0])}, "latest"])
        if not re.fullmatch(r"0x[0-9a-fA-F]{64}", result) or int(result, 16) == 0:
            raise ValueError("Invalid smart account")
        sender = "0x" + result[-40:].lower()
        code = await rpc("eth_getCode", [sender, "latest"])
        if code not in ("0x", "0x0"):
            actual_owner = await rpc("eth_call", [{"to": sender, "data": call("owner()", [], [])}, "latest"])
            if actual_owner[-40:].lower() != owner[2:]:
                raise ValueError("Account owner mismatch")
        return {"smart_sender": sender, "account_factory": factory, "paymaster_address": paymaster,
                "entry_point": ENTRY_POINT}
    except (httpx.HTTPError, ValueError, KeyError, TypeError, AttributeError) as error:
        raise HTTPException(502, "SmoothSend smart-account setup is unavailable. No payment has been sent.") from error


async def account_nonce(sender, rpc):
    data = call("getNonce(address,uint192)", ["address", "uint192"], [sender, 0])
    value = int(await rpc("eth_call", [{"to": ENTRY_POINT, "data": data}, "latest"]), 16)
    if value > 2**63 - 1:
        raise HTTPException(409, "Unsupported smart-account nonce.")
    return value


def payment_calldata(chain_id, recipient, amount, paymaster, fee_limit):
    token = asset(chain_id)["token_address"]
    approve = call("approve(address,uint256)", ["address", "uint256"], [paymaster, fee_limit])
    return call("executeBatch(address[],uint256[],bytes[])", ["address[]", "uint256[]", "bytes[]"], [
        [fee_token(chain_id), token or recipient], [0, 0 if token else amount],
        [bytes.fromhex(approve[2:]), bytes.fromhex(transfer_data(recipient, amount)[2:]) if token else b""],
    ])


def operation_hash(op, chain_id, entry_point):
    def packed_pair(high, low):
        return (int(op.get(high, "0x0"), 16) << 128 | int(op.get(low, "0x0"), 16)).to_bytes(32, "big")
    init = op.get("initCode") or (op.get("factory", "0x") + op.get("factoryData", "0x")[2:])
    pm = op.get("paymasterAndData") or (op.get("paymaster", "0x") +
         packed_pair("paymasterVerificationGasLimit", "paymasterPostOpGasLimit").hex() + op.get("paymasterData", "0x")[2:])
    inner = keccak(encode(["address", "uint256", "bytes32", "bytes32", "bytes32", "uint256", "bytes32", "bytes32"], [
        op["sender"], int(op["nonce"], 16), keccak(bytes.fromhex(init[2:])), keccak(bytes.fromhex(op["callData"][2:])),
        bytes.fromhex(op["accountGasLimits"][2:]) if op.get("accountGasLimits") else packed_pair("verificationGasLimit", "callGasLimit"),
        int(op["preVerificationGas"], 16), bytes.fromhex(op["gasFees"][2:]) if op.get("gasFees") else packed_pair("maxPriorityFeePerGas", "maxFeePerGas"),
        keccak(bytes.fromhex(pm[2:])),
    ]))
    return "0x" + keccak(encode(["bytes32", "address", "uint256"], [inner, entry_point, chain_id])).hex()


def verify_operation(proof, payment, userop_hash):
    try:
        op = proof["userOperation"]
        pm = op.get("paymasterAndData") or op.get("paymaster", "")
        init = op.get("initCode") or (op.get("factory", "0x") + op.get("factoryData", "0x")[2:])
        expected_init = payment["account_factory"] + call("createAccount(address,uint256)", ["address", "uint256"], [payment["sender"], 0])[2:]
        valid = (init.lower() in ("0x", expected_init) and proof["entryPoint"].lower() == payment["entry_point"] and
                 op["sender"].lower() == payment["smart_sender"] and int(op["nonce"], 16) == payment["nonce"] and
                 op["callData"].lower() == payment["call_data"] and pm[:42].lower() == payment["paymaster_address"] and
                 operation_hash(op, payment["chain_id"], payment["entry_point"]) == userop_hash)
    except (KeyError, TypeError, ValueError, AttributeError, OverflowError):
        valid = False
    if not valid:
        raise HTTPException(409, "UserOperation does not match the reserved reward, nonce, smart account and fee limit.")


def verify_receipt(receipt, payment, amount, userop_hash):
    """Verify the chain's EntryPoint event and only transfers in this operation's log segment."""
    try:
        if receipt["status"] != "0x1" or receipt["to"].lower() != payment["entry_point"]:
            raise ValueError("Wrong transaction")
        segment = []
        for log in receipt["logs"]:
            topics = [str(t).lower() for t in log.get("topics", [])]
            if log.get("removed"):
                raise ValueError("Removed log")
            if log["address"].lower() == payment["entry_point"] and topics and topics[0] == USEROP_EVENT:
                if topics[1] != userop_hash:
                    segment = []
                    continue
                data = bytes.fromhex(log["data"][2:])
                if (len(topics) != 4 or topics[2][-40:] != payment["smart_sender"][2:] or
                    topics[3][-40:] != payment["paymaster_address"][2:] or len(data) != 128 or
                    int.from_bytes(data[:32], "big") != payment["nonce"]):
                    raise ValueError("Wrong operation event")
                success = int.from_bytes(data[32:64], "big")
                if success not in (0, 1):
                    raise ValueError("Invalid success flag")
                token = asset(payment["chain_id"])["token_address"]
                if success and token:
                    expected = [TRANSFER_EVENT, "0x" + payment["smart_sender"][2:].rjust(64, "0"),
                                "0x" + payment["recipient"][2:].rjust(64, "0")]
                    if not any(t["address"].lower() == token and [str(v).lower() for v in t.get("topics", [])] == expected and
                               t.get("data", "").lower() == "0x" + f"{amount:064x}" for t in segment):
                        raise ValueError("Exact token transfer missing")
                return "paid" if success else "failed"
            segment.append(log)
        raise ValueError("Operation event missing")
    except (KeyError, ValueError, TypeError, AttributeError, IndexError) as error:
        raise HTTPException(409, "The on-chain receipt does not prove this SmoothSend reward payment.") from error
