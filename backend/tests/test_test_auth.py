"""The test-only sign-in path fails closed."""

import pytest

from app import test_auth
from app.config import Settings, settings


def test_test_auth_is_disabled_by_default_and_not_routed() -> None:
    from app.main import app

    assert Settings.model_fields["environment"].default == "production"
    assert Settings.model_fields["test_auth_secret"].default == ""
    assert "/test-auth/session" not in {route.path for route in app.routes}


def test_both_exact_environment_and_long_secret_are_required(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    cases = [
        ("production", "a" * 32, False),
        ("Test", "a" * 32, False),
        ("test", "short", False),
        ("test", "a" * 32, True),
    ]
    for environment, secret, expected in cases:
        monkeypatch.setattr(settings, "environment", environment)
        monkeypatch.setattr(settings, "test_auth_secret", secret)
        assert test_auth.is_enabled() is expected


def test_disabled_or_wrong_secret_returns_404(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(settings, "environment", "production")
    monkeypatch.setattr(settings, "test_auth_secret", "a" * 32)
    with pytest.raises(Exception) as disabled:
        test_auth._authorise("a" * 32)
    assert getattr(disabled.value, "status_code", None) == 404

    monkeypatch.setattr(settings, "environment", "test")
    with pytest.raises(Exception) as wrong:
        test_auth._authorise("b" * 32)
    assert getattr(wrong.value, "status_code", None) == 404
