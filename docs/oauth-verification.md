# Verifying GitHub OAuth for real — owner checklist

**This is the one thing that cannot be automated.** Completing a GitHub authorization requires a person to
be signed in at github.com and press Authorize. Everything on this side of that boundary is covered by
tests — the state generation and verification, the code exchange, the profile read, what is stored, how the
token is encrypted, every failure GitHub can return, and the session that results. What no test can do is
prove that a real GitHub OAuth app, with real credentials, redirects back to a running GitBounty and
produces a working session.

Until you complete this, the honest statement is: **the OAuth implementation is tested against a mocked
GitHub boundary; a real github.com authorization has not been performed.**

Budget twenty minutes. Nothing here changes any shared system, and nothing is deployed.

---

## Before you start

You need a GitHub account, Docker, Python 3.12+ and Node 22.13+.

### 1. The database

```bash
docker start gitbounty_dev_db 2>/dev/null || docker run -d --name gitbounty_dev_db \
  -e POSTGRES_USER=gitbounty -e POSTGRES_PASSWORD=gitbounty_local_dev \
  -e POSTGRES_DB=gitbounty_dev -p 5440:5432 postgres:17-alpine
```

### 2. A GitHub OAuth app of your own

<https://github.com/settings/developers> → **OAuth Apps** → **New OAuth App**

| Field | Value — must match exactly |
|---|---|
| Application name | anything, e.g. `GitBounty (local verification)` |
| Homepage URL | `http://localhost:3000` |
| **Authorization callback URL** | **`http://localhost:8001/auth/github/callback`** |

The callback URL is the one that must match character for character, including the scheme, the port and
the path. If it does not, GitHub refuses with *"The redirect_uri is not associated with this
application"* — that is the single most common failure here.

Create it, then **Generate a new client secret** and copy both the client ID and the secret now. GitHub
shows the secret once.

> This app is yours, for this check. It is not the project's app and you can delete it afterwards.

### 3. `backend/.env`

```bash
cd backend
cp .env.example .env     # if you have not already
```

Fill in:

```bash
GITHUB_CLIENT_ID=<from step 2>
GITHUB_CLIENT_SECRET=<from step 2>
GITHUB_CALLBACK_URL=http://localhost:8001/auth/github/callback
FRONTEND_URL=http://localhost:3000
ALLOWED_ORIGINS=http://localhost:3000,http://127.0.0.1:3000
DATABASE_URL=postgresql://gitbounty:gitbounty_local_dev@localhost:5440/gitbounty_dev

# Generate each once:
#   python -c "import secrets; print(secrets.token_urlsafe(32))"
SESSION_SECRET=
#   python -c "from cryptography.fernet import Fernet; print(Fernet.generate_key().decode())"
TOKEN_ENCRYPTION_KEY=
```

Leave `GITBOUNTY_ENVIRONMENT`, `GITBOUNTY_TEST_AUTH_SECRET` and `DEV_LOGIN_STUB_ENABLED` **empty**. If any
of them is set, you are not testing the real path.

---

## Run it

Two terminals.

```bash
# terminal 1 — the backend
cd backend && . .venv/bin/activate
python dev/migrate.py up
uvicorn app.main:app --port 8001
```

```bash
# terminal 2 — the website
cd frontend/web && npm ci && npm run dev
```

Confirm before going further:

```bash
curl -s http://localhost:8001/ready | python3 -m json.tool
```

Every check must read `ok` or `configured`. If `github_oauth` says `not configured`, the client id or
secret is missing from `.env`.

---

## The check

### Step 1 — start the flow

Open <http://localhost:3000> in a **fresh browser profile or a private window** (so no earlier session is
involved) and click **Connect GitHub**.

**Expected redirect sequence** — three hops:

1. `http://localhost:3000/` → `http://localhost:8001/auth/github`
2. → `https://github.com/login/oauth/authorize?client_id=…&redirect_uri=…&scope=read%3Auser&state=…`
3. after you press **Authorize** → `http://localhost:8001/auth/github/callback?code=…&state=…`
   → `http://localhost:3000/explore`

Before pressing Authorize, check the consent screen says the app is asking for **"Read access to your
profile data"** and nothing about repositories. The scope requested is `read:user` only.

📷 **Record**: a screenshot of GitHub's consent screen, showing the app name and the permissions.

### Step 2 — you land signed in

You should arrive at `/explore` showing **@your-github-login** in the top right.

📷 **Record**: a screenshot of `/explore` with your login visible.

### Step 3 — the API agrees

In the browser's developer console on `localhost:3000`:

```js
await (await fetch("http://localhost:8001/api/me", { credentials: "include" })).json()
```

**Expected**: your real account.

```json
{"id": 1, "github_id": 583231, "github_login": "octocat", "name": "The Octocat",
 "avatar_url": "https://avatars.githubusercontent.com/u/583231?v=4"}
```

- `github_login` is **your** login.
- There is **no token field**. If you see one, stop and report it.

📷 **Record**: the console output.

### Step 4 — the cookie exists, without exposing it

Do **not** copy the cookie's value anywhere — it is a credential for your session.

In the console:

```js
document.cookie
```

**Expected**: the GitBounty session cookie is **not** in the result. It is `HttpOnly`, so page JavaScript
cannot read it. That is the correct answer.

To confirm it exists and how it is set, use **DevTools → Application → Cookies → `http://localhost:8001`**
and read the *flags* column only:

| Attribute | Expected |
|---|---|
| Name | `gitbounty_session` |
| HttpOnly | ✅ |
| SameSite | `Lax` |
| Secure | ❌ locally — correct; `SECURE_COOKIES=true` is for a deployment over https |
| Expires | about 14 days away |

📷 **Record**: a screenshot of that row **with the Value column collapsed or redacted**.

### Step 5 — the token is encrypted at rest

```bash
docker exec gitbounty_dev_db psql -U gitbounty -d gitbounty_dev -c \
  "select github_login, length(github_access_token) as token_length,
          left(github_access_token, 6) as starts_with from users;"
```

**Expected**: `starts_with` is `gAAAAA` — the Fernet prefix — and **not** `gho_` or `ghp_`. If it begins
with `gho_`, the token is in plaintext: stop and report it.

📷 **Record**: that output. It shows no secret: a length and a six-character format marker.

### Step 6 — the session survives a refresh

Reload `/explore`. You stay signed in, with no second trip to GitHub.

### Step 7 — the first sync ran by itself

Go to **My PRs**. The GitHub sync panel should show a last-synced time, not "Never synced" — signing in
starts a synchronisation in the background.

If you have merged pull requests into repositories you do not own, they appear. An empty list is also a
correct result and the page says which kind of empty it is.

📷 **Record**: a screenshot of the sync panel.

### Step 8 — signing out really signs you out

Click **Sign out**, then in the console:

```js
(await fetch("http://localhost:8001/api/me", { credentials: "include" })).status
```

**Expected**: `401`.

And the stored token is gone, not merely the cookie:

```bash
docker exec gitbounty_dev_db psql -U gitbounty -d gitbounty_dev -c \
  "select github_login, github_access_token is null as token_cleared from users;"
```

**Expected**: `token_cleared` is `t`.

📷 **Record**: both results.

### Step 9 — a forged callback is refused

```bash
curl -s -o /dev/null -w "%{http_code}\n" \
  "http://localhost:8001/auth/github/callback?code=anything&state=forged"
```

**Expected**: `400`. The state is one-time and lives in your session, so a replayed or invented one is
refused before the code is ever sent to GitHub.

### Step 10 — revoke the grant at GitHub

GitBounty cannot revoke a GitHub grant on your behalf; only you can, and only at GitHub.

<https://github.com/settings/applications> → your app → **Revoke**.

Then sign in again and sync: it should fail with *"GitHub rejected the stored token. Sign in again."* —
which is the behaviour a revoked token is supposed to produce.

---

## What to report back

| | Result |
|---|---|
| Consent screen showed `read:user` only | ☐ |
| Landed on `/explore` signed in as yourself | ☐ |
| `/api/me` returned your account, with no token field | ☐ |
| Cookie is `HttpOnly` + `SameSite=Lax` (value not recorded anywhere) | ☐ |
| Stored token starts `gAAAAA`, not `gho_` | ☐ |
| Refresh kept the session | ☐ |
| A sync ran automatically after sign-in | ☐ |
| Sign out → `/api/me` is 401 **and** the stored token is null | ☐ |
| Forged callback state → 400 | ☐ |
| Revoking at GitHub produces the "sign in again" error | ☐ |

Plus the screenshots from steps 1, 2, 3, 4, 5, 7 and 8.

**Never send**: the client secret, the session cookie's value, `SESSION_SECRET`, `TOKEN_ENCRYPTION_KEY`, or
a GitHub token. None of them is needed to show this worked.

---

## If something fails

See [`troubleshooting.md`](troubleshooting.md) — it covers the redirect-uri mismatch, the invalid-state
error, and the "signed in then immediately signed out" case in detail.

## Afterwards

The app you created is yours and can be deleted. Before GitBounty is ever used by anybody else, the
secrets created along the way must be rotated — see [`security.md`](security.md), and note that rotating
`TOKEN_ENCRYPTION_KEY` makes every stored token unreadable and signs everybody out.
