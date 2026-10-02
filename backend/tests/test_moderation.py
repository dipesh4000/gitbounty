"""Moderation: who may do it, and that history survives it.

The two things worth protecting are that the feature fails closed when nobody is configured as an
administrator, and that resolving a flag never edits or deletes an award.
"""

from __future__ import annotations

import asyncio

import asyncpg
import httpx
import pytest
import respx
from fastapi.testclient import TestClient

from app.config import Settings, settings
from app.routes.moderation import is_admin

from .conftest import API_TEST_DATABASE_URL, DEV_LOGIN
from .test_github import SEARCH_URL, search_item
from .test_points_api import files_url, publish_bounty, sync

ADMIN_GITHUB_ID = 4242


def query(sql: str, *args: object) -> list[asyncpg.Record]:
    async def run():
        connection = await asyncpg.connect(API_TEST_DATABASE_URL)
        try:
            return await connection.fetch(sql, *args)
        finally:
            await connection.close()

    return asyncio.run(run())


@pytest.fixture
def admin(monkeypatch: pytest.MonkeyPatch) -> None:
    """Make the signed-in development user an administrator, by GitHub numeric id."""
    monkeypatch.setattr(settings, "dev_github_id", ADMIN_GITHUB_ID)
    monkeypatch.setattr(settings, "admin_github_ids", str(ADMIN_GITHUB_ID))


def flag_body(**overrides) -> dict:
    return {
        "subject_kind": "bounty",
        "bounty_repo_full_name": "org/a",
        "bounty_issue_number": 12,
        "reason": "Two accounts appear to be awarding each other points for trivial changes.",
        **overrides,
    }


# --- the administrator model ----------------------------------------------


def test_nobody_is_an_administrator_by_default() -> None:
    """An empty list is not "everybody"; it is nobody. A feature that can take points away must fail
    closed when it has not been configured."""
    assert Settings().admin_github_ids == ""
    assert Settings().admin_github_id_list == frozenset()


def test_the_list_is_parsed_from_stable_numeric_ids() -> None:
    assert Settings(admin_github_ids="12,34").admin_github_id_list == frozenset({12, 34})
    assert Settings(admin_github_ids=" 12 , 34 ").admin_github_id_list == frozenset({12, 34})


def test_a_malformed_entry_is_dropped_and_never_widens_the_set() -> None:
    assert Settings(admin_github_ids="12,,oops,-5,34").admin_github_id_list == frozenset({12, 34})
    assert Settings(admin_github_ids="octocat").admin_github_id_list == frozenset()
    assert Settings(admin_github_ids=",,,").admin_github_id_list == frozenset()


def test_a_login_is_never_accepted_in_place_of_an_id(monkeypatch: pytest.MonkeyPatch) -> None:
    """A login can be changed by its owner; a numeric id cannot."""
    from app.auth import CurrentUser

    monkeypatch.setattr(settings, "admin_github_ids", "octocat")
    assert is_admin(CurrentUser(id=1, github_id=99, github_login="octocat", github_token="t")) is False


def test_membership_is_by_id_not_by_name(monkeypatch: pytest.MonkeyPatch) -> None:
    from app.auth import CurrentUser

    monkeypatch.setattr(settings, "admin_github_ids", "4242")
    assert is_admin(CurrentUser(id=1, github_id=4242, github_login="anything", github_token="t")) is True
    assert is_admin(CurrentUser(id=2, github_id=4243, github_login="anything", github_token="t")) is False


# --- unauthorized access --------------------------------------------------


def test_reviewing_flags_is_refused_when_no_administrator_is_configured(api: TestClient) -> None:
    assert settings.admin_github_id_list == frozenset()

    response = api.get("/api/moderation/flags")

    assert response.status_code == 403
    assert "administrators" in response.json()["detail"]


def test_resolving_is_refused_when_no_administrator_is_configured(api: TestClient) -> None:
    response = api.post("/api/moderation/flags/1/resolve",
                        json={"resolution": "dismissed", "reason": "Looks fine to me, honestly."})
    assert response.status_code == 403


def test_an_ordinary_signed_in_user_cannot_review_or_resolve(
    api: TestClient, monkeypatch: pytest.MonkeyPatch
) -> None:
    """Somebody else is an administrator; this user is not."""
    monkeypatch.setattr(settings, "admin_github_ids", "999999")

    assert api.get("/api/moderation/flags").status_code == 403
    assert api.post("/api/moderation/flags/1/resolve",
                    json={"resolution": "upheld", "reason": "I would like these points, please."}
                    ).status_code == 403


def test_an_ordinary_user_may_still_report(api: TestClient) -> None:
    """Reporting is open; acting on a report is not."""
    response = api.post("/api/moderation/flags", json=flag_body())

    assert response.status_code == 201
    assert response.json()["status"] == "open"
    assert response.json()["reporter_login"] == DEV_LOGIN


# --- reporting ------------------------------------------------------------


def test_a_report_must_say_which_thing_it_is_about(api: TestClient) -> None:
    response = api.post("/api/moderation/flags", json={
        "subject_kind": "bounty",
        "reason": "Something is wrong here but I will not say what.",
    })
    assert response.status_code == 400
    assert "which one" in response.json()["detail"]


def test_a_report_needs_a_reason_of_substance(api: TestClient) -> None:
    assert api.post("/api/moderation/flags", json=flag_body(reason="bad")).status_code == 422
    assert api.post("/api/moderation/flags", json=flag_body(reason="")).status_code == 422


def test_a_report_changes_nothing_by_itself(api: TestClient) -> None:
    """An automatic consequence for an unreviewed report would be a denial-of-service tool pointed at
    other contributors."""
    api.post("/api/moderation/flags", json=flag_body())

    assert query("select count(*) as n from points_ledger")[0]["n"] == 0
    assert api.get("/api/issues").json()["items"] == []  # nothing hidden either


def test_a_report_against_a_ledger_entry_that_does_not_exist_is_a_404(api: TestClient) -> None:
    response = api.post("/api/moderation/flags", json={
        "subject_kind": "ledger_entry", "ledger_entry_id": 999999,
        "reason": "This award looks like it was farmed by two cooperating accounts.",
    })
    assert response.status_code == 404


# --- resolving ------------------------------------------------------------


def test_an_administrator_sees_open_flags(api: TestClient, admin: None) -> None:
    api.post("/api/moderation/flags", json=flag_body())

    body = api.get("/api/moderation/flags").json()

    assert body["total"] == 1
    assert body["items"][0]["subject_kind"] == "bounty"
    assert body["items"][0]["status"] == "open"


def test_dismissing_records_who_and_why_and_moves_nothing(api: TestClient, admin: None) -> None:
    flag_id = api.post("/api/moderation/flags", json=flag_body()).json()["id"]

    response = api.post(f"/api/moderation/flags/{flag_id}/resolve", json={
        "resolution": "dismissed",
        "reason": "Checked the two accounts; they work at different companies on unrelated code.",
    })

    body = response.json()
    assert body["status"] == "dismissed"
    assert body["resolution"] == "dismissed"
    assert body["moderator_login"] == DEV_LOGIN
    assert body["resolved_at"] is not None
    assert "different companies" in body["resolution_reason"]
    assert body["resolution_ledger_entry_id"] is None
    assert query("select count(*) as n from points_ledger")[0]["n"] == 0


def test_a_resolution_needs_a_reason(api: TestClient, admin: None) -> None:
    flag_id = api.post("/api/moderation/flags", json=flag_body()).json()["id"]

    assert api.post(f"/api/moderation/flags/{flag_id}/resolve",
                    json={"resolution": "dismissed", "reason": "no"}).status_code == 422


def test_a_flag_cannot_be_resolved_twice(api: TestClient, admin: None) -> None:
    flag_id = api.post("/api/moderation/flags", json=flag_body()).json()["id"]
    api.post(f"/api/moderation/flags/{flag_id}/resolve",
             json={"resolution": "dismissed", "reason": "Checked it, nothing to see here at all."})

    second = api.post(f"/api/moderation/flags/{flag_id}/resolve",
                      json={"resolution": "upheld", "reason": "Changed my mind about this one entirely."})

    assert second.status_code == 409
    assert "already resolved" in second.json()["detail"]


def test_resolving_a_flag_that_does_not_exist_is_a_404(api: TestClient, admin: None) -> None:
    assert api.post("/api/moderation/flags/999999/resolve",
                    json={"resolution": "dismissed", "reason": "There is nothing here to dismiss."}
                    ).status_code == 404


# --- withdrawing an award, without rewriting history ----------------------


@respx.mock
def _award_something(api: TestClient) -> dict:
    publish_bounty("org/a", 12, 40)
    respx.get(SEARCH_URL).mock(return_value=httpx.Response(200, json={"items": [
        search_item(pr_id=1, repo="org/a", number=1, author=DEV_LOGIN, body="Closes #12"),
    ]}))
    respx.get(files_url("org/a", 1)).mock(return_value=httpx.Response(200, json=[]))
    respx.get("https://api.github.com/repos/org/a/pulls/1/reviews").mock(
        return_value=httpx.Response(200, json=[])
    )
    return sync(api)


def test_withdrawing_an_award_writes_a_new_entry_and_edits_nothing(
    api: TestClient, admin: None
) -> None:
    assert _award_something(api)["total_points"] == 45

    history = api.get("/api/me/points/history").json()
    award = next(e for e in history["entries"] if e["kind"] == "bounty_award")
    before = query("select id, points, reason, kind from points_ledger order by id")

    flag_id = api.post("/api/moderation/flags", json={
        "subject_kind": "ledger_entry", "ledger_entry_id": award["id"],
        "reason": "This bounty was published and claimed by two cooperating accounts.",
    }).json()["id"]

    response = api.post(f"/api/moderation/flags/{flag_id}/resolve", json={
        "resolution": "award_withdrawn",
        "reason": "Confirmed: the maintainer and the contributor are the same person.",
    })

    assert response.status_code == 200
    assert response.json()["status"] == "upheld"
    assert response.json()["resolution"] == "award_withdrawn"
    void_id = response.json()["resolution_ledger_entry_id"]
    assert void_id is not None

    after = query("select id, points, reason, kind from points_ledger order by id")

    # Every original row is untouched: same id, same points, same reason, same kind.
    assert after[: len(before)] == before, "a historical award was edited"
    # And exactly one row was added.
    assert len(after) == len(before) + 1
    withdrawal = after[-1]
    assert withdrawal["id"] == void_id
    assert withdrawal["kind"] == "void"
    assert withdrawal["points"] == -40
    assert "same person" in withdrawal["reason"]
    assert DEV_LOGIN in withdrawal["reason"], "the moderator is named in the entry itself"

    # The total reflects it, and the contributor can see both rows.
    assert api.get("/api/me/points").json()["total_points"] == 5
    kinds = [e["kind"] for e in api.get("/api/me/points/history").json()["entries"]]
    assert kinds.count("bounty_award") == 1 and kinds.count("void") == 1


def test_an_award_cannot_be_withdrawn_twice(api: TestClient, admin: None) -> None:
    _award_something(api)
    award = next(e for e in api.get("/api/me/points/history").json()["entries"]
                 if e["kind"] == "bounty_award")

    def flag_and_withdraw():
        flag_id = api.post("/api/moderation/flags", json={
            "subject_kind": "ledger_entry", "ledger_entry_id": award["id"],
            "reason": "This award was obtained by two cooperating accounts, I believe.",
        }).json()["id"]
        return api.post(f"/api/moderation/flags/{flag_id}/resolve", json={
            "resolution": "award_withdrawn", "reason": "Confirmed by looking at both accounts closely.",
        })

    assert flag_and_withdraw().status_code == 200
    second = flag_and_withdraw()

    assert second.status_code == 409
    assert "already been withdrawn" in second.json()["detail"]
    assert api.get("/api/me/points").json()["total_points"] == 5, "not withdrawn twice"


def test_withdrawing_needs_a_flag_against_a_specific_entry(api: TestClient, admin: None) -> None:
    """A bounty-level flag does not identify whose award to take away."""
    flag_id = api.post("/api/moderation/flags", json=flag_body()).json()["id"]

    response = api.post(f"/api/moderation/flags/{flag_id}/resolve", json={
        "resolution": "award_withdrawn", "reason": "I would like to withdraw something, vaguely.",
    })

    assert response.status_code == 400
    assert "specific ledger entry" in response.json()["detail"]


def test_a_withdrawal_cannot_be_turned_into_a_second_withdrawal(api: TestClient, admin: None) -> None:
    """The void entry is itself in the ledger; flagging *it* must not take more points away."""
    _award_something(api)
    award = next(e for e in api.get("/api/me/points/history").json()["entries"]
                 if e["kind"] == "bounty_award")
    first = api.post("/api/moderation/flags", json={
        "subject_kind": "ledger_entry", "ledger_entry_id": award["id"],
        "reason": "Two cooperating accounts, as far as I can tell from the history.",
    }).json()["id"]
    void_id = api.post(f"/api/moderation/flags/{first}/resolve", json={
        "resolution": "award_withdrawn", "reason": "Confirmed by looking at both accounts closely.",
    }).json()["resolution_ledger_entry_id"]

    second = api.post("/api/moderation/flags", json={
        "subject_kind": "ledger_entry", "ledger_entry_id": void_id,
        "reason": "I do not think this withdrawal should have happened at all.",
    }).json()["id"]
    response = api.post(f"/api/moderation/flags/{second}/resolve", json={
        "resolution": "award_withdrawn", "reason": "Trying to withdraw a withdrawal, which is nonsense.",
    })

    assert response.status_code == 400
    assert "not an award" in response.json()["detail"]
    assert api.get("/api/me/points").json()["total_points"] == 5
