import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  /* There is an unrelated package-lock.json in a parent directory outside this repository, and without this
     Turbopack picks that up as the workspace root. Pin the root to this app. */
  turbopack: {
    root: __dirname,
  },
};

export default nextConfig;
