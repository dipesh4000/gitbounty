"""The Postgres connection pool.

Plain SQL through asyncpg, deliberately: schema changes are hand-written migration files applied by a teammate
(rules.md section 4), so there is no ORM here to generate or assume a schema.
"""

from __future__ import annotations

import logging

import asyncpg

from .config import settings

_pool: asyncpg.Pool | None = None


class DatabaseNotConfigured(RuntimeError):
    """No DATABASE_URL. The app still runs -- endpoints that need the database say 503."""


class DatabaseUnreachable(RuntimeError):
    """A DATABASE_URL is configured but the pool could not be opened."""


#: Why the last connect() attempt failed, for /ready to report without re-raising.
last_connect_error: str | None = None


async def connect() -> None:
    """Open the pool at startup. Does nothing when there is no DATABASE_URL.

    A database that is merely *down* must not stop the process from starting. It used to: the exception
    propagated out of the lifespan, uvicorn exited, and /ready -- the endpoint whose whole job is to say
    "the database is unreachable" -- was never reachable to say it. The failure is recorded instead, and
    every endpoint that needs the database answers 503 with a message that names no host.
    """
    global _pool, last_connect_error
    if _pool is not None or not settings.database_url:
        return
    try:
        _pool = await asyncpg.create_pool(settings.database_url, min_size=1, max_size=10)
        last_connect_error = None
    except Exception as error:
        last_connect_error = type(error).__name__
        logging.getLogger(__name__).error(
            "Could not open the database pool (%s). Endpoints that need it will answer 503.",
            type(error).__name__,
        )


async def disconnect() -> None:
    global _pool
    if _pool is not None:
        await _pool.close()
        _pool = None


def is_configured() -> bool:
    return _pool is not None


def pool() -> asyncpg.Pool:
    if _pool is None:
        if last_connect_error:
            # Configured but unreachable. The message names no host, port, driver or credential: an
            # operator reads /ready and the log, a stranger learns nothing.
            raise DatabaseNotConfigured("The database is not reachable right now. Try again shortly.")
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
