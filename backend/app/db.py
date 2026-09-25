"""The Postgres connection pool.

Plain SQL through asyncpg, deliberately: schema changes are hand-written migration files applied by a teammate
(rules.md section 4), so there is no ORM here to generate or assume a schema.
"""

from __future__ import annotations

import asyncpg

from .config import settings

_pool: asyncpg.Pool | None = None


class DatabaseNotConfigured(RuntimeError):
    """No DATABASE_URL. The app still runs -- endpoints that need the database say 503."""


async def connect() -> None:
    """Open the pool at startup. Does nothing when there is no DATABASE_URL."""
    global _pool
    if _pool is not None or not settings.database_url:
        return
    _pool = await asyncpg.create_pool(settings.database_url, min_size=1, max_size=10)


async def disconnect() -> None:
    global _pool
    if _pool is not None:
        await _pool.close()
        _pool = None


def is_configured() -> bool:
    return _pool is not None


def pool() -> asyncpg.Pool:
    if _pool is None:
        raise DatabaseNotConfigured(
            "No database connection. Set DATABASE_URL in backend/.env (see backend/dev/README.md)."
        )
    return _pool


async def fetch_all(sql: str, *args: object) -> list[asyncpg.Record]:
    """Run a read query through the shared asyncpg pool."""
    async with pool().acquire() as connection:
        return await connection.fetch(sql, *args)


async def fetch_one(sql: str, *args: object) -> asyncpg.Record | None:
    """Return one row through the shared asyncpg pool."""
    async with pool().acquire() as connection:
        return await connection.fetchrow(sql, *args)


async def execute_many(sql: str, rows: list[tuple[object, ...]]) -> int:
    """Execute the same statement for a batch, using one acquired connection."""
    if not rows:
        return 0
    async with pool().acquire() as connection:
        await connection.executemany(sql, rows)
    return len(rows)
