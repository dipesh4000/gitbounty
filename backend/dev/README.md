# Local development database

Nothing here is a migration and nothing here touches the real database. The GitBounty Supabase project belongs to
Nishika, the schema is her feature, and migrations are applied by hand from [`../../migrations/`](../../migrations)
(see [`../../feature-seams.md`](../../feature-seams.md) seam 2).

[`schema.sql`](schema.sql) is the schema Aastha's features need, written so it can be run locally today and handed
to Nishika to become the numbered migration. Keeping one copy means the SQL that gets applied is the SQL that has
actually been run.

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

docker exec -i gitbounty_dev_db psql -U gitbounty -d gitbounty_dev < dev/schema.sql
```

Then in `backend/.env`:

```
DATABASE_URL=postgresql://gitbounty:gitbounty_local_dev@localhost:5440/gitbounty_dev
```

That password is a local-only throwaway and is fine in this README. The real Supabase connection string is a
secret and belongs in `.env`, which is gitignored (rules.md section 5).

## Stop and remove it

```bash
docker rm -f gitbounty_dev_db
```

Nothing else on the machine is affected; the data lives only in that container.
