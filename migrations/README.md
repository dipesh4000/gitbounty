# SQL migrations

Numbered SQL files are the schema change record. Current migrations run from 0001 through 0015.
The planned SQLAlchemy ORM does not replace this workflow.

- Add the next `NNNN_short_description.sql`; inspect filenames and git history first.
- Include purpose and `Depends on:` comments.
- Never edit or rename a migration that may have been applied.
- Tell the user before writing destructive SQL.
- Local databases use `backend/dev/migrate.py`; shared database changes require explicit owner authorisation.
- Check status/checksums before applying and back up shared data.

[Setup](../docs/setup.md) covers local commands.
[Security and operations](../docs/security.md) preserves upgrade and recovery instructions.
Tests build the schema from these files; application startup must not generate it from ORM models.
