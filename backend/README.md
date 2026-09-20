# Backend

**Status: not started. The language and framework are not chosen yet.**

## What it has to do

- Verify who the user is (GitHub login) and expose a REST API for the website and, later, the extension:
  list open bounties, create and fund a bounty, show a maintainer's dashboard.
- Receive GitHub webhooks (`issues.labeled`, `issues.closed`, `pull_request.merged`), verify the HMAC signature on the
  raw body, and reject a delivery ID it has seen before.
- Read and write the database (Postgres on Supabase). Schema changes come from [`../migrations/`](../migrations), not
  from this folder.
- Call the escrow contract: `release()` on a verified merge, and `refund()` handling for stale bounties.

## Rules that apply here

See [`../rules.md`](../rules.md), in particular section 5 (secrets, webhook verification, anything that moves funds)
and section 7 (don't pick the stack by scaffolding it).
