import { loadEnvFile } from 'node:process';
import { existsSync, mkdirSync, readFileSync, writeFileSync, cpSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createPublicClient, createWalletClient, encodeDeployData, getAddress, http, parseAbi, formatEther, getContractAddress } from 'viem';
import { privateKeyToAccount } from 'viem/accounts';
import { avalancheFuji } from 'viem/chains';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const officialToken = '0x5425890298aed601595a70ab815c96711a31bc65';
const tokenAbi = parseAbi(['function decimals() view returns (uint8)']);
const escrowAbi = parseAbi([
  'function token() view returns (address)',
  'function authorizationSigner() view returns (address)',
]);

export function configuration(env) {
  if (Number(env.ESCROW_CHAIN_ID || 43113) !== 43113) throw new Error('ESCROW_CHAIN_ID must be 43113 (Fuji).');
  const token = getAddress(env.ESCROW_TOKEN_ADDRESS || officialToken);
  if (token.toLowerCase() !== officialToken) throw new Error('Use the official Fuji test USDC address.');
  let signer = env.ESCROW_AUTHORIZATION_SIGNER ? getAddress(env.ESCROW_AUTHORIZATION_SIGNER) : undefined;
  if (env.ESCROW_SIGNER_PRIVATE_KEY) {
    let derived;
    try { derived = privateKeyToAccount(env.ESCROW_SIGNER_PRIVATE_KEY).address; }
    catch { throw new Error('ESCROW_SIGNER_PRIVATE_KEY is invalid.'); }
    if (signer && signer !== derived) throw new Error('ESCROW_AUTHORIZATION_SIGNER does not match the signing key.');
    signer = derived;
  }
  if (!signer || /^0x0{40}$/i.test(signer)) throw new Error('Set ESCROW_SIGNER_PRIVATE_KEY or ESCROW_AUTHORIZATION_SIGNER.');
  let deployer;
  if (env.FUJI_DEPLOYER_PRIVATE_KEY) {
    try { deployer = privateKeyToAccount(env.FUJI_DEPLOYER_PRIVATE_KEY); }
    catch { throw new Error('FUJI_DEPLOYER_PRIVATE_KEY is invalid.'); }
    if (deployer.address === signer) throw new Error('Use separate deployer and authorization signer wallets.');
  }
  return { token, signer, deployer, rpc: env.ESCROW_RPC_URL || env.FUJI_RPC_URL || avalancheFuji.rpcUrls.default.http[0] };
}

async function main() {
  const mode = process.argv[2];
  if (!['check', 'deploy'].includes(mode)) throw new Error('Use npm run check or npm run deploy.');
  const envFile = resolve(root, process.env.GITBOUNTY_ENV_FILE || '../.env');
  if (process.env.GITBOUNTY_ENV_FILE !== '') {
    if (!existsSync(envFile)) throw new Error('Project-root .env is missing. Copy .env.example to .env and configure the signer.');
    loadEnvFile(envFile);
  }
  const config = configuration(process.env);
  const client = createPublicClient({ chain: avalancheFuji, transport: http(config.rpc, { retryCount: 2, timeout: 15000 }) });
  if (await client.getChainId() !== 43113) throw new Error('RPC returned a different chain; expected Fuji 43113.');
  const code = await client.getCode({ address: config.token });
  if (!code || code === '0x') throw new Error('USDC bytecode is missing.');
  if (await client.readContract({ address: config.token, abi: tokenAbi, functionName: 'decimals' }) !== 6) throw new Error('USDC decimals must be 6.');
  console.log('Fuji RPC and official test USDC: checked');
  console.log(`ESCROW_AUTHORIZATION_SIGNER=${config.signer}`);
  if (config.deployer) {
    console.log(`Deployer: ${config.deployer.address}`);
    console.log(`Test AVAX: ${formatEther(await client.getBalance({ address: config.deployer.address }))}`);
  } else {
    console.log('Deployment requires FUJI_DEPLOYER_PRIVATE_KEY in the project-root .env.');
  }
  if (process.env.ESCROW_CONTRACT_ADDRESS) {
    const address = getAddress(process.env.ESCROW_CONTRACT_ADDRESS);
    await verify(client, address, config);
    console.log(`Existing escrow token and signer: checked (${address})`);
    if (mode === 'deploy') throw new Error('ESCROW_CONTRACT_ADDRESS is already set. Refusing another deployment.');
  }
  if (mode === 'check') return;
  if (!config.deployer) throw new Error('Set FUJI_DEPLOYER_PRIVATE_KEY before deploying.');

  const evidence = resolve(root, 'deployments/fuji');
  const intentPath = resolve(evidence, 'deployment.json');
  if (existsSync(intentPath)) {
    const previous = JSON.parse(readFileSync(intentPath, 'utf8'));
    if (!previous.transactionHash) throw new Error('A deployment intent exists without a hash. Inspect that wallet nonce on Fuji before retrying.');
    await finish(client, evidence, previous, config);
    return;
  }
  const artifactPath = resolve(root, 'artifacts/contracts/GitBountyEscrow.sol/GitBountyEscrow.json');
  const artifact = JSON.parse(readFileSync(artifactPath, 'utf8'));
  const gas = await client.estimateGas({ account: config.deployer.address, data: encodeDeployData({ abi: artifact.abi, bytecode: artifact.bytecode, args: [config.token, config.signer] }) });
  if (await client.getBalance({ address: config.deployer.address }) < gas * await client.getGasPrice() * 2n) {
    throw new Error('Deployer needs more Fuji test AVAX for deployment gas.');
  }
  const nonce = await client.getTransactionCount({ address: config.deployer.address, blockTag: 'pending' });
  const address = getContractAddress({ from: config.deployer.address, nonce: BigInt(nonce) });
  const intent = { chainId: 43113, address, deployer: config.deployer.address, nonce, constructorArguments: [config.token, config.signer] };
  mkdirSync(evidence, { recursive: true });
  // Persist the nonce before broadcasting; an uncertain send must not silently deploy twice.
  writeFileSync(intentPath, JSON.stringify(intent, null, 2), { flag: 'wx' });
  cpSync(resolve(root, 'artifacts'), resolve(evidence, 'artifacts'), { recursive: true });
  const wallet = createWalletClient({ account: config.deployer, chain: avalancheFuji, transport: http(config.rpc) });
  console.log(`Deploying GitBountyEscrow on Fuji with token ${config.token} and signer ${config.signer}`);
  intent.transactionHash = await wallet.deployContract({ abi: artifact.abi, bytecode: artifact.bytecode, args: intent.constructorArguments, nonce });
  writeFileSync(intentPath, JSON.stringify(intent, null, 2));
  console.log(`Transaction: ${intent.transactionHash}`);
  await finish(client, evidence, intent, config);
}

async function verify(client, address, config) {
  const code = await client.getCode({ address });
  if (!code || code === '0x') throw new Error('Escrow bytecode is missing.');
  for (const [functionName, expected] of [['token', config.token], ['authorizationSigner', config.signer]]) {
    const actual = await client.readContract({ address, abi: escrowAbi, functionName });
    if (getAddress(actual) !== expected) throw new Error(`Deployed ${functionName} does not match configuration.`);
  }
}

async function finish(client, evidence, intent, config) {
  const receipt = await client.waitForTransactionReceipt({ hash: intent.transactionHash, confirmations: 2, timeout: 120000 });
  if (receipt.status !== 'success' || getAddress(receipt.contractAddress) !== getAddress(intent.address)) throw new Error('Deployment receipt failed or address mismatched.');
  await verify(client, intent.address, config);
  const block = await client.getBlock({ blockNumber: receipt.blockNumber });
  if (block.hash !== receipt.blockHash) throw new Error('Receipt block is no longer canonical. Retry verification.');
  writeFileSync(resolve(evidence, 'receipt.json'), JSON.stringify(receipt, (_, value) => typeof value === 'bigint' ? value.toString() : value, 2));
  const output = `ESCROW_CONTRACT_ADDRESS=${intent.address}\nESCROW_AUTHORIZATION_SIGNER=${config.signer}\nESCROW_DEPLOYMENT_BLOCK=${receipt.blockNumber}\n`;
  writeFileSync(resolve(evidence, 'backend.env'), output);
  console.log(output);
  console.log('Evidence saved in contracts/deployments/fuji. Copy backend.env values into the project-root .env; keep ESCROW_ENABLED=false until integration is ready.');
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch(error => {
    // Provider errors can embed authenticated RPC URLs or raw request details.
    console.error(error?.constructor === Error ? error.message : 'Fuji operation failed. Check connectivity/configuration. If deployment started, rerun deploy to recover the saved transaction.');
    process.exitCode = 1;
  });
}
