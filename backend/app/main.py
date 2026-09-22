"""GitBounty API.

One FastAPI app, with each feature in its own module under `features/` so the two people working on it
don't collide. See feature-split.md for who owns what.
"""

import logging
from collections.abc import AsyncIterator
from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from .auth_stub import warn_if_dev_login_enabled
from .config import settings
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
# The website is a separate origin from this API, so the browser needs to be told it may call it. Listed
# origins only -- never "*", which would let any page on the internet make calls as a signed-in user.
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.allowed_origin_list,
    allow_credentials=True,
    allow_methods=["GET", "POST"],
    allow_headers=["*"],
)

app.include_router(merged_prs_router)
app.include_router(points_router)


@app.get("/health")
def health() -> dict[str, str]:
    """Liveness check. Used to confirm the app is up, nothing more."""
    return {"status": "ok"}
