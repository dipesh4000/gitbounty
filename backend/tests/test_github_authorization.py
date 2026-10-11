"""Rejected OAuth credentials must lead to reauthorization, not a gateway retry."""

import httpx
import pytest
import respx

from app import github
from app.routes.maintainer import _github_error


@pytest.mark.asyncio
@respx.mock
@pytest.mark.parametrize("operation,path", [
    (lambda: github.get_repo("invalid-token", "owner/repo"), "/repos/owner/repo"),
    (lambda: github.list_user_repositories("invalid-token", "owner"), "/users/owner/repos"),
    (lambda: github.list_repo_issues("invalid-token", "owner/repo"), "/repos/owner/repo/issues"),
    (lambda: github.list_authorized_repositories("invalid-token"), "/user/repos"),
])
async def test_rejected_credentials_require_sign_in(operation, path):
    respx.get(f"https://api.github.com{path}").mock(return_value=httpx.Response(401))
    with pytest.raises(github.GitHubAuthError) as caught:
        await operation()
    response = _github_error(caught.value)
    assert response.status_code == 401
    assert response.detail == "Sign in with GitHub again."
    assert "invalid-token" not in str(caught.value)


def test_transient_failures_still_retry_and_rate_limits_keep_the_wait():
    assert _github_error(github.GitHubError("server failure")).status_code == 502
    limited = _github_error(github.RateLimited(25))
    assert limited.status_code == 429
    assert limited.headers == {"Retry-After": "25"}
