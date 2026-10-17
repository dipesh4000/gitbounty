# Escrow release evidence and remaining gates

Updated October 17, 2026.

Migration 0017 was applied to the configured Supabase database with owner authorization. All migration checksums through 0017 were verified afterwards. Existing rows were preserved.

Contract: `0xc8ff1527BF4d43A3bC7EA3d9fb415D5647739f65`, Fuji 43113, deployment block 59609397. Read-only deployment checks confirmed the official USDC token and immutable signer. No funding or settlement transaction has been broadcast by this implementation session.

## Application flow

1. Sign in through GitHub, install/connect the App on a public repository, and link the permanent wallet on a bounty page (wallet setup is also available in the existing workspace).
2. In Maintainers, select a fresh issue, enter Fuji USDC and a work deadline. The deadline opts into escrow; without it, the historical promise path remains available. The API freezes payer, reference, amount, work deadline and seven-day claim grace.
3. Open `/bounties`, select the new record, approve the exact allowance, then fund. Funding requires two canonical confirmations and the exact escrow event plus USDC transfer.
4. A different GitHub author submits a PR whose body closes the issue, targeting the repository default branch. Merge within the funded work window.
5. Process the durable GitHub delivery using the public bounty page’s authenticated refresh. Cash eligibility requires the actual GraphQL ClosedEvent closer, numeric identities, exactly one funded issue, and a non-self author. Ordinary points sync excludes escrow awards to prevent bypassing these checks.
6. The verified author links their permanent EOA, requests a voucher, and claims. The public page shows verified transaction evidence. A saved transaction hash can be verified after reload. Chain recovery advances up to 1,000 blocks per request with overlap and a persisted cursor.
7. After expiry, the payer can submit a refund. Verification requires the exact refund event and return transfer.

## Runtime configuration

Copy the public deployment values from `contracts/deployments/fuji/backend.env` into the hosted backend. Keep the signing private key in server secret storage. Set `ESCROW_ENABLED=true` only on the backend version containing these routes and set `ESCROW_EXECUTION_MODE=direct`. Confirm `/ready`, `/api/escrow/config`, `/bounties`, GitHub App installation and callback settings after deployment.

The request-driven delivery drain is explicit recovery, not proof of autonomous webhook processing. A persistent worker still requires a restart/recovery demonstration if advertised. Privy and sponsored execution remain optional until the direct-wallet live proof is complete.

## Verification and open acceptance work

- Contract suite: 9 passing; read-only Fuji configuration check passed.
- Frontend suite: 78 passing; production build and TypeScript passed after adding bounty routes.
- Focused backend escrow checks: 11 passing; Ruff passed.
- Database-dependent regression tests were previously skipped because local PostgreSQL was unavailable; they must run against an isolated test database, never the shared application database.
- Still required: deployed application proof, a real two-account issue/PR/delivery, funding and settlement hashes, gas/token balance checks, restart and browser-close recovery, browser accessibility checks, and the submission video/slides/owner provenance and portal receipt.

These records do not mark the entire project or hackathon submission complete.
