"""Shared fixtures.

The database tests run against the local container described in `backend/dev/README.md`. They skip, rather than
fail, when it isn't running: someone reviewing the pure logic shouldn't need Docker to run the suite.
"""

from __future__ import annotations

import os
from collections.abc import AsyncIterator
from pathlib import Path

import asyncpg
import pytest

# Run against the declared defaults, not against whoever's machine this is. `app.config` reads
# backend/.env by default, so without this a developer's own ALLOWED_ORIGINS, DATABASE_URL or OAuth
# credentials leak into the suite and a test can pass here and fail in CI (or the reverse). This has to
# happen before anything imports `app`, which is why it sits at module scope in conftest.
os.environ["GITBOUNTY_ENV_FILE"] = ""
for _leaked in (
    "GITHUB_CLIENT_ID", "GITHUB_CLIENT_SECRET", "GITHUB_CALLBACK_URL", "FRONTEND_URL",
    "SESSION_SECRET", "TOKEN_ENCRYPTION_KEY", "DATABASE_URL", "ALLOWED_ORIGINS",
    "DEV_LOGIN_STUB_ENABLED", "DEV_GITHUB_LOGIN", "DEV_GITHUB_TOKEN", "DEV_GITHUB_ID",
):
    os.environ.pop(_leaked, None)

DEV_DATABASE_URL = "postgresql://gitbounty:gitbounty_local_dev@localhost:5440/gitbounty_dev"
TEST_DATABASE_URL = os.environ.get("TEST_DATABASE_URL", DEV_DATABASE_URL)

MIGRATIONS = sorted((Path(__file__).resolve().parents[2] / "migrations").glob("*.sql"))


async def apply_migrations(connection: asyncpg.Connection) -> None:
    """Build the schema from migrations/, which is the only description of it.

    Previously this applied backend/dev/schema.sql: a second, hand-maintained copy of the same tables
    that could drift from the files actually applied to the real database. Bootstrapping from the
    migrations means the suite is also a clean-database bootstrap test (rules.md section 4).
    """
    for path in MIGRATIONS:
        await connection.execute(path.read_text())


@pytest.fixture
async def db() -> AsyncIterator[asyncpg.Connection]:
    """A connection inside a transaction that is rolled back, so tests never leave rows behind."""
    try:
        connection = await asyncpg.connect(TEST_DATABASE_URL, timeout=3)
    except Exception as error:  # not running, wrong port, no such database
        pytest.skip(f"No local database at {TEST_DATABASE_URL} ({type(error).__name__}). See backend/dev/README.md")

    await apply_migrations(connection)

    transaction = connection.transaction()
    await transaction.start()
    # Start from empty inside the transaction, so a test sees only its own rows even when the development
    # database has data in it. The rollback puts that data back; nothing is actually deleted.
    await connection.execute(
        "truncate merged_prs, issue_points, issues, repositories, users restart identity cascade"
    )
    try:
        yield connection
    finally:
        await transaction.rollback()
        await connection.close()


@pytest.fixture
async def user_id(db: asyncpg.Connection) -> int:
    from app.features.points.store import upsert_user

    return await upsert_user(db, github_id=1, github_login="aastha-malik")
