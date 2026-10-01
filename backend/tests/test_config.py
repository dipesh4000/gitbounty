"""Configuration, and the one guarantee the rest of the suite depends on."""

from __future__ import annotations

from app import config
from app.config import Settings


def test_the_suite_does_not_read_a_developers_env_file() -> None:
    """Otherwise a test passes on one machine and fails on another for reasons nobody can see.

    conftest.py sets GITBOUNTY_ENV_FILE="" at import time. If that ever stops working, every assertion
    about a default -- the CORS allowlist especially -- quietly starts testing somebody's local .env.
    """
    assert config._ENV_FILE is None


def test_defaults_are_safe_when_nothing_is_configured() -> None:
    """An unconfigured build must not fall back to anything permissive."""
    settings = Settings()
    assert settings.github_client_id == ""
    assert settings.github_client_secret == ""
    assert settings.session_secret == ""
    assert settings.token_encryption_key == ""
    assert settings.database_url == ""
    assert settings.dev_login_stub_enabled is False
    assert "*" not in settings.allowed_origin_list


def test_the_cors_allowlist_is_parsed_and_trimmed() -> None:
    settings = Settings(allowed_origins=" http://a.example , http://b.example ,, ")
    assert settings.allowed_origin_list == ["http://a.example", "http://b.example"]
