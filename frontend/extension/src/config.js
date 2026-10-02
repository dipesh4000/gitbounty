/*
  Where the extension expects GitBounty to be.

  Both values are local on purpose: GitBounty is not deployed, and an extension that points at a
  production host that does not exist is worse than one that points at nothing. When there is a
  deployment, these two lines are the only thing that changes -- everything else reads them from here.
*/
(function exposeGitBountyConfig(root, factory) {
  const config = factory();
  if (typeof module === "object" && module.exports) module.exports = config;
  root.GitBountyConfig = config;
})(typeof globalThis === "object" ? globalThis : this, function createConfig() {
  "use strict";

  /** The FastAPI backend. Must match manifest.json's host_permissions. */
  const API_BASE = "http://localhost:8001";

  /** The Next.js website, as `npm run dev` serves it. */
  const APP_BASE = "http://localhost:3000";

  return {
    API_BASE,
    APP_BASE,
    /** Where "Connect GitHub" sends the browser: the backend's real OAuth route, never a fake session. */
    SIGN_IN_URL: `${API_BASE}/auth/github`,
    DASHBOARD_URL: `${APP_BASE}/explore`,
  };
});
