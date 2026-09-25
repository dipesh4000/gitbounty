"""Configuration, read from the environment only — never hard-coded (rules.md section 5)."""

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    github_client_id: str = ""
    github_client_secret: str = ""
    github_callback_url: str = "http://localhost:8001/auth/github/callback"
    frontend_url: str = "http://localhost:3000"
    session_secret: str = ""
    token_encryption_key: str = ""
    database_url: str = ""

    # Browser origins allowed to call this API. The website is served separately (a static file server in
    # development, a static host in production), so it is always a different origin from this API.
    # Comma-separated. Set it explicitly in a deployed build; never widen it to "*".
    allowed_origins: str = "http://localhost:3000,http://127.0.0.1:3000,http://localhost:8000,http://127.0.0.1:8000,http://localhost:5500,http://127.0.0.1:5500,http://localhost:8080,http://127.0.0.1:8080"


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


settings = Settings()
