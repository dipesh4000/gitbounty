# Backend

FastAPI (Python), Postgres, no ORM. Schema changes live in [`../migrations/`](../migrations)
and are the only record of what the database looks like (see [`../rules.md`](../rules.md) section 4).

## What is built

- **Sign in with GitHub** — OAuth with a one-time `state` check, a signed http-only session
  cookie holding only the user's row id, and the access token encrypted before storage.
- **Issue browsing** — a sync job pulls unassigned "good first issue" tickets from GitHub into
  our tables; the board reads from those tables and never calls GitHub on a page load.

## What is not built yet

Points and leaderboards, merged-pull-request detection, the escrow contract and anything that
moves funds. See [`../overview.md`](../overview.md) for the build order.

## Running it

```bash
cd backend
python3 -m venv .venv && source .venv/bin/activate
pip install -r requirements.txt

cp .env.example .env     # then fill it in, see below
uvicorn app.main:app --reload --port 8001
```

Serve the website separately, on the port `FRONTEND_URL` names:

```bash
cd frontend/web && python3 -m http.server 8000
```

Check it came up: `curl localhost:8001/health` reports both the app and whether the database
is reachable. Interactive API docs are at `http://localhost:8001/docs`.

## What you need to fill in

**A GitHub OAuth app** — <https://github.com/settings/developers> → New OAuth App.
Homepage `http://localhost:8000`, callback `http://localhost:8001/auth/github/callback`.
Copy the client id and generate a client secret.

**A database URL** — the Supabase project, under Project Settings → Database → Connection string.

**Two generated secrets:**

```bash
python3 -c "import secrets; print(secrets.token_urlsafe(48))"                      # SESSION_SECRET
python3 -c "from cryptography.fernet import Fernet; print(Fernet.generate_key().decode())"  # TOKEN_ENCRYPTION_KEY
```

Apply the migrations in numeric order in the Supabase SQL editor before first run.

## Endpoints

| Method | Path | Notes |
|---|---|---|
| `GET` | `/health` | App and database liveness |
| `GET` | `/auth/github` | Starts the OAuth flow |
| `GET` | `/auth/github/callback` | GitHub returns here, then redirects to the site |
| `POST` | `/auth/logout` | Clears the session |
| `GET` | `/api/me` | The signed-in user's public profile |
| `POST` | `/api/issues/sync` | Signed in. Refreshes the board from GitHub |
| `GET` | `/api/issues` | The board. Filters: `category`, `language`, `q`, `page`, `per_page` |
| `GET` | `/api/issues/categories` | Open issue count per category |

## Things to know before changing this

- **Never call GitHub's search API on a page load.** It allows about 30 requests per minute.
  `/api/issues` reads Postgres; only `/api/issues/sync` talks to GitHub.
- **The OAuth scope is `read:user` and should stay that way.** Reading public issues and public
  merged pull requests needs nothing more (`rules.md` section 5).
- **The access token column is never returned by the API.** The queries that read a user name
  their columns explicitly so it cannot leak by accident. Keep it that way.
- Sync runs as the signed-in user, against their own rate limit, and caps how many new
  repositories one run will look up.
