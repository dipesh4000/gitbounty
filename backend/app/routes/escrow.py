"""Phase 2 funding evidence, recipient binding and direct settlement verification."""

from __future__ import annotations

import json
from datetime import UTC, datetime, timedelta

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field

from ..auth import CurrentUser, get_current_user
from ..config import settings
from ..db import pool
from ..escrow import settlement_typed_data, sign_settlement, signer_address
from ..escrow_chain import (
    approve_calldata,
    bounty_state,
    fund_calldata,
    refund_calldata,
    rpc,
    settle_calldata,
    transaction_evidence,
    verify_funding_receipt,
    verify_settlement_receipt,
    verify_refund_receipt,
)

router = APIRouter(prefix="/api/escrow", tags=["escrow"])


class TransactionProof(BaseModel):
    tx_hash: str = Field(pattern=r"^0x[0-9a-fA-F]{64}$")


def require_enabled() -> None:
    if settings.dev_login_stub_enabled and settings.environment != "test":
        raise HTTPException(503, "Live escrow requires real GitHub authentication.")
    key = settings.escrow_signer_private_key.get_secret_value()
    configured = (
        settings.escrow_enabled
        and settings.escrow_chain_id == 43113
        and bool(settings.escrow_contract_address and settings.escrow_authorization_signer)
    )
    if not configured:
        raise HTTPException(503, "Escrow is not enabled.")
    if settings.escrow_execution_mode != "direct":
        raise HTTPException(503, "Only the verified direct-wallet execution path is available.")
    if key and signer_address(key).lower() != settings.escrow_authorization_signer.lower():
        raise HTTPException(503, "Escrow signer configuration does not match the deployed contract.")


def _terms(row) -> dict:
    return {**dict(row), "amount_units": int(row["amount_units"])}


@router.get("/config")
async def config():
    return {
        "enabled": bool(settings.escrow_enabled),
        "chain_id": settings.escrow_chain_id,
        "contract_address": settings.escrow_contract_address or None,
        "token_address": settings.escrow_token_address,
        "authorization_signer": settings.escrow_authorization_signer or None,
        "deployment_block": settings.escrow_deployment_block or None,
        "execution_mode": settings.escrow_execution_mode,
    }


@router.get("/bounties")
async def list_bounties():
    async with pool().acquire() as connection:
        rows = await connection.fetch(
            """select t.bounty_id, ip.repo_full_name, ip.issue_number, ip.points,
                      t.amount_units::text, t.work_ends_at, t.claim_until,
                      f.tx_hash as funding_tx_hash
               from escrow_reward_terms t join issue_points ip on ip.id = t.bounty_id
               left join escrow_funding_events f on f.bounty_id = t.bounty_id
               where ip.status = 'published' order by t.created_at desc limit 100"""
        )
    return {"items": [dict(row) for row in rows]}


@router.get("/bounties/{bounty_id}")
async def bounty(bounty_id: int):
    async with pool().acquire() as connection:
        row = await connection.fetchrow(
            """select ip.repo_full_name, ip.issue_number, ip.points, ip.status as contribution_state,
                      t.*, f.tx_hash as funding_tx_hash, f.funded_at,
                      a.allocation_id, a.github_pr_id, a.author_github_id,
                      coalesce(e.event_name, 'BountyFunded') as last_chain_event,
                      e.tx_hash as settlement_tx_hash
               from escrow_reward_terms t join issue_points ip on ip.id = t.bounty_id
               left join escrow_funding_events f on f.bounty_id = t.bounty_id
               left join escrow_allocations a on a.bounty_id = t.bounty_id
               left join lateral (
                   select event_name, tx_hash from escrow_chain_events
                   where onchain_bounty_id = t.onchain_bounty_id and event_name <> 'BountyFunded'
                   order by block_number desc, log_index desc limit 1
               ) e on true where t.bounty_id = $1""",
            bounty_id,
        )
    if row is None:
        raise HTTPException(404, "Escrow bounty not found.")
    item = dict(row)
    item["amount_units"] = str(item["amount_units"])
    item["escrow_state"] = (
        "settled" if item["last_chain_event"] == "BountySettled" else
        "refunded" if item["last_chain_event"] == "BountyRefunded" else
        "funded" if item["funding_tx_hash"] else "unfunded"
    )
    return item


@router.get("/bounties/{bounty_id}/funding")
async def funding_instructions(bounty_id: int, user: CurrentUser = Depends(get_current_user)):
    require_enabled()
    async with pool().acquire() as connection:
        row = await connection.fetchrow(
            "select * from escrow_reward_terms where bounty_id = $1 and payer_github_id = $2",
            bounty_id, user.github_id,
        )
    if row is None:
        raise HTTPException(404, "Escrow bounty not found.")
    terms = _terms(row)
    return {
        "chain_id": terms["chain_id"],
        "payer": terms["payer_address"],
        "amount_units": str(terms["amount_units"]),
        "approval": {
            "to": terms["token_address"], "value": "0x0",
            "data": approve_calldata(terms["contract_address"], terms["amount_units"]),
        },
        "fund": {
            "to": terms["contract_address"], "value": "0x0",
            "data": fund_calldata(terms["reference_id"], terms["amount_units"], int(terms["work_ends_at"].timestamp())),
        },
    }


@router.post("/bounties/{bounty_id}/funding/verify")
async def verify_funding(bounty_id: int, proof: TransactionProof, user: CurrentUser = Depends(get_current_user)):
    require_enabled()
    tx_hash = proof.tx_hash.lower()
    async with pool().acquire() as connection, connection.transaction():
        row = await connection.fetchrow(
            "select * from escrow_reward_terms where bounty_id = $1 and payer_github_id = $2 for update",
            bounty_id, user.github_id,
        )
        if row is None:
            raise HTTPException(404, "Escrow bounty not found.")
        existing = await connection.fetchrow("select * from escrow_funding_events where bounty_id = $1", bounty_id)
        if existing:
            if existing["tx_hash"] != tx_hash:
                raise HTTPException(409, "This bounty is already funded by another transaction.")
            return {"status": "funded", "tx_hash": tx_hash}
        terms = _terms(row)
        try:
            tx, receipt, block_time = await transaction_evidence(tx_hash)
            if (tx.get("to") or "").lower() != terms["contract_address"]:
                raise ValueError("Funding transaction did not call the escrow contract.")
            event_terms = {**terms, "funded_at": int(block_time.timestamp()),
                           "work_ends_at": int(terms["work_ends_at"].timestamp()),
                           "claim_until": int(terms["claim_until"].timestamp())}
            event = verify_funding_receipt(receipt, event_terms)
        except (RuntimeError, ValueError) as error:
            raise HTTPException(409, str(error)) from error
        await connection.execute(
            """insert into escrow_funding_events
               (bounty_id, tx_hash, log_index, block_number, block_hash, block_time,
                payer_address, token_address, amount_units, funded_at)
               values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$6)""",
            bounty_id, tx_hash, int(event["logIndex"], 16), int(receipt["blockNumber"], 16),
            receipt["blockHash"].lower(), block_time, terms["payer_address"],
            terms["token_address"], terms["amount_units"],
        )
        await connection.execute(
            """insert into escrow_chain_events
               (chain_id, contract_address, tx_hash, log_index, event_name, onchain_bounty_id,
                block_number, block_hash, block_time, event_data)
               values ($1,$2,$3,$4,'BountyFunded',$5,$6,$7,$8,$9::jsonb) on conflict do nothing""",
            terms["chain_id"], terms["contract_address"], tx_hash, int(event["logIndex"], 16),
            terms["onchain_bounty_id"], int(receipt["blockNumber"], 16), receipt["blockHash"].lower(),
            block_time, json.dumps({"payer": terms["payer_address"], "amount": str(terms["amount_units"])}),
        )
        await connection.execute(
            """insert into escrow_chain_attempts
               (bounty_id, kind, execution_mode, tx_hash, status)
               values ($1, 'fund', 'direct', $2, 'verified')""",
            bounty_id, tx_hash,
        )
    return {"status": "funded", "tx_hash": tx_hash}


@router.post("/claims/{allocation_id}/voucher")
async def voucher(allocation_id: int, user: CurrentUser = Depends(get_current_user)):
    require_enabled()
    key = settings.escrow_signer_private_key.get_secret_value()
    if not key:
        raise HTTPException(503, "Escrow authorization signing is unavailable.")
    async with pool().acquire() as connection, connection.transaction():
        row = await connection.fetchrow(
            """select a.*, t.*, w.address as recipient
               from escrow_allocations a join escrow_reward_terms t on t.bounty_id = a.bounty_id
               join escrow_funding_events f on f.bounty_id = t.bounty_id
               join wallets w on w.github_id = a.author_github_id
               where a.allocation_id = $1 and a.author_github_id = $2 for update of a""",
            allocation_id, user.github_id,
        )
        if row is None:
            raise HTTPException(404, "Eligible funded escrow claim not found.")
        terms = _terms(row)
        block = await rpc("eth_getBlockByNumber", ["latest", False])
        now = datetime.fromtimestamp(int(block["timestamp"], 16), UTC)
        live = await connection.fetchrow(
            "select * from escrow_vouchers where allocation_id = $1 and status = 'live' for update",
            allocation_id,
        )
        if live and live["deadline"] > now:
            return {"typed_data": json.loads(live["typed_data"]), "signature": live["signature"],
                    "digest": live["digest"], "settle": {"to": terms["contract_address"], "value": "0x0",
                    "data": settle_calldata(json.loads(live["typed_data"])["message"], live["signature"])}}
        if now >= terms["claim_until"]:
            raise HTTPException(409, "The escrow claim window has closed.")
        if (terms["claim_until"] - now).total_seconds() < 30:
            raise HTTPException(409, "Too little claim time remains to issue an authorization.")
        try:
            onchain = await bounty_state(terms["onchain_bounty_id"])
        except RuntimeError as error:
            raise HTTPException(503, str(error)) from error
        if (
            onchain["state"] != 1
            or onchain["payer"] != terms["payer_address"]
            or onchain["amount"] != terms["amount_units"]
            or onchain["work_ends_at"] != int(terms["work_ends_at"].timestamp())
            or onchain["claim_until"] != int(terms["claim_until"].timestamp())
        ):
            raise HTTPException(409, "Live escrow state does not match this reward.")
        await connection.execute("update escrow_vouchers set status = 'expired' where allocation_id = $1 and status = 'live'", allocation_id)
        await connection.execute(
            """insert into escrow_recipient_bindings (allocation_id, recipient) values ($1, $2)
               on conflict (allocation_id) do nothing""",
            allocation_id, terms["recipient"],
        )
        bound = await connection.fetchval("select recipient from escrow_recipient_bindings where allocation_id = $1", allocation_id)
        if bound != terms["recipient"]:
            raise HTTPException(409, "This reward is permanently bound to another wallet.")
        deadline = min(now + timedelta(minutes=15), terms["claim_until"])
        typed = settlement_typed_data(
            chain_id=terms["chain_id"], contract_address=terms["contract_address"],
            bounty_id=terms["onchain_bounty_id"], recipient=bound, token_address=terms["token_address"],
            amount=terms["amount_units"], nonce=0, deadline=int(deadline.timestamp()),
        )
        signed = sign_settlement(typed, key)
        await connection.execute(
            """insert into escrow_vouchers
               (allocation_id, recipient, typed_data, digest, signature, nonce, deadline)
               values ($1,$2,$3::jsonb,$4,$5,0,$6)""",
            allocation_id, bound, json.dumps(typed), signed["digest"].lower(), signed["signature"].lower(), deadline,
        )
    return {"typed_data": typed, "signature": signed["signature"], "digest": signed["digest"],
            "settle": {"to": terms["contract_address"], "value": "0x0",
                       "data": settle_calldata(typed["message"], signed["signature"])}}


@router.post("/claims/{allocation_id}/settlement/verify")
async def verify_settlement(allocation_id: int, proof: TransactionProof, user: CurrentUser = Depends(get_current_user)):
    require_enabled()
    tx_hash = proof.tx_hash.lower()
    async with pool().acquire() as connection, connection.transaction():
        row = await connection.fetchrow(
            """select a.*, t.*, b.recipient, v.digest, v.id as voucher_id
               from escrow_allocations a join escrow_reward_terms t on t.bounty_id = a.bounty_id
               join escrow_recipient_bindings b on b.allocation_id = a.allocation_id
               join escrow_vouchers v on v.allocation_id = a.allocation_id
               where a.allocation_id = $1 and a.author_github_id = $2
               order by v.created_at desc limit 1 for update of v""",
            allocation_id, user.github_id,
        )
        if row is None:
            raise HTTPException(404, "Escrow claim not found.")
        existing = await connection.fetchrow(
            """select tx_hash from escrow_chain_events
               where event_name = 'BountySettled' and onchain_bounty_id = $1""",
            row["onchain_bounty_id"],
        )
        if existing:
            return {"status": "settled", "tx_hash": existing["tx_hash"]}
        terms = _terms(row)
        try:
            tx, receipt, block_time = await transaction_evidence(tx_hash)
            if settings.escrow_execution_mode == "direct" and (tx.get("to") or "").lower() != terms["contract_address"]:
                raise ValueError("Direct settlement did not call the escrow contract.")
            vouchers = await connection.fetch(
                "select id, digest from escrow_vouchers where allocation_id = $1", allocation_id,
            )
            matched = None
            for issued in vouchers:
                try:
                    event = verify_settlement_receipt(receipt, terms, row["recipient"], issued["digest"])
                    matched = issued
                    break
                except ValueError:
                    continue
            if matched is None:
                raise ValueError("Settlement does not match any issued authorization.")
        except (RuntimeError, ValueError) as error:
            raise HTTPException(409, str(error)) from error
        await connection.execute(
            """insert into escrow_chain_events
               (chain_id, contract_address, tx_hash, log_index, event_name, onchain_bounty_id,
                block_number, block_hash, block_time, event_data)
               values ($1,$2,$3,$4,'BountySettled',$5,$6,$7,$8,$9::jsonb)""",
            terms["chain_id"], terms["contract_address"], tx_hash, int(event["logIndex"], 16),
            terms["onchain_bounty_id"], int(receipt["blockNumber"], 16), receipt["blockHash"].lower(),
            block_time, json.dumps({"recipient": row["recipient"], "amount": str(terms["amount_units"]),
                                    "digest": matched["digest"]}),
        )
        await connection.execute("update escrow_vouchers set status = 'used' where id = $1", matched["id"])
        await connection.execute(
            """insert into escrow_chain_attempts
               (bounty_id, kind, execution_mode, tx_hash, status)
               values ($1, 'settle', $2, $3, 'verified')""",
            terms["bounty_id"], "direct" if settings.escrow_execution_mode == "direct" else "aa", tx_hash,
        )
    return {"status": "settled", "tx_hash": tx_hash}


@router.get("/bounties/{bounty_id}/refund")
async def refund_instructions(bounty_id: int, user: CurrentUser = Depends(get_current_user)):
    require_enabled()
    async with pool().acquire() as connection:
        row = await connection.fetchrow(
            "select * from escrow_reward_terms where bounty_id = $1 and payer_github_id = $2",
            bounty_id, user.github_id,
        )
    if row is None:
        raise HTTPException(404, "Escrow bounty not found.")
    return {"chain_id": row["chain_id"], "available_at": row["claim_until"],
            "transaction": {"to": row["contract_address"], "value": "0x0",
                            "data": refund_calldata(row["onchain_bounty_id"])}}


@router.post("/reconcile")
async def reconcile(user: CurrentUser = Depends(get_current_user)):
    """Bounded request-driven recovery; no browser transaction hash is required."""
    require_enabled()
    contract = settings.escrow_contract_address.lower()
    latest = int(await rpc("eth_blockNumber", []), 16) - 1
    async with pool().acquire() as connection:
        cursor = await connection.fetchval(
            "select last_block_number from escrow_index_cursors where chain_id = $1 and contract_address = $2",
            settings.escrow_chain_id, contract,
        )
    start = max(settings.escrow_deployment_block, (cursor or settings.escrow_deployment_block) - 10)
    end = min(start + 999, latest)
    if end < start:
        return {"processed": 0, "caught_up": True}
    logs = await rpc("eth_getLogs", [{"address": contract, "fromBlock": hex(start), "toBlock": hex(end)}])
    processed = 0
    from ..escrow_chain import FUNDED_TOPIC, SETTLED_TOPIC, REFUNDED_TOPIC
    for log in logs:
        topics = log.get("topics", [])
        if len(topics) < 2 or log.get("removed"):
            continue
        async with pool().acquire() as connection:
            row = await connection.fetchrow(
                """select t.bounty_id, t.payer_github_id, a.allocation_id, a.author_github_id
                   from escrow_reward_terms t left join escrow_allocations a on a.bounty_id = t.bounty_id
                   where t.contract_address = $1 and t.onchain_bounty_id = $2""",
                contract, topics[1].lower(),
            )
        if row is None:
            continue
        proof = TransactionProof(tx_hash=log["transactionHash"])
        # Server-resolved identities are used only by this internal recovery dispatch.
        from types import SimpleNamespace
        if topics[0].lower() == FUNDED_TOPIC:
            await verify_funding(row["bounty_id"], proof, SimpleNamespace(github_id=row["payer_github_id"]))
            processed += 1
        elif topics[0].lower() == SETTLED_TOPIC and row["allocation_id"]:
            await verify_settlement(row["allocation_id"], proof, SimpleNamespace(github_id=row["author_github_id"]))
            processed += 1
        elif topics[0].lower() == REFUNDED_TOPIC:
            await verify_refund(row["bounty_id"], proof, SimpleNamespace(github_id=row["payer_github_id"]))
            processed += 1
    block = await rpc("eth_getBlockByNumber", [hex(end), False])
    async with pool().acquire() as connection:
        await connection.execute(
            """insert into escrow_index_cursors
               (chain_id, contract_address, deployment_block, last_block_number, last_block_hash)
               values ($1,$2,$3,$4,$5) on conflict (chain_id, contract_address) do update
               set last_block_number = greatest(escrow_index_cursors.last_block_number, excluded.last_block_number),
                   last_block_hash = case when excluded.last_block_number >= escrow_index_cursors.last_block_number
                     then excluded.last_block_hash else escrow_index_cursors.last_block_hash end, updated_at = now()""",
            settings.escrow_chain_id, contract, settings.escrow_deployment_block, end, block["hash"],
        )
    return {"processed": processed, "through_block": end, "caught_up": end >= latest}


@router.post("/process-delivery")
async def process_delivery(user: CurrentUser = Depends(get_current_user)):
    """Process one durable delivery during a live request on serverless hosts."""
    require_enabled()
    from ..services.webhooks import process_one
    async with pool().acquire() as connection:
        processed = await process_one(connection)
    return {"processed": processed}


@router.post("/bounties/{bounty_id}/refund/verify")
async def verify_refund(bounty_id: int, proof: TransactionProof, user: CurrentUser = Depends(get_current_user)):
    require_enabled()
    async with pool().acquire() as connection, connection.transaction():
        row = await connection.fetchrow(
            "select * from escrow_reward_terms where bounty_id = $1 and payer_github_id = $2 for update",
            bounty_id, user.github_id,
        )
        if row is None:
            raise HTTPException(404, "Escrow bounty not found.")
        tx_hash = proof.tx_hash.lower()
        try:
            tx, receipt, block_time = await transaction_evidence(tx_hash)
            if (tx.get("to") or "").lower() != row["contract_address"]:
                raise ValueError("Refund did not call escrow.")
            event = verify_refund_receipt(receipt, dict(row))
        except (ValueError, RuntimeError) as error:
            raise HTTPException(409, str(error)) from error
        await connection.execute(
            """insert into escrow_chain_events
               (chain_id,contract_address,tx_hash,log_index,event_name,onchain_bounty_id,
                block_number,block_hash,block_time,event_data)
               values ($1,$2,$3,$4,'BountyRefunded',$5,$6,$7,$8,$9::jsonb) on conflict do nothing""",
            row["chain_id"], row["contract_address"], tx_hash, int(event["logIndex"], 16),
            row["onchain_bounty_id"], int(receipt["blockNumber"], 16), receipt["blockHash"].lower(),
            block_time, json.dumps({"payer": row["payer_address"], "amount": str(row["amount_units"])}),
        )
    return {"status": "refunded", "tx_hash": tx_hash}
