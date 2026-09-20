# Migrations

Every schema change to the GitBounty database lives here as a plain `.sql` file.

The Supabase project is owned by a teammate, not by whoever is writing the change, so
migrations are applied by hand (Supabase SQL editor or `supabase db push`) rather than
by a tool running from a dev machine. That makes this folder the only record of what the
database looks like.

## Rules

- One file per change, named `NNNN_short_description.sql` (`0001_init.sql`, `0002_add_webhook_deliveries.sql`).
- Apply files in numeric order.
- Never edit a migration that has already been applied. Add a new one.
- Write them so they are safe to read top to bottom in the SQL editor: one change per file, comments on anything non-obvious.
