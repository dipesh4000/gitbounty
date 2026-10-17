# GitBounty escrow

Hardhat 3 workspace for the Phase 1 Fuji escrow. It is pinned to Solidity 0.8.30, OpenZeppelin Contracts 5.6.1, and the Cancun EVM target required by Avalanche C-Chain.

```powershell
npm install
npm test
npm run build
```

The tests cover exact funding, payer-bound bounty IDs, EIP-712 settlement, replay and invalid authorization, claim/refund boundaries, failed token transfers, direct donations, and cross-bounty liability conservation. `test/settlement-vector.json` is shared with the backend `eth-account` check.

## Fuji commands

Run from this `contracts` folder. Both commands automatically load `../.env`; existing process environment variables take precedence.

```powershell
npm run check
npm run deploy
```

`check` reads Fuji chain ID, official USDC bytecode/decimals, and optional deployer AVAX balance. It derives and prints the public authorization signer from `ESCROW_SIGNER_PRIVATE_KEY`, checks any supplied `ESCROW_AUTHORIZATION_SIGNER` matches, and checks token/signer views when `ESCROW_CONTRACT_ADDRESS` is set. It sends no transactions.

`deploy` builds with the production Cancun profile, performs those checks, then deploys using `FUJI_DEPLOYER_PRIVATE_KEY`. Supply a separate deployer wallet with Fuji test AVAX. The constructor uses official Fuji test USDC and the authorization signer. An existing configured contract blocks new deployment.

Required values in `project-root .env`:

```dotenv
ESCROW_SIGNER_PRIVATE_KEY=YOUR_EXISTING_SIGNER_KEY
FUJI_DEPLOYER_PRIVATE_KEY=YOUR_SEPARATE_DEPLOYER_KEY
ESCROW_RPC_URL=https://api.avax-test.network/ext/bc/C/rpc
ESCROW_CHAIN_ID=43113
```

After two confirmations, deployment prints `ESCROW_CONTRACT_ADDRESS`, `ESCROW_AUTHORIZATION_SIGNER`, and `ESCROW_DEPLOYMENT_BLOCK`. Copy them into `project-root .env`. Keep `ESCROW_ENABLED=false` until application integration is ready.

`deployments/fuji/` retains the transaction hash, receipt, constructor arguments, artifacts/build metadata and a public-only `backend.env` snippet. If receipt verification times out, rerun `npm run deploy` to recover the saved transaction. An intent without a hash requires inspecting the recorded deployer/nonce before another send; do not blindly delete it. Never delete successful deployment evidence to redeploy accidentally.

Run `npm run test:scripts` for the configuration guard tests. The sources remain UNLICENSED until the owner selects a license; third-party dependency notices still apply. Never print or share private keys.
