"""Liveness."""

from __future__ import annotations

from fastapi import APIRouter

from ..db import fetch_one
from ..models import Health

router = APIRouter(tags=["meta"])


@router.get("/health", response_model=Health)
async def health() -> Health:
    """Liveness check that also proves the database is reachable."""
    try:
        await fetch_one("select 1 as ok")
        database = "ok"
    except Exception as exc:  # surfaced, not swallowed
        database = f"error: {exc.__class__.__name__}"
    return Health(status="ok", database=database)
