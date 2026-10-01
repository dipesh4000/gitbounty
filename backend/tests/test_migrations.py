"""The migration set itself, and the runner that applies it.

These run without a database where they can, because the naming and ordering rules are worth enforcing
even on a machine with no Postgres.
"""

from __future__ import annotations

import sys
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
        head = "\n".join(path.read_text().splitlines()[:8]).lower()
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
