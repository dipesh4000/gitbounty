# Troubleshooting

## Sign-in

**"GitHub login is not configured. Missing: ..."** — the named variables are empty in `backend/.env`. See
[`setup.md`](setup.md) step 3. The message lists exactly which.

**GitHub says "The redirect_uri is not associated with this application."** — the OAuth app's callback URL
and `GITHUB_CALLBACK_URL` differ. They must match exactly, including scheme, port and path:
`http://localhost:8001/auth/github/callback`.

**"Invalid OAuth state. Start the login again."** — the state is one-time and lives in the session cookie.
Usually a reloaded callback URL or a stale tab. Start at `/` again. If it happens every time, the session
cookie is not coming back: check `SESSION_SECRET` is set and that the site and API are on origins in
`ALLOWED_ORIGINS`.

**Signed in, then immediately signed out.** The cookie is not reaching the API. Check `ALLOWED_ORIGINS`
includes the exact origin you are browsing (`localhost` and `127.0.0.1` are different origins), and that
the site calls the API host you expect — `NEXT_PUBLIC_GITBOUNTY_API`.

**"Sign in with GitHub again" on every request.** The stored token cannot be read. Normal right after
`TOKEN_ENCRYPTION_KEY` is rotated; signing in again fixes it. See [`security.md`](security.md).

## The website

**"GitBounty can't reach its API."** The backend is not running on the URL the site was built with, or CORS
refused the call. Start it on `:8001`, or rebuild with `NEXT_PUBLIC_GITBOUNTY_API` set. The URL is baked in
at build time, not read at runtime.

**403 "Missing or invalid X-GitBounty-CSRF header."** The page is using a token from a session that has
been replaced. `apiWrite` retries once with a fresh token automatically; if it persists, reload.

**Everything is 503.** `curl http://localhost:8001/ready` — the `checks` object names what is missing.
Usually `DATABASE_URL`, or the container is not running (`docker start gitbounty_dev_db`).

**"No bounties have been published yet."** Correct and literal: nothing has been published. Publish one
from the maintainer workspace.

## The maintainer workspace

**"No repositories you can publish on."** GitBounty lists repositories GitHub says you have **admin or
maintain** on, that are public, not archived, have issues enabled and have at least one open issue. One you
can administer but that fails a later test is listed with the reason.

**403 "You need admin or maintain permission."** GitHub reports your permission on that repository as less
than that. Write access is deliberately not enough — see [`points-rules.md`](points-rules.md).

**"These issues are no longer open."** The issue was closed on GitHub between loading the list and
publishing. Refresh.

**429 "GitHub's rate limit was reached."** The response carries `Retry-After`. Nothing is lost.

## Synchronisation

**My PRs is empty.** The page says which kind of empty: never synced, syncing, synced-and-empty, or failed.
Press **Sync GitHub**. Only pull requests you authored, that were merged, into repositories you do not own,
count.

**A merge earned 0.** The repository has no published GitBounty bounty, so it does not take part. That is
the rule, not a bug — [`points-rules.md`](points-rules.md).

**A merge earned 5 instead of 45.** The bounty was already awarded, or your pull request did not name the
issue with a closing keyword (`Closes #12`), or you are the maintainer who published it. The reason for
every entry is in `GET /api/me/points/history`.

**A sync stayed "running" forever.** A process died mid-run. Runs older than 30 minutes are released
automatically on the next attempt; press Sync again.

## The extension

**No badge on an issue list.** Check, in order: the backend answers
`curl 'http://localhost:8001/api/issues?repository=owner/name'` with that issue; the extension is loaded
(`chrome://extensions`); the page is a `/issues` or `/pull/` URL; the extension card was reloaded after a
code change. The badge appears only for a **published** bounty.

**A badge says "40 label" instead of "40 GitBounty".** Working as intended. The issue carries a
`gitbounty:40` GitHub label but no published bounty, so the extension marks it as a label value — it awards
nothing.

**The popup says "GitBounty is not running on localhost:8001."** Start the backend.

**"Open full dashboard" goes nowhere.** The website is not running on `:3000`. Both URLs are in
`frontend/extension/src/config.js`.

## Tests

**Database tests skip.** The container is not running: `docker start gitbounty_dev_db`. They skip rather
than fail on purpose, so the pure logic can be checked without Docker.

**"No API test database".** Create it — [`setup.md`](setup.md) step 1.

**A test passes locally and fails in CI.** It should not: the suite sets `GITBOUNTY_ENV_FILE=""` and clears
the GitBounty variables before importing the app, so it never reads your `.env`.
`backend/tests/test_config.py` guards that.
