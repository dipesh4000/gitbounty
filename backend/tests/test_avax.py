import httpx
import pytest
import respx

from app.avax import avax_to_wei, wei_to_avax, asset, amount_to_units, transfer_data
from eth_account import Account
from eth_account.messages import encode_defunct
from app.config import settings
from .test_maintainer_api import REPO, REPO_URL, ISSUES_URL, repo, issue, query


def test_exact_avax_amounts():
    for amount in ("0.000000000000000001", "0.1", "1", "123456789.123456789123456789"):
        assert wei_to_avax(avax_to_wei(amount)) == amount
    for invalid in ("0", "-1", "NaN", "1e-3", "0.0000000000000000001", "1.", "01", " 1"):
        with pytest.raises(ValueError):
            avax_to_wei(invalid)


@respx.mock
def test_published_promise_is_exact_and_immutable_and_does_not_convert_points(api):
    respx.get(REPO_URL).mock(return_value=httpx.Response(200, json=repo()))
    respx.get(ISSUES_URL).mock(return_value=httpx.Response(200, json=[issue()]))
    payload = {"issues": [{"repository": REPO, "number": 12, "points": 40, "category": "backend", "reward_avax": "0.123456789123456789"}]}
    assert api.post("/api/maintainer/bounties", json=payload).status_code == 200
    terms = query("select amount_wei, payer_github_id from avax_reward_terms")[0]
    assert int(terms["amount_wei"]) == 123456789123456789
    assert api.get("/api/issues").json()["items"][0]["reward_avax"] == "0.123456789123456789"
    assert api.get("/api/maintainer/bounties").json()["items"][0]["reward_avax"] == "0.123456789123456789"
    payload["issues"][0]["reward_avax"] = "2"
    assert api.post("/api/maintainer/bounties", json=payload).status_code == 409
    with pytest.raises(Exception, match="immutable"):
        query("update avax_reward_terms set amount_wei = 1")
    # The normal reservation pipeline snapshots the promise once, without crediting money for a baseline.
    sql = """insert into reward_allocations (github_id, github_pr_id, kind, bounty_repo_full_name, bounty_issue_number, award)
             values (999, 1234, 'bounty_award', $1, 12, '{}'::jsonb) on conflict do nothing"""
    query(sql, REPO)
    query(sql, REPO)
    claims = query("select * from avax_reward_claims")
    assert len(claims) == 1
    assert claims[0]["github_id"] == 999
    assert int(claims[0]["amount_wei"]) == 123456789123456789
    assert claims[0]["payer_github_id"] == terms["payer_github_id"]
    assert claims[0]["review_status"] == "clear"


def link_wallet(api, account):
    challenge = api.post("/api/avax/wallet/challenge")
    assert challenge.status_code == 200, challenge.text
    signature = "0x" + bytes(account.sign_message(encode_defunct(text=challenge.json()["message"])).signature).hex()
    response = api.post("/api/avax/wallet", json={"signature": signature})
    assert response.status_code == 200, response.text
    assert api.post("/api/avax/wallet", json={"signature": signature}).status_code == 409


@pytest.fixture(autouse=True)
def smoothsend_key(monkeypatch):
    monkeypatch.setattr(settings, "smoothsend_public_key", "pk_nogas_test")


@pytest.mark.parametrize("fuji", [False, True])
@respx.mock
def test_owner_payment_verifies_wallet_claim_amount_nonce_and_receipt_exactly_once(api, monkeypatch, fuji):
    from app.routes import payments
    from app import smoothsend
    monkeypatch.setattr(settings, "avax_payments_enabled", True)
    monkeypatch.setattr(settings, "environment", "test")
    monkeypatch.setattr(settings, "dev_github_id", 10)
    monkeypatch.setattr(settings, "payment_mode", "usdc_fuji" if fuji else "avax_mainnet")
    details = asset(43113 if fuji else 43114)
    amount = 1250000 if fuji else 10**17
    owner, contributor = Account.create(), Account.create()
    smart, factory, paymaster = ("0x" + c * 40 for c in ("3", "4", "5"))
    respx.get(REPO_URL).mock(return_value=httpx.Response(200, json=repo()))
    respx.get(ISSUES_URL).mock(return_value=httpx.Response(200, json=[issue()]))
    payload = {"issues": [{"repository": REPO, "number": 12, "points": 40, "category": "backend",
                            **({"reward_usdc": "1.25"} if fuji else {"reward_avax": "0.1"})}]}
    assert api.post("/api/maintainer/bounties", json=payload).status_code == 200
    link_wallet(api, owner)
    query("""insert into reward_allocations (github_id, github_pr_id, kind, bounty_repo_full_name, bounty_issue_number, award)
             values (20, 1234, 'bounty_award', $1, 12, '{}'::jsonb)""", REPO)
    claim_id = query("select allocation_id from avax_reward_claims")[0]["allocation_id"]
    monkeypatch.setattr(payments, "credit", _no_credit)
    path = f"/api/avax/rewards/{claim_id}"
    assert api.post(path + "/claim").status_code == 404
    monkeypatch.setattr(settings, "dev_github_id", 20)
    monkeypatch.setattr(settings, "dev_github_login", "contributor")
    assert api.post(path + "/claim").status_code == 409
    link_wallet(api, contributor)
    query("update avax_reward_claims set review_status = 'under_review' where allocation_id = $1", claim_id)
    assert api.post(path + "/claim").status_code == 409
    query("update avax_reward_claims set review_status = 'clear' where allocation_id = $1", claim_id)
    assert api.post(path + "/claim").status_code == 200
    assert api.post(path + "/claim").status_code == 200
    chain = {"nonce": 5, "receipt": None, "proof": None}
    async def fake_rpc(method, params):
        return {"eth_chainId": hex(details["chain_id"]), "eth_getTransactionReceipt": chain["receipt"]}[method]
    async def fake_setup(*args):
        return {"smart_sender": smart, "account_factory": factory, "paymaster_address": paymaster, "entry_point": smoothsend.ENTRY_POINT}
    async def fake_nonce(*args):
        return chain["nonce"]
    async def fake_gateway(method, params, chain_id):
        return chain["proof"] if method == "eth_getUserOperationByHash" else ({"receipt": {"transactionHash": chain["receipt"]["transactionHash"]}} if chain["receipt"] else None)
    monkeypatch.setattr(payments, "rpc", fake_rpc)
    monkeypatch.setattr(smoothsend, "account_setup", fake_setup)
    monkeypatch.setattr(smoothsend, "account_nonce", fake_nonce)
    monkeypatch.setattr(smoothsend, "gateway_rpc", fake_gateway)
    assert api.post(path + "/payment").status_code == 404
    monkeypatch.setattr(settings, "dev_github_id", 10)
    monkeypatch.setattr(settings, "dev_github_login", "aastha-malik")
    assert api.post(path + "/payment", json={"amount_wei": "1", "destination": owner.address}).status_code == 422
    from concurrent.futures import ThreadPoolExecutor
    with ThreadPoolExecutor(max_workers=2) as executor:
        prepared = list(executor.map(lambda _: api.post(path + "/payment").json(), range(2)))
    assert prepared[0] == prepared[1]
    payment = prepared[0]
    assert payment["sender"] == owner.address.lower() and payment["recipient"] == contributor.address.lower()
    assert payment["amount_wei"] == str(amount) and payment["chain_id"] == details["chain_id"]
    assert payment["smart_sender"] == smart and payment["provider"] == "smoothsend"
    chain["nonce"] = 6
    assert api.post(path + "/payment").json()["nonce"] == 5
    def operation(nonce):
        return {"sender": smart, "nonce": hex(nonce), "callData": payment["call_data"],
                "maxFeePerGas": "0x10", "maxPriorityFeePerGas": "0x1", "verificationGasLimit": "0x20",
                "callGasLimit": "0x30", "preVerificationGas": "0x40", "paymasterAndData": paymaster + "0" * 64}
    op = operation(5)
    userop_hash = smoothsend.operation_hash(op, details["chain_id"], smoothsend.ENTRY_POINT)
    op["signature"] = "0x" + bytes(owner.sign_message(encode_defunct(hexstr=userop_hash)).signature).hex()
    assert api.post(path + "/payment/operation", json={"userop_hash": userop_hash, "operation": op}).status_code == 200
    assert api.post(path + "/payment").json()["operation"] is not None
    chain["proof"] = {"userOperation": {**op, "callData": "0x"}, "entryPoint": smoothsend.ENTRY_POINT}
    assert api.post(path + "/payment/confirm", json={"userop_hash": userop_hash}).status_code == 409
    chain["proof"]["userOperation"] = op
    assert api.post(path + "/payment/confirm", json={"userop_hash": userop_hash}).json()["status"] == "submitted"
    tx_hash = "0x" + "a" * 64
    def receipt(nonce, success, op_hash):
        event = {"address": smoothsend.ENTRY_POINT, "topics": [smoothsend.USEROP_EVENT, op_hash,
                 "0x" + smart[2:].rjust(64, "0"), "0x" + paymaster[2:].rjust(64, "0")],
                 "data": "0x" + f"{nonce:064x}{int(success):064x}" + "0" * 128}
        logs = transfer_logs(smart, contributor.address.lower(), amount) if fuji and success else []
        return {"transactionHash": tx_hash, "status": "0x1", "to": smoothsend.ENTRY_POINT, "logs": logs + [event]}
    chain["receipt"] = receipt(5, False, userop_hash)
    assert api.post(path + "/payment/confirm", json={"userop_hash": userop_hash}).json()["status"] == "failed"
    assert api.post(path + "/payment").json()["nonce"] == 6
    op = operation(6)
    userop_hash = smoothsend.operation_hash(op, details["chain_id"], smoothsend.ENTRY_POINT)
    chain["proof"]["userOperation"] = op
    chain["receipt"] = receipt(6, True, userop_hash)
    assert api.post(path + "/payment/confirm", json={"userop_hash": userop_hash}).json()["status"] == "paid"
    assert api.post(path + "/payment/confirm", json={"userop_hash": userop_hash}).json()["status"] == "paid"
    assert api.post(path + "/payment").json()["status"] == "paid"
    async def unavailable(*args):
        raise AssertionError("Paid rewards must return without another network request")
    monkeypatch.setattr(payments, "rpc", unavailable)
    monkeypatch.setattr(smoothsend, "gateway_rpc", unavailable)
    assert api.post(path + "/payment/confirm", json={"userop_hash": userop_hash}).json()["status"] == "paid"
    assert len(query("select * from avax_payments")) == 1
    assert len(query("select * from smoothsend_payment_receipts")) == 2


async def _no_credit(*args):
    return 0


def test_transaction_validation_rejects_changed_destination_chain_nonce_and_calldata():
    from fastapi import HTTPException
    from app.routes.payments import verify_transaction
    payment = {"sender": "0xsender", "recipient": "0xrecipient", "nonce": 5}
    tx_hash = "0x" + "a" * 64
    tx = {"hash": tx_hash, "from": "0xsender", "to": "0xrecipient", "value": "0x10", "nonce": "0x5", "chainId": "0xa86a", "input": "0x"}
    verify_transaction(tx, None, payment, 16, tx_hash)
    for key, value in (("to", "0xother"), ("chainId", "0x1"), ("nonce", "0x6"), ("input", "0x1234"), ("from", "0xother")):
        with pytest.raises(HTTPException):
            verify_transaction({**tx, key: value}, None, payment, 16, tx_hash)


def test_live_wallet_actions_refuse_development_identity(monkeypatch):
    from fastapi import HTTPException
    from app.routes.payments import require_enabled
    monkeypatch.setattr(settings, "avax_payments_enabled", True)
    monkeypatch.setattr(settings, "environment", "production")
    monkeypatch.setattr(settings, "dev_login_stub_enabled", True)
    with pytest.raises(HTTPException, match="real GitHub"):
        require_enabled()


def transfer_logs(sender, recipient, amount):
    return [{"address": asset(43113)["token_address"], "topics": [
        "0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef",
        "0x" + sender[2:].rjust(64, "0"), "0x" + recipient[2:].rjust(64, "0")], "data": "0x" + f"{amount:064x}"}]


def test_fuji_transfer_requires_exact_contract_data_and_successful_transfer_event():
    from fastapi import HTTPException
    from app.routes.payments import verify_transaction
    sender, recipient = "0x" + "1" * 40, "0x" + "2" * 40
    payment = {"sender": sender, "recipient": recipient, "nonce": 5, "chain_id": 43113}
    tx_hash = "0x" + "a" * 64
    tx = {"hash": tx_hash, "from": sender, "to": asset(43113)["token_address"], "value": "0x0",
          "nonce": "0x5", "chainId": hex(43113), "input": transfer_data(recipient, 1250000), "blockHash": "block"}
    receipt = {"transactionHash": tx_hash, "blockHash": "block", "blockNumber": "0x1", "status": "0x1",
               "logs": transfer_logs(sender, recipient, 1250000)}
    verify_transaction(tx, receipt, payment, 1250000, tx_hash)
    for patch in ({"to": recipient}, {"input": transfer_data(sender, 1250000)}, {"input": transfer_data(recipient, 1)},
                  {"chainId": hex(43114)}, {"value": "0x1"}):
        with pytest.raises(HTTPException):
            verify_transaction({**tx, **patch}, receipt, payment, 1250000, tx_hash)
    for logs in ([], transfer_logs(sender, sender, 1250000), transfer_logs(sender, recipient, 1),
                 [{**receipt["logs"][0], "address": recipient}]):
        with pytest.raises(HTTPException):
            verify_transaction(tx, {**receipt, "logs": logs}, payment, 1250000, tx_hash)
    assert amount_to_units("0.000001", 6) == 1
    with pytest.raises(ValueError):
        amount_to_units("0.0000001", 6)


@respx.mock
def test_fuji_publication_never_relabels_mainnet_terms(api, monkeypatch):
    respx.get(REPO_URL).mock(return_value=httpx.Response(200, json=repo()))
    respx.get(ISSUES_URL).mock(return_value=httpx.Response(200, json=[issue()]))
    monkeypatch.setattr(settings, "payment_mode", "usdc_fuji")
    row = {"repository": REPO, "number": 12, "points": 40, "category": "backend"}
    assert api.post("/api/maintainer/bounties", json={"issues": [{**row, "reward_avax": "0.1"}]}).status_code == 409
    assert api.post("/api/maintainer/bounties", json={"issues": [{**row, "reward_usdc": "1.0000001"}]}).status_code == 422
    assert api.post("/api/maintainer/bounties", json={"issues": [{**row, "reward_usdc": "1.25"}]}).status_code == 200
    public = api.get("/api/issues").json()["items"][0]
    assert public["reward_usdc"] == "1.25" and public["reward_avax"] is None and public["reward_chain_id"] == 43113
    monkeypatch.setattr(settings, "payment_mode", "avax_mainnet")
    assert api.post("/api/maintainer/bounties", json={"issues": [{**row, "reward_avax": "1.25"}]}).status_code == 409
    assert query("select chain_id from avax_reward_terms")[0]["chain_id"] == 43113


def test_smoothsend_is_required_even_when_payments_flag_is_enabled(monkeypatch):
    from fastapi import HTTPException
    from app.routes.payments import require_enabled, payment_config
    monkeypatch.setattr(settings, "avax_payments_enabled", True)
    monkeypatch.setattr(settings, "smoothsend_public_key", "")
    assert payment_config()["enabled"] is False
    with pytest.raises(HTTPException, match="SmoothSend is required"):
        require_enabled()
    monkeypatch.setattr(settings, "smoothsend_public_key", "sk_nogas_not_for_browser")
    assert payment_config()["smoothsend_public_key"] is None


def test_smoothsend_gateway_uses_backend_key_without_exposing_it(monkeypatch):
    from app import smoothsend
    from app.routes.payments import payment_config

    monkeypatch.setattr(settings, "smoothsend_public_key", "pk_nogas_browser_test")
    monkeypatch.setattr(settings, "smoothsend_secret_key", "sk_nogas_backend_test")
    assert smoothsend.configured()
    assert smoothsend.gateway_key() == "sk_nogas_backend_test"
    assert payment_config()["smoothsend_public_key"] == "pk_nogas_browser_test"
    assert "sk_nogas_backend_test" not in str(payment_config())
    monkeypatch.setattr(settings, "smoothsend_secret_key", "invalid")
    assert not smoothsend.configured()


def test_operation_hash_matches_smoothsend_sdk_238_and_rejects_cross_operation_transfer():
    from fastapi import HTTPException
    from app import smoothsend
    # Independently generated by @smoothsend/sdk/avax 2.3.8 (viem EntryPoint 0.7).
    op = {"sender": "0x" + "1" * 40, "nonce": "0x5", "callData": "0x1234",
          "maxFeePerGas": "0x10", "maxPriorityFeePerGas": "0x1", "verificationGasLimit": "0x20",
          "callGasLimit": "0x30", "preVerificationGas": "0x40", "paymasterAndData": "0x" + "2" * 40 + "0" * 64}
    hash_ = "0x83df2694327a27f6cb904ffad7f8f4164732954f5c75789df33d2385c2604a61"
    assert smoothsend.operation_hash(op, 43113, smoothsend.ENTRY_POINT) == hash_
    payment = {"entry_point": smoothsend.ENTRY_POINT, "smart_sender": op["sender"], "sender": "0x" + "3" * 40,
               "paymaster_address": "0x" + "2" * 40, "account_factory": "0x" + "4" * 40,
               "chain_id": 43113, "nonce": 5, "call_data": "0x1234", "recipient": "0x" + "5" * 40}
    smoothsend.verify_operation({"entryPoint": smoothsend.ENTRY_POINT, "userOperation": op}, payment, hash_)
    wrong_factory = {**op, "factory": "0x" + "6" * 40, "factoryData": "0x1234"}
    with pytest.raises(HTTPException):
        smoothsend.verify_operation({"entryPoint": smoothsend.ENTRY_POINT, "userOperation": wrong_factory}, payment,
                                    smoothsend.operation_hash(wrong_factory, 43113, smoothsend.ENTRY_POINT))
    event = {"address": smoothsend.ENTRY_POINT, "topics": [smoothsend.USEROP_EVENT, hash_,
             "0x" + payment["smart_sender"][2:].rjust(64, "0"),
             "0x" + payment["paymaster_address"][2:].rjust(64, "0")],
             "data": "0x" + f"{5:064x}{1:064x}" + "0" * 128}
    transfer = transfer_logs(payment["smart_sender"], payment["recipient"], 1250000)
    receipt = {"status": "0x1", "to": smoothsend.ENTRY_POINT, "logs": transfer + [event]}
    assert smoothsend.verify_receipt(receipt, payment, 1250000, hash_) == "paid"
    other_event = {**event, "topics": [smoothsend.USEROP_EVENT, "0x" + "a" * 64, *event["topics"][2:]]}
    with pytest.raises(HTTPException):
        smoothsend.verify_receipt({**receipt, "logs": transfer + [other_event, event]}, payment, 1250000, hash_)


@pytest.mark.parametrize("fuji", [False, True])
def test_wallet_balance_is_identity_scoped_exact_and_independent_of_payout_setup(api, monkeypatch, fuji):
    from app.routes import payments
    monkeypatch.setattr(settings, "payment_mode", "usdc_fuji" if fuji else "avax_mainnet")
    monkeypatch.setattr(settings, "avax_payments_enabled", False)
    monkeypatch.setattr(settings, "smoothsend_public_key", "")
    assert api.get("/api/avax/wallet/balance").json()["address"] is None
    address = "0x" + "1" * 40
    query("insert into users (github_id, github_login) values ($1, $2)", settings.dev_github_id, settings.dev_github_login)
    query("insert into wallets (github_id, address) values ($1, $2)", settings.dev_github_id, address)
    calls = []
    async def rpc(method, params):
        calls.append((method, params))
        if method == "eth_chainId":
            return hex(43113 if fuji else 43114)
        if method == "eth_getBalance":
            assert params == [address, "latest"]
            return hex(123456789123456789)
        assert method == "eth_call"
        assert params[0]["to"] == asset(43113)["token_address"]
        assert params[0]["data"].endswith(address[2:])
        return hex(1250001)
    monkeypatch.setattr(payments, "rpc", rpc)
    body = api.get("/api/avax/wallet/balance?address=0xother").json()
    assert body["address"] == address
    assert body["native_balance_avax"] == "0.123456789123456789"
    assert body["balance"] == ("1.250001" if fuji else "0.123456789123456789")
    assert body["checked_at"]
    assert len(calls) == (3 if fuji else 2)
    monkeypatch.setattr(settings, "dev_github_id", settings.dev_github_id + 1)
    assert api.get("/api/avax/wallet/balance").json()["balance"] is None
