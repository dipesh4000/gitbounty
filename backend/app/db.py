"""The Postgres connection pool.

There is no ORM on purpose: migrations/ is the only record of the schema
(rules.md section 4), so everything here is plain SQL.
"""

from __future__ import annotations

from psycopg.rows import dict_row
from psycopg_pool import AsyncConnectionPool

from .config import get_settings

_pool: AsyncConnectionPool | None = None


async def open_pool() -> AsyncConnectionPool:
    """Open the pool. Called once, on application startup."""
    global _pool
    if _pool is None:
        _pool = AsyncConnectionPool(
            conninfo=get_settings().database_url,
            min_size=1,
            max_size=5,
            open=False,
            kwargs={"row_factory": dict_row},
        )
        await _pool.open(wait=True, timeout=10)
    return _pool


async def close_pool() -> None:
    """Close the pool. Called once, on application shutdown."""
    global _pool
    if _pool is not None:
        await _pool.close()
        _pool = None


def get_pool() -> AsyncConnectionPool:
    if _pool is None:
        raise RuntimeError("Database pool is not open. This should happen on startup.")
    return _pool


async def fetch_all(sql: str, params: tuple | dict | None = None) -> list[dict]:
    async with get_pool().connection() as conn:
        cur = await conn.execute(sql, params)
        return await cur.fetchall()


async def fetch_one(sql: str, params: tuple | dict | None = None) -> dict | None:
    async with get_pool().connection() as conn:
        cur = await conn.execute(sql, params)
        return await cur.fetchone()


async def execute(sql: str, params: tuple | dict | None = None) -> None:
    async with get_pool().connection() as conn:
        await conn.execute(sql, params)


async def execute_many(sql: str, rows: list[tuple]) -> int:
    """Run one statement over many parameter sets on a single connection.

    Used by the issue sync. Taking a connection per row meant a network
    round-trip each time, which is slow when the database is a region away.
    """
    if not rows:
        return 0
    async with get_pool().connection() as conn:
        async with conn.cursor() as cur:
            await cur.executemany(sql, rows)
    return len(rows)
