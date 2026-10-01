# Database runbook

Migrations, backup and restore. The schema lives in [`../migrations/`](../migrations) and nowhere else.

## Applying migrations

```bash
cd backend && . .venv/bin/activate
python dev/migrate.py status    # applied · pending · CHANGED
python dev/migrate.py up        # apply everything pending
```

Each file runs in its own transaction, so a file that fails leaves nothing behind. Each applied file is
recorded in `schema_migrations` with the sha256 of its contents, so `status` reports not only what has been
applied but whether an applied file has been **edited since** — which `rules.md` section 4 forbids. The
runner also refuses a set with a gap or a duplicate number.

### It refuses a non-local database

```
Refusing to touch db.example.com:5432/postgres: it is not a local database.
```

Deliberate. A developer's `DATABASE_URL` is usually the shared Supabase project, and nobody applies
migrations to it from their own machine unasked. When the owner has asked:

```bash
python dev/migrate.py up --database-url "<the connection string>" --i-have-approval
```

Take a backup first.

## Adding a migration

1. `ls migrations/` — take the next number. Check `git log` too, in case somebody has an unpushed one.
2. Name it `NNNN_short_description.sql`.
3. Head it with a comment saying **what it creates or changes** and **what it depends on**. A teammate may
   apply it by hand.
4. One logical change per file.
5. Never edit an applied migration. Add another.
6. Tell the owner before anything destructive — `DROP`, `TRUNCATE`, `DELETE` without `WHERE`, or a column
   type change.
7. `pytest backend/tests/test_migrations.py` — it rebuilds a database from scratch and checks the naming
   and ordering rules.

## Clean-database bootstrap

The proof that `migrations/` is a complete description of the schema:

```bash
docker exec gitbounty_dev_db psql -U gitbounty -d postgres \
  -c "drop database if exists gitbounty_bootstrap_test" \
  -c "create database gitbounty_bootstrap_test"
python dev/migrate.py up \
  --database-url postgresql://gitbounty:gitbounty_local_dev@localhost:5440/gitbounty_bootstrap_test
```

`test_an_empty_database_bootstraps_from_the_migrations_alone` does exactly this on every test run, and the
other suites build their schema the same way — so a migration that does not describe the real schema breaks
the tests rather than being discovered later.

## Backup

### Local container

```bash
docker exec gitbounty_dev_db pg_dump -U gitbounty -d gitbounty_dev --format=custom \
  > gitbounty-$(date +%Y%m%d-%H%M).dump
```

### Supabase

Supabase takes automatic daily backups on paid plans; check what the project's plan actually includes
rather than assuming. For a dump you hold yourself:

```bash
pg_dump "$DATABASE_URL" --format=custom --no-owner --no-privileges \
  > gitbounty-$(date +%Y%m%d-%H%M).dump
```

A dump contains **encrypted GitHub tokens and every user's identity**. It is as sensitive as the database.
Store it encrypted, and never in the repository.

Take one before: rotating the database password, applying a migration to a shared database, and any
ownership transfer.

## Restore

```bash
createdb gitbounty_restore_test
pg_restore --dbname=gitbounty_restore_test --no-owner --no-privileges gitbounty-20261002-1200.dump
```

Then check:

```sql
select count(*) from users;
select count(*) from points_ledger;
select coalesce(sum(points),0) from points_ledger;     -- compare with before
select filename from schema_migrations order by filename;
```

Point a backend at it (`DATABASE_URL=...gitbounty_restore_test`), call `/ready`, and read a leaderboard.

**A backup nobody has restored is not a backup.** Do this once on purpose, not during an incident.

**Not done:** no restore has been rehearsed against a real Supabase backup, because the project is not
ours to practise on. It is in [`handoff.md`](handoff.md) as an owner action.

## Data retention

GitBounty currently deletes nothing automatically. There is no account-deletion endpoint. `users` has
`on delete cascade` to `points_ledger`, `merged_prs`, `sync_runs` and `issue_points`, so deleting a user row
removes their data — including bounties they published, which may not be what anybody wants. **Deciding
retention and deletion is an owner decision**, and it is a legal one in some jurisdictions; see
[`handoff.md`](handoff.md).

## If something has gone wrong

| | |
|---|---|
| `status` says `CHANGED` | Somebody edited an applied migration. Restore the file from git and add a new migration for the intended change |
| `status` says `UNKNOWN` | A row names a file that no longer exists. Somebody deleted or renamed a migration; recover it from git |
| Points look wrong | Do **not** edit `points_ledger`. Append an `adjustment` with a reason (`store.record_adjustment`) so the history keeps both facts |
| Duplicate award suspected | `select bounty_repo_full_name, bounty_issue_number, count(*) from points_ledger where kind='bounty_award' group by 1,2 having count(*) > 1;` should return nothing — the unique index makes it impossible, and an empty result is worth confirming |
