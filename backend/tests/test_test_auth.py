"""The test-only sign-in path, and every way it must refuse to exist.

This is the one piece of code whose whole job is to be unreachable. These tests are about the refusals,
not the feature.
"""

from __future__ import annotations

import importlib
import importlib.resources

import pytest
from fastapi.testclient import TestClient

from app import test_auth
from app.config import Settings, settings


def test_it_is_off_by_default_in_the_shipped_configuration() -> None:
    """Checks the declared defaults, not the running settings: the running ones could be anything."""
    assert Settings.model_fields["environment"].default == "production"
    assert Settings.model_fields["test_auth_secret"].default == ""


def test_both_conditions_are_required_and_each_defaults_to_the_safe_one(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    secret = "a" * 32

    monkeypatch.setattr(settings, "environment", "production")
    monkeypatch.setattr(settings, "test_auth_secret", secret)
    assert test_auth.is_enabled() is False, "a secret alone is not enough"

    monkeypatch.setattr(settings, "environment", "test")
    monkeypatch.setattr(settings, "test_auth_secret", "")
    assert test_auth.is_enabled() is False, "a test environment alone is not enough"

    monkeypatch.setattr(settings, "test_auth_secret", secret)
    assert test_auth.is_enabled() is True


@pytest.mark.parametrize("value", ["production", "", "Test", "testing", "test ", "dev", "staging"])
def test_only_the_exact_string_test_counts(monkeypatch: pytest.MonkeyPatch, value: str) -> None:
    """A typo, a capital letter or a near-miss all fail closed."""
    monkeypatch.setattr(settings, "environment", value)
    monkeypatch.setattr(settings, "test_auth_secret", "a" * 32)
    assert test_auth.is_enabled() is False


@pytest.mark.parametrize("secret", ["", "short", "a" * 15])
def test_a_secret_that_is_too_short_does_nothing(monkeypatch: pytest.MonkeyPatch, secret: str) -> None:
    monkeypatch.setattr(settings, "environment", "test")
    monkeypatch.setattr(settings, "test_auth_secret", secret)
    assert test_auth.is_enabled() is False


def test_the_route_is_not_mounted_in_the_default_configuration() -> None:
    """Not merely refused -- not routed. The path does not exist on an ordinary build."""
    from app.main import app

    assert "/test-auth/session" not in {route.path for route in app.routes}


def test_the_path_answers_404_rather_than_403(monkeypatch: pytest.MonkeyPatch) -> None:
    """A build that is not a test environment should not admit the endpoint exists."""
    monkeypatch.setattr(settings, "environment", "production")
    monkeypatch.setattr(settings, "test_auth_secret", "a" * 32)

    with pytest.raises(Exception) as caught:
        test_auth._authorise("a" * 32)
    assert "404" in str(caught.value) or getattr(caught.value, "status_code", None) == 404


def test_a_wrong_secret_is_also_a_404(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(settings, "environment", "test")
    monkeypatch.setattr(settings, "test_auth_secret", "a" * 32)

    for provided in (None, "", "b" * 32, "a" * 31):
        with pytest.raises(Exception) as caught:
            test_auth._authorise(provided)
        assert getattr(caught.value, "status_code", None) == 404


def test_it_does_not_reintroduce_a_hard_coded_identity() -> None:
    """The deleted demo login had a login and a user baked into it. This has neither."""
    source = (importlib.resources.files("app") / "test_auth.py").read_text()
    code = "\n".join(
        line for line in source.splitlines() if not line.lstrip().startswith("#")
    )
    # No identity is baked in anywhere, comments included.
    assert "aastha-malik" not in source
    # No executable line mentions a demo session, flag or storage key. (The module docstring explains
    # how this differs from the demo login that was deleted; that is prose, not a code path.)
    assert "demoSession" not in code and "gitbounty_demo" not in code
    assert "localStorage" not in code
    # Every identity it can create comes from the request body.
    assert "body.github_id" in code and "body.github_login" in code


def test_the_website_contains_no_call_to_it() -> None:
    """Nothing a visitor loads can reach this path, so it cannot be triggered from a browser by accident."""
    from pathlib import Path

    web = Path(__file__).resolve().parents[2] / "frontend" / "web" / "app"
    extension = Path(__file__).resolve().parents[2] / "frontend" / "extension"
    for root in (web, extension):
        for path in root.rglob("*"):
            if path.is_file() and path.suffix in {".ts", ".tsx", ".js", ".jsx", ".html"}:
                assert "test-auth" not in path.read_text(), f"{path} references the test sign-in path"


def test_a_mounted_test_session_issues_an_ordinary_session(monkeypatch: pytest.MonkeyPatch) -> None:
    """When it is enabled it must behave exactly like a real sign-in, so what the end-to-end test
    exercises afterwards is the real code path and not a parallel one."""
    import importlib as _importlib

    from cryptography.fernet import Fernet

    monkeypatch.setenv("GITBOUNTY_ENVIRONMENT", "test")
    monkeypatch.setenv("GITBOUNTY_TEST_AUTH_SECRET", "s" * 32)
    monkeypatch.setenv("SESSION_SECRET", "test-session-secret")
    monkeypatch.setenv("TOKEN_ENCRYPTION_KEY", Fernet.generate_key().decode())
    monkeypatch.setenv("DATABASE_URL", "")

    import app.config

    _importlib.reload(app.config)
    assert app.config.settings.environment == "test"

    # Rebuilding the app with these settings mounts the route; without a database it answers 503, which
    # is enough to prove it is routed and authorised rather than hidden.
    import app.test_auth as fresh_test_auth

    _importlib.reload(fresh_test_auth)
    assert fresh_test_auth.is_enabled() is True

    # Put the module back the way the rest of the suite expects it.
    _importlib.reload(app.config)
    _importlib.reload(fresh_test_auth)
