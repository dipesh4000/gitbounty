"""Server-resolved Fuji actions, durable signing and SmoothSend gas sponsorship."""

import json
from typing import Literal

import httpx
from eth_account.messages import encode_defunct
from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel, ConfigDict

from . import smoothsend
from .auth import CurrentUser, get_current_user
from .config import settings
from .db import pool
from .escrow_chain import approve_calldata, bounty_state, fund_calldata, refund_calldata, rpc, transaction_evidence
from .managed_wallets import decrypt_key, ensure_wallet

router = APIRouter(prefix="/api/sponsored", tags=["sponsored escrow"])
MODE = "developer-sponsored"


@router.get("/operations")
async def operations(bounty_id: int | None = Query(default=None, gt=0), user: CurrentUser = Depends(get_current_user)):
    async with pool().acquire() as connection:
        rows = await connection.fetch(
            """select id,bounty_id,kind,status,userop_hash,tx_hash from sponsored_operations
               where github_id=$1 and ($2::bigint is null or bounty_id=$2) order by id desc limit 10""", user.github_id, bounty_id,
        )
    return {"items": [dict(row) for row in rows]}


def require_sponsorship():
    if not settings.managed_wallets_enabled or not settings.escrow_enabled or settings.escrow_chain_id != 43113 or settings.escrow_execution_mode != "sponsored":
        raise HTTPException(503, "Sponsored Fuji execution is not enabled.")
    if not settings.smoothsend_secret_key.startswith("sk_nogas_"):
        raise HTTPException(503, "SmoothSend server sponsorship is not configured.")
    if settings.dev_login_stub_enabled and settings.environment != "test":
        raise HTTPException(503, "Real GitHub sign-in is required.")


async def smart_account(connection, github_id):
    wallet = await ensure_wallet(connection, github_id)
    if not wallet["managed"]:
        raise HTTPException(409, "This account has an external wallet. Its address cannot be silently replaced.")
    async with connection.transaction():
        await connection.fetchval("select github_id from managed_wallet_keys where github_id=$1 for update", github_id)
        row = await connection.fetchrow("select * from managed_smart_accounts where github_id=$1", github_id)
        if row:
            return dict(row)
        setup = await smoothsend.account_setup(wallet["address"], 43113, rpc)
        # Pin the documented Fuji factory/paymaster, not arbitrary gateway-provided code.
        if setup["account_factory"] != "0x55326f005a0959f75496cdd692505ffb520972f5" or setup["paymaster_address"] != "0x3207f577792f9d549acb2a6c97c0f74eaeb166d8":
            raise HTTPException(503, "SmoothSend Fuji deployment differs from the verified configuration.")
        for address in (setup["account_factory"], setup["paymaster_address"], smoothsend.ENTRY_POINT):
            if await rpc("eth_getCode", [address, "latest"]) in ("0x", "0x0"):
                raise HTTPException(503, "Sponsored account infrastructure is unavailable on this chain.")
        entry_points = await smoothsend.gateway_rpc("eth_supportedEntryPoints", [], 43113, MODE)
        if smoothsend.ENTRY_POINT not in [address.lower() for address in entry_points]:
            raise HTTPException(503, "SmoothSend does not support the configured EntryPoint.")
        row = await connection.fetchrow(
            """insert into managed_smart_accounts (github_id,address,factory,paymaster)
               values ($1,$2,$3,$4) returning *""", github_id, setup["smart_sender"], setup["account_factory"], setup["paymaster_address"],
        )
        return dict(row)


@router.post("/wallet")
async def provision(user: CurrentUser = Depends(get_current_user)):
    require_sponsorship()
    async with pool().acquire() as connection:
        account = await smart_account(connection, user.github_id)
    return await wallet_balance(account)


async def wallet_balance(account):
    if int(await rpc("eth_chainId", []), 16) != 43113:
        raise HTTPException(503, "RPC network mismatch.")
    try:
        balance = int(await rpc("eth_call", [{"to": settings.escrow_token_address, "data": smoothsend.call("balanceOf(address)", ["address"], [account["address"]])}, "latest"]), 16)
        if not 0 <= balance < 2**256:
            raise ValueError("Invalid balance")
    except (TypeError, ValueError):
        raise HTTPException(502, "Avalanche returned an invalid balance. Refresh to retry.") from None
    return {"address": account["address"], "balance_units": str(balance), "chain_id": 43113, "custody": "app-managed", "gas": "SmoothSend sponsored"}


@router.get("/wallet")
async def wallet_status(user: CurrentUser = Depends(get_current_user)):
    # Reading an existing deposit address must not unlock keys, provision or need sponsor credits.
    if settings.escrow_chain_id != 43113:
        raise HTTPException(503, "App wallets support Avalanche Fuji only.")
    async with pool().acquire() as connection:
        account = await connection.fetchrow("select address from managed_smart_accounts where github_id=$1", user.github_id)
    return await wallet_balance(account) if account else None


class Action(BaseModel):
    model_config = ConfigDict(extra="forbid")
    kind: Literal["fund", "settle", "refund"]


def batch_call(calls):
    return smoothsend.call("executeBatch(address[],uint256[],bytes[])", ["address[]", "uint256[]", "bytes[]"],
                           [[item[0] for item in calls], [0] * len(calls), [bytes.fromhex(item[1][2:]) for item in calls]])


async def signed_operation(connection, user, bounty_id, kind, calls, account):
    key = await connection.fetchrow("select * from managed_wallet_keys where github_id=$1", user.github_id)
    owner = decrypt_key(user.github_id, key["owner_address"], key["encrypted_key"])
    if int(await rpc("eth_chainId", []), 16) != 43113:
        raise HTTPException(503, "RPC network mismatch.")
    nonce = await smoothsend.account_nonce(account["address"], rpc)
    gas_price = int(await rpc("eth_gasPrice", []), 16)
    op = {"sender": account["address"], "nonce": hex(nonce), "callData": batch_call(calls),
          "maxFeePerGas": hex(gas_price * 2), "maxPriorityFeePerGas": "0x0", "signature": "0x"}
    if await rpc("eth_getCode", [account["address"], "latest"]) in ("0x", "0x0"):
        op.update(factory=account["factory"], factoryData=smoothsend.call("createAccount(address,uint256)", ["address", "uint256"], [owner.address, 0]))
    gas = await smoothsend.gateway_rpc("eth_estimateUserOperationGas", [op, smoothsend.ENTRY_POINT], 43113, MODE)
    for field in ("callGasLimit", "verificationGasLimit", "preVerificationGas"):
        op[field] = gas[field]
    headers = {"Authorization": "Bearer " + settings.smoothsend_secret_key, "X-Chain": "avalanche",
               "X-Network": "testnet", "X-Sponsorship-Mode": MODE, "Origin": settings.frontend_url}
    try:
        async with httpx.AsyncClient(timeout=20) as client:
            response = await client.post(smoothsend.GATEWAY + "/api/v1/bundler/paymaster/sign", headers=headers, json={"mode": MODE, "userOp": op})
            response.raise_for_status()
            payload = response.json()
        pm = payload.get("data", payload)
        if not pm.get("success") or pm["paymasterAndData"][:42].lower() != account["paymaster"]:
            raise ValueError("Invalid sponsor")
        op["paymasterAndData"] = pm["paymasterAndData"]
    except (httpx.HTTPError, ValueError, KeyError, TypeError):
        raise HTTPException(503, "Gas sponsorship is unavailable. Check sponsor credits and allowed origin; no transaction was sent.") from None
    userop_hash = smoothsend.operation_hash(op, 43113, smoothsend.ENTRY_POINT)
    op["signature"] = "0x" + owner.sign_message(encode_defunct(hexstr=userop_hash)).signature.hex()
    # Commit this exact authorization before any send. Retries must reuse it.
    return await connection.fetchrow(
        """insert into sponsored_operations (github_id,bounty_id,kind,userop_hash,operation,status)
           values ($1,$2,$3,$4,$5::jsonb,'signed') returning id,userop_hash,status,tx_hash""",
        user.github_id, bounty_id, kind, userop_hash, json.dumps(op),
    )


@router.post("/bounties/{bounty_id}")
async def submit(bounty_id: int, action: Action, user: CurrentUser = Depends(get_current_user)):
    require_sponsorship()
    async with pool().acquire() as connection:
        account = await smart_account(connection, user.github_id)
    from .routes.escrow import voucher
    authorization = None
    if action.kind == "settle":
        async with pool().acquire() as connection:
            allocation_id = await connection.fetchval("select allocation_id from escrow_allocations where bounty_id=$1 and author_github_id=$2", bounty_id, user.github_id)
        if allocation_id is None:
            raise HTTPException(403, "This reward does not belong to your GitHub identity.")
        authorization = await voucher(allocation_id, user)
    async with pool().acquire() as connection:
        async with connection.transaction():
            await connection.fetchval("select github_id from managed_wallet_keys where github_id=$1 for update", user.github_id)
            pending = await connection.fetchrow("select id,bounty_id,kind,userop_hash,status,tx_hash from sponsored_operations where github_id=$1 and status in ('signed','submitted','confirmed')", user.github_id)
            if pending:
                if pending["bounty_id"] != bounty_id or pending["kind"] != action.kind:
                    raise HTTPException(409, "Verify your pending operation before starting another action.")
                return dict(pending)
            terms = await connection.fetchrow("select * from escrow_reward_terms where bounty_id=$1", bounty_id)
            if not terms:
                raise HTTPException(404, "Bounty not found.")
            contract, token, amount = terms["contract_address"], terms["token_address"], int(terms["amount_units"])
            if action.kind in ("fund", "refund") and (terms["payer_github_id"] != user.github_id or terms["payer_address"] != account["address"]):
                raise HTTPException(403, "This bounty is not funded by your managed smart account.")
            if action.kind == "fund":
                state = await bounty_state(terms["onchain_bounty_id"])
                if state["state"] != 0:
                    raise HTTPException(409, "This bounty already exists on chain. Refresh its evidence.")
                balance = int(await rpc("eth_call", [{"to": token, "data": smoothsend.call("balanceOf(address)", ["address"], [account["address"]])}, "latest"]), 16)
                if balance < amount:
                    raise HTTPException(409, "Deposit the reward USDC into your app wallet before funding. Gas is sponsored separately.")
                calls = [(token, approve_calldata(contract, amount)), (contract, fund_calldata(terms["reference_id"], amount, int(terms["work_ends_at"].timestamp())))]
            elif action.kind == "refund":
                state = await bounty_state(terms["onchain_bounty_id"])
                latest = await rpc("eth_getBlockByNumber", ["latest", False])
                if state["state"] != 1 or int(latest["timestamp"], 16) < state["claim_until"]:
                    raise HTTPException(409, "This bounty is not refundable yet.")
                calls = [(contract, refund_calldata(terms["onchain_bounty_id"]))]
            else:
                calls = [(contract, authorization["settle"]["data"])]
            row = await signed_operation(connection, user, bounty_id, action.kind, calls, account)
    return dict(row)


def operation_segment(receipt, userop_hash, account, nonce):
    if receipt.get("status") != "0x1" or (receipt.get("to") or "").lower() != smoothsend.ENTRY_POINT:
        raise HTTPException(409, "Receipt is not a successful EntryPoint transaction.")
    segment = []
    for log in receipt.get("logs", []):
        if log.get("removed"):
            raise HTTPException(409, "Removed chain evidence. Retry verification.")
        topics = [str(t).lower() for t in log.get("topics", [])]
        if log.get("address", "").lower() == smoothsend.ENTRY_POINT and topics and topics[0] == smoothsend.USEROP_EVENT:
            if len(topics) == 4 and topics[1] == userop_hash:
                data = bytes.fromhex(log["data"][2:])
                if topics[2][-40:] != account["address"][2:] or topics[3][-40:] != account["paymaster"][2:] or len(data) != 128 or int.from_bytes(data[:32], "big") != nonce:
                    raise HTTPException(409, "Operation evidence mismatch.")
                success = int.from_bytes(data[32:64], "big")
                if success not in (0, 1):
                    raise HTTPException(409, "Invalid operation success flag.")
                return bool(success), {**receipt, "logs": segment}
            segment = []
        else:
            segment.append(log)
    raise HTTPException(409, "Matching UserOperation event is not visible yet.")


@router.post("/operations/{operation_id}/verify")
async def verify(operation_id: int, user: CurrentUser = Depends(get_current_user)):
    require_sponsorship()
    async with pool().acquire() as connection:
        async with connection.transaction():
            row = await connection.fetchrow("select * from sponsored_operations where id=$1 and github_id=$2 for update", operation_id, user.github_id)
            if not row:
                raise HTTPException(404, "Operation not found.")
            if row["status"] in ("verified", "failed"):
                return {"id": row["id"], "status": row["status"], "tx_hash": row["tx_hash"]}
            receipt = await smoothsend.gateway_rpc("eth_getUserOperationReceipt", [row["userop_hash"]], 43113, MODE)
            if receipt is None:
                op = json.loads(row["operation"])
                sent = await smoothsend.gateway_rpc("eth_sendUserOperation", [op, smoothsend.ENTRY_POINT], 43113, MODE)
                if sent.lower() != row["userop_hash"]:
                    raise HTTPException(502, "Bundler hash mismatch. Verify again without creating another operation.")
                await connection.execute("update sponsored_operations set status='submitted' where id=$1", operation_id)
                return {"id": operation_id, "status": "submitted", "userop_hash": row["userop_hash"]}
            tx_hash = receipt["receipt"]["transactionHash"].lower()
            _, chain_receipt, _ = await transaction_evidence(tx_hash)
            account = await connection.fetchrow("select * from managed_smart_accounts where github_id=$1", user.github_id)
            saved_op = json.loads(row["operation"])
            success, _segment = operation_segment(chain_receipt, row["userop_hash"], account, int(saved_op["nonce"], 16))
            await connection.execute("update sponsored_operations set status=$2,tx_hash=$3 where id=$1", operation_id, "confirmed" if success else "failed", tx_hash)
        if not success:
            return {"id": operation_id, "status": "failed", "tx_hash": tx_hash}
    from .routes.escrow import TransactionProof, verify_funding, verify_refund, verify_settlement
    proof = TransactionProof(tx_hash=tx_hash)
    if row["kind"] == "fund":
        await verify_funding(row["bounty_id"], proof, user)
    elif row["kind"] == "refund":
        await verify_refund(row["bounty_id"], proof, user)
    else:
        async with pool().acquire() as connection:
            allocation_id = await connection.fetchval("select allocation_id from escrow_allocations where bounty_id=$1 and author_github_id=$2", row["bounty_id"], user.github_id)
        await verify_settlement(allocation_id, proof, user)
    async with pool().acquire() as connection:
        await connection.execute("update sponsored_operations set status='verified' where id=$1", operation_id)
    return {"id": operation_id, "status": "verified", "tx_hash": tx_hash}
