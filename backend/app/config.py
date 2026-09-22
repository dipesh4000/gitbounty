"""Configuration, read from the environment only — never hard-coded (rules.md section 5)."""

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    github_client_id: str = ""
    github_client_secret: str = ""
    database_url: str = ""

    # Dev-only stand-in for the login feature, which isn't built yet.
    # See feature-seams.md, seam 1. Empty in any deployed build.
    dev_github_login: str = ""
    dev_github_token: str = ""
    # The stub's stand-in for GitHub's numeric user id. Set it to the real one when working against seeded data,
    # otherwise every sync lands on a separate placeholder user.
    dev_github_id: int = 0


settings = Settings()
