# Local database tooling

Use [local setup](../../docs/setup.md) to create the throwaway Postgres container and test databases.
From the backend virtualenv, run:

```text
uv run --locked python dev/migrate.py status
uv run --locked python dev/migrate.py up
```

The runner applies numbered [SQL migrations](../../migrations/) transactionally and records checksums.
It refuses non-local targets without `--i-have-approval`; obtain explicit owner authorisation before using that option.
See [security and operations](../../docs/security.md) for upgrade caveats, backups and restore checks.
