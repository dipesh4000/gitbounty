import { spawn, execFileSync, type ChildProcess } from "node:child_process";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

import {
  API_PORT, API_URL, DATABASE_URL, FAKE_GITHUB_PORT, FAKE_GITHUB_URL, TEST_AUTH_SECRET, WEB_PORT, WEB_URL,
} from "./config";

/*
  Brings up the whole stack: a dedicated Postgres database, the fake GitHub, the backend, and the
  production build of the website. Writes the process ids where the teardown can find them.

  The database is **created and dropped by this harness** and is never the developer's own: its name ends
  in _e2e and the migrations are applied to it from scratch, which is also a clean-bootstrap check in its
  own right.
*/

const root = resolve(__dirname, "..");
const backend = join(root, "backend");
const python = join(backend, ".venv", "bin", "python");

const children: ChildProcess[] = [];
const stateDir = mkdtempSync(join(tmpdir(), "gitbounty-e2e-"));

function log(message: string) {
  console.log(`[e2e setup] ${message}`);
}

async function waitFor(url: string, name: string, timeoutMs = 90_000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    try {
      const response = await fetch(url);
      if (response.ok || response.status === 401 || response.status === 503) {
        log(`${name} is up`);
        return;
      }
    } catch {
      /* not listening yet */
    }
    await new Promise((r) => setTimeout(r, 400));
  }
  throw new Error(`${name} did not come up at ${url} within ${timeoutMs}ms`);
}

/*
  Started detached, so each process gets its own group and the whole group can be killed.

  `npm run start` spawns node as a grandchild; signalling npm alone leaves that grandchild listening, and
  a leftover server from a previous run then answers on the port with chunks from an older build. That
  failure is confusing enough to be worth preventing structurally.
*/
function start(name: string, command: string, args: string[], options: { cwd: string; env: NodeJS.ProcessEnv }) {
  const child = spawn(command, args, { ...options, stdio: ["ignore", "pipe", "pipe"], detached: true });
  child.stdout?.on("data", (chunk) => process.env.E2E_VERBOSE && process.stdout.write(`[${name}] ${chunk}`));
  child.stderr?.on("data", (chunk) => process.env.E2E_VERBOSE && process.stderr.write(`[${name}] ${chunk}`));
  child.on("exit", (code) => code !== 0 && code !== null && log(`${name} exited with ${code}`));
  children.push(child);
  return child;
}

function stopAll() {
  for (const child of children) {
    if (child.pid === undefined) continue;
    try {
      process.kill(-child.pid, "SIGTERM");  // the whole group, not just the shell
    } catch {
      try { child.kill("SIGTERM"); } catch { /* already gone */ }
    }
  }
}

/** Refuse to start on a port something else is already holding, rather than testing that something. */
async function requireFreePort(port: number, name: string) {
  try {
    await fetch(`http://127.0.0.1:${port}/`, { signal: AbortSignal.timeout(1500) });
  } catch {
    return;  // nothing listening: good
  }
  throw new Error(
    `something is already listening on port ${port} (${name}). ` +
    "Stop it before running the end-to-end test -- otherwise the test would be run against it.",
  );
}

export default async function globalSetup() {
  for (const [port, name] of [[WEB_PORT, "website"], [API_PORT, "backend"], [FAKE_GITHUB_PORT, "fake GitHub"]] as const) {
    await requireFreePort(port, name);
  }

  // A crash or an interrupt must not leave three servers behind.
  for (const signal of ["SIGINT", "SIGTERM"] as const) process.once(signal, stopAll);
  process.once("exit", stopAll);

  const databaseName = new URL(DATABASE_URL).pathname.slice(1);
  if (!databaseName.endsWith("_e2e")) {
    throw new Error(`refusing to use ${databaseName}: the end-to-end database name must end in _e2e`);
  }
  const adminUrl = DATABASE_URL.replace(/\/[^/]+$/, "/postgres");

  log(`recreating ${databaseName}`);
  execFileSync(python, ["-c", `
import asyncio, asyncpg
async def main():
    c = await asyncpg.connect(${JSON.stringify(adminUrl)})
    await c.execute("drop database if exists ${databaseName} with (force)")
    await c.execute("create database ${databaseName}")
    await c.close()
asyncio.run(main())
`], { cwd: backend, stdio: "inherit" });

  log("applying migrations");
  execFileSync(python, ["dev/migrate.py", "up", "--database-url", DATABASE_URL], {
    cwd: backend,
    stdio: process.env.E2E_VERBOSE ? "inherit" : "ignore",
  });

  log("starting the fake GitHub");
  start("github", python, [join(root, "e2e", "fake-github", "server.py")], {
    cwd: root,
    env: { ...process.env, FAKE_GITHUB_PORT: String(FAKE_GITHUB_PORT) },
  });
  await waitFor(`${FAKE_GITHUB_URL}/__control__/health`, "fake GitHub");

  log("starting the backend");
  start("api", python, ["-m", "uvicorn", "app.main:app", "--host", "127.0.0.1", "--port", String(API_PORT), "--log-level", "warning"], {
    cwd: backend,
    env: {
      ...process.env,
      // Never the developer's .env: the harness supplies every value.
      GITBOUNTY_ENV_FILE: "",
      DATABASE_URL,
      SESSION_SECRET: "end-to-end-session-secret",
      TOKEN_ENCRYPTION_KEY: execFileSync(python, ["-c", "from cryptography.fernet import Fernet;print(Fernet.generate_key().decode())"], { cwd: backend }).toString().trim(),
      FRONTEND_URL: WEB_URL,
      ALLOWED_ORIGINS: WEB_URL,
      // These two together mount the test sign-in path, and nothing else does.
      GITBOUNTY_ENVIRONMENT: "test",
      GITBOUNTY_TEST_AUTH_SECRET: TEST_AUTH_SECRET,
      // Only honoured because GITBOUNTY_ENVIRONMENT is "test".
      GITHUB_API_URL: FAKE_GITHUB_URL,
      GITHUB_CLIENT_ID: "e2e-client-id",
      GITHUB_CLIENT_SECRET: "e2e-client-secret",
      DEV_LOGIN_STUB_ENABLED: "false",
      DEV_GITHUB_LOGIN: "",
    },
  });
  await waitFor(`${API_URL}/health`, "backend");

  // NEXT_PUBLIC_GITBOUNTY_API is inlined at **build** time, not read at runtime (docs/troubleshooting.md
  // says so, and this is what proves it): a build made against localhost:8001 keeps calling localhost:8001
  // whatever the environment says when it starts. So the site is rebuilt against the harness's API.
  const web = join(root, "frontend", "web");
  log("building the website against the harness API");
  execFileSync("npm", ["run", "build"], {
    cwd: web,
    env: { ...process.env, NEXT_PUBLIC_GITBOUNTY_API: API_URL },
    stdio: process.env.E2E_VERBOSE ? "inherit" : "ignore",
  });

  log("starting the website (production build)");
  start("web", "npm", ["run", "start", "--", "--port", String(WEB_PORT)], {
    cwd: web,
    env: { ...process.env, PORT: String(WEB_PORT), NEXT_PUBLIC_GITBOUNTY_API: API_URL },
  });
  await waitFor(WEB_URL, "website");

  writeFileSync(join(stateDir, "pids.json"), JSON.stringify(children.map((c) => c.pid)));
  process.env.E2E_STATE_DIR = stateDir;
  log("ready");

  return async () => {
    log("stopping");
    stopAll();
  };
}
