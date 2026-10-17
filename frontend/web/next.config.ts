import type { NextConfig } from "next";
import { existsSync } from "node:fs";
import { resolve } from "node:path";
import { loadEnvFile } from "node:process";

// Next only exposes NEXT_PUBLIC_* variables to the browser. Never add server secrets to `env` below.
const envFile = process.env.GITBOUNTY_ENV_FILE === "" ? undefined
  : resolve(__dirname, process.env.GITBOUNTY_ENV_FILE || "../../.env");
if (envFile && existsSync(envFile)) loadEnvFile(envFile);

const nextConfig: NextConfig = {
  // Vercel's multi-service deployment serves public files, but /_next/image returns 404.
  // Use those static files directly for the site's small, already compressed images.
  images: { unoptimized: true },
  /* There is an unrelated package-lock.json in a parent directory outside this repository, and without this
     Turbopack picks that up as the workspace root. Pin the root to this app. */
  turbopack: {
    root: __dirname,
  },

  /* `next dev` only serves its development assets to origins it recognises, and the default is localhost.
     Opening the site on 127.0.0.1 (or over the network) without this leaves the page rendered but never
     hydrated: it looks right and nothing works. Development only; it has no effect on a production build. */
  allowedDevOrigins: ["127.0.0.1", "localhost"],

  /* Hide Next's floating development badge. It only ever appears in `next dev`, never in a build, but it sits
     on top of the page and is the one thing that makes the development view differ from the deployed design. */
  devIndicators: false,
};

export default nextConfig;
