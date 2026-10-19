# Escrow release evidence and remaining gates

Updated October 17, 2026.

Migrations through 0020 are applied to the configured Supabase database with owner authorization. Existing receiving wallet addresses and rows were preserved. The current release uses GitHub login, app custody and SmoothSend developer sponsorship; the production observations below describe the older deployed build, not proof of this release.

Production verification on October 17: `/ready` returned 200 with escrow configured;
`/api/escrow/config` returned `enabled: true`, Fuji 43113, the recorded contract and
signer, and direct execution. `/api/escrow/bounties` returned an empty list.
The public issue board returned 500. A read-only database diagnostic independently
reported `EMAXCONNSESSION`, with a session-pool limit of 15 clients. The local fix
reduces asyncpg to two connections with no preallocated connections and a ten-second
idle lifetime, and uses SQLAlchemy NullPool. The fix requires an owner Git push and
Vercel redeployment before production recovery can be verified.

Contract: `0xc8ff1527BF4d43A3bC7EA3d9fb415D5647739f65`, Fuji 43113, deployment block 59609397. Read-only deployment checks confirmed the official USDC token and immutable signer. No funding or settlement transaction has been broadcast by this implementation session.

## Application flow

1. Sign in through GitHub and install/connect the GitHub App on a public repository. Login provisions an encrypted managed signer. `/wallet` derives its SmoothSend smart account; no external wallet connection is needed.
2. Deposit Fuji test USDC at the app wallet address. In Maintainers, select a fresh issue, enter USDC and a required work deadline. Points-only bounties remain available. The API freezes the smart-account payer, reference, amount, work deadline and seven-day claim grace.
3. Open `/bounties`, select the new record, review and confirm funding. The server signs an exact approval/fund batch with SmoothSend developer-sponsored gas. Funding requires two canonical confirmations, inner UserOperation success and the exact escrow event plus USDC transfer.
4. A different GitHub author submits a PR whose body closes the issue, targeting the repository default branch. Merge within the funded work window.
5. Process the durable GitHub delivery using the public bounty page’s authenticated refresh. Cash eligibility requires the actual GraphQL ClosedEvent closer, numeric identities, exactly one funded issue, and a non-self author. Ordinary points sync excludes escrow awards to prevent bypassing these checks.
6. The verified author opens their app wallet, reviews and confirms a sponsored claim. New unbound recipients use their smart account; historical voucher bindings remain unchanged. Pending signed operations survive reload and retries reuse the stored authorization. Chain recovery advances up to 1,000 blocks per request with overlap and a persisted cursor.
7. After expiry, the payer can confirm a sponsored refund. Verification requires inner operation success, the exact refund event and return transfer.

## Runtime configuration

Copy the public deployment values from `contracts/deployments/fuji/backend.env` into the hosted backend. Keep the voucher signing key and SmoothSend server key in server secret storage. Configure a separate backed-up Fernet `WALLET_ENCRYPTION_KEY` (never reuse the token key). On the deployed version containing these routes, set `ESCROW_ENABLED=true`, `MANAGED_WALLETS_ENABLED=true` and `ESCROW_EXECUTION_MODE=sponsored`. Confirm `/ready`, `/api/escrow/config`, `/wallet`, `/bounties`, GitHub App installation/callback settings, and SmoothSend sponsor credits plus the exact production origin allowlist.

The request-driven delivery drain is explicit recovery, not proof of autonomous webhook processing. A persistent worker still requires a restart/recovery demonstration if advertised. Privy is excluded by the owner's decision. Sponsorship failure must not fall back to user-paid gas. The owner handles the Git push; no Git commands were used for this release.

## Verification and open acceptance work

- Contract suite: 9 passing; read-only Fuji configuration check passed.
- Frontend suite: 82 passing, including managed wallet and explicit sponsored confirmation tests.
- Focused backend custody/sponsorship/escrow/configuration/security checks: 36 passing.
- Read-only SmoothSend server-key Fuji gateway check passed. This is not a live sponsorship or funding proof.
- Database-dependent regression tests were previously skipped because local PostgreSQL was unavailable; they must run against an isolated test database, never the shared application database.
- Still required: deployed application proof, a real two-account issue/PR/delivery, funding and settlement hashes, gas/token balance checks, restart and browser-close recovery, browser accessibility checks, and the submission video/slides/owner provenance and portal receipt.

These records do not mark the entire project or hackathon submission complete.
