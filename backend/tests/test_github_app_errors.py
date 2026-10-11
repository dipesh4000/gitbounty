import pytest
from fastapi import HTTPException

from app import github_app
from app.config import settings


def test_missing_app_key_has_actionable_error(monkeypatch, tmp_path):
    for name, value in {"github_app_id": "123", "github_app_slug": "test-app",
                        "github_app_private_key_path": str(tmp_path / "missing.pem"),
                        "github_webhook_secret": "test-secret"}.items():
        monkeypatch.setattr(settings, name, value)
    with pytest.raises(HTTPException) as caught:
        github_app.app_jwt()
    assert caught.value.status_code == 503
    assert "server operator" in caught.value.detail
    assert str(tmp_path) not in caught.value.detail
