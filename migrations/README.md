# Migrations

Every schema change to the GitBounty database lives here as a plain `.sql` file.

The Supabase project is owned by a teammate, not by whoever is writing the change, so
migrations are applied by hand (Supabase SQL editor or `supabase db push`) rather than
by a tool running from a dev machine. That makes this folder the only record of what the
database looks like.

## Applying them

```bash
cd backend && . .venv/bin/activate
python dev/migrate.py status     # what is applied, what is pending, what has been edited since
python dev/migrate.py up         # apply everything pending
```

The runner records each applied file in `schema_migrations` with the sha256 of its contents, so "has this
been applied?" has an answer and an edit to an already-applied file is reported rather than ignored. It
**refuses a non-local database** unless `--i-have-approval` is passed, because the `DATABASE_URL` in a
developer's `.env` is usually the shared Supabase project.

The test suite builds its schema from these files too (`backend/tests/conftest.py`), so this folder being
a complete and correct description of the database is checked on every run rather than assumed.

## Rules

- One file per change, named `NNNN_short_description.sql` (`0001_init.sql`, `0002_add_webhook_deliveries.sql`).
- Apply files in numeric order. Numbers must be consecutive from 0001; the runner enforces both.
- Never edit a migration that has already been applied. Add a new one.
- Write them so they are safe to read top to bottom in the SQL editor: one change per file, comments on anything non-obvious.
