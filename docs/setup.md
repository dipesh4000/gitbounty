# Local setup

Use uv, Python 3.12 (matching CI), Node 22.13+ and local Postgres 17.
uv manages Python and dependencies; the SQLAlchemy migration is partially complete.
Install uv using its official installation guide: https://docs.astral.sh/uv/getting-started/installation/.
Run npm commands within the relevant project folder.

For your configured Supabase database, skip the local database step and keep the existing
`DATABASE_URL` in `backend/.env`. Local Postgres is needed only for isolated automated tests.

## 1. Local database

On this Windows machine, the temporary PostgreSQL 17 instance used for testing already exists.
Start it in a dedicated PowerShell terminal without Docker (leave this terminal open):

```powershell
& "$env:TEMP\gitbounty-postgres-tools\pgsql\bin\postgres.exe" -D "$env:TEMP\gitbounty-postgres-tools\data" -p 5440 -h 127.0.0.1
```

It contains `gitbounty_dev`, `gitbounty_api_test` and `gitbounty_bootstrap_test`.
This temporary location is for local development; do not rely on it for long-term storage.

On another machine, create the local container instead (requires Docker):

From any terminal, as single-line commands:

```text
docker run -d --name gitbounty_dev_db -e POSTGRES_USER=gitbounty -e POSTGRES_PASSWORD=gitbounty_local_dev -e POSTGRES_DB=gitbounty_dev -p 5440:5432 postgres:17-alpine
docker exec gitbounty_dev_db psql -U gitbounty -d postgres -c "create database gitbounty_api_test" -c "create database gitbounty_bootstrap_test"
```

The password above is for this throwaway local container only.
If the container already exists, use `docker start gitbounty_dev_db`.
Create the test databases once. Never substitute a shared database for a test target.

## 2. Backend environment

From the repository root, Windows PowerShell:

```powershell
cd backend
uv sync --locked
if (-not (Test-Path .env)) { Copy-Item .env.example .env }
```

On macOS/Linux:

```bash
cd backend
uv sync --locked
cp .env.example .env
```

Only copy the example if you do not already have a `.env`; preserve existing configuration.
Create a GitHub OAuth app through [developer settings](https://github.com/settings/developers):
homepage `http://localhost:3000`, callback `http://localhost:8001/auth/github/callback`.
The callback must match `GITHUB_CALLBACK_URL`.

Set these in the ignored `backend/.env`. The backend always loads this file, regardless of the
working directory. A root `.env` is not used. `ALLOWED_ORIGIN`, `COOKIE_SECURE` and
`COOKIE_SAMESITE` are not GitBounty setting names; use the names below. Groq, NVIDIA and Gemini
settings are unrelated to the current bounty flow.

GitHub's consent screen identifies the OAuth app's developer. The configured local app is
**GitBounty (local)**, owned by **Nishika**, which the owner has chosen to retain.
This does not select the signed-in user's identity; that comes from GitHub's authenticated profile.
See [GitHub's consent guide](https://docs.github.com/en/apps/oauth-apps/using-oauth-apps/authorizing-oauth-apps).

| Setting | Local value |
|---|---|
| `GITHUB_CLIENT_ID`, `GITHUB_CLIENT_SECRET` | From your OAuth app; keep the secret private |
| `GITHUB_CALLBACK_URL` | `http://localhost:8001/auth/github/callback` |
| `FRONTEND_URL` | `http://localhost:3000` |
| `ALLOWED_ORIGINS` | `http://localhost:3000,http://127.0.0.1:3000` |
| `DATABASE_URL` | `postgresql://gitbounty:gitbounty_local_dev@127.0.0.1:5440/gitbounty_dev` |
| `SESSION_SECRET` | A generated random session secret |
| `TOKEN_ENCRYPTION_KEY` | A generated Fernet key |
| `SECURE_COOKIES` | `false` for local HTTP; explicitly `true` for deployed HTTPS |

For webhook processing, create a GitHub App with read-only Contents, Issues and Pull requests permissions.
Subscribe to Pull request events; installation lifecycle events are also handled. Set its webhook URL to
`https://<public-api-host>/webhooks/github`. Add these server-only values:

| Setting | Value |
|---|---|
| `GITHUB_APP_ID` | Numeric App ID |
| `GITHUB_APP_SLUG` | App URL slug used by the installation link |
| `GITHUB_APP_PRIVATE_KEY_PATH` | Absolute path to the downloaded RSA private key, outside this repository |
| `GITHUB_WEBHOOK_SECRET` | A generated webhook secret configured identically in GitHub |

Do not commit the private key or secret. The local API must be reachable from GitHub to receive live deliveries.

Generate secrets locally using the virtualenv's Python, then keep the values private:

```text
uv run --locked python -c "import secrets; print(secrets.token_urlsafe(32))"
uv run --locked python -c "from cryptography.fernet import Fernet; print(Fernet.generate_key().decode())"
```

Run these commands from `backend/`; uv selects the project's Python and environment.
Never include generated output in a commit or support message.
For real OAuth verification, leave the development login stub disabled, the test secret unset,
and `GITBOUNTY_ENVIRONMENT` at its default.

Other settings are defined in [config.py](../backend/app/config.py) and [.env.example](../backend/.env.example).
Notable options: `ADMIN_GITHUB_IDS` (numeric IDs; empty grants nobody moderation access),
`LOG_LEVEL`, `JSON_LOGS`, `SESSION_MAX_AGE_SECONDS`, and `GITBOUNTY_ENV_FILE`.
The test-only auth/API-host/rate-limit overrides must never be enabled for normal operation.

There is no application Settings page. Edit server settings in `backend/.env` and restart the backend.
The template supplies local cookie/expiry defaults and disables test-only authentication. In an existing `.env`,
remove empty `SESSION_MAX_AGE_SECONDS` values or set `1209600`; use `SECURE_COOKIES=false` for local HTTP.
Keep `GITBOUNTY_ENVIRONMENT=production` and `GITBOUNTY_TEST_AUTH_SECRET` empty for manual testing.

## 3. Run backend and website

From `backend/`, PowerShell:

```powershell
uv run --locked python dev/migrate.py status
uv run --locked python dev/migrate.py up
uv run --locked python -m uvicorn app.main:app --port 8001 --reload
```

For a shared Supabase target, the runner requires explicit owner approval:
`uv run --locked python dev/migrate.py status --i-have-approval`, then, only with that approval,
`uv run --locked python dev/migrate.py up --i-have-approval`.
Migrations 0013 and 0014 were applied to the configured Supabase target with owner approval on 2026-10-09.
Startup does not apply migrations automatically. `/ready` reports an incomplete rewards schema as 503.

The same uv commands work on POSIX. Production dependency installation uses `uv sync --locked --no-dev`.
Confirm [readiness](http://localhost:8001/ready), then open [API docs](http://localhost:8001/docs).

In a second terminal from the repository root:

```text
cd frontend/web
npm ci
npm run dev
```

Open [localhost:3000](http://localhost:3000). Port 8001 is the API, not the website.
Explore, Create and Leaderboard require GitHub sign-in. Landing actions open `/login` with the selected
destination; direct workspace links show the same sign-in screen. Informational pages and the landing
bounty preview remain public. After authorization, you return to the selected workspace.
The API URL defaults to port 8001; `NEXT_PUBLIC_GITBOUNTY_API` overrides it and is baked into production builds.
Use the same hostname consistently for the site, API and callback.

## 4. Extension

Open `chrome://extensions`, `brave://extensions` or `edge://extensions`, enable Developer mode,
and load `frontend/extension` unpacked.
Start the API, publish a bounty, then open its GitHub issue list.
Reload the extension and GitHub tab after changing extension code.
See the [extension README](../frontend/extension/README.md) for current behavior and pending changes.

## 5. Checks

Run each row in its own folder:

| Folder | Commands |
|---|---|
| `backend/` | `uv run --locked pytest` |
| `frontend/web/` | `npm ci`, `npm run lint`, `npm run typecheck`, `npm test`, `npm run build` |
| `frontend/extension/` | `npm ci`, `npm run check` |
| `e2e/` | See [E2E instructions](../e2e/README.md); Windows and POSIX are supported |

Database tests skip when their databases cannot be reached. Report skips; they do not establish correctness.
Tests isolate configuration from developer dotenv files.
[CI](../.github/workflows/ci.yml) runs backend/database checks, web component/build checks,
extension tests, E2E/accessibility, secret scanning and migration validation. It does not deploy.

## Real GitHub verification

Use the [copy-ready test data](testing-data.md) for your two GitHub accounts, five issues,
point values, filter checks and merge/claim scenarios with expected totals.

The automated E2E harness substitutes GitHub; verify this separately with an actual account:

1. On the website, choose **Create a bounty**, sign in through GitHub, and confirm you return to the repository picker. Confirm `/api/me` returns your identity without any access token.
2. Refresh and confirm the session persists. Inspect cookie flags without exposing the cookie value.
3. Choose a public repository you maintain, choose an open issue, select it, set 1–1000 points and a
   category, review, then publish. Confirm it appears at `/explore` after sign-in and in the public landing preview,
   and on its GitHub issue after reloading the extension and GitHub tab.
4. Use **My published bounties** to edit, unpublish or archive the reward. Confirm the explorer and
   extension reflect changes. Use **My PRs** to sync; **Points** shows history and claimable rewards.
5. For reward verification, use a different contributor account: open a PR with `Closes #<issue>`
   targeting the rewarded repository, then merge it as the maintainer. Self-merges/own-repository
   contributions are excluded. Sync the contributor after merging and confirm a single award;
   repeat sync to verify it is not counted twice.
6. Install the GitHub App on that public repository and connect it from the maintainer workspace.
7. Using a different eligible contributor account, merge a PR closing that issue. Confirm the delivery is processed.
8. Sign in as the contributor, claim reserved points, and confirm history and leaderboard. Sync again and confirm no duplicate.
9. Sign out and confirm `/api/me` returns 401 and the stored token is cleared.
10. To test revocation, revoke the GitHub grant while retaining the existing GitBounty session, then sync.
   The app should request reauthentication. Signing in again first would obtain a new grant and invalidate this check.

Use two GitHub accounts: a repository maintainer and a contributor who does not own that repository or bounty.
For the pre-registration path, merge before the contributor first signs in to GitBounty. The PR body should
contain an explicit closing reference such as `Closes #12`. GitHub's Development-sidebar link alone is not detected.
An eligible 40-point bounty normally earns 45 points including the baseline; repeat sync/claim must add zero.
The webhook worker starts with the API when all four App settings and the database are configured.
A public HTTPS tunnel to port 8001 is needed for GitHub to reach a local webhook; use its URL only for the webhook,
while keeping the website and OAuth callback on the configured localhost addresses.

In the signed-in workspace, test Explore bounties, Create a bounty, My PRs, Points and Leaderboard.
`/maintainers` opens the publishing workspace; `/leaderboard` shows the live ranking. Both require sign-in.
For moderation, set `ADMIN_GITHUB_IDS` and use the API reference; moderation UI remains deferred.

## Stop after testing

Press Ctrl+C in the backend and website terminals. Stop the local Windows database with:

```powershell
& "$env:TEMP\gitbounty-postgres-tools\pgsql\bin\pg_ctl.exe" stop -D "$env:TEMP\gitbounty-postgres-tools\data" -m fast -w
```

For the Docker alternative, use `docker stop gitbounty_dev_db`. Stop any webhook tunnel in its terminal too.

## Troubleshooting

| Symptom | Check |
|---|---|
| Readiness/API 503 | Configured database reachable, migrations applied, required settings present |
| Missing `reward_allocations` or `connected_repositories` | Apply migrations 0013/0014 using the runner; shared targets require owner approval |
| OAuth redirect mismatch | Exact callback scheme, hostname, port and path |
| Repeated signed-out state | Consistent hostnames, allowed origins, cookie settings and current encryption key |
| CSRF 403 | Obtain a fresh token from `/api/csrf`; reload after session changes |
| Empty explorer | A maintainer must publish a bounty; a GitHub label does not publish one |
| No extension badge | Loaded/reloaded extension, matching GitHub issue URL, API contains that bounty |
| Label has points but no badge | Labels alone are not registered rewards |
| Missing `jsdom` | Run `npm ci` in the project whose tests are failing |
| PR earns only baseline | Check closing reference, bounty availability and author eligibility |
| Sync stuck running | In-process task may have died; a later attempt releases stale runs after 30 minutes |
| Rate limit 429 | Respect retry information; limits may come from GitBounty or GitHub |

For credential changes and database recovery, use [security and operations](security.md).

## Avalanche payments through SmoothSend

Payments execute only on Avalanche C-Chain (43114) or Fuji (43113), through SmoothSend. The current
local test choice is official Circle USDC on Fuji. Connected browser wallets prove GitHub identity and
sign UserOperations; owners fund their SmoothSend smart accounts and pay fees in USDC. Points stay
separate. GitBounty neither funds nor guarantees an owner's promise; there is no escrow or server signing key.

1. Apply numbered migrations through `0016_fuji_usdc.sql` with the migration runner. Shared targets
   require explicit owner approval. Existing mainnet promises retain their immutable network and amount.
2. In ignored `backend/.env`, set `AVAX_PAYMENTS_ENABLED=true`, `PAYMENT_MODE=usdc_fuji`,
   `SMOOTHSEND_PUBLIC_KEY=pk_nogas_…` (your dashboard public key), and `SMOOTHSEND_FEE_LIMIT_USDC=0.1`.
   Allow the exact frontend origin in the SmoothSend dashboard, normally `http://localhost:3000`.
   Restart the API. Missing/invalid public keys keep execution disabled; secret keys are never exposed.
3. Publish a fresh issue with an exact USDC promise, up to six decimals. Claim amounts, recipients,
   network and nonce are server-resolved. Old points-only bounties cannot gain money retroactively.
4. After an eligible verified merge, the contributor opens **Payments**, signs a one-time wallet
   challenge and claims. One receiving wallet is permanently linked to the numeric GitHub identity.
5. The owner chooses **Review payment**, connects their payer wallet and funds the displayed SmoothSend
   smart-account address with reward plus fee allowance in Fuji USDC. This differs from their EOA address.
   Review the exact receiving address, full reward, network and fee. Confirm signs through SmoothSend's
   `user-pays-erc20` flow. The allowance caps the paymaster's USDC approval; fees do not reduce the reward.
6. **Verify payment** checks the Avalanche receipt, EntryPoint event, saved operation/nonce/calldata and
   exact USDC Transfer in that operation's log segment. A pending/unknown operation remains unpaid.
   Recover using its UserOperation hash. Resubmit reuses the stored signed operation; a verified failed
   operation permits a new nonce on the same payment row. Confirmed receipts are append-only.
7. Contributors receive USDC in their linked browser wallets. Moving it later using the wallet's Send
   action needs Fuji AVAX for ordinary gas; sponsored withdrawals are not implemented.

One unfinished payment per payer wallet is allowed. Manual review holds block payment. There is no direct
payout fallback when SmoothSend fails. Test tokens have no monetary value; no live wallet transfer is
performed by automated tests. Follow the [complete two-account walkthrough](testing-data.md) for live verification.

Official references: [Circle USDC contracts](https://developers.circle.com/stablecoins/usdc-contract-addresses),
[Circle test faucet](https://faucet.circle.com/), [SmoothSend Avalanche quickstart](https://docs.smoothsend.xyz/avax/quickstart).
The SDK is dynamically loaded from its Avalanche subpath. Project `.npmrc` uses legacy peer resolution
because the SDK's unused Aptos wallet peers conflict; `npm ci` follows that checked-in setting.

The local Codex MCP server is registered as `smoothsend-mcp` using `npx -y @smoothsend/mcp@1.2.0`.
Reload Codex to load newly registered tools. MCP provides development tools; runtime payments use the SDK.
