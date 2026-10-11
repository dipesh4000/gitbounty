import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";

/*
  Component tests run under jsdom with their own config, separate from vite.config.ts: that one builds
  the app for the Cloudflare Workers runtime, which a test does not want and cannot use.
*/
export default defineConfig({
  plugins: [react()],
  resolve: {
    // The application gets these aliases from vinext's Vite plugin.
    alias: {
      "next/image": "vinext/shims/image",
      "next/link": "vinext/shims/link",
    },
  },
  test: {
    environment: "jsdom",
    globals: true,
    setupFiles: ["./tests/setup.ts"],
    include: ["tests/**/*.test.tsx", "tests/**/*.test.ts"],
    css: false,
    restoreMocks: true,
  },
});
