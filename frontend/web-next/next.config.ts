import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  /* There is an unrelated package-lock.json in a parent directory outside this repository, and without this
     Turbopack picks that up as the workspace root. Pin the root to this app. */
  turbopack: {
    root: __dirname,
  },

  /* `next dev` only serves its development assets to origins it recognises, and the default is localhost.
     Opening the site on 127.0.0.1 (or over the network) without this leaves the page rendered but never
     hydrated: it looks right and nothing works. Development only; it has no effect on a production build. */
  allowedDevOrigins: ["127.0.0.1", "localhost"],
};

export default nextConfig;
