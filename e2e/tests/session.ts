import type { BrowserContext, APIRequestContext } from "@playwright/test";

import { API_URL, TEST_AUTH_SECRET } from "../config";

/**
 * Sign a browser context in, through the backend's test-only path.
 *
 * This is the one thing the end-to-end test cannot do for real: completing a GitHub authorization needs a
 * human at github.com. Everything after it -- the session cookie, CSRF, authorization, the ledger -- is
 * the ordinary code path, because the test sign-in issues exactly the session OAuth issues.
 *
 * The path only exists because the harness starts the backend with GITBOUNTY_ENVIRONMENT=test and a
 * secret; without both it is not routed at all and this would 404.
 */
export async function signIn(
  context: BrowserContext,
  user: { github_id: number; github_login: string },
  { githubToken = "e2e-github-token" }: { githubToken?: string | null } = {},
) {
  const response = await context.request.post(`${API_URL}/test-auth/session`, {
    headers: { "X-GitBounty-Test-Auth": TEST_AUTH_SECRET, "Content-Type": "application/json" },
    data: { ...user, github_token: githubToken },
  });
  if (!response.ok()) {
    throw new Error(`test sign-in failed: ${response.status()} ${await response.text()}`);
  }
  return response.json() as Promise<{ id: number; github_login: string; csrf_token: string }>;
}

/** Run a synchronisation and wait for it to finish, the way the UI's Sync button does. */
export async function syncAndWait(request: APIRequestContext, csrfToken: string, { full = false } = {}) {
  const started = await request.post(`${API_URL}/api/me/sync${full ? "?full=true" : ""}`, {
    headers: { "X-GitBounty-CSRF": csrfToken },
  });
  if (!started.ok()) throw new Error(`sync failed to start: ${started.status()} ${await started.text()}`);

  for (let attempt = 0; attempt < 60; attempt += 1) {
    const points = await (await request.get(`${API_URL}/api/me/points`)).json();
    if (points.sync.state !== "running") return points;
    await new Promise((r) => setTimeout(r, 300));
  }
  throw new Error("the sync did not finish");
}
