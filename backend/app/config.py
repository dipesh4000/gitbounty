"""Configuration, read once from the environment.

Every value comes from an environment variable. Nothing here has a default that
would silently work in production, so a missing variable fails loudly at startup
rather than halfway through a request.
"""

from __future__ import annotations

import os
from dataclasses import dataclass

from dotenv import load_dotenv

# Loads backend/.env when running locally. In production the host supplies the
# environment directly and there is no file to load.
load_dotenv()

GITHUB_API_URL = "https://api.github.com"
GITHUB_OAUTH_AUTHORIZE_URL = "https://github.com/login/oauth/authorize"
GITHUB_OAUTH_TOKEN_URL = "https://github.com/login/oauth/access_token"

# The only scope we ask for. Reading public issues and a user's public merged
# pull requests needs nothing more (rules.md section 5: fewest permissions).
GITHUB_OAUTH_SCOPE = "read:user"


class ConfigError(RuntimeError):
    """Raised when a required environment variable is missing."""


def _required(name: str) -> str:
    value = os.environ.get(name, "").strip()
    if not value:
        raise ConfigError(
            f"{name} is not set. Copy backend/.env.example to backend/.env and fill it in."
        )
    return value


@dataclass(frozen=True)
class Settings:
    database_url: str
    github_client_id: str
    github_client_secret: str
    github_callback_url: str
    frontend_url: str
    session_secret: str
    token_encryption_key: str


_settings: Settings | None = None


def get_settings() -> Settings:
    """Return the settings, reading the environment the first time it is called."""
    global _settings
    if _settings is None:
        _settings = Settings(
            database_url=_required("DATABASE_URL"),
            github_client_id=_required("GITHUB_CLIENT_ID"),
            github_client_secret=_required("GITHUB_CLIENT_SECRET"),
            github_callback_url=_required("GITHUB_CALLBACK_URL"),
            frontend_url=os.environ.get("FRONTEND_URL", "http://localhost:8000").rstrip("/"),
            session_secret=_required("SESSION_SECRET"),
            token_encryption_key=_required("TOKEN_ENCRYPTION_KEY"),
        )
    return _settings
