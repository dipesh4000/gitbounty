# Security model

What GitBounty protects, how, and what it does not protect. Where a claim is not true yet, it says so.

## What there is to protect

| Asset | Where it lives | Exposure if lost |
|---|---|---|
| A user's GitHub access token | `users.github_access_token`, Fernet-encrypted | Read access to that person's GitHub as them, within `read:user` |
| `TOKEN_ENCRYPTION_KEY` | environment only | Every stored token becomes readable |
| `SESSION_SECRET` | environment only | Session cookies can be forged — anybody can be impersonated |
| `GITHUB_CLIENT_SECRET` | environment only | The OAuth app can be impersonated |
| `DATABASE_URL` | environment only | Everything above, plus the ledger |
| The points ledger | `points_ledger` | Reputation can be falsified |

GitBounty stores no password of its own, no payment details, and nothing a user has not chosen to connect.

## Authentication

- GitHub OAuth, scope **`read:user`** only. No write access to repositories; no private-repository access.
- `state` is 32 bytes from `secrets.token_urlsafe`, kept in the signed session, popped before use, and
  compared with `secrets.compare_digest`. A replayed or missing state is `400` before the code is used.
- The session is **rotated** on sign-in (session fixation).
- The session cookie holds **only** a signed internal user id — never a token, never a login.
- `HttpOnly` (Starlette sets it), `SameSite=Lax`, `Secure` when `SECURE_COOKIES` is true, 14-day expiry.
- Tokens are Fernet-encrypted before storage and **never** appear in a response: `UserPublic` does not
  declare the field, and `USER_PUBLIC_COLUMNS` does not select it.
- Logout clears the session **and** the stored token.
- A token GitHub rejects becomes `401` with "sign in again"; so does a token that no longer decrypts, which
  is what a rotated `TOKEN_ENCRYPTION_KEY` looks like.

**Not done:** GitBounty cannot revoke a GitHub grant on the user's behalf — only the user can, at
<https://github.com/settings/applications>. Clearing the stored token is what GitBounty can do, and does.

## Authorization

- One definition, `github.can_publish_bounties`, decides both what is listed and what may be written, so a
  repository missing from the list cannot be published to by a hand-made request.
- It reads **GitHub's own `permissions` object**. The client never asserts ownership.
- `admin` or `maintain` is required. `push` is not enough: somebody who can both set a bounty's value and
  merge the pull request claiming it is the collusion case with one person in it.
- Every maintainer write re-checks, per request. Losing permission ends the ability to change those
  bounties.
- Reading a bounty's history requires maintaining its repository.

## CSRF

The session is a cookie, and a browser attaches cookies to a cross-site form post whether the user meant it
or not. CORS does not prevent the *request*, only reading the *response*.

A token is minted at sign-in, kept in the signed session, read from `GET /api/csrf` and echoed in
`X-GitBounty-CSRF` on every state-changing request. An attacker's page cannot read `/api/csrf`
cross-origin, and cannot set a custom header on a form post at all — adding one makes the request
preflighted, which the CORS allowlist then refuses.

`SameSite=Lax` already blocks the classic case; this is the second lock.

## CORS

An explicit allowlist from `ALLOWED_ORIGINS`, with credentials. Never `*` — with credentials, `*` would let
any page on the internet make calls as a signed-in user. A test asserts a listed origin is allowed and an
unlisted one is not.

## Injection

- **SQL:** every query is parameterised through asyncpg. The only interpolation anywhere is `order_by`,
  chosen from a hard-coded whitelist. Repository names are validated against `^[A-Za-z0-9._-]+/[A-Za-z0-9._-]+$`
  before reaching a URL or a query.
- **XSS:** React escapes by default. The one `dangerouslySetInnerHTML` contains a static comment. The
  extension builds every node with `textContent`, never `innerHTML`.
- **Open redirect:** the only redirect target is `FRONTEND_URL`, from configuration, never from a request.

## IDOR and row ownership

Every `/api/me/*` read is scoped to the session's user id. A maintainer's bounty list is scoped to
`set_by_user_id`. A bounty edit re-checks GitHub permission on the repository rather than trusting the path.
Ledger entries are never addressable by id from outside.

## Error handling and logging

- GitHub's response bodies are never forwarded; failures become a fixed sentence plus a status.
- `/ready` reports `unreachable` without naming the host, port, driver or credential.
- The migration runner strips credentials before printing a target.
- Tokens are never logged. The sync logs an exception with a user id, not a token.

**Not done:** there is no request/correlation id and logging is `logging.basicConfig(level=INFO)`. Listed in
[`deployment-readiness.md`](deployment-readiness.md).

## The extension

`activeTab` plus one host (`http://localhost:8001/*`). Content scripts limited by `include_globs` to GitHub
issue and pull-request URLs. No remotely loaded code, no analytics, no secret of any kind — everything in
that folder ships to the browser and is public.

## Secrets in the repository

`.gitignore` covers `.env`, `*.env` and `.env.*`, with `.env.example` (empty values) the exception.
`git log --all --diff-filter=A --name-only` shows no `.env` ever committed, and no key, token or connection
string appears in any tracked file.

---

# Secret rotation checklist

**Every secret used during development must be treated as compromised.** They were shared while the project
was being built. Rotate all four before GitBounty is ever exposed to anybody.

**Only the owner can do this.** It requires GitHub and Supabase accounts nobody else holds. Never paste a
value into a chat, an issue, a commit message or a log.

Rotate in this order — the last one has the biggest user-visible effect.

### 1. `SESSION_SECRET`

```bash
python -c "import secrets; print(secrets.token_urlsafe(32))"
```

**Effect:** every existing session cookie becomes invalid. Everyone is signed out and signs in again.
Nothing is lost. Zero risk.

### 2. `GITHUB_CLIENT_SECRET`

GitHub → Settings → Developer settings → OAuth Apps → your app → **Generate a new client secret**, then
delete the old one.

**Effect:** none for anyone already signed in. New sign-ins fail until the new value is deployed, so deploy
it in the same change. The client *ID* does not change.

### 3. The database password and `DATABASE_URL`

Supabase → Project Settings → Database → reset the password, then update `DATABASE_URL` everywhere.

**Effect:** the backend cannot reach the database between the reset and the update. `/ready` reports
`database: unreachable` and endpoints answer 503; nothing is corrupted. Take a backup first
([`database-runbook.md`](database-runbook.md)).

### 4. `TOKEN_ENCRYPTION_KEY` — read this before doing it

```bash
python -c "from cryptography.fernet import Fernet; print(Fernet.generate_key().decode())"
```

**Effect: every stored GitHub token becomes permanently unreadable.** Fernet ciphertext encrypted with the
old key cannot be decrypted with the new one, and GitBounty keeps no second copy.

What that means in practice:

- Every user must sign in again before their next sync. The code already handles this: `decrypt` returns
  `None`, `get_current_user_with_token` clears the session and answers `401` with "Sign in with GitHub
  again", and the website shows the signed-out state.
- **No points are lost.** The ledger, the bounties and the pull-request history are not encrypted and are
  untouched.
- A sync in flight fails and is recorded as failed. It can be re-run after signing in.

Two ways to do it:

- **Simple (recommended here).** Rotate the key and, in the same change, run
  `update users set github_access_token = null;` so the state is clean rather than full of ciphertext
  nobody can read. Everybody signs in again.
- **Zero-logout (only if ever needed).** Add a second key, decrypt with either and re-encrypt with the new
  one in a one-off pass, then drop the old key. This needs code that does not exist today; do not attempt it
  under time pressure.

### After rotating

- [ ] `curl /ready` reports every dependency healthy
- [ ] A fresh browser completes sign-in end to end
- [ ] `GET /api/me` returns the right account
- [ ] A sync runs and records `succeeded`
- [ ] `git log -p -- backend/.env` is empty and `git grep` finds no new value in a tracked file
- [ ] The old GitHub client secret is deleted, not merely replaced

## Dependency and supply chain

`npm audit` runs in CI for both JavaScript projects. Python dependencies are pinned exactly in
`requirements.txt`. The licence inventory is in [`handoff.md`](handoff.md).

## Reporting a problem

There is no security contact yet, because there is no deployment and no users. Setting one up is in
[`handoff.md`](handoff.md).
