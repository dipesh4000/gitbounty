// Read-only SDK preflight. No signer, private key, paymaster signing or transaction broadcast.
import { SmoothSendAvaxSubmitter } from "@smoothsend/sdk/avax";

const apiKey = process.env.SMOOTHSEND_PUBLIC_KEY;
const origin = process.env.FRONTEND_URL;
const network = process.env.PAYMENT_MODE === "usdc_fuji" ? "testnet" : "mainnet";
if (!apiKey?.startsWith("pk_nogas_") || !origin) {
  console.error("Set SMOOTHSEND_PUBLIC_KEY and FRONTEND_URL in the backend environment. No requests sent.");
  process.exitCode = 1;
} else {
  try {
    const sdk = new SmoothSendAvaxSubmitter({ apiKey, network, corsOrigin: origin, timeout: 15_000 });
    const chainId = Number(await sdk.getChainId());
    const entryPoints = await sdk.getSupportedEntryPoints();
    const expected = network === "testnet" ? 43113 : 43114;
    if (chainId !== expected || !entryPoints.some(address => address.toLowerCase() === "0x0000000071727de22e5e9d8baf0edac6f37da032")) {
      console.error("FAIL: gateway network or supported EntryPoint does not match GitBounty.");
      process.exitCode = 1;
    } else {
      console.log(`PASS: actual SmoothSend SDK gateway calls · ${network} · chain ${chainId} · EntryPoint v0.7 supported.`);
      console.log("This proves read-only gateway connectivity, NOT a payout. No signature or transfer was requested.");
    }
  } catch {
    // SDK/HTTP errors may contain request credentials; never print raw errors or request config.
    console.error("FAIL: SDK gateway preflight. Check key, allowed origin, network and connectivity. No payment sent.");
    process.exitCode = 1;
  }
}
