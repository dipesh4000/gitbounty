"""Every HTTP route, gathered into one router for main.py to mount."""

from fastapi import APIRouter

from . import auth, issues, meta

api_router = APIRouter()
api_router.include_router(meta.router)
api_router.include_router(auth.router)
api_router.include_router(issues.router)

__all__ = ["api_router"]
