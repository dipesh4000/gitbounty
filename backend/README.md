# Backend

FastAPI serves OAuth, issue browsing, maintainer publishing, PR sync, the points ledger,
leaderboards, GitHub App webhooks, pre-registration claims and moderation.
Database access uses async SQLAlchemy for issue-board reads and authentication, with asyncpg for remaining queries.

[Setup](../docs/setup.md) has the commands and configuration.
[Architecture](../docs/architecture.md) maps the code; [plan](../plan.md) tracks work.

uv manages dependencies: run `uv sync --locked` and `uv run --locked pytest` here.
The existing implementation reached merge and points award in a two-account trial; webhook provenance
and a fully evidenced live Fuji settlement remain pending. The current provider-specific payment path,
signed-operation storage and receipt checks live in `app/routes/payments.py` and `app/smoothsend.py`.
They remain supported during migration, but SmoothSend is not a product dependency.

The hackathon target adds native Privy GitHub onboarding mapped to the existing application session, an authorization signer, and independent verification
of claims from the funded `GitBountyEscrow` contract. The backend must derive eligibility from verified
GitHub data, never from client-supplied repository, PR, recipient, token, or amount fields. See the
[target architecture](../docs/architecture.md#target-hackathon-architecture).
Schema changes remain numbered SQL files in [migrations](../migrations/).

The current worker is an in-process task; choose and prove its production execution mode before
claiming automatic processing. The [audit](../docs/implementation-audit.md) also records locked
cryptography/Starlette advisories and the focused-test limits.
