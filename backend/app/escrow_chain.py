"""Minimal Fuji RPC encoding and receipt verification for GitBountyEscrow."""

from __future__ import annotations

from datetime import UTC, datetime
from typing import Any

import httpx
from eth_abi import decode, encode
from eth_utils import keccak, to_checksum_address

from .config import settings

TRANSFER_TOPIC = "0x" + keccak(text="Transfer(address,address,uint256)").hex()
FUNDED_TOPIC = "0x" + keccak(
    text="BountyFunded(bytes32,bytes32,address,uint256,uint256,uint256,uint256)"
).hex()
SETTLED_TOPIC = "0x" + keccak(text="BountySettled(bytes32,address,uint256,bytes32)").hex()
REFUNDED_TOPIC = "0x" + keccak(text="BountyRefunded(bytes32,address,uint256)").hex()


def _selector(signature: str) -> bytes:
    return keccak(text=signature)[:4]


def _address_topic(address: str) -> str:
    return "0x" + address.lower().removeprefix("0x").rjust(64, "0")


def derive_bounty_id(chain_id: int, contract: str, payer: str, reference_id: str) -> str:
    value = encode(
        ["uint256", "address", "address", "bytes32"],
        [chain_id, to_checksum_address(contract), to_checksum_address(payer), bytes.fromhex(reference_id[2:])],
    )
    return "0x" + keccak(value).hex()


def approve_calldata(spender: str, amount: int) -> str:
    return "0x" + (_selector("approve(address,uint256)") + encode(
        ["address", "uint256"], [to_checksum_address(spender), amount]
    )).hex()


def fund_calldata(reference_id: str, amount: int, work_ends_at: int) -> str:
    return "0x" + (_selector("fund(bytes32,uint256,uint256)") + encode(
        ["bytes32", "uint256", "uint256"],
        [bytes.fromhex(reference_id[2:]), amount, work_ends_at],
    )).hex()


def settle_calldata(message: dict[str, Any], signature: str) -> str:
    settlement = (
        bytes.fromhex(message["bountyId"][2:]),
        to_checksum_address(message["recipient"]),
        to_checksum_address(message["token"]),
        int(message["amount"]),
        int(message["nonce"]),
        int(message["deadline"]),
    )
    return "0x" + (_selector("settle((bytes32,address,address,uint256,uint256,uint256),bytes)") + encode(
        ["(bytes32,address,address,uint256,uint256,uint256)", "bytes"],
        [settlement, bytes.fromhex(signature[2:])],
    )).hex()


def refund_calldata(bounty_id: str) -> str:
    return "0x" + (_selector("refund(bytes32)") + encode(
        ["bytes32"], [bytes.fromhex(bounty_id[2:])]
    )).hex()


async def rpc(method: str, params: list[Any]) -> Any:
    try:
        async with httpx.AsyncClient(timeout=20) as client:
            response = await client.post(
                settings.escrow_rpc_url,
                json={"jsonrpc": "2.0", "id": 1, "method": method, "params": params},
            )
            response.raise_for_status()
            payload = response.json()
    except (httpx.HTTPError, ValueError) as error:
        raise RuntimeError("Avalanche RPC is unavailable.") from error
    if payload.get("error") or "result" not in payload:
        raise RuntimeError("Avalanche RPC rejected the request.")
    return payload["result"]


async def transaction_evidence(tx_hash: str) -> tuple[dict, dict, datetime]:
    if int(await rpc("eth_chainId", []), 16) != settings.escrow_chain_id:
        raise ValueError("Avalanche RPC is connected to the wrong chain.")
    tx = await rpc("eth_getTransactionByHash", [tx_hash])
    receipt = await rpc("eth_getTransactionReceipt", [tx_hash])
    if not tx or not receipt:
        raise ValueError("Transaction is not visible yet.")
    if receipt.get("status") != "0x1" or receipt.get("transactionHash", "").lower() != tx_hash:
        raise ValueError("Transaction did not succeed.")
    if tx.get("blockHash") != receipt.get("blockHash") or not receipt.get("blockHash"):
        raise ValueError("Transaction receipt is not canonical.")
    block = await rpc("eth_getBlockByHash", [receipt["blockHash"], False])
    if not block or block.get("hash") != receipt["blockHash"]:
        raise ValueError("Transaction block is not canonical.")
    canonical = await rpc("eth_getBlockByNumber", [receipt["blockNumber"], False])
    latest = int(await rpc("eth_blockNumber", []), 16)
    if not canonical or canonical.get("hash") != receipt["blockHash"] or latest < int(receipt["blockNumber"], 16) + 1:
        raise ValueError("Wait for two canonical confirmations before verifying again.")
    return tx, receipt, datetime.fromtimestamp(int(block["timestamp"], 16), UTC)


async def bounty_state(bounty_id: str) -> dict[str, Any]:
    data = "0x" + (_selector("bounties(bytes32)") + encode(
        ["bytes32"], [bytes.fromhex(bounty_id[2:])]
    )).hex()
    raw = await rpc("eth_call", [{"to": settings.escrow_contract_address, "data": data}, "latest"])
    try:
        payer, amount, funded_at, work_ends_at, claim_until, state, recipient = decode(
            ["address", "uint256", "uint256", "uint256", "uint256", "uint8", "address"],
            bytes.fromhex(raw[2:]),
        )
    except (TypeError, ValueError) as error:
        raise RuntimeError("Escrow returned invalid bounty state.") from error
    return {
        "payer": payer.lower(), "amount": amount, "funded_at": funded_at,
        "work_ends_at": work_ends_at, "claim_until": claim_until,
        "state": state, "recipient": recipient.lower(),
    }


def verify_funding_receipt(receipt: dict, terms: dict) -> dict[str, Any]:
    bounty_id = terms["onchain_bounty_id"].lower()
    reference_id = terms["reference_id"].lower()
    payer = terms["payer_address"].lower()
    amount = int(terms["amount_units"])
    contract = terms["contract_address"].lower()
    token = terms["token_address"].lower()

    funded = None
    transferred = False
    for log in receipt.get("logs", []):
        if log.get("removed"):
            continue
        topics = [str(topic).lower() for topic in log.get("topics", [])]
        address = log.get("address", "").lower()
        if address == contract and topics[:4] == [FUNDED_TOPIC, bounty_id, reference_id, _address_topic(payer)]:
            values = decode(["uint256", "uint256", "uint256", "uint256"], bytes.fromhex(log["data"][2:]))
            if values == (amount, int(terms["funded_at"]), int(terms["work_ends_at"]), int(terms["claim_until"])):
                funded = log
        if address == token and topics == [TRANSFER_TOPIC, _address_topic(payer), _address_topic(contract)]:
            transferred |= int(log.get("data", "0x0"), 16) == amount
    if funded is None or not transferred:
        raise ValueError("Transaction does not contain the exact escrow funding evidence.")
    return funded


def verify_settlement_receipt(receipt: dict, terms: dict, recipient: str, digest: str) -> dict[str, Any]:
    bounty_id = terms["onchain_bounty_id"].lower()
    contract = terms["contract_address"].lower()
    token = terms["token_address"].lower()
    amount = int(terms["amount_units"])
    recipient = recipient.lower()
    settled = None
    transferred = False
    for log in receipt.get("logs", []):
        if log.get("removed"):
            continue
        topics = [str(topic).lower() for topic in log.get("topics", [])]
        address = log.get("address", "").lower()
        if address == contract and topics[:3] == [SETTLED_TOPIC, bounty_id, _address_topic(recipient)]:
            values = decode(["uint256", "bytes32"], bytes.fromhex(log["data"][2:]))
            if values[0] == amount and "0x" + values[1].hex() == digest.lower():
                settled = log
        if address == token and topics == [TRANSFER_TOPIC, _address_topic(contract), _address_topic(recipient)]:
            transferred |= int(log.get("data", "0x0"), 16) == amount
    if settled is None or not transferred:
        raise ValueError("Transaction does not contain the exact escrow settlement evidence.")
    return settled


def verify_refund_receipt(receipt: dict, terms: dict) -> dict[str, Any]:
    payer = terms["payer_address"].lower()
    contract = terms["contract_address"].lower()
    amount = int(terms["amount_units"])
    event = None
    transferred = False
    for log in receipt.get("logs", []):
        if log.get("removed"):
            continue
        topics = [str(topic).lower() for topic in log.get("topics", [])]
        if log.get("address", "").lower() == contract and topics == [REFUNDED_TOPIC, terms["onchain_bounty_id"], _address_topic(payer)]:
            if int(log["data"], 16) == amount:
                event = log
        if log.get("address", "").lower() == terms["token_address"] and topics == [TRANSFER_TOPIC, _address_topic(contract), _address_topic(payer)]:
            transferred |= int(log["data"], 16) == amount
    if event is None or not transferred:
        raise ValueError("Refund lacks the matching escrow event and USDC transfer.")
    return event
