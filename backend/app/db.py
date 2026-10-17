"""Postgres connections during the incremental async SQLAlchemy migration.

Migrated queries use a short-lived AsyncSession. Remaining queries use asyncpg.
Neither connection path creates or alters tables; numbered migrations own the schema.
"""

from __future__ import annotations

import logging

import asyncpg
from sqlalchemy.ext.asyncio import AsyncEngine, AsyncSession, async_sessionmaker, create_async_engine
from sqlalchemy.pool import NullPool

from .config import settings

_pool: asyncpg.Pool | None = None
_engine: AsyncEngine | None = None
_sessions: async_sessionmaker[AsyncSession] | None = None


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
    global _pool, _engine, _sessions, last_connect_error
    if _pool is not None or not settings.database_url:
        return
    try:
        # Vercel can run several instances against a small Supabase session pool.
        # Keep no startup connections and release idle sockets promptly.
        _pool = await asyncpg.create_pool(
            settings.database_url, min_size=0, max_size=2,
            max_inactive_connection_lifetime=10, timeout=15,
        )
        database_url = settings.database_url
        _engine = create_async_engine(
            "postgresql+asyncpg://",
            # Keep asyncpg's DSN options (including sslmode) and keep credentials
            # out of SQLAlchemy's URL and exception representations.
            async_creator=lambda: asyncpg.connect(database_url),
            poolclass=NullPool,
            hide_parameters=True,
        )
        _sessions = async_sessionmaker(_engine, expire_on_commit=False)
        last_connect_error = None
    except Exception as error:
        await disconnect()
        last_connect_error = type(error).__name__
        logging.getLogger(__name__).error(
            "Could not open the database pool (%s). Endpoints that need it will answer 503.",
            type(error).__name__,
        )


async def disconnect() -> None:
    global _pool, _engine, _sessions
    _sessions = None
    if _engine is not None:
        await _engine.dispose()
        _engine = None
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
            "No database connection. Set DATABASE_URL in project-root .env (see backend/dev/README.md)."
        )
    return _pool


def session() -> AsyncSession:
    """Create a session for one operation; callers close it with `async with`."""
    pool()  # Preserve the same safe unavailable-database errors on both paths.
    if _sessions is None:
        raise DatabaseNotConfigured("The database is not reachable right now. Try again shortly.")
    return _sessions()
