# Local development database

The schema itself lives in [`../../migrations/`](../../migrations) and nowhere else. This folder holds
the tooling for running it against a throwaway local database.

There used to be a second copy of the schema here, `dev/schema.sql`, written so local work could start
before the numbered migrations existed. It has been deleted: two independent descriptions of the same
tables drift, and they had — the migration's `issue_points.set_by_user_id` is `not null` while a database
built from `schema.sql` accepted a row without it, which is why a test that should have failed passed.

## Why a container

This machine's system Postgres has no role for the current user, and creating one needs sudo. A throwaway
container avoids that and, more importantly, keeps GitBounty away from the Supabase stacks already running here
for other projects.

## Start it

```bash
docker run -d --name gitbounty_dev_db \
  -e POSTGRES_USER=gitbounty \
  -e POSTGRES_PASSWORD=gitbounty_local_dev \
  -e POSTGRES_DB=gitbounty_dev \
  -p 5440:5432 postgres:17-alpine
```

Then in `backend/.env`:

```
DATABASE_URL=postgresql://gitbounty:gitbounty_local_dev@localhost:5440/gitbounty_dev
```

That password is a local-only throwaway and is fine in this README. The real Supabase connection string
is a secret and belongs in `.env`, which is gitignored (rules.md section 5).

## Apply the migrations

```bash
. .venv/bin/activate
python dev/migrate.py status     # what is applied, what is pending
python dev/migrate.py up         # apply everything pending
```

Each file runs in its own transaction and is recorded in `schema_migrations` with the sha256 of its
contents, so `status` can tell you not only what is applied but whether an applied file has been edited
since — which rules.md section 4 forbids.

The runner **refuses a non-local database** unless `--i-have-approval` is passed. The `DATABASE_URL` in a
developer's `.env` is usually the shared Supabase project, and nobody applies migrations to it from their
own machine without being asked.

## The test databases

The suite needs two more databases in the same container. Create them once:

```bash
docker exec gitbounty_dev_db psql -U gitbounty -d postgres \
  -c "create database gitbounty_api_test" \
  -c "create database gitbounty_bootstrap_test"
```

Both are built from `migrations/` by the tests themselves, so nothing has to be kept in step by hand.
Tests that need a database skip rather than fail when it is not there.

## Stop and remove it

```bash
docker rm -f gitbounty_dev_db
```

Nothing else on the machine is affected; the data lives only in that container.
