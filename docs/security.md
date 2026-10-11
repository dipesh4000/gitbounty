# Security and operations

This is guidance for local and deployed operation. Deployment does not establish production readiness.
See [setup](setup.md) for commands and [progress](../plan.md) for outstanding work.

## Current controls

- GitHub OAuth uses one-time state validation and rotates the signed session on login.
- Session cookies are HttpOnly and SameSite=Lax. Set `SECURE_COOKIES=true` explicitly for an HTTPS deployment.
- GitHub tokens are Fernet-encrypted at rest, excluded from public response models, and cleared on logout.
  Authentication now uses SQLAlchemy; its user mapping defers the token column unless explicitly requested.
  Real-database tests cover encrypted storage, identity-preserving renames, public response filtering and logout removal.
- Maintainer writes re-check GitHub admin/maintain permission. The client does not establish ownership.
- Cookie-authenticated writes require CSRF headers; OAuth and logout are explicitly exempt.
- Configure an explicit browser-origin allowlist. Development/test sign-in paths must be disabled in production.
- SQL queries are parameterised; keep this and token filtering intact during SQLAlchemy migration.
- The extension contains public code only and uses minimal permissions.

## Secrets and rotation

Never put secrets or database dumps in git, logs, screenshots or chat.
Earlier project records report credentials shared during development; rotate affected credentials before exposure.
This document does not establish whether any particular current secret has already been rotated.

| Setting | Rotation effect |
|---|---|
| `SESSION_SECRET` | Invalidates sessions; users sign in again |
| `GITHUB_CLIENT_SECRET` | Update the backend with the new OAuth secret, then retire the old one |
| Database password / `DATABASE_URL` | Coordinate database and backend updates; verify connectivity afterwards |
| `TOKEN_ENCRYPTION_KEY` | Existing encrypted GitHub tokens become unreadable without the old key; users must reauthenticate |

Key rotation does not erase points. A multi-key re-encryption workflow is not implemented.
GitHub App private keys, installation tokens and webhook secrets must stay server-side.
Webhook verification must use the raw body, HMAC-SHA256 and constant-time comparison.
Persist delivery processing state, verify installation scope and prevent duplicate awards.

After rotation, check readiness, a fresh login, sync, and logout.
Do not share actual cookie/token values as verification evidence.

## Payment trust boundary

SmoothSend is required for owner payouts. The browser receives only `SMOOTHSEND_PUBLIC_KEY`;
`SMOOTHSEND_SECRET_KEY` stays on the backend. Configure the exact frontend origin in the dashboard.
Wallet signatures prove permanent links to numeric GitHub identities; they do not grant custody to GitBounty.
The server derives payment terms, nonce and calldata, verifies the owner's signed operation, and
independently checks the chain receipt before marking paid. Never mark a submitted operation paid
from its hash alone. Recovery reuses the saved signature and nonce; verify before retrying.
The full reward and capped USDC fee approval are separate. There is no escrow, server signing key,
internal wallet balance or automatic withdrawal. Fuji tokens have no monetary value.

## Database migrations and recovery

The numbered files in [migrations](../migrations/) are the schema change record.
Run `uv run --locked python dev/migrate.py status` and `up` from the backend environment.
The runner applies each file transactionally, records checksums and rejects numbering gaps.
Never edit an applied migration; add the next numbered file with its dependencies.

Shared database changes need explicit owner authorisation and a backup.
The runner refuses non-local targets without `--i-have-approval`; that flag is not permission by itself.
Check which migrations are applied rather than assuming the hosted database matches git.

Upgrade notes retained from the existing migration history:

- 0007 rejects values outside 1–1000. Unpublishing alone does not satisfy that check;
  inspect out-of-range rows and agree on a data correction before retrying.
- When upgrading the old merged-PR totals to the ledger, include 0010's backfill.
  Stopping after 0008 leaves old contributions out of the new totals.
- Report checksum changes; recover the original file and use a new migration for intended changes.

Back up before shared changes and practise restoring to a separate database.
A local container dump can be created without shell binary redirection:

```text
docker exec gitbounty_dev_db pg_dump -U gitbounty -d gitbounty_dev -Fc -f /tmp/gitbounty-backup.dump
docker cp gitbounty_dev_db:/tmp/gitbounty-backup.dump <secure-backup-directory>/gitbounty-backup.dump
```

Replace the destination with a protected directory outside the repository.
For hosted Postgres, use a protected connection configuration with `pg_dump -Fc --file=<backup-file>`;
do not paste credentials into commands or logs.
Restore using `pg_restore --dbname=<separate-restore-database> --no-owner --no-privileges <backup-file>`.
Compare user/ledger row counts, ledger totals, migration history, readiness and leaderboard reads.
A real hosted backup restore has not been verified in this review.

Do not repair points by editing ledger rows. Append a reasoned adjustment using the application's correction path.
Account deletion/retention is not implemented; deleting user rows can cascade into awards and published bounties.

## Logs and rate limits

Structured JSON logs include `X-Request-ID` correlation and events for requests, syncs, bounties and awards.
`LOG_LEVEL` and `JSON_LOGS` control output. Bodies, query strings and credentials are excluded from request logs;
redaction is a backstop, not permission to log secrets.

Rate limiting is implemented. A 429 includes retry information.
Counters live in one process and need a shared strategy before scaling.
Proxy configuration must establish trusted client addresses.
`RATE_LIMIT_SCALE` only affects the exact test environment.
There is no metrics or external error-reporting service.

## Before public release

- Verify real OAuth and a complete publish → merge → award journey.
- Configure production database, backups, OAuth callback, HTTPS cookies and allowed origins.
- Disable the development login stub and test-auth configuration.
- Choose hosting and a durable worker/recovery strategy; configure proxy trust and rate limiting for that topology.
- Recheck dependencies and runtime behavior; old audit counts are not evidence of current safety.
- Set moderator GitHub numeric IDs and a security contact.
- Resolve licensing, privacy/terms and retention policy with the owner.
- Replace extension localhost URLs and verify browser/session behavior before store submission.

No deployment, shared database operation, credential rotation or external telemetry is authorised by this document.
