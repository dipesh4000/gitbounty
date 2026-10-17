"""Security-sensitive configuration defaults and test-only overrides."""

from app import config
from app.config import Settings


def test_defaults_are_isolated_and_safe() -> None:
    settings = Settings()
    assert config._ENV_FILE is None
    assert not any(
        (
            settings.github_client_id,
            settings.github_client_secret,
            settings.session_secret,
            settings.token_encryption_key,
            settings.database_url,
        )
    )
    assert settings.dev_login_stub_enabled is False
    assert settings.escrow_enabled is False
    assert settings.escrow_contract_address == ""
    assert settings.escrow_signer_private_key.get_secret_value() == ""
    assert "*" not in settings.allowed_origin_list


def test_escrow_signer_key_is_redacted() -> None:
    settings = Settings(escrow_signer_private_key="0x" + "11" * 32)
    assert "11" * 32 not in repr(settings)


def test_cors_allowlist_is_trimmed() -> None:
    settings = Settings(allowed_origins=" http://a.example , http://b.example ,, ")
    assert settings.allowed_origin_list == ["http://a.example", "http://b.example"]


def test_github_api_override_requires_exact_test_environment() -> None:
    elsewhere = "http://127.0.0.1:9999"
    for environment in (None, "production", "Test", "testing"):
        kwargs = {"github_api_url": elsewhere}
        if environment is not None:
            kwargs["GITBOUNTY_ENVIRONMENT"] = environment
        assert Settings(**kwargs).github_api == "https://api.github.com"
    assert (
        Settings(
            github_api_url=elsewhere + "/", GITBOUNTY_ENVIRONMENT="test"
        ).github_api
        == elsewhere
    )
