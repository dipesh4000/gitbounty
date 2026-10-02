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


def test_the_github_api_host_cannot_be_moved_outside_a_test_environment() -> None:
    """A configurable API host would send every user's token wherever it pointed.

    So the setting is only honoured when GITBOUNTY_ENVIRONMENT is exactly "test". Anywhere else it is the
    real host whatever the variable says.
    """
    elsewhere = "http://127.0.0.1:9999"

    def settings(environment: str | None = None, url: str = elsewhere) -> Settings:
        # The field is read from GITBOUNTY_ENVIRONMENT, never from a bare ENVIRONMENT, so the alias is
        # what a caller (and the environment) must use.
        kwargs = {"github_api_url": url}
        if environment is not None:
            kwargs["GITBOUNTY_ENVIRONMENT"] = environment
        return Settings(**kwargs)

    assert Settings().github_api == "https://api.github.com"
    assert settings().github_api == "https://api.github.com"
    for environment in ("production", "staging", "Test", "", "testing"):
        assert settings(environment).github_api == "https://api.github.com", environment

    assert settings("test").github_api == elsewhere
    # And a trailing slash cannot produce a double slash in a request URL.
    assert settings("test", elsewhere + "/").github_api == elsewhere


def test_a_bare_environment_variable_does_not_unlock_anything() -> None:
    """ENVIRONMENT is a name a host or CI runner may already set. Only GITBOUNTY_ENVIRONMENT counts."""
    import os

    previous = os.environ.get("ENVIRONMENT")
    os.environ["ENVIRONMENT"] = "test"
    try:
        assert Settings().environment == "production"
        assert Settings(github_api_url="http://127.0.0.1:9999").github_api == "https://api.github.com"
    finally:
        if previous is None:
            os.environ.pop("ENVIRONMENT", None)
        else:
            os.environ["ENVIRONMENT"] = previous
