"""Configuration, read from the environment only — never hard-coded (rules.md section 5)."""

import os
from pathlib import Path
from typing import Literal

from pydantic import Field, SecretStr
from pydantic_settings import BaseSettings, SettingsConfigDict

# Which dotenv file to read, if any. Normally the project-root `.env`. The test suite sets
# GITBOUNTY_ENV_FILE="" so that a result never depends on what a particular developer happens to have in
# their `.env` -- a suite that passes on one machine and fails on another is not a safety net.
_ENV_FILE = os.environ.get("GITBOUNTY_ENV_FILE", str(Path(__file__).resolve().parents[2] / ".env")) or None


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=_ENV_FILE, extra="ignore", env_prefix="")

    github_app_id: str = ""
    github_app_slug: str = ""
    github_app_private_key_path: str = ""
    github_webhook_secret: str = ""
    avax_payments_enabled: bool = False
    payment_mode: Literal["avax_mainnet", "usdc_fuji"] = "avax_mainnet"
    smoothsend_public_key: str = ""
    smoothsend_secret_key: str = ""
    smoothsend_fee_limit_usdc: str = "0.1"
    avax_rpc_url: str = "https://api.avax.network/ext/bc/C/rpc"

    # Phase 2 escrow. The signer key is a backend bearer secret and must never reach a response or log.
    escrow_enabled: bool = False
    escrow_execution_mode: Literal["direct", "direct_with_optional_aa", "sponsored"] = "direct"
    escrow_chain_id: int = 43113
    escrow_rpc_url: str = "https://api.avax-test.network/ext/bc/C/rpc"
    escrow_token_address: str = "0x5425890298aed601595a70ab815c96711a31bc65"
    escrow_contract_address: str = ""
    escrow_authorization_signer: str = ""
    escrow_signer_private_key: SecretStr = SecretStr("")
    escrow_deployment_block: int = 0
    # Custody is opt-in; keep this independent from OAuth token encryption.
    managed_wallets_enabled: bool = False
    wallet_encryption_key: SecretStr = SecretStr("")

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

    # Who may review and resolve moderation flags, as a comma-separated list of **stable GitHub numeric
    # ids** -- not logins, which a person can change, and not internal row ids, which differ per database.
    #
    # Empty by default, and an empty list means **nobody is an administrator**. GitBounty has no
    # trustworthy administrator model of its own -- no roles table, no invitation flow, no way to verify
    # that whoever first signed in should have power over everybody else's points -- so the honest
    # arrangement is a list the owner writes down, and failing closed when they have not.
    admin_github_ids: str = ""

    # Multiplies every rate limit. **Only honoured when GITBOUNTY_ENVIRONMENT is "test"**, and 1 anywhere
    # else whatever this says -- a knob that could loosen production limits from the environment would
    # defeat the point of having them. The end-to-end test needs it because one journey legitimately runs
    # nine synchronisations in a few seconds, which a person never would.
    rate_limit_scale: int = 1

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
    def admin_github_id_list(self) -> frozenset[int]:
        """The administrators, as GitHub numeric ids. Anything unparseable is dropped, not guessed.

        A malformed entry must never widen the set: an id that cannot be read as an integer is ignored,
        so `ADMIN_GITHUB_IDS="12,,oops,34"` grants 12 and 34 and nothing else.
        """
        found: set[int] = set()
        for part in self.admin_github_ids.split(","):
            part = part.strip()
            if part.isdigit():
                found.add(int(part))
        return frozenset(found)

    @property
    def rate_limit_multiplier(self) -> int:
        """How much to multiply every rate limit by. Always 1 outside a test environment."""
        if self.environment == "test":
            return max(1, self.rate_limit_scale)
        return 1

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
