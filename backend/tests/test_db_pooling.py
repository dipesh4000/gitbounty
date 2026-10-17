from unittest.mock import AsyncMock, patch

from sqlalchemy.pool import NullPool

from app import db


async def test_serverless_connections_do_not_hold_two_large_idle_pools(monkeypatch):
    monkeypatch.setattr(db.settings, "database_url", "postgresql://fixture/fixture")
    monkeypatch.setattr(db, "_pool", None)
    fake_pool = AsyncMock()
    with patch.object(db.asyncpg, "create_pool", AsyncMock(return_value=fake_pool)) as create_pool, \
         patch.object(db, "create_async_engine") as create_engine, \
         patch.object(db, "async_sessionmaker"):
        create_engine.return_value.dispose = AsyncMock()
        try:
            await db.connect()
            assert create_pool.call_args.kwargs["min_size"] == 0
            assert create_pool.call_args.kwargs["max_size"] == 2
            assert create_pool.call_args.kwargs["max_inactive_connection_lifetime"] == 10
            assert create_engine.call_args.kwargs["poolclass"] is NullPool
        finally:
            await db.disconnect()
