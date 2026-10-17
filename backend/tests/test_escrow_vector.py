import json
from pathlib import Path

from eth_account import Account

from app.escrow import (
    SETTLEMENT_FIELDS,
    encode_settlement,
    settlement_digest,
    settlement_typed_data,
    sign_settlement,
)


VECTOR_PATH = Path(__file__).parents[2] / "contracts" / "test" / "settlement-vector.json"
TEST_SIGNER_KEY = "0x" + "11" * 32


def test_settlement_golden_vector_matches_eth_account() -> None:
    vector = json.loads(VECTOR_PATH.read_text())
    message = {
        **vector["message"],
        "amount": int(vector["message"]["amount"]),
        "nonce": int(vector["message"]["nonce"]),
        "deadline": int(vector["message"]["deadline"]),
    }
    typed_data = settlement_typed_data(
        chain_id=vector["domain"]["chainId"],
        contract_address=vector["domain"]["verifyingContract"],
        bounty_id=message["bountyId"],
        recipient=message["recipient"],
        token_address=message["token"],
        amount=message["amount"],
        nonce=message["nonce"],
        deadline=message["deadline"],
    )
    signed = sign_settlement(typed_data, TEST_SIGNER_KEY)

    assert SETTLEMENT_FIELDS == typed_data["types"]["Settlement"]
    assert settlement_digest(typed_data) == vector["digest"]
    assert signed["digest"] == vector["digest"]
    assert signed["signature"] == vector["signature"]
    assert signed["signer"] == vector["signer"]
    assert Account.recover_message(
        encode_settlement(typed_data),
        signature=vector["signature"],
    ) == vector["signer"]
