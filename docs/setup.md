# Local development setup

From nothing to a running GitBounty. Everything here runs on your own machine; nothing touches a deployed
environment, and nothing in this guide requires a secret anybody else holds.

## What you need

| | |
|---|---|
| Python | 3.12 or newer |
| Node | 22.13 or newer |
| Docker | for the throwaway Postgres container |
| A GitHub account | to create an OAuth app of your own |

## 1. The database

```bash
docker run -d --name gitbounty_dev_db \
  -e POSTGRES_USER=gitbounty \
  -e POSTGRES_PASSWORD=gitbounty_local_dev \
  -e POSTGRES_DB=gitbounty_dev \
  -p 5440:5432 postgres:17-alpine
```

Port 5440, not 5432, so GitBounty does not collide with any other Postgres on the machine. That password is
a local throwaway and is deliberately written down here; it protects nothing.

The test suites want two more databases in the same container:

```bash
docker exec gitbounty_dev_db psql -U gitbounty -d postgres \
  -c "create database gitbounty_api_test" \
  -c "create database gitbounty_bootstrap_test"
```

## 2. A GitHub OAuth app

GitBounty signs people in with their own GitHub account, so you need an OAuth app of your own. It takes a
minute and costs nothing.

1. Go to <https://github.com/settings/developers> → **OAuth Apps** → **New OAuth App**.
2. Fill in:
   - **Application name**: anything, e.g. `GitBounty (local)`
   - **Homepage URL**: `http://localhost:3000`
   - **Authorization callback URL**: `http://localhost:8001/auth/github/callback` — this must match
     `GITHUB_CALLBACK_URL` exactly, including the port and the path.
3. Create it, then **Generate a new client secret**. Copy the client ID and the secret now; GitHub shows
   the secret once.

GitBounty asks for the `read:user` scope only. It never requests write access to your repositories and
never asks for private-repository access.

## 3. The backend

```bash
cd backend
python3 -m venv .venv
. .venv/bin/activate
pip install -r requirements-dev.txt
cp .env.example .env
```

Fill in `backend/.env`:

```bash
GITHUB_CLIENT_ID=            # from step 2
GITHUB_CLIENT_SECRET=        # from step 2
GITHUB_CALLBACK_URL=http://localhost:8001/auth/github/callback
FRONTEND_URL=http://localhost:3000
ALLOWED_ORIGINS=http://localhost:3000,http://127.0.0.1:3000

# Generate each of these once, and keep them:
#   python -c "import secrets; print(secrets.token_urlsafe(32))"
SESSION_SECRET=
#   python -c "from cryptography.fernet import Fernet; print(Fernet.generate_key().decode())"
TOKEN_ENCRYPTION_KEY=

DATABASE_URL=postgresql://gitbounty:gitbounty_local_dev@localhost:5440/gitbounty_dev
```

`.env` is gitignored and must never be committed.

Apply the migrations, then start the server:

```bash
python dev/migrate.py status    # what is applied, what is pending
python dev/migrate.py up
uvicorn app.main:app --port 8001 --reload
```

Check it: `curl http://localhost:8001/ready` should report every dependency `configured` or `ok`. If it
says `not ready`, the `checks` object names what is missing.

## 4. The website

```bash
cd frontend/web
npm ci
npm run dev        # http://localhost:3000
```

The site calls `http://localhost:8001` by default. To point it elsewhere:

```bash
NEXT_PUBLIC_GITBOUNTY_API=http://127.0.0.1:8001 npm run dev
```

Open <http://localhost:3000> and click **Connect GitHub**. You will be sent to GitHub, asked to authorise
your own app, and returned to `/explore`. A first synchronisation starts in the background; the Sync
GitHub control on **My PRs** shows its progress.

## 5. The browser extension (optional)

See [`frontend/extension/README.md`](../frontend/extension/README.md). In short: `chrome://extensions` →
Developer mode → Load unpacked → `frontend/extension`.

## Running the checks

```bash
cd backend && . .venv/bin/activate && pytest          # 277 tests
cd frontend/web && npm run lint && npm run typecheck && npm run build
cd frontend/extension && npm run check                # 35 tests
```

Backend tests that need a database skip, rather than fail, when the container is not running — so the pure
logic can be checked without Docker. They never read your `.env`: `conftest.py` sets
`GITBOUNTY_ENV_FILE=""` and clears the GitBounty variables, so a result never depends on whose machine it
is.

## Environment variable reference

Placeholders only. Never commit a real value.

| Variable | Required | What it is |
|---|---|---|
| `GITHUB_CLIENT_ID` | for sign-in | Your OAuth app's client ID |
| `GITHUB_CLIENT_SECRET` | for sign-in | Your OAuth app's client secret. **Secret.** |
| `GITHUB_CALLBACK_URL` | yes | Must match the OAuth app exactly. Default `http://localhost:8001/auth/github/callback` |
| `FRONTEND_URL` | yes | Where to send the browser after sign-in. Default `http://localhost:3000` |
| `ALLOWED_ORIGINS` | yes | Comma-separated browser origins allowed to call the API. Never `*` |
| `SESSION_SECRET` | for sign-in | Signs the session cookie. **Secret.** Rotating it signs everybody out |
| `TOKEN_ENCRYPTION_KEY` | for sign-in | Fernet key encrypting stored GitHub tokens. **Secret.** Rotating it makes every stored token unreadable and forces everybody to sign in again |
| `DATABASE_URL` | for anything stored | Postgres connection string. **Secret** when it is not the local container |
| `SECURE_COOKIES` | deployed only | `true` marks the session cookie Secure. Unset, it follows whether `FRONTEND_URL` is https |
| `SESSION_MAX_AGE_SECONDS` | no | Session lifetime. Default 14 days |
| `GITBOUNTY_ENV_FILE` | no | Which dotenv file to read. The test suite sets it to `""` |
| `DEV_LOGIN_STUB_ENABLED` | no | **Local only.** Treats every request as one configured user. Authenticates nobody |
| `DEV_GITHUB_LOGIN` / `DEV_GITHUB_TOKEN` / `DEV_GITHUB_ID` | no | That user, for the stub |

The development login stub is off by default, warns loudly at startup when it is on, and must never be
enabled anywhere but a local machine.

## Common first problems

See [`troubleshooting.md`](troubleshooting.md).
