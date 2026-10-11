"""Owner-signed AVAX transfers. No endpoint accepts a payout amount or destination."""

import secrets
from datetime import datetime, timezone

import asyncpg
import httpx
from eth_account import Account
from eth_account.messages import encode_defunct
from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel, ConfigDict, Field

from ..auth import CurrentUser, get_current_user
from ..avax import asset, units_to_amount, transfer_data, amount_to_units
from .. import smoothsend
import json
from ..config import settings
from ..db import pool
from ..features.points.allocations import credit
from ..routes.maintainer import _actor_id

router = APIRouter(prefix="/api/avax", tags=["AVAX rewards"])
def active_asset():
    return asset(43113 if settings.payment_mode == "usdc_fuji" else 43114)


def require_network(chain_id):
    if chain_id != active_asset()["chain_id"]:
        raise HTTPException(409, "This promise belongs to another network. Its terms cannot be converted.")


@router.get("/config")
def payment_config():
    return {**active_asset(), "enabled": settings.avax_payments_enabled and smoothsend.configured(),
            "provider": "smoothsend", "sponsorship_mode": "user-pays-erc20",
            "smoothsend_public_key": settings.smoothsend_public_key if smoothsend.configured() else None,
            "fee_limit_usdc": settings.smoothsend_fee_limit_usdc,
            "configuration_message": None if smoothsend.configured() else f"Set SMOOTHSEND_PUBLIC_KEY to your dashboard public key and allow {settings.frontend_url} in SmoothSend."}


@router.get("/wallet/balance")
async def wallet_balance(user: CurrentUser = Depends(get_current_user)):
    """Read the linked EOA on the configured Avalanche network, without enabling payouts."""
    details = active_asset()
    async with pool().acquire() as connection:
        address = await connection.fetchval("select address from wallets where github_id = $1", user.github_id)
    if address is None:
        return {**details, "address": None, "balance": None, "native_balance_avax": None, "checked_at": None}
    await check_chain()
    try:
        native = int(await rpc("eth_getBalance", [address, "latest"]), 16)
        balance = native
        if details["token_address"]:
            balance = int(await rpc("eth_call", [{"to": details["token_address"],
                "data": smoothsend.call("balanceOf(address)", ["address"], [address])}, "latest"]), 16)
        if min(native, balance) < 0 or max(native, balance) >= 2**256:
            raise ValueError("Invalid balance")
    except (TypeError, ValueError) as error:
        raise HTTPException(502, "Avalanche returned an invalid balance. Refresh to retry.") from error
    return {**details, "address": address, "balance": units_to_amount(balance, details["decimals"]),
            "native_balance_avax": units_to_amount(native, 18), "checked_at": datetime.now(timezone.utc).isoformat()}



class WalletProof(BaseModel):
    model_config = ConfigDict(extra="forbid")
    signature: str = Field(pattern=r"^0x[0-9a-fA-F]{130}$")


class TransactionProof(BaseModel):
    model_config = ConfigDict(extra="forbid")
    userop_hash: str = Field(pattern=r"^0x[0-9a-fA-F]{64}$")


class OperationProof(TransactionProof):
    operation: dict


class PaymentRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")


def require_enabled():
    if not settings.avax_payments_enabled:
        raise HTTPException(503, "AVAX payment execution is not enabled yet.")
    if not smoothsend.configured():
        raise HTTPException(503, "SmoothSend is required. Configure SMOOTHSEND_PUBLIC_KEY and the allowed origin before paying.")
    if settings.dev_login_stub_enabled and settings.environment != "test":
        raise HTTPException(503, "Live wallet actions require real GitHub authentication.")


async def rpc(method: str, params: list):
    try:
        async with httpx.AsyncClient(timeout=15) as client:
            response = await client.post(active_asset()["rpc_url"] if settings.payment_mode == "usdc_fuji" else settings.avax_rpc_url, json={
                "jsonrpc": "2.0", "id": 1, "method": method, "params": params,
            })
            response.raise_for_status()
            result = response.json()
        if "error" in result or "result" not in result:
            raise ValueError("RPC error")
        return result["result"]
    except (httpx.HTTPError, ValueError, TypeError) as error:
        raise HTTPException(502, "Avalanche could not be verified. Retry without sending another payment.") from error


async def check_chain():
    if int(await rpc("eth_chainId", []), 16) != active_asset()["chain_id"]:
        raise HTTPException(503, "The payment RPC does not match the configured payment network.")


@router.post("/wallet/challenge")
async def wallet_challenge(user: CurrentUser = Depends(get_current_user)):
    require_enabled()
    async with pool().acquire() as connection:
        await _actor_id(connection, user)
        message = (f"{settings.frontend_url}\nGitBounty: connect my receiving/payment wallet.\n"
                   f"GitHub ID: {user.github_id}\nChain ID: {active_asset()["chain_id"]}\n"
                   f"This links one wallet permanently; it does not authorize a transfer.\nNonce: {secrets.token_urlsafe(32)}")
        await connection.execute(
            """insert into wallet_challenges (github_id, message, expires_at)
               values ($1, $2, now() + interval '5 minutes') on conflict (github_id)
               do update set message = excluded.message, expires_at = excluded.expires_at""",
            user.github_id, message,
        )
    return {"message": message}


@router.post("/wallet")
async def connect_wallet(proof: WalletProof, user: CurrentUser = Depends(get_current_user)):
    require_enabled()
    try:
        async with pool().acquire() as connection, connection.transaction():
            message = await connection.fetchval(
                "delete from wallet_challenges where github_id = $1 and expires_at > now() returning message",
                user.github_id,
            )
            if message is None:
                raise HTTPException(409, "Request a fresh wallet challenge.")
            try:
                address = Account.recover_message(encode_defunct(text=message), signature=proof.signature).lower()
            except Exception as error:
                raise HTTPException(400, "Invalid wallet signature.") from error
            existing = await connection.fetchval("select address from wallets where github_id = $1", user.github_id)
            if existing and existing != address:
                raise HTTPException(409, "This GitHub identity already has a different wallet.")
            await connection.execute(
                "insert into wallets (github_id, address) values ($1, $2) on conflict (github_id) do nothing",
                user.github_id, address,
            )
            actual = await connection.fetchval("select address from wallets where github_id = $1", user.github_id)
            if actual != address:
                raise HTTPException(409, "This GitHub identity already has a different wallet.")
    except asyncpg.UniqueViolationError as error:
        raise HTTPException(409, "This wallet is already linked to another GitHub identity.") from error
    return {"address": address}


@router.get("/rewards")
async def rewards(page: int = Query(default=1, ge=1), user: CurrentUser = Depends(get_current_user)):
    async with pool().acquire() as connection:
        wallet = await connection.fetchval("select address from wallets where github_id = $1", user.github_id)
        rows = await connection.fetch(
            """select c.allocation_id as id, c.github_id, c.payer_github_id, c.amount_wei::text,
                      c.review_status, c.claimed_at, a.bounty_repo_full_name as repository,
                      a.bounty_issue_number as issue_number, p.status, p.tx_hash, p.userop_hash, t.chain_id, u.github_login as contributor_login, payer.github_login as payer_login, recipient.address as receiving_wallet
               from avax_reward_claims c join reward_allocations a on a.id = c.allocation_id
               left join avax_payments p on p.claim_id = c.allocation_id
               join avax_reward_terms t on t.bounty_id = c.bounty_id
               left join users u on u.github_id = c.github_id
               left join users payer on payer.github_id = c.payer_github_id
               left join wallets recipient on recipient.github_id = c.github_id
               where c.github_id = $1 or c.payer_github_id = $1
               order by c.created_at desc, c.allocation_id desc limit 26 offset $2""", user.github_id, (page - 1) * 25,
        )
    return {"enabled": payment_config()["enabled"], "wallet": wallet, "chain_id": active_asset()["chain_id"], "payment_config": payment_config(),
            "page": page, "has_more": len(rows) > 25,
            "items": [{**dict(row), **asset(row["chain_id"]), "reward_amount": units_to_amount(int(row["amount_wei"]), asset(row["chain_id"])["decimals"]),
                       "is_payer": row["payer_github_id"] == user.github_id} for row in rows[:25]]}


@router.post("/rewards/{claim_id}/claim")
async def claim_reward(claim_id: int, user: CurrentUser = Depends(get_current_user)):
    require_enabled()
    async with pool().acquire() as connection, connection.transaction():
        row = await connection.fetchrow(
            "select * from avax_reward_claims where allocation_id = $1 and github_id = $2 for update",
            claim_id, user.github_id,
        )
        if row is None:
            raise HTTPException(404, "Reward not found.")
        require_network(await connection.fetchval("select chain_id from avax_reward_terms where bounty_id = $1", row["bounty_id"]))
        if row["review_status"] != "clear":
            raise HTTPException(409, "This reward is under manual review.")
        if not await connection.fetchval("select address from wallets where github_id = $1", user.github_id):
            raise HTTPException(409, "Connect and prove your receiving wallet first.")
        user_id = await _actor_id(connection, user)
        await credit(connection, claim_id, user_id)
        await connection.execute(
            "update avax_reward_claims set claimed_at = coalesce(claimed_at, now()) where allocation_id = $1", claim_id,
        )
    return {"status": "awaiting_owner_payment"}


def payment_out(row, amount: int):
    details = asset(row["chain_id"])
    return {**dict(row), **details, "amount_wei": str(amount),
            "reward_amount": units_to_amount(amount, details["decimals"]),
            "transaction_to": details["token_address"] or row["recipient"],
            "transaction_value": "0" if details["token_address"] else str(amount),
            "transaction_data": transfer_data(row["recipient"], amount) if details["token_address"] else "0x",
            "fee_token": smoothsend.fee_token(row["chain_id"]), "fee_limit_usdc": units_to_amount(int(row["fee_limit"] or 0), 6), "fee_limit": str(row["fee_limit"] or 0),
            "smoothsend_public_key": settings.smoothsend_public_key}


@router.post("/rewards/{claim_id}/payment")
async def prepare_payment(claim_id: int, request: PaymentRequest = PaymentRequest(), user: CurrentUser = Depends(get_current_user)):
    require_enabled()
    async with pool().acquire() as connection, connection.transaction():
        claim = await connection.fetchrow(
            "select * from avax_reward_claims where allocation_id = $1 and payer_github_id = $2 for update",
            claim_id, user.github_id,
        )
        if claim is None:
            raise HTTPException(404, "Reward not found.")
        require_network(await connection.fetchval("select chain_id from avax_reward_terms where bounty_id = $1", claim["bounty_id"]))
        existing = await connection.fetchrow("select * from avax_payments where claim_id = $1", claim_id)
        if claim["review_status"] != "clear" and (existing is None or existing["status"] != "paid"):
            raise HTTPException(409, "This reward is under manual review.")
        if existing and existing["provider"] != "smoothsend":
            raise HTTPException(409, "A legacy payment exists. It must be reconciled before changing providers.")
        if existing and existing["status"] != "failed":
            return payment_out(existing, int(claim["amount_wei"]))
        await check_chain()
        if existing:
            # Avalanche accepted blocks are final. Only a verified reverted transaction may
            # release its consumed nonce for a new attempt on the same payment row.
            receipt = await connection.fetchval("select 1 from smoothsend_payment_receipts where userop_hash = $1 and status = 'failed'", existing["userop_hash"])
            if not receipt:
                raise HTTPException(409, "Verify the previous transaction before retrying payment.")
        if claim["review_status"] != "clear" or claim["claimed_at"] is None:
            raise HTTPException(409, "The contributor must claim, and manual review must be clear.")
        sender = await connection.fetchval("select address from wallets where github_id = $1", user.github_id)
        recipient = await connection.fetchval("select address from wallets where github_id = $1", claim["github_id"])
        if not sender or not recipient:
            raise HTTPException(409, "Both parties must connect their wallets.")
        # Serialize per sender: one unfinished transfer at a time, including across worker processes.
        await connection.execute("select pg_advisory_xact_lock(hashtextextended($1, 0))", sender)
        if await connection.fetchval(
            "select 1 from avax_payments where sender = $1 and status in ('awaiting_signature', 'submitted')", sender,
        ):
            raise HTTPException(409, "Complete or verify your previous payment first.")
        chain_id = active_asset()["chain_id"]
        setup = ({key: existing[key] for key in ("smart_sender", "entry_point", "account_factory", "paymaster_address")}
                 if existing else await smoothsend.account_setup(sender, chain_id, rpc))
        nonce = await smoothsend.account_nonce(setup["smart_sender"], rpc)
        fee_limit = amount_to_units(settings.smoothsend_fee_limit_usdc, 6)
        call_data = smoothsend.payment_calldata(chain_id, recipient, int(claim["amount_wei"]), setup["paymaster_address"], fee_limit)
        row = await connection.fetchrow(
            """insert into avax_payments (claim_id, chain_id, sender, recipient, nonce, provider, smart_sender,
                   entry_point, account_factory, paymaster_address, fee_limit, call_data)
               values ($1, $2, $3, $4, $5, 'smoothsend', $6, $7, $8, $9, $10, $11)
               on conflict (claim_id) do update set nonce = excluded.nonce, status = 'awaiting_signature',
                   tx_hash = null, userop_hash = null, paid_at = null, operation = null
               returning *""", claim_id, chain_id, sender, recipient, nonce, setup["smart_sender"],
            setup["entry_point"], setup["account_factory"], setup["paymaster_address"], fee_limit, call_data,
        )
    return payment_out(row, int(claim["amount_wei"]))


def verify_transaction(tx, receipt, payment, amount: int, tx_hash: str):
    try:
        details = asset(payment.get("chain_id", 43114))
        token = details["token_address"]
        valid = (tx["hash"].lower() == tx_hash and tx["from"].lower() == payment["sender"]
                 and (tx.get("to") or "").lower() == (token or payment["recipient"])
                 and int(tx["value"], 16) == (0 if token else amount) and int(tx["nonce"], 16) == payment["nonce"]
                 and int(tx["chainId"], 16) == details["chain_id"]
                 and (tx.get("input", "").lower() == transfer_data(payment["recipient"], amount) if token else tx.get("input") in ("0x", ""))
                 and (receipt is None or (receipt["transactionHash"].lower() == tx_hash
                      and receipt["blockHash"] == tx["blockHash"] and receipt.get("blockNumber") is not None)))
    except (KeyError, ValueError, TypeError, AttributeError):
        valid = False
    if valid and token and receipt is not None and receipt.get("status") == "0x1":
        # Receipt success alone does not prove tokens moved. Require the exact token Transfer event.
        topics = ["0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef",
                  "0x" + payment["sender"][2:].rjust(64, "0"),
                  "0x" + payment["recipient"][2:].rjust(64, "0")]
        valid = any(log.get("address", "").lower() == token and not log.get("removed", False)
                    and [str(t).lower() for t in log.get("topics", [])] == topics
                    and log.get("data", "").lower() == "0x" + f"{amount:064x}"
                    for log in receipt.get("logs", []))
    if not valid:
        raise HTTPException(409, "Transaction does not match this reward's fixed payment instructions.")


@router.post("/rewards/{claim_id}/payment/operation")
async def save_operation(claim_id: int, proof: OperationProof, user: CurrentUser = Depends(get_current_user)):
    require_enabled()
    async with pool().acquire() as connection, connection.transaction():
        row = await connection.fetchrow("select * from avax_payments where claim_id = $1 and sender = (select address from wallets where github_id = $2) for update", claim_id, user.github_id)
        if row is None or row["provider"] != "smoothsend":
            raise HTTPException(404, "SmoothSend payment not found.")
        if row["status"] not in ("awaiting_signature", "submitted"):
            raise HTTPException(409, "Prepare this payment before signing again.")
        require_network(row["chain_id"])
        userop_hash = proof.userop_hash.lower()
        smoothsend.verify_operation({"userOperation": proof.operation, "entryPoint": row["entry_point"]}, row, userop_hash)
        try:
            signer = Account.recover_message(encode_defunct(hexstr=userop_hash), signature=proof.operation["signature"]).lower()
        except Exception as error:
            raise HTTPException(400, "Invalid operation signature.") from error
        if signer != row["sender"]:
            raise HTTPException(403, "The linked owner wallet must sign this operation.")
        await connection.execute("update avax_payments set userop_hash = $2, operation = $3::jsonb, status = 'submitted' where claim_id = $1", claim_id, userop_hash, json.dumps(proof.operation))
    return {"status": "submitted", "userop_hash": userop_hash}


@router.post("/rewards/{claim_id}/payment/confirm")
async def confirm_payment(claim_id: int, proof: TransactionProof, user: CurrentUser = Depends(get_current_user)):
    require_enabled()
    try:
        async with pool().acquire() as connection, connection.transaction():
            row = await connection.fetchrow(
                """select p.*, c.amount_wei from avax_payments p join avax_reward_claims c on c.allocation_id = p.claim_id
                   where p.claim_id = $1 and c.payer_github_id = $2 for update of p""", claim_id, user.github_id,
            )
            if row is None or row["provider"] != "smoothsend":
                raise HTTPException(404, "SmoothSend payment not found.")
            if row["status"] == "paid":
                return {"status": "paid", "tx_hash": row["tx_hash"], "userop_hash": row["userop_hash"]}
            require_network(row["chain_id"])
            await check_chain()
            userop_hash = proof.userop_hash.lower()
            operation = await smoothsend.gateway_rpc("eth_getUserOperationByHash", [userop_hash], row["chain_id"])
            if operation is None:
                raise HTTPException(409, "Operation is not visible yet. Verify again, or resubmit the same saved operation.")
            smoothsend.verify_operation(operation, row, userop_hash)
            bundled = await smoothsend.gateway_rpc("eth_getUserOperationReceipt", [userop_hash], row["chain_id"])
            if bundled is None:
                await connection.execute("update avax_payments set userop_hash = $2, status = 'submitted' where claim_id = $1", claim_id, userop_hash)
                return {"status": "submitted", "userop_hash": userop_hash}
            try:
                tx_hash = TransactionProof(userop_hash=bundled["receipt"]["transactionHash"]).userop_hash.lower()
            except (KeyError, TypeError, ValueError) as error:
                raise HTTPException(502, "SmoothSend returned an invalid receipt. Retry verification.") from error
            receipt = await rpc("eth_getTransactionReceipt", [tx_hash])
            if receipt is None or receipt.get("transactionHash", "").lower() != tx_hash:
                raise HTTPException(409, "The chain receipt is not visible yet. Retry verification.")
            new_status = smoothsend.verify_receipt(receipt, row, int(row["amount_wei"]), userop_hash)
            await connection.execute(
                """insert into smoothsend_payment_receipts (userop_hash, tx_hash, claim_id, chain_id, nonce, status)
                   values ($1, $2, $3, $4, $5, $6) on conflict (userop_hash) do nothing""",
                userop_hash, tx_hash, claim_id, row["chain_id"], row["nonce"], new_status,
            )
            await connection.execute(
                """update avax_payments set status = $2, tx_hash = $3, userop_hash = $4,
                   paid_at = case when $2 = 'paid' then now() else null end where claim_id = $1""",
                claim_id, new_status, tx_hash, userop_hash,
            )
    except asyncpg.UniqueViolationError as error:
        raise HTTPException(409, "This operation is already recorded for another reward.") from error
    return {"status": new_status, "tx_hash": tx_hash, "userop_hash": userop_hash}
