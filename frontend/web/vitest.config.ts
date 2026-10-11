import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";

/* Component tests use Vite only as Vitest's transform layer; Next.js builds and serves the app. */
export default defineConfig({
  plugins: [react()],
  test: {
    environment: "jsdom",
    globals: true,
    setupFiles: ["./tests/setup.ts"],
    include: ["tests/**/*.test.tsx", "tests/**/*.test.ts"],
    css: false,
    restoreMocks: true,
  },
});
