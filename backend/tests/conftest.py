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

DEV_DATABASE_URL = "postgresql://gitbounty:gitbounty_local_dev@localhost:5440/gitbounty_dev"
TEST_DATABASE_URL = os.environ.get("TEST_DATABASE_URL", DEV_DATABASE_URL)

SCHEMA = Path(__file__).resolve().parent.parent / "dev" / "schema.sql"


@pytest.fixture
async def db() -> AsyncIterator[asyncpg.Connection]:
    """A connection inside a transaction that is rolled back, so tests never leave rows behind."""
    try:
        connection = await asyncpg.connect(TEST_DATABASE_URL, timeout=3)
    except Exception as error:  # not running, wrong port, no such database
        pytest.skip(f"No local database at {TEST_DATABASE_URL} ({type(error).__name__}). See backend/dev/README.md")

    await connection.execute(SCHEMA.read_text())

    transaction = connection.transaction()
    await transaction.start()
    try:
        yield connection
    finally:
        await transaction.rollback()
        await connection.close()


@pytest.fixture
async def user_id(db: asyncpg.Connection) -> int:
    from app.features.points.store import upsert_user

    return await upsert_user(db, github_id=1, github_login="aastha-malik")
