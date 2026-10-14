import axios from "axios";
import { beforeEach, afterEach, expect, it, vi } from "vitest";
import { inspectRewardFunding, quoteReward, sendReward, type SmoothPayment } from "../app/lib/wallet";
import { selectWallet } from "../app/lib/walletProviders";

// Use the real installed SmoothSend SDK; substitute only wallet, chain RPC and HTTP transport.
const chain = vi.hoisted(() => ({
  getChainId: vi.fn(async () => 43113), readContract: vi.fn(async () => BigInt(2_000_000)),
  getBalance: vi.fn(async () => BigInt(0)), getBytecode: vi.fn(async () => "0x"),
  estimateFeesPerGas: vi.fn(async () => ({ maxFeePerGas: BigInt(50), maxPriorityFeePerGas: BigInt(2) })),
  signMessage: vi.fn(async () => "0x" + "1".repeat(130)),
}));
vi.mock("viem", async importOriginal => ({ ...await importOriginal<typeof import("viem")>(),
  createPublicClient: () => chain,
  createWalletClient: () => ({ requestAddresses: async () => ["0x1111111111111111111111111111111111111111"], switchChain: async () => {}, signMessage: chain.signMessage }),
}));

const payment: SmoothPayment = {
  claim_id: 1, sender: "0x1111111111111111111111111111111111111111", recipient: "0x2222222222222222222222222222222222222222",
  smart_sender: "0x3333333333333333333333333333333333333333", chain_id: 43113, nonce: 0,
  entry_point: "0x0000000071727de22e5e9d8baf0edac6f37da032", account_factory: "0x55326f005a0959F75496cdd692505fFB520972f5",
  paymaster_address: "0x3207f577792F9d549acB2A6C97c0f74EAeB166d8",
  token_address: "0x5425890298aed601595a70AB815c96711a31Bc65", fee_token: "0x5425890298aed601595a70AB815c96711a31Bc65",
  decimals: 6, symbol: "USDC", amount_wei: "1250000", fee_limit: "100000", fee_limit_usdc: "0.1",
  call_data: "0x1234", smoothsend_public_key: "pk_nogas_fixture", operation: null, status: "awaiting_signature", tx_hash: null, userop_hash: null,
};
let events: string[];
let predictedFee: string;
let rejectSave: boolean;
let gatewayChain: string;
const operationHash = "0x" + "a".repeat(64);

beforeEach(() => {
  events = []; predictedFee = "2000"; rejectSave = false; gatewayChain = "0xa869";
  chain.readContract.mockResolvedValue(BigInt(2_000_000)); chain.signMessage.mockClear();
  selectWallet({ request: async () => [] });
  const create = axios.create.bind(axios);
  vi.spyOn(axios, "create").mockImplementation(config => create({ ...config, adapter: async request => {
    const body = JSON.parse(request.data);
    const name = body.method ?? "paymaster/sign";
    events.push(name);
    expect(request.headers["X-Network"]).toBe("testnet");
    expect(request.headers["X-Chain"]).toBe("avalanche");
    let result: unknown;
    if (name === "eth_chainId") result = gatewayChain;
    else if (name === "eth_supportedEntryPoints") result = [payment.entry_point];
    else if (name === "eth_estimateUserOperationGas") {
      expect(request.headers["X-Sponsorship-Mode"]).toBe("user-pays-erc20");
      result = { callGasLimit: "0x186a0", verificationGasLimit: "0x186a0", preVerificationGas: "0xc350" };
    } else if (name === "eth_sendUserOperation") {
      expect(request.headers["X-Sponsorship-Mode"]).toBe("user-pays-erc20");
      expect(body.params[0].sender).toBe(payment.smart_sender);
      expect(body.params[0].callData).toBe(payment.call_data);
      expect(body.params[0].signature).toBe("0x" + "1".repeat(130));
      result = operationHash;
    } else if (name === "paymaster/sign") {
      expect(body.mode).toBe("user-pays-erc20"); expect(body.token).toBe(payment.fee_token);
      return { config: request, status: 200, statusText: "OK", headers: {}, data: { success: true,
        paymasterAndData: payment.paymaster_address + "0".repeat(64), feePreview: { predictedTokenFee: predictedFee } } };
    } else throw new Error(`Unexpected SDK request: ${name}`);
    return { config: request, status: 200, statusText: "OK", headers: {}, data: { jsonrpc: "2.0", id: body.id, result } };
  } }));
  vi.stubGlobal("fetch", vi.fn(async (url: string, options?: RequestInit) => {
    if (String(url).endsWith("/api/csrf")) return new Response(JSON.stringify({ csrf_token: "fixture" }));
    expect(String(url)).toContain("/payment/operation");
    const body = JSON.parse(String(options?.body));
    expect(body.userop_hash).toMatch(/^0x[0-9a-f]{64}$/);
    expect(body.operation.callData).toBe(payment.call_data);
    events.push("save-signed-operation");
    return new Response(JSON.stringify(rejectSave ? { detail: "Persistence unavailable" } : {}), { status: rejectSave ? 503 : 200 });
  }));
});
afterEach(() => { vi.restoreAllMocks(); selectWallet(undefined); });

it("runs actual SDK estimation, paymaster sponsorship and broadcast after saving the signature", async () => {
  expect(await sendReward(payment)).toBe(operationHash);
  expect(events).toContain("paymaster/sign");
  expect(events.indexOf("save-signed-operation")).toBeLessThan(events.indexOf("eth_sendUserOperation"));
  expect(chain.signMessage).toHaveBeenCalledTimes(1);
});

it("does not broadcast if the signed operation cannot be persisted", async () => {
  rejectSave = true;
  await expect(sendReward(payment)).rejects.toThrow();
  expect(events).toContain("save-signed-operation");
  expect(events).not.toContain("eth_sendUserOperation");
});

it("rejects a quote above the owner fee cap without signing", async () => {
  predictedFee = "100001";
  await expect(quoteReward(payment)).rejects.toThrow(/exceeds/);
  expect(chain.signMessage).not.toHaveBeenCalled();
  expect(events).not.toContain("eth_sendUserOperation");
});

it("requires the reward plus fee reserve in the smart account, not the owner wallet", async () => {
  chain.readContract.mockResolvedValue(BigInt(1_250_000));
  expect(await inspectRewardFunding(payment)).toMatchObject({ sufficient: false, rewardRequired: "1.35", rewardBalance: "1.25" });
  expect(chain.readContract).toHaveBeenCalledWith(expect.objectContaining({ args: [payment.smart_sender] }));
  await expect(sendReward(payment)).rejects.toThrow(/payout account needs/);
  expect(chain.signMessage).not.toHaveBeenCalled();
});

it("blocks a mismatched SmoothSend network without a signature", async () => {
  gatewayChain = "0xa86a";
  await expect(inspectRewardFunding(payment)).rejects.toThrow(/different Avalanche network/);
  expect(chain.signMessage).not.toHaveBeenCalled();
});

it("recovery sends the same saved operation without another quote or signature", async () => {
  const operation = { sender: payment.smart_sender, nonce: "0x0", callData: payment.call_data, signature: "0x" + "1".repeat(130) };
  expect(await sendReward({ ...payment, operation })).toBe(operationHash);
  expect(events).toEqual(["eth_chainId", "eth_sendUserOperation"]);
  expect(chain.signMessage).not.toHaveBeenCalled();
});
