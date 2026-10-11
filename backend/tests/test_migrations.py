"""The migration set itself, and the runner that applies it.

These run without a database where they can, because the naming and ordering rules are worth enforcing
even on a machine with no Postgres.
"""

from __future__ import annotations

import sys
import os
import subprocess
from pathlib import Path

import asyncpg
import pytest

sys.path.insert(0, str(Path(__file__).resolve().parent.parent / "dev"))
import migrate  # noqa: E402

from .conftest import TEST_DATABASE_URL, apply_migrations  # noqa: E402

BOOTSTRAP_DATABASE_URL = TEST_DATABASE_URL.rsplit("/", 1)[0] + "/gitbounty_bootstrap_test"


def test_every_migration_is_named_and_numbered_consecutively() -> None:
    """A gap or a duplicate number means two people numbered at the same time."""
    files = migrate.migration_files()
    assert files, "there is at least one migration"
    numbers = [int(path.name[:4]) for path in files]
    assert numbers == list(range(1, len(files) + 1))
    assert all(migrate.FILENAME_PATTERN.match(path.name) for path in files)


def test_every_migration_documents_what_it_changes() -> None:
    """A teammate applies these by hand, so each needs a header saying what it does (rules.md s4)."""
    for path in migrate.migration_files():
        head = "\n".join(path.read_text(encoding="utf-8").splitlines()[:8]).lower()
        assert path.name.lower().split("_", 1)[1].removesuffix(".sql").split("_")[0] in head or "creates:" in head, (
            f"{path.name} has no header comment describing the change"
        )
        assert "depends on" in head or "depends on: nothing" in head or "0001" in head or "nothing" in head, (
            f"{path.name} does not say what it depends on"
        )


def test_the_runner_refuses_a_non_local_database_without_approval() -> None:
    """rules.md section 4: nobody applies migrations to the shared Supabase project unasked."""
    # Hostnames only -- is_local reads nothing else, and a credential-shaped literal in a tracked file is
    # exactly what the CI secret scan is there to object to, even a made-up one.
    assert migrate.is_local("postgresql://localhost:5432/db")
    assert migrate.is_local("postgresql://127.0.0.1:5432/db")
    assert not migrate.is_local("postgresql://aws-0-ap-southeast-2.pooler.supabase.com:5432/postgres")

    exit_code = migrate.main(["up", "--database-url", "postgresql://db.example.com:5432/postgres"])
    assert exit_code == 2


def test_the_target_description_never_includes_credentials() -> None:
    described = migrate.describe_target("postgresql://someone:" + "a-fake-password" + "@db.example.com:5432/postgres")
    assert "a-fake-password" not in described
    assert "someone" not in described
    assert described == "db.example.com:5432/postgres"


def test_the_checksum_is_of_the_file_contents() -> None:
    assert migrate.checksum("a") != migrate.checksum("b")
    assert migrate.checksum("a") == migrate.checksum("a")


async def _connect(url: str) -> asyncpg.Connection:
    try:
        return await asyncpg.connect(url, timeout=3)
    except Exception as error:
        pytest.skip(f"No database at {migrate.describe_target(url)} ({type(error).__name__}).")


async def test_an_empty_database_bootstraps_from_the_migrations_alone() -> None:
    """The clean-database bootstrap proof: migrations/ is a complete description of the schema."""
    admin = await _connect(TEST_DATABASE_URL.rsplit("/", 1)[0] + "/postgres")
    try:
        await admin.execute("drop database if exists gitbounty_bootstrap_test")
        await admin.execute("create database gitbounty_bootstrap_test")
    finally:
        await admin.close()

    assert await migrate.up(BOOTSTRAP_DATABASE_URL) == 0

    connection = await _connect(BOOTSTRAP_DATABASE_URL)
    try:
        tables = {
            row["table_name"]
            for row in await connection.fetch(
                "select table_name from information_schema.tables where table_schema = 'public'"
            )
        }
        assert {"users", "repositories", "issues", "issue_points", "merged_prs", "schema_migrations"} <= tables

        recorded = await connection.fetch("select filename from schema_migrations order by filename")
        assert [row["filename"] for row in recorded] == [path.name for path in migrate.migration_files()]

        # Running again applies nothing and fails nothing.
        assert await migrate.up(BOOTSTRAP_DATABASE_URL) == 0
        assert await migrate.status(BOOTSTRAP_DATABASE_URL) == 0
    finally:
        await connection.close()


async def test_the_runner_notices_an_edited_migration() -> None:
    """Editing an applied migration is the mistake rules.md section 4 forbids; it must be reported.

    This runs against its own throwaway database rather than inside a transaction: `migrate.up` opens its
    own connection, so an outer transaction holding locks on schema_migrations would simply block.
    """
    url = TEST_DATABASE_URL.rsplit("/", 1)[0] + "/gitbounty_checksum_test"
    admin = await _connect(TEST_DATABASE_URL.rsplit("/", 1)[0] + "/postgres")
    try:
        await admin.execute("drop database if exists gitbounty_checksum_test")
        await admin.execute("create database gitbounty_checksum_test")
    finally:
        await admin.close()

    try:
        assert await migrate.up(url) == 0

        connection = await _connect(url)
        try:
            await connection.execute(
                "update schema_migrations set checksum = 'not-the-real-checksum' where filename = $1",
                "0001_users.sql",
            )
        finally:
            await connection.close()

        with pytest.raises(migrate.MigrationError, match="contents have changed"):
            await migrate.up(url)
        assert await migrate.status(url) == 1, "status reports the problem with a non-zero exit code"
    finally:
        admin = await _connect(TEST_DATABASE_URL.rsplit("/", 1)[0] + "/postgres")
        try:
            await admin.execute("drop database if exists gitbounty_checksum_test")
        finally:
            await admin.close()


async def _fresh_database(name: str) -> str:
    """Create an empty throwaway database and return its URL. Never a shared one: migrate.py refuses
    anything non-local anyway, and these tests drop and recreate."""
    base = TEST_DATABASE_URL.rsplit("/", 1)[0]
    admin = await _connect(f"{base}/postgres")
    try:
        await admin.execute(f"drop database if exists {name}")
        await admin.execute(f"create database {name}")
    finally:
        await admin.close()
    return f"{base}/{name}"


async def _apply_through(url: str, last: int) -> None:
    """Apply migrations 0001..`last` by hand, as a database that predates this branch would have."""
    connection = await _connect(url)
    try:
        for path in migrate.migration_files():
            if int(path.name[:4]) > last:
                break
            await connection.execute(path.read_text(encoding="utf-8"))
    finally:
        await connection.close()


async def test_an_existing_database_upgrades_without_losing_anybodys_points() -> None:
    """Before 0008 a total was summed from merged_prs; after it, from points_ledger.

    Without 0010 that upgrade took every existing user to zero -- the rows were still there, but nothing
    read them. Verified on a copy before the backfill was written: 45 points before, 0 after.
    """
    url = await _fresh_database("gb_upgrade_test")
    await _apply_through(url, 5)

    connection = await _connect(url)
    try:
        await connection.execute(
            """
            insert into users (github_id, github_login) values (1,'old-user'),(2,'other-user');
            insert into merged_prs (user_id, github_pr_id, repo_full_name, number, title, url,
                                    merged_at, category, closed_issue_repo, closed_issue_number,
                                    issue_points, points)
            values (1, 500, 'old/repo', 9,  'Bounty PR', 'https://github.com/old/repo/pull/9',
                    now(), 'backend', 'old/repo', 5, 40, 45),
                   (1, 501, 'old/repo', 10, 'Plain PR',  'https://github.com/old/repo/pull/10',
                    now(), 'docs', null, null, null, 5),
                   (2, 502, 'old/repo', 11, 'Other PR',  'https://github.com/old/repo/pull/11',
                    now(), 'frontend', null, null, null, 5);
            """
        )
        before = {
            row["user_id"]: row["total"]
            for row in await connection.fetch(
                "select user_id, sum(points)::int as total from merged_prs group by user_id"
            )
        }
    finally:
        await connection.close()

    assert await migrate.up(url) == 0

    connection = await _connect(url)
    try:
        after = {
            row["user_id"]: row["total"]
            for row in await connection.fetch(
                "select user_id, sum(points)::int as total from points_ledger group by user_id"
            )
        }
        assert after == before == {1: 50, 2: 5}, "nobody's total changed across the upgrade"

        kinds = await connection.fetch(
            "select kind, points, rule_version, bounty_issue_number from points_ledger order by user_id, kind, points"
        )
        # A reconstructed entry must not claim to have been produced by the current rules.
        assert {row["rule_version"] for row in kinds} == {"points-v0-backfill"}
        assert sum(1 for row in kinds if row["kind"] == "bounty_award") == 1
        assert sum(1 for row in kinds if row["kind"] == "baseline_award") == 3

        # And it is idempotent: applying the backfill again adds nothing.
        backfill = next(p for p in migrate.migration_files() if p.name.startswith("0010"))
        await connection.execute(backfill.read_text(encoding="utf-8"))
        assert await connection.fetchval("select count(*) from points_ledger") == 4
        assert await connection.fetchval("select sum(points) from points_ledger") == 55
    finally:
        await connection.close()

    admin = await _connect(TEST_DATABASE_URL.rsplit("/", 1)[0] + "/postgres")
    try:
        await admin.execute("drop database if exists gb_upgrade_test")
    finally:
        await admin.close()


async def test_a_row_that_breaks_a_new_constraint_is_reported_in_words() -> None:
    """A teammate applies these by hand. An asyncpg traceback does not tell them which file failed."""
    url = await _fresh_database("gb_range_test")
    await _apply_through(url, 5)

    connection = await _connect(url)
    try:
        await connection.execute(
            """
            insert into users (github_id, github_login) values (1,'u');
            insert into issue_points (repo_full_name, issue_number, points, set_by_user_id)
            values ('a/b', 1, 100000, 1);
            """
        )
    finally:
        await connection.close()

    with pytest.raises(migrate.MigrationError) as caught:
        await migrate.up(url)

    message = str(caught.value)
    assert "0007_bounty_lifecycle.sql failed to apply" in message
    assert "nothing from it was kept" in message
    assert "issue_points_points_check" in message
    assert "points < 1 or points > 1000" in message, "the message says how to find the offending rows"

    admin = await _connect(TEST_DATABASE_URL.rsplit("/", 1)[0] + "/postgres")
    try:
        await admin.execute("drop database if exists gb_range_test")
    finally:
        await admin.close()


def test_documented_script_can_load_configuration_from_any_directory():
    result = subprocess.run(
        [sys.executable, str(Path(migrate.__file__)), "status"],
        cwd=Path(migrate.__file__).parent,
        env={**os.environ, "GITBOUNTY_ENV_FILE": "", "DATABASE_URL": ""},
        capture_output=True, text=True, timeout=10,
    )
    assert result.returncode == 2
    assert "No database." in result.stderr
    assert "ModuleNotFoundError" not in result.stderr
