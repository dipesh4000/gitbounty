from eth_abi import encode
import pytest

from app.escrow_chain import (
    FUNDED_TOPIC,
    SETTLED_TOPIC,
    TRANSFER_TOPIC,
    approve_calldata,
    derive_bounty_id,
    fund_calldata,
    refund_calldata,
    settle_calldata,
    verify_funding_receipt,
    verify_settlement_receipt,
)

CONTRACT = "0xc8ff1527bf4d43a3bc7ea3d9fb415d5647739f65"
TOKEN = "0x5425890298aed601595a70ab815c96711a31bc65"
PAYER = "0x2867ab18c8e9a31ad29fe501d45ce3e50fb016ab"
RECIPIENT = "0x8ba1f109551bd432803012645ac136ddd64dba72"
REFERENCE = "0x" + "22" * 32
DIGEST = "0x" + "44" * 32


def topic(address: str) -> str:
    return "0x" + address[2:].rjust(64, "0")


def test_transaction_calldata_and_payer_bound_id_are_deterministic() -> None:
    bounty_id = derive_bounty_id(43113, CONTRACT, PAYER, REFERENCE)
    assert len(bounty_id) == 66
    assert bounty_id != derive_bounty_id(43113, CONTRACT, RECIPIENT, REFERENCE)
    assert approve_calldata(CONTRACT, 1_000_000).startswith("0x095ea7b3")
    assert fund_calldata(REFERENCE, 1_000_000, 2_000_000_000).startswith("0x")
    assert refund_calldata(bounty_id).startswith("0x")
    assert settle_calldata({
        "bountyId": bounty_id, "recipient": RECIPIENT, "token": TOKEN,
        "amount": 1_000_000, "nonce": 0, "deadline": 2_000_000_000,
    }, "0x" + "11" * 65).startswith("0x")


def test_funding_requires_both_contract_event_and_exact_token_transfer() -> None:
    bounty_id = derive_bounty_id(43113, CONTRACT, PAYER, REFERENCE)
    terms = {
        "onchain_bounty_id": bounty_id, "reference_id": REFERENCE,
        "payer_address": PAYER, "amount_units": 1_000_000,
        "contract_address": CONTRACT, "token_address": TOKEN,
        "funded_at": 100, "work_ends_at": 200, "claim_until": 604_800 + 200,
    }
    receipt = {"logs": [
        {"address": CONTRACT, "topics": [FUNDED_TOPIC, bounty_id, REFERENCE, topic(PAYER)],
         "data": "0x" + encode(["uint256"] * 4, [1_000_000, 100, 200, 605_000]).hex(), "logIndex": "0x1"},
        {"address": TOKEN, "topics": [TRANSFER_TOPIC, topic(PAYER), topic(CONTRACT)],
         "data": hex(1_000_000), "logIndex": "0x2"},
    ]}
    assert verify_funding_receipt(receipt, terms)["logIndex"] == "0x1"
    with pytest.raises(ValueError, match="exact escrow funding"):
        verify_funding_receipt({"logs": receipt["logs"][:1]}, terms)
    with pytest.raises(ValueError, match="exact escrow funding"):
        verify_funding_receipt(receipt, {**terms, "amount_units": 2_000_000})
    with pytest.raises(ValueError, match="exact escrow funding"):
        verify_funding_receipt({"logs": [{**log, "removed": True} for log in receipt["logs"]]}, terms)


def test_settlement_requires_matching_digest_and_outgoing_transfer() -> None:
    bounty_id = derive_bounty_id(43113, CONTRACT, PAYER, REFERENCE)
    terms = {"onchain_bounty_id": bounty_id, "contract_address": CONTRACT,
             "token_address": TOKEN, "amount_units": 1_000_000}
    receipt = {"logs": [
        {"address": CONTRACT, "topics": [SETTLED_TOPIC, bounty_id, topic(RECIPIENT)],
         "data": "0x" + encode(["uint256", "bytes32"], [1_000_000, bytes.fromhex(DIGEST[2:])]).hex(),
         "logIndex": "0x3"},
        {"address": TOKEN, "topics": [TRANSFER_TOPIC, topic(CONTRACT), topic(RECIPIENT)],
         "data": hex(1_000_000), "logIndex": "0x4"},
    ]}
    assert verify_settlement_receipt(receipt, terms, RECIPIENT, DIGEST)["logIndex"] == "0x3"
    with pytest.raises(ValueError, match="exact escrow settlement"):
        verify_settlement_receipt(receipt, terms, RECIPIENT, "0x" + "55" * 32)
    with pytest.raises(ValueError, match="exact escrow settlement"):
        verify_settlement_receipt({"logs": receipt["logs"][:1]}, terms, RECIPIENT, DIGEST)
