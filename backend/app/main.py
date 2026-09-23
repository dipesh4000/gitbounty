"""The GitBounty API.

Run locally from the backend/ folder:

    uvicorn app.main:app --reload --port 8001
"""

from __future__ import annotations

from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from starlette.middleware.sessions import SessionMiddleware

from .auth import router as auth_router
from .config import get_settings
from .db import close_pool, fetch_one, open_pool
from .issues import router as issues_router


@asynccontextmanager
async def lifespan(app: FastAPI):
    await open_pool()
    try:
        yield
    finally:
        await close_pool()


def create_app() -> FastAPI:
    settings = get_settings()
    app = FastAPI(title="GitBounty API", version="0.1.0", lifespan=lifespan)

    # Signed, http-only session cookie holding nothing but the user's id.
    app.add_middleware(
        SessionMiddleware,
        secret_key=settings.session_secret,
        session_cookie="gitbounty_session",
        same_site="lax",
        https_only=False,  # set True once the app is served over HTTPS
        max_age=60 * 60 * 24 * 14,
    )

    # The static site is served from a different port in development, so it
    # needs to be allowed explicitly and with credentials for the cookie.
    app.add_middleware(
        CORSMiddleware,
        allow_origins=[settings.frontend_url],
        allow_credentials=True,
        allow_methods=["GET", "POST"],
        allow_headers=["*"],
    )

    @app.get("/health", tags=["meta"])
    async def health() -> dict:
        """Liveness check that also proves the database is reachable."""
        try:
            await fetch_one("select 1 as ok")
            database = "ok"
        except Exception as exc:  # surfaced, not swallowed
            database = f"error: {exc.__class__.__name__}"
        return {"status": "ok", "database": database}

    app.include_router(auth_router)
    app.include_router(issues_router)

    return app


app = create_app()
