import { createWalletClient, createPublicClient, custom, http, erc20Abi, formatUnits, type Address, type Hex } from "viem";
import { avalanche, avalancheFuji } from "viem/chains";
import { apiWrite } from "./api";
import { walletProvider, walletError } from "./walletProviders";

export type SmoothPayment = { claim_id: number; sender: string; recipient: string; nonce: number; amount_wei: string;
  chain_id: number; smart_sender: Address; entry_point: Address; account_factory: Address; paymaster_address: Address;
  call_data: Hex; fee_token: Address; fee_limit: string; fee_limit_usdc: string; smoothsend_public_key: string;
  token_address: Address | null; decimals: number; symbol: string;
  operation: string | Record<string, unknown> | null; status: string; tx_hash: string | null; userop_hash: string | null };

export type PaymentFunding = { rewardBalance: string; feeBalance: string; rewardRequired: string; feeRequired: string; sufficient: boolean; checkedAt: string };

/** Read-only preflight: verifies SDK routing and the smart account, never asks for a signature. */
export async function inspectRewardFunding(payment: SmoothPayment): Promise<PaymentFunding> {
  const chain = payment.chain_id === avalancheFuji.id ? avalancheFuji : payment.chain_id === avalanche.id ? avalanche : null;
  if (!chain) throw new Error("Only Avalanche mainnet and Fuji are supported.");
  if (!payment.smoothsend_public_key?.startsWith("pk_nogas_")) throw new Error("SmoothSend public key is not configured.");
  const { SmoothSendAvaxSubmitter } = await import("@smoothsend/sdk/avax");
  const submitter = new SmoothSendAvaxSubmitter({ apiKey: payment.smoothsend_public_key, network: chain.id === avalancheFuji.id ? "testnet" : "mainnet" });
  if (Number(await submitter.getChainId()) !== chain.id) throw new Error("SmoothSend is on a different Avalanche network.");
  if (!(await submitter.getSupportedEntryPoints()).some(address => address.toLowerCase() === payment.entry_point.toLowerCase())) throw new Error("SmoothSend does not support this payment's EntryPoint.");
  const client = createPublicClient({ chain, transport: http() });
  if (await client.getChainId() !== chain.id) throw new Error("The Avalanche RPC is on a different network.");
  const balanceOf = (address: Address) => client.readContract({ address, abi: erc20Abi, functionName: "balanceOf", args: [payment.smart_sender] });
  const [reward, fee] = await Promise.all([payment.token_address ? balanceOf(payment.token_address) : client.getBalance({ address: payment.smart_sender }), balanceOf(payment.fee_token)]);
  const sameToken = payment.token_address?.toLowerCase() === payment.fee_token.toLowerCase();
  const amount = BigInt(payment.amount_wei), allowance = BigInt(payment.fee_limit);
  return { rewardBalance: formatUnits(reward, payment.decimals), feeBalance: formatUnits(fee, 6),
    rewardRequired: formatUnits(sameToken ? amount + allowance : amount, payment.decimals), feeRequired: formatUnits(allowance, 6),
    sufficient: reward >= amount + (sameToken ? allowance : BigInt(0)) && fee >= allowance, checkedAt: new Date().toISOString() };
}

export async function browserWallet(chainId: number = avalanche.id) {
  const provider = walletProvider();
  if (!provider) throw new Error("Install an Avalanche-compatible browser wallet to continue.");
  const chain = chainId === avalancheFuji.id ? avalancheFuji : chainId === avalanche.id ? avalanche : null;
  if (!chain) throw new Error("Only Avalanche mainnet and Fuji are supported.");
  const client = createWalletClient({ chain, transport: custom(provider) });
  let account: Address | undefined;
  try { [account] = await client.requestAddresses(); }
  catch (error) { throw new Error(walletError(error)); }
  if (!account) throw new Error("No wallet account was selected.");
  return { client, account, chain };
}

export async function connectRewardWallet() {
  const { client, account } = await browserWallet();
  const { message } = await apiWrite<{ message: string }>("/api/avax/wallet/challenge");
  const signature = await client.signMessage({ account, message });
  return apiWrite<{ address: string }>("/api/avax/wallet", { body: { signature } });
}

async function paymentClient(payment: SmoothPayment) {
  if (!payment.smoothsend_public_key?.startsWith("pk_nogas_")) throw new Error("SmoothSend is required and must be configured first.");
  const { client, account, chain } = await browserWallet(payment.chain_id);
  if (account.toLowerCase() !== payment.sender) throw new Error("Select your linked payer wallet.");
  try { await client.switchChain({ id: chain.id }); }
  catch (error) {
    if ((error as { code?: number }).code !== 4902) throw error;
    await client.addChain({ chain }); await client.switchChain({ id: chain.id });
  }
  const sdk = await import("@smoothsend/sdk/avax");
  const submitter = new sdk.SmoothSendAvaxSubmitter({ apiKey: payment.smoothsend_public_key,
    network: chain.id === avalancheFuji.id ? "testnet" : "mainnet", chain: "avalanche" });
  if (Number(await submitter.getChainId()) !== chain.id) throw new Error("SmoothSend is on a different Avalanche network.");
  const publicClient = createPublicClient({ chain, transport: http() });
  return { sdk, submitter, publicClient, client, account, chain };
}

async function draftPayment(payment: SmoothPayment, context: Awaited<ReturnType<typeof paymentClient>>) {
  const { publicClient, sdk, account } = context;
  const fees = await publicClient.estimateFeesPerGas();
  const code = await publicClient.getBytecode({ address: payment.smart_sender });
  return { sender: payment.smart_sender, nonce: `0x${BigInt(payment.nonce).toString(16)}`, callData: payment.call_data,
    maxFeePerGas: `0x${(fees.maxFeePerGas ?? BigInt(50_000_000_000)).toString(16)}`,
    maxPriorityFeePerGas: `0x${(fees.maxPriorityFeePerGas ?? BigInt(2_000_000_000)).toString(16)}`,
    ...(!code || code === "0x" ? { factory: payment.account_factory, factoryData: sdk.encodeCreateAccountFactoryData(account, BigInt(0)) } : {}) };
}

export async function quoteReward(payment: SmoothPayment) {
  const context = await paymentClient(payment);
  const quote = await context.submitter.estimateUserPaysFee({ userOp: await draftPayment(payment, context),
    entryPoint: payment.entry_point, paymaster: { token: payment.fee_token } });
  if (!quote.feePreview) throw new Error("SmoothSend did not return a fee quote. No operation was signed.");
  const fee = BigInt(quote.feePreview.predictedTokenFee);
  if (fee > BigInt(payment.fee_limit)) throw new Error(`SmoothSend's estimated fee exceeds the ${payment.fee_limit_usdc} USDC limit. No operation was signed.`);
  return (Number(fee) / 1_000_000).toFixed(6);
}

export async function sendReward(payment: SmoothPayment) {
  const context = await paymentClient(payment);
  const { sdk, submitter, client, account, chain } = context;
  // Recover exactly the already signed operation after a timeout or page reload.
  if (payment.operation) {
    const operation = typeof payment.operation === "string" ? JSON.parse(payment.operation) : payment.operation;
    return submitter.sendUserOperation(operation, payment.entry_point, "user-pays-erc20");
  }
  if (!(await inspectRewardFunding(payment)).sufficient) throw new Error("Your payout account needs the reward plus the USDC fee reserve. Add funds and check again before signing.");
  await quoteReward(payment);
  const result = await submitter.submitSponsoredUserOperation({
    userOp: await draftPayment(payment, context), entryPoint: payment.entry_point,
    mode: "user-pays-erc20", paymaster: { token: payment.fee_token }, waitForReceipt: false,
    signUserOp: async operation => {
      const hash = sdk.hashUserOperationAvax({ chainId: chain.id, entryPointAddress: payment.entry_point, userOperation: operation });
      const signature = await client.signMessage({ account, message: { raw: hash as Hex } });
      // Save before broadcast so a timeout cannot lose the signed payment or its reserved nonce.
      await apiWrite(`/api/avax/rewards/${payment.claim_id}/payment/operation`, { body: { userop_hash: hash, operation: { ...operation, signature } } });
      return signature;
    },
  });
  return result.userOpHash;
}
