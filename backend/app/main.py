"""GitBounty API.

One FastAPI app, with each feature in its own module under `features/` so the two people working on it
don't collide. See feature-split.md for who owns what.
"""

import logging
from collections.abc import AsyncIterator
from contextlib import asynccontextmanager

from fastapi import FastAPI

from .auth_stub import warn_if_dev_login_enabled
from .features.merged_prs.router import router as merged_prs_router

logging.basicConfig(level=logging.INFO)

@asynccontextmanager
async def lifespan(_: FastAPI) -> AsyncIterator[None]:
    warn_if_dev_login_enabled()
    yield


app = FastAPI(title="GitBounty API", version="0.1.0", lifespan=lifespan)
app.include_router(merged_prs_router)


@app.get("/health")
def health() -> dict[str, str]:
    """Liveness check. Used to confirm the app is up, nothing more."""
    return {"status": "ok"}
