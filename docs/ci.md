# CI

[`.github/workflows/ci.yml`](../.github/workflows/ci.yml) runs on every push and every pull request. It
does not deploy anything and never touches a shared database.

| Job | Does | Fails when |
|---|---|---|
| **Backend** | Starts Postgres 17, creates the two test databases, bootstraps the schema **from `migrations/` alone**, runs `pytest` | A test fails, the bootstrap fails, or **any test skips** |
| **Website** | `npm ci`, lint, typecheck, **component tests** (vitest, 59), production build, `npm audit --omit=dev --audit-level=high` | Any of them fails |
| **Extension** | `npm ci`, `npm run check` (syntax check plus 39 tests), manifest JSON validity, audit | Any of them fails |
| **Secret scan** | gitleaks over the working tree and the whole history, plus a dependency-free check for a tracked `.env` and for credential-shaped strings | Anything is found |
| **Migration validation** | Naming, consecutive numbering, and a `Depends on:` header on every file | Any file breaks a rule |

## Why "any test skipped" fails the build

Database-backed tests skip locally when the container is not running, so the pure logic can be checked
without Docker. In CI the databases are provided, so a skip means a dependency the job should have set up
and did not — which would otherwise look like a pass.

## What is deliberately not here

- **No deployment step.** GitBounty is not deployed, and adding one is the owner's decision.
- **No migration run against a shared database.** Migrations are applied deliberately, by a person, with a
  backup — see [`database-runbook.md`](database-runbook.md).
- **No broad ignores or skipped suites** to make the build green. If something cannot be tested, it is
  written down in [`known-limitations.md`](known-limitations.md) instead.
- **No secret.** Every job runs on public code. `GITHUB_TOKEN` is the automatic, read-only one.

## Branch protection

Not configured — it is a repository setting, not a file, so only the owner can do it. Recommended on the
default branch: require all five jobs to pass, require a pull request, and disallow force pushes.
See [`handoff.md`](handoff.md).

## Running the same checks locally

```bash
cd backend && . .venv/bin/activate && pytest
cd frontend/web && npm run lint && npm run typecheck && npm test && npm run build && npm audit --omit=dev
cd frontend/extension && npm run check
```
