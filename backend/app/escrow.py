"""Version-1 GitBounty escrow settlement typed data and signing."""

from __future__ import annotations

from typing import Any

from eth_account import Account
from eth_account.messages import SignableMessage, encode_typed_data
from eth_utils import is_hex, keccak, to_checksum_address

DOMAIN_NAME = "GitBountyEscrow"
DOMAIN_VERSION = "1"
SETTLEMENT_FIELDS = [
    {"name": "bountyId", "type": "bytes32"},
    {"name": "recipient", "type": "address"},
    {"name": "token", "type": "address"},
    {"name": "amount", "type": "uint256"},
    {"name": "nonce", "type": "uint256"},
    {"name": "deadline", "type": "uint256"},
]
UINT256_MAX = 2**256 - 1


def _address(value: str) -> str:
    try:
        return to_checksum_address(value)
    except (TypeError, ValueError) as error:
        raise ValueError("Invalid EVM address.") from error


def _bytes32(value: str) -> str:
    if not isinstance(value, str) or len(value) != 66 or not value.startswith("0x") or not is_hex(value):
        raise ValueError("Expected a 32-byte hex value.")
    return value.lower()


def _uint256(value: int, name: str, *, positive: bool = False) -> int:
    if isinstance(value, bool) or not isinstance(value, int) or value < int(positive) or value > UINT256_MAX:
        raise ValueError(f"Invalid {name}.")
    return value


def settlement_typed_data(
    *,
    chain_id: int,
    contract_address: str,
    bounty_id: str,
    recipient: str,
    token_address: str,
    amount: int,
    nonce: int,
    deadline: int,
) -> dict[str, Any]:
    """Build the exact payload frozen in docs/architecture.md and the contract."""
    return {
        "types": {
            "EIP712Domain": [
                {"name": "name", "type": "string"},
                {"name": "version", "type": "string"},
                {"name": "chainId", "type": "uint256"},
                {"name": "verifyingContract", "type": "address"},
            ],
            "Settlement": SETTLEMENT_FIELDS,
        },
        "primaryType": "Settlement",
        "domain": {
            "name": DOMAIN_NAME,
            "version": DOMAIN_VERSION,
            "chainId": _uint256(chain_id, "chain ID", positive=True),
            "verifyingContract": _address(contract_address),
        },
        "message": {
            "bountyId": _bytes32(bounty_id),
            "recipient": _address(recipient),
            "token": _address(token_address),
            "amount": _uint256(amount, "amount", positive=True),
            "nonce": _uint256(nonce, "nonce"),
            "deadline": _uint256(deadline, "deadline", positive=True),
        },
    }


def encode_settlement(typed_data: dict[str, Any]) -> SignableMessage:
    return encode_typed_data(full_message=typed_data)


def settlement_digest(typed_data: dict[str, Any]) -> str:
    signable = encode_settlement(typed_data)
    return "0x" + keccak(b"\x19" + signable.version + signable.header + signable.body).hex()


def signer_address(private_key: str) -> str:
    try:
        return Account.from_key(private_key).address
    except (TypeError, ValueError) as error:
        raise ValueError("Invalid escrow signer key.") from error


def sign_settlement(typed_data: dict[str, Any], private_key: str) -> dict[str, str]:
    """Return persistable bearer authorization fields. Callers must never log the signature."""
    signed = Account.sign_message(encode_settlement(typed_data), private_key)
    return {
        "digest": "0x" + signed.message_hash.hex(),
        "signature": "0x" + signed.signature.hex(),
        "signer": Account.from_key(private_key).address,
    }
