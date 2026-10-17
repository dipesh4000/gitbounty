from datetime import UTC, datetime, timedelta

import asyncpg
import pytest


async def _bounty(db, github_id: int, issue_number: int, mode: str = "points_only") -> int:
    user_id = await db.fetchval(
        "insert into users (github_id, github_login) values ($1, $2) returning id",
        github_id,
        f"user-{github_id}",
    )
    return await db.fetchval(
        """insert into issue_points
           (repo_full_name, issue_number, points, set_by_user_id, reward_mode)
           values ('org/repo', $1, 40, $2, $3) returning id""",
        issue_number,
        user_id,
        mode,
    )


async def test_escrow_schema_keeps_legacy_and_contract_paths_exclusive(db) -> None:
    legacy_id = await _bounty(db, 10, 1)
    with pytest.raises(asyncpg.RaiseError, match="not in legacy payment mode"):
        await db.execute(
            "insert into avax_reward_terms (bounty_id, payer_github_id, amount_wei) values ($1, 10, 1)",
            legacy_id,
        )

    await db.execute("update issue_points set reward_mode = 'legacy_payment' where id = $1", legacy_id)
    await db.execute(
        "insert into avax_reward_terms (bounty_id, payer_github_id, amount_wei) values ($1, 10, 1)",
        legacy_id,
    )
    with pytest.raises(asyncpg.RaiseError, match="immutable"):
        await db.execute("update issue_points set reward_mode = 'escrow' where id = $1", legacy_id)

    escrow_id = await _bounty(db, 20, 2, "escrow")
    work_ends = datetime.now(UTC) + timedelta(days=1)
    await db.execute(
        """insert into escrow_reward_terms
           (bounty_id, chain_id, contract_address, token_address, reference_id,
            onchain_bounty_id, repository_github_id, issue_github_id, payer_github_id,
            payer_address, amount_units, work_ends_at, claim_until)
           values ($1, 43113, $2, $3, $4, $5, 100, 200, 20, $6, 1000000, $7, $8)""",
        escrow_id,
        "0x" + "1" * 40,
        "0x" + "2" * 40,
        "0x" + "3" * 64,
        "0x" + "4" * 64,
        "0x" + "5" * 40,
        work_ends,
        work_ends + timedelta(days=7),
    )
    with pytest.raises(asyncpg.RaiseError, match="not in legacy payment mode"):
        await db.execute(
            "insert into avax_reward_terms (bounty_id, payer_github_id, amount_wei) values ($1, 20, 1)",
            escrow_id,
        )
    with pytest.raises(asyncpg.RaiseError, match="immutable"):
        await db.execute("update escrow_reward_terms set amount_units = 2 where bounty_id = $1", escrow_id)


async def test_phase_two_tables_are_present(db) -> None:
    expected = {
        "escrow_reward_terms",
        "escrow_funding_events",
        "escrow_allocations",
        "escrow_recipient_bindings",
        "escrow_vouchers",
        "escrow_chain_attempts",
        "escrow_chain_events",
        "escrow_index_cursors",
    }
    found = {
        row["table_name"]
        for row in await db.fetch(
            """select table_name from information_schema.tables
               where table_schema = 'public' and table_name = any($1::text[])""",
            list(expected),
        )
    }
    assert found == expected
