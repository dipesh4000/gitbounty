"""GitBounty API.

One FastAPI app, with each feature in its own module under `features/` so the two people working on it
don't collide. See feature-split.md for who owns what.
"""

import logging
from collections.abc import AsyncIterator
from contextlib import asynccontextmanager

from fastapi import FastAPI

from .auth_stub import warn_if_dev_login_enabled
from .db import connect, disconnect, is_configured
from .features.merged_prs.router import router as merged_prs_router
from .features.points.router import router as points_router

logging.basicConfig(level=logging.INFO)

@asynccontextmanager
async def lifespan(_: FastAPI) -> AsyncIterator[None]:
    warn_if_dev_login_enabled()
    await connect()
    if not is_configured():
        logging.getLogger(__name__).warning(
            "No DATABASE_URL: endpoints that need the database will answer 503. See backend/dev/README.md."
        )
    yield
    await disconnect()


app = FastAPI(title="GitBounty API", version="0.1.0", lifespan=lifespan)
app.include_router(merged_prs_router)
app.include_router(points_router)


@app.get("/health")
def health() -> dict[str, str]:
    """Liveness check. Used to confirm the app is up, nothing more."""
    return {"status": "ok"}
