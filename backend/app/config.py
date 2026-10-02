"""Configuration, read from the environment only — never hard-coded (rules.md section 5)."""

import os

from pydantic import Field
from pydantic_settings import BaseSettings, SettingsConfigDict

# Which dotenv file to read, if any. Normally `.env` next to this package. The test suite sets
# GITBOUNTY_ENV_FILE="" so that a result never depends on what a particular developer happens to have in
# their `.env` -- a suite that passes on one machine and fails on another is not a safety net.
_ENV_FILE = os.environ.get("GITBOUNTY_ENV_FILE", ".env") or None


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=_ENV_FILE, extra="ignore", env_prefix="")

    github_client_id: str = ""
    github_client_secret: str = ""
    github_callback_url: str = "http://localhost:8001/auth/github/callback"
    # Where GitHub's REST API lives. Overridden only by the end-to-end test, which points it at a local
    # stand-in so the whole flow can run without a GitHub account and without touching github.com.
    # Anything other than the real host is refused unless GITBOUNTY_ENVIRONMENT is "test".
    github_api_url: str = "https://api.github.com"
    frontend_url: str = "http://localhost:3000"
    session_secret: str = ""
    token_encryption_key: str = ""
    database_url: str = ""

    # Browser origins allowed to call this API. The website is served separately (a static file server in
    # development, a static host in production), so it is always a different origin from this API.
    # Comma-separated. Set it explicitly in a deployed build; never widen it to "*".
    allowed_origins: str = "http://localhost:3000,http://127.0.0.1:3000,http://localhost:8000,http://127.0.0.1:8000,http://localhost:5500,http://127.0.0.1:5500,http://localhost:8080,http://127.0.0.1:8080"


    # Cookie and session policy. `secure_cookies` must be true in anything deployed: it was derived from
    # whether FRONTEND_URL started with https://, which meant one forgotten environment variable silently
    # shipped a session cookie over plain HTTP.
    secure_cookies: bool | None = None
    # Two weeks. A session cookie is a bearer credential, so this is a real expiry, not a formality.
    session_max_age_seconds: int = 60 * 60 * 24 * 14

    #: Log level for everything GitBounty logs.
    log_level: str = "INFO"
    #: One JSON object per line. Turn it off locally if a human is reading the terminal.
    json_logs: bool = True

    # Which environment this is. "production" by default, so an unset or mistyped value is never a test
    # environment. Only the exact string "test" unlocks the test sign-in path in app/test_auth.py, and
    # only together with TEST_AUTH_SECRET.
    # Named GITBOUNTY_ENVIRONMENT rather than the obvious ENVIRONMENT on purpose: a bare ENVIRONMENT is a
    # common variable that a host or a CI runner may already set to something, and "impossible to enable
    # by accident" has to mean a name nothing else is likely to use.
    environment: str = Field(default="production", validation_alias="GITBOUNTY_ENVIRONMENT")
    #: The shared secret an automated test presents to create a session. Must be >= 16 characters to have
    #: any effect at all. Never set outside a test environment.
    test_auth_secret: str = Field(default="", validation_alias="GITBOUNTY_TEST_AUTH_SECRET")

    # Explicitly gated local fallback for backend work without OAuth.
    dev_login_stub_enabled: bool = False
    dev_github_login: str = ""
    dev_github_token: str = ""
    # The stub's stand-in for GitHub's numeric user id. Set it to the real one when working against seeded data,
    # otherwise every sync lands on a separate placeholder user.
    dev_github_id: int = 0


    @property
    def allowed_origin_list(self) -> list[str]:
        return [origin.strip() for origin in self.allowed_origins.split(",") if origin.strip()]

    @property
    def github_api(self) -> str:
        """The GitHub API base, with the real host enforced outside a test environment.

        A configurable API host is exactly the kind of setting that would be catastrophic if it could be
        pointed somewhere else in a deployed build -- every user's token would be sent there. So it is
        only honoured when GITBOUNTY_ENVIRONMENT is "test"; anywhere else it is the real host whatever the
        variable says.
        """
        if self.environment == "test":
            return self.github_api_url.rstrip("/")
        return "https://api.github.com"

    @property
    def cookies_secure(self) -> bool:
        """Whether the session cookie is marked Secure.

        Set SECURE_COOKIES explicitly in a deployed build. Unset, it falls back to whether the site is
        served over https, which is right locally and is the old behaviour.
        """
        if self.secure_cookies is not None:
            return self.secure_cookies
        return self.frontend_url.startswith("https://")


settings = Settings()
