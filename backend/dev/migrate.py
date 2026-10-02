#!/usr/bin/env python3
"""Apply, or report on, the migrations in ../migrations.

Why this exists: the migrations were applied by hand with no record of which had been applied, and
backend/dev/schema.sql held a second, independent copy of the same tables that could drift from them.
This makes migrations/ the only description of the schema, and makes "has this been applied?" a question
with an answer.

It is deliberately dumb about transactions and deliberately careful about targets:

  - Each file runs inside its own transaction. A file that fails leaves nothing behind.
  - Each applied file is recorded in schema_migrations with the sha256 of its contents, so editing an
    already-applied migration is reported as an error instead of passing unnoticed (rules.md section 4).
  - It will not touch a non-local database unless --i-have-approval is passed. rules.md section 4 says
    nobody applies migrations to the shared Supabase project from their own machine without being asked,
    and the DATABASE_URL in a developer's .env is usually that project.

Usage:
    python dev/migrate.py status                      # what is applied, what is pending
    python dev/migrate.py up                         # apply everything pending
    python dev/migrate.py up --database-url URL      # against a specific database
    python dev/migrate.py up --i-have-approval       # allow a non-local target (asks nothing further)
"""

from __future__ import annotations

import argparse
import asyncio
import hashlib
import re
import sys
from pathlib import Path
from urllib.parse import urlsplit

import asyncpg

MIGRATIONS_DIR = Path(__file__).resolve().parent.parent.parent / "migrations"
FILENAME_PATTERN = re.compile(r"^(\d{4})_[a-z0-9_]+\.sql$")
LOCAL_HOSTS = {"localhost", "127.0.0.1", "::1", ""}

LEDGER_SQL = """
create table if not exists schema_migrations (
    filename    text        primary key,
    checksum    text        not null,
    applied_at  timestamptz not null default now()
)
"""


class MigrationError(RuntimeError):
    """Something about the migration set or the target database is wrong."""


def _explain(filename: str, error: "asyncpg.PostgresError") -> str:
    """Turn a Postgres failure into something the person running this can act on.

    Nothing from the database's own message is dropped -- it names the constraint and the relation, which
    is the useful part. What is added is which file failed, that the file did not half-apply, and, for the
    failure that is actually likely here, what the decision is.
    """
    detail = getattr(error, "detail", None) or ""
    lines = [
        f"{filename} failed to apply. It ran in its own transaction, so nothing from it was kept.",
        f"  {type(error).__name__}: {error}",
    ]
    if detail:
        lines.append(f"  {detail}")

    if isinstance(error, asyncpg.CheckViolationError):
        lines += [
            "",
            "A row already in the database breaks a constraint this migration adds. That is a decision,",
            "not a retry: find the offending rows and correct them deliberately, then run this again.",
            "For the 1..1000 bounty range added by 0007, that is:",
            "  select repo_full_name, issue_number, points from issue_points",
            "   where points < 1 or points > 1000;",
        ]
    elif isinstance(error, asyncpg.ForeignKeyViolationError):
        lines += [
            "",
            "A row references something that is not there. Check whether an earlier migration was",
            "applied to a different database, or whether rows were inserted by hand.",
        ]
    return "\n".join(lines)


def checksum(text: str) -> str:
    return hashlib.sha256(text.encode()).hexdigest()


def migration_files() -> list[Path]:
    """Every migration, in numeric order, with the naming rule enforced.

    A gap or a duplicated number is an error: two people numbering 0007 at the same time is exactly the
    collision rules.md section 4 asks you to check for, and it is better caught here than in Supabase.
    """
    files = sorted(path for path in MIGRATIONS_DIR.glob("*.sql"))
    numbers: dict[int, Path] = {}
    for path in files:
        match = FILENAME_PATTERN.match(path.name)
        if not match:
            raise MigrationError(
                f"{path.name} is not named NNNN_short_description.sql (see migrations/README.md)."
            )
        number = int(match.group(1))
        if number in numbers:
            raise MigrationError(f"Two migrations share number {number:04d}: {numbers[number].name} and {path.name}.")
        numbers[number] = path

    expected = list(range(1, len(numbers) + 1))
    if sorted(numbers) != expected:
        missing = sorted(set(expected) - set(numbers))
        raise MigrationError(f"Migration numbers are not consecutive from 0001. Missing: {missing}.")
    return [numbers[number] for number in sorted(numbers)]


def is_local(database_url: str) -> bool:
    host = urlsplit(database_url).hostname or ""
    return host in LOCAL_HOSTS


def describe_target(database_url: str) -> str:
    """The target, with the credentials removed. Never print a connection string as given."""
    parts = urlsplit(database_url)
    return f"{parts.hostname or 'localhost'}:{parts.port or 5432}{parts.path}"


async def applied(connection: asyncpg.Connection) -> dict[str, str]:
    await connection.execute(LEDGER_SQL)
    rows = await connection.fetch("select filename, checksum from schema_migrations")
    return {row["filename"]: row["checksum"] for row in rows}


async def status(database_url: str) -> int:
    files = migration_files()
    connection = await asyncpg.connect(database_url, timeout=10)
    try:
        recorded = await applied(connection)
    finally:
        await connection.close()

    print(f"target:  {describe_target(database_url)}")
    problems = 0
    for path in files:
        current = checksum(path.read_text())
        if path.name not in recorded:
            print(f"pending  {path.name}")
        elif recorded[path.name] != current:
            print(f"CHANGED  {path.name}  <- applied, but the file has been edited since")
            problems += 1
        else:
            print(f"applied  {path.name}")

    unknown = set(recorded) - {path.name for path in files}
    for name in sorted(unknown):
        print(f"UNKNOWN  {name}  <- recorded as applied but no such file")
        problems += 1
    return 1 if problems else 0


async def up(database_url: str) -> int:
    files = migration_files()
    connection = await asyncpg.connect(database_url, timeout=10)
    try:
        recorded = await applied(connection)
        for path in files:
            current = checksum(path.read_text())
            if path.name in recorded:
                if recorded[path.name] != current:
                    raise MigrationError(
                        f"{path.name} has already been applied but its contents have changed. "
                        "Never edit an applied migration -- add a new one (rules.md section 4)."
                    )
                continue
            try:
                async with connection.transaction():
                    await connection.execute(path.read_text())
                    await connection.execute(
                        "insert into schema_migrations (filename, checksum) values ($1, $2)",
                        path.name,
                        current,
                    )
            except asyncpg.PostgresError as error:
                # A teammate runs this by hand. A raw asyncpg traceback tells them nothing about which
                # file failed or what to do, and the most likely failure -- an existing row that a new
                # constraint refuses -- needs a human decision, not a retry.
                raise MigrationError(_explain(path.name, error)) from error
            print(f"applied  {path.name}")
    finally:
        await connection.close()
    return 0


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("command", choices=["status", "up"])
    parser.add_argument("--database-url", default=None, help="Defaults to DATABASE_URL from the environment or backend/.env.")
    parser.add_argument(
        "--i-have-approval",
        action="store_true",
        help="Allow a non-local target. rules.md section 4: ask the owner first.",
    )
    args = parser.parse_args(argv)

    database_url = args.database_url
    if not database_url:
        from app.config import settings  # imported late so --help works without dependencies
        database_url = settings.database_url
    if not database_url:
        print("No database. Pass --database-url or set DATABASE_URL (see dev/README.md).", file=sys.stderr)
        return 2

    if not is_local(database_url) and not args.i_have_approval:
        print(
            f"Refusing to touch {describe_target(database_url)}: it is not a local database.\n"
            "The GitBounty Supabase project is applied to by hand, by its owner. If you have been asked\n"
            "to do this, re-run with --i-have-approval.",
            file=sys.stderr,
        )
        return 2

    try:
        return asyncio.run(status(database_url) if args.command == "status" else up(database_url))
    except MigrationError as error:
        print(f"error: {error}", file=sys.stderr)
        return 2


if __name__ == "__main__":
    raise SystemExit(main())
