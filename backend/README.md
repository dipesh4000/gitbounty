# Backend

FastAPI serves OAuth, issue browsing, maintainer publishing, PR sync, the points ledger,
leaderboards, GitHub App webhooks, pre-registration claims and moderation.
Database access uses async SQLAlchemy for issue-board reads and authentication, with asyncpg for remaining queries.

[Setup](../docs/setup.md) has the commands and configuration.
[Architecture](../docs/architecture.md) maps the code; [plan](../plan.md) tracks work.

uv manages dependencies: run `uv sync --locked` and `uv run --locked pytest` here.
Live GitHub verification is still pending.
Schema changes remain numbered SQL files in [migrations](../migrations/).
