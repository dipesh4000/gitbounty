import { defineConfig } from "@playwright/test";

const channel = process.env.E2E_BROWSER_CHANNEL;
if (channel && channel !== "chrome" && channel !== "msedge") {
  throw new Error("E2E_BROWSER_CHANNEL must be chrome or msedge, or unset for bundled Chromium");
}

/*
  The end-to-end test runs against the **real** stack: the real FastAPI backend, a real Postgres, and the
  real production build of the website. Only github.com is substituted, by a local HTTP server
  (fake-github/server.py) the backend talks to over a socket -- so the httpx client, the headers, the
  pagination loop and the status handling are all the real code paths.

  Everything is started by `global-setup.ts` rather than Playwright's `webServer`, because the three
  processes have to come up in order and the database has to be migrated between two of them.
*/
export default defineConfig({
  testDir: "./tests",
  globalSetup: "./global-setup.ts",
  globalTeardown: "./global-teardown.ts",
  // One worker: the test drives a single shared database and moves one pull request through its states.
  workers: 1,
  fullyParallel: false,
  timeout: 90_000,
  expect: { timeout: 15_000 },
  reporter: process.env.CI ? [["list"], ["github"]] : [["list"]],
  use: {
    baseURL: process.env.E2E_WEB_URL ?? "http://127.0.0.1:3100",
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
  },
  projects: [{ name: channel ?? "chromium", use: { browserName: "chromium", ...(channel ? { channel } : {}) } }],
});
