"""GitBounty API.

One FastAPI app, with routes and feature modules. See docs/architecture.md for boundaries.
"""

import asyncio
import logging
import secrets
import asyncpg
from collections.abc import AsyncIterator
from contextlib import asynccontextmanager, suppress

from fastapi import FastAPI, Response
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse, RedirectResponse
from starlette.middleware.sessions import SessionMiddleware

from .auth import router as auth_router
from .auth_stub import warn_if_dev_login_enabled
from .config import settings
from .csrf import CsrfMiddleware
from .observability import RequestLoggingMiddleware, configure as configure_logging
from .ratelimit import RateLimitMiddleware
from .test_auth import is_enabled as test_auth_enabled, router as test_auth_router, warn_if_enabled as warn_if_test_auth_enabled
from . import db
from .db import connect, disconnect, is_configured, pool
from .features.points.router import router as points_router
from .features.points.allocations import router as claims_router
from .routes.issues import router as issues_router
from .routes.maintainer import router as maintainer_router
from .routes.payments import router as payments_router
from .routes.moderation import router as moderation_router
from .routes.github_app import router as github_app_router
from .routes.escrow import router as escrow_router
from .github_app import configured as app_configured
from .services.webhooks import run_worker
from .escrow import signer_address

configure_logging(settings.log_level, json_logs=settings.json_logs)


@asynccontextmanager
async def lifespan(_: FastAPI) -> AsyncIterator[None]:
    warn_if_dev_login_enabled()
    warn_if_test_auth_enabled()
    await connect()
    if not is_configured():
        logging.getLogger(__name__).warning(
            "No DATABASE_URL: endpoints that need the database will answer 503. See backend/dev/README.md."
        )
    worker = asyncio.create_task(run_worker()) if is_configured() and app_configured() else None
    try:
        yield
    finally:
        if worker is not None:
            worker.cancel()
            with suppress(asyncio.CancelledError):
                await worker
        await disconnect()


app = FastAPI(title="GitBounty API", version="0.1.0", lifespan=lifespan)
if not settings.session_secret:
    logging.getLogger(__name__).warning(
        "No SESSION_SECRET: GitHub login is disabled until it is configured."
    )
# Middleware runs in reverse order of registration, so the first one added is the innermost. The order
# below means a request is seen as: logging -> rate limit -> CORS -> session -> CSRF -> the route. The
# rate limiter and CSRF both need the session decoded, so both are added before SessionMiddleware; the
# request logger is added last so it wraps everything and can time and report a rejection too.
app.add_middleware(CsrfMiddleware)
app.add_middleware(RateLimitMiddleware)
app.add_middleware(
    SessionMiddleware,
    secret_key=settings.session_secret or secrets.token_urlsafe(32),
    session_cookie="gitbounty_session",
    # Lax, not None: a cross-site POST must not carry this cookie. Starlette sets HttpOnly itself, so the
    # value is never readable by page JavaScript.
    same_site="lax",
    # Secure in production. Derived from FRONTEND_URL before, which meant a deployment that forgot to
    # update one environment variable silently shipped a cookie sent over plain HTTP.
    https_only=settings.cookies_secure,
    max_age=settings.session_max_age_seconds,
)
app.include_router(auth_router)
app.include_router(points_router)
app.include_router(claims_router)
app.include_router(issues_router)
app.include_router(maintainer_router)
app.include_router(payments_router)
app.include_router(moderation_router)
app.include_router(github_app_router)
app.include_router(escrow_router)
# Mounted only in a test environment. In any other configuration the path is not routed at all, so it
# cannot be reached even with the right header.
if test_auth_enabled():
    app.include_router(test_auth_router)


def declared_methods() -> list[str]:
    """Every HTTP method the app actually routes, plus OPTIONS for preflight.

    Derived rather than written out. The hard-coded list said ["GET", "POST"], and when
    PATCH /api/maintainer/bounties/... was added the browser preflight for it started returning 400 --
    so editing, unpublishing, republishing and archiving a bounty could not work from the website at all,
    while every server-side test passed because TestClient does not preflight. Deriving it means a new
    route cannot reintroduce that.
    """
    methods = {"OPTIONS"}
    for route in app.routes:
        methods.update(getattr(route, "methods", None) or ())
    methods.discard("HEAD")  # implied by GET; listing it adds nothing
    return sorted(methods)


# The website is a separate origin from this API, so the browser needs to be told it may call it. Listed
# origins only -- never "*", which would let any page on the internet make calls as a signed-in user.
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.allowed_origin_list,
    allow_credentials=True,
    allow_methods=declared_methods(),
    # The CSRF token header has to survive preflight. "*" is echoed back by Starlette rather than sent
    # literally, so it stays compatible with allow_credentials.
    allow_headers=["*"],
    # So a browser can read the id and quote it in a bug report.
    expose_headers=["X-Request-ID", "Retry-After", "X-RateLimit-Limit", "X-RateLimit-Window"],
)
# Outermost: every request gets an id, and every outcome -- including one the rate limiter rejected -- is
# logged once with its duration.
app.add_middleware(RequestLoggingMiddleware)



@app.get("/health")
@app.get("/healthz", include_in_schema=False)
def health() -> dict[str, str]:
    """Liveness: the process is running and answering. Checks nothing else, on purpose."""
    return {"status": "ok"}


@app.get("/", include_in_schema=False)
def website() -> RedirectResponse:
    return RedirectResponse(settings.frontend_url)


@app.exception_handler(asyncpg.UndefinedTableError)
async def missing_table(_request, _error) -> JSONResponse:
    return JSONResponse(status_code=503, content={"detail": "Database setup is incomplete. Apply the pending numbered migrations from backend/dev/migrate.py."})


@app.get("/ready")
async def ready(response: Response) -> dict[str, object]:
    """Readiness: whether this instance can actually serve requests.

    Reports each dependency as configured / reachable, and answers 503 when something a request would need
    is not there. Deliberately vague about *why* -- "database: unreachable" is useful to an operator and
    tells an attacker nothing about the host, the driver or the credentials. The exception is never
    included; it goes to the log.
    """
    checks: dict[str, str] = {
        "github_oauth": "configured" if (settings.github_client_id and settings.github_client_secret) else "not configured",
        "session_secret": "configured" if settings.session_secret else "not configured",
        "token_encryption": "configured" if settings.token_encryption_key else "not configured",
    }
    if settings.escrow_enabled:
        key = settings.escrow_signer_private_key.get_secret_value()
        try:
            escrow_valid = bool(
                settings.escrow_contract_address
                and settings.escrow_authorization_signer
                and settings.escrow_deployment_block
                and key
                and signer_address(key).lower() == settings.escrow_authorization_signer.lower()
            )
        except ValueError:
            escrow_valid = False
        checks["escrow"] = "configured" if escrow_valid else "not configured"

    if not is_configured():
        checks["database"] = "unreachable" if db.last_connect_error else "not configured"
    else:
        try:
            async with pool().acquire() as connection:
                complete = await connection.fetchval("""
                    select to_regclass('public.users') is not null
                       and to_regclass('public.reward_allocations') is not null
                       and to_regclass('public.connected_repositories') is not null
                       and to_regclass('public.webhook_deliveries') is not null
                       and to_regclass('public.avax_reward_terms') is not null
                       and to_regclass('public.avax_reward_claims') is not null
                       and to_regclass('public.wallets') is not null
                       and to_regclass('public.avax_payments') is not null
                       and to_regclass('public.avax_payment_receipts') is not null
                       and to_regclass('public.smoothsend_payment_receipts') is not null
                       and to_regclass('public.escrow_reward_terms') is not null
                       and to_regclass('public.escrow_funding_events') is not null
                       and to_regclass('public.escrow_allocations') is not null
                       and to_regclass('public.escrow_vouchers') is not null
                       and to_regclass('public.escrow_chain_events') is not null
                """)
            checks["database"] = "ok" if complete else "schema incomplete"
        except Exception:
            logging.getLogger(__name__).exception("readiness: database check failed")
            checks["database"] = "unreachable"

    ready_now = checks["database"] == "ok" and all(
        value == "configured" for key, value in checks.items() if key != "database"
    )
    if not ready_now:
        response.status_code = 503
    return {"status": "ready" if ready_now else "not ready", "checks": checks}
