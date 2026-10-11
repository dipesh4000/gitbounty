"""Exact decimal AVAX amounts, independent of contribution points."""

import re

FUJI_USDC = "0x5425890298aed601595a70ab815c96711a31bc65"


def asset(chain_id: int) -> dict:
    if chain_id == 43113:
        return {"chain_id": 43113, "symbol": "USDC", "decimals": 6, "token_address": FUJI_USDC,
                "network": "Avalanche Fuji", "testnet": True,
                "explorer": "https://testnet.snowtrace.io", "rpc_url": "https://api.avax-test.network/ext/bc/C/rpc"}
    if chain_id != 43114:
        raise ValueError("Unsupported payment network.")
    return {"chain_id": 43114, "symbol": "AVAX", "decimals": 18, "token_address": None,
            "network": "Avalanche mainnet", "testnet": False,
            "explorer": "https://snowtrace.io", "rpc_url": "https://api.avax.network/ext/bc/C/rpc"}


def amount_to_units(value: str, decimals: int) -> int:
    if not re.fullmatch(rf"(?:0|[1-9][0-9]{{0,59}})(?:\.[0-9]{{1,{decimals}}})?", value):
        raise ValueError(f"Use a positive amount with at most {decimals} decimal places.")
    whole, _, fraction = value.partition(".")
    units = int(whole) * 10**decimals + int(fraction.ljust(decimals, "0"))
    if units <= 0:
        raise ValueError("The reward must be greater than zero.")
    return units


def units_to_amount(value: int, decimals: int) -> str:
    whole, fraction = divmod(value, 10**decimals)
    return f"{whole}.{fraction:0{decimals}d}".rstrip("0").rstrip(".")


def reward_fields(amount, chain_id=43114) -> dict:
    if amount is None:
        return {"reward_avax": None, "reward_usdc": None, "reward_chain_id": None}
    amount = units_to_amount(int(amount), asset(chain_id)["decimals"])
    return {"reward_avax": amount if chain_id == 43114 else None,
            "reward_usdc": amount if chain_id == 43113 else None, "reward_chain_id": chain_id}


def transfer_data(recipient: str, amount: int) -> str:
    return "0xa9059cbb" + recipient.removeprefix("0x").rjust(64, "0") + f"{amount:064x}"


def avax_to_wei(value: str) -> int:
    if not re.fullmatch(r"(?:0|[1-9][0-9]{0,59})(?:\.[0-9]{1,18})?", value):
        raise ValueError("Use a positive AVAX amount with at most 18 decimal places.")
    whole, _, fraction = value.partition(".")
    wei = int(whole) * 10**18 + int(fraction.ljust(18, "0"))
    if wei <= 0:
        raise ValueError("The AVAX reward must be greater than zero.")
    return wei


def wei_to_avax(value: int) -> str:
    whole, fraction = divmod(value, 10**18)
    return f"{whole}.{fraction:018d}".rstrip("0").rstrip(".")
