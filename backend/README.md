# Backend

FastAPI serves OAuth, issue browsing, maintainer publishing, PR sync, the points ledger,
leaderboards, GitHub App webhooks, pre-registration claims and moderation.
Database access uses async SQLAlchemy for issue-board reads and authentication, with asyncpg for remaining queries.

[Setup](../docs/setup.md) has the commands and configuration.
[Architecture](../docs/architecture.md) maps the code; [plan](../plan.md) tracks work.

uv manages dependencies: run `uv sync --locked` and `uv run --locked pytest` here.
The live two-account trial reached merge and points award; webhook provenance and live payment
verification remain pending. SmoothSend payment instructions, signed-operation storage and independent
receipt checks live in `app/routes/payments.py` and `app/smoothsend.py`. The backend resolves all
payment terms from authenticated claims and exposes only the public provider key. See
[payment architecture](../docs/architecture.md#smoothsend-payments).
Schema changes remain numbered SQL files in [migrations](../migrations/).
