/** Everything the harness and the tests agree on. Ports are deliberately not the development ones, so a
 *  running `npm run dev` cannot be mistaken for the stack under test. */
export const WEB_PORT = 3100;
export const API_PORT = 8101;
export const FAKE_GITHUB_PORT = 8099;

export const WEB_URL = `http://127.0.0.1:${WEB_PORT}`;
export const API_URL = `http://127.0.0.1:${API_PORT}`;
export const FAKE_GITHUB_URL = `http://127.0.0.1:${FAKE_GITHUB_PORT}`;

/** The test sign-in secret. Only has any effect together with GITBOUNTY_ENVIRONMENT=test. */
export const TEST_AUTH_SECRET = "end-to-end-test-secret-value-0001";

export const DATABASE_URL =
  process.env.E2E_DATABASE_URL ??
  "postgresql://gitbounty:gitbounty_local_dev@localhost:5440/gitbounty_e2e";

export const MAINTAINER = { github_id: 900001, github_login: "e2e-maintainer" };
export const CONTRIBUTOR = { github_id: 900002, github_login: "e2e-contributor" };

export const REPO = "e2e-maintainer/widgets";
