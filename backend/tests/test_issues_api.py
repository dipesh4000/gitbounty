"""Public issue-board query behavior used by the website and browser extension."""

import asyncio

from app.routes import issues


def test_browse_issues_filters_an_exact_repository(monkeypatch) -> None:
    captured: dict[str, object] = {}

    async def fake_fetch_all(sql: str, *args):
        captured["sql"] = sql
        captured["args"] = args
        return []

    monkeypatch.setattr(issues, "fetch_all", fake_fetch_all)

    result = asyncio.run(issues.browse_issues(
        category=None,
        language=None,
        q=None,
        repository="aasha-malik/gitbounty",
        sort="updated",
        page=1,
        per_page=100,
    ))

    assert result.items == []
    assert "lower(r.full_name) = lower($4)" in captured["sql"]
    assert captured["args"] == (None, None, None, "aasha-malik/gitbounty", 101, 0)
