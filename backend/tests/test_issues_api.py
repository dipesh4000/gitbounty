"""Public issue-board queries used by the website and extension."""

from .test_maintainer_api import query
from .test_points_api import publish_bounty


def test_board_filters_an_exact_repository_without_exposing_tokens(api) -> None:
    publish_bounty("org/app", 1, 40)
    publish_bounty("org/app-extra", 2, 80)
    response = api.get("/api/issues", params={"repository": "ORG/APP"})
    assert response.status_code == 200
    items = response.json()["items"]
    assert [(item["repository"], item["points"]) for item in items] == [("org/app", 40)]
    assert items[0]["posted_by"] == "the-maintainer"
    assert "github_access_token" not in items[0]


def test_board_filters_and_pages_only_open_published_rewards(api) -> None:
    publish_bounty("org/app", 1, 40, category="backend")
    publish_bounty("org/app", 2, 50, category="docs")
    publish_bounty("org/app", 3, 60, status="unpublished")
    publish_bounty("org/app", 4, 70, status="archived")
    publish_bounty("org/app", 5, 80)
    query("update issues set state = 'closed' where number = 5")
    query("update issues set language = 'Python', issue_updated_at = now() where number = 1")
    first = api.get("/api/issues", params={"per_page": 1}).json()
    second = api.get("/api/issues", params={"per_page": 1, "page": 2}).json()
    assert (first["items"][0]["number"], first["has_more"]) == (1, True)
    assert (second["items"][0]["number"], second["has_more"]) == (2, False)
    filtered = api.get("/api/issues", params={"language": "PYTHON", "q": "Issue 1", "category": "backend"})
    assert [item["number"] for item in filtered.json()["items"]] == [1]
    assert api.get("/api/issues", params={"q": "' OR 1=1 --"}).json()["items"] == []


def test_board_orders_by_repository_stars(api) -> None:
    publish_bounty("org/small", 1, 40)
    publish_bounty("org/large", 2, 40)
    query("update repositories set stargazers_count = 100 where full_name = 'org/large'")
    body = api.get("/api/issues", params={"sort": "stars"}).json()
    assert [item["repository"] for item in body["items"]] == ["org/large", "org/small"]


def test_board_read_does_not_disable_transactions_for_later_sessions(api) -> None:
    from sqlalchemy import literal, select
    from app.db import session
    from app.routes.issues import _read

    async def check():
        assert (await _read(select(literal(1))))[0]["anon_1"] == 1
        async with session() as db_session:
            await db_session.execute(select(literal(1)))
            connection = await db_session.connection()
            raw = await connection.get_raw_connection()
            assert raw.driver_connection.is_in_transaction()

    api.portal.call(check)


def test_beginner_filter_uses_labels_before_pagination_and_matches_case(api):
    for number in range(1, 5):
        publish_bounty("org/start", number, 40)
    query("update issues set labels = ARRAY['Good First Issue'] where number = 2")
    query("update issues set labels = ARRAY['good-first-contribution'] where number = 3")
    query("update issues set labels = ARRAY['good first issue'] where number = 4")
    query("update issue_points set status = 'archived' where issue_number = 4")
    first = api.get("/api/issues", params={"beginner": True, "per_page": 1}).json()
    second = api.get("/api/issues", params={"beginner": True, "per_page": 1, "page": 2}).json()
    assert [item["number"] for item in first["items"]] == [2]
    assert first["has_more"] is True
    assert [item["number"] for item in second["items"]] == [3]
    assert second["has_more"] is False
