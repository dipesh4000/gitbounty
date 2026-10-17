import hardhatToolboxViem from "@nomicfoundation/hardhat-toolbox-viem";
import { configVariable, defineConfig } from "hardhat/config";
import { existsSync } from "node:fs";
import { loadEnvFile } from "node:process";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const envFile = resolve(dirname(fileURLToPath(import.meta.url)), process.env.GITBOUNTY_ENV_FILE || "../.env");
if (process.env.GITBOUNTY_ENV_FILE !== "" && existsSync(envFile)) loadEnvFile(envFile);

export default defineConfig({
  plugins: [hardhatToolboxViem],
  solidity: {
    profiles: {
      default: {
        version: "0.8.30",
        settings: {
          evmVersion: "cancun",
          optimizer: { enabled: true, runs: 200 },
        },
      },
      production: {
        version: "0.8.30",
        settings: {
          evmVersion: "cancun",
          optimizer: { enabled: true, runs: 200 },
        },
      },
    },
  },
  networks: {
    hardhatFuji: {
      type: "edr-simulated",
      chainType: "l1",
      chainId: 43113,
      hardfork: "cancun",
    },
    fuji: {
      type: "http",
      chainType: "l1",
      chainId: 43113,
      url: process.env.ESCROW_RPC_URL || process.env.FUJI_RPC_URL || "https://api.avax-test.network/ext/bc/C/rpc",
      accounts: [configVariable("FUJI_DEPLOYER_PRIVATE_KEY")],
    },
  },
});
