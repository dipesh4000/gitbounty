# Working rules

## 1. Read history before changing anything

Run `git log --stat -n 20`, `git log -p -- <path>` for the relevant files, and `git status -sb`.
Read the files to be changed and tell the user what the history showed before editing.
Preserve unrelated work.

## 2. Commit small checked steps

Finish one logical change, check it, inspect `git status` and `git diff --staged`, then commit it locally.
Do not start the next logical step with the previous one uncommitted.
No secrets, unchecked claims, or unrelated files in commits.

## 3. Keep the layout clear

Backend code belongs in `backend/`, website code in `frontend/web/`, extension code in
`frontend/extension/`, SQL migrations in `migrations/`, and browser tests in `e2e/`.
Ask before adding a top-level folder. Keep documentation status in [plan.md](plan.md), not duplicate plans.

## 4. Database changes

- Numbered SQL files in `migrations/` remain the schema change record. SQLAlchemy ORM is approved for queries;
  ORM schema generation, automatic migration and Alembic adoption are not part of that decision.
- Add `NNNN_short_description.sql` with purpose and dependency comments. Check existing numbers and git history first.
- Never edit a migration that may have been applied. Add a new one.
- Local throwaway databases may use the migration runner. Shared Supabase changes require explicit owner authorisation;
  do not automatically apply them from a developer machine or CI.
- Never assume a migration is applied. Check status or ask the database owner.
- Tell the user before writing destructive SQL: `DROP`, `TRUNCATE`, unqualified `DELETE`, or a column type change.

## 5. Identity and security

- Never commit real credentials, dotenv files, database passwords, OAuth secrets, tokens or private keys.
  Use empty secret placeholders in `.env.example`; no secret belongs in a browser bundle.
- Flag changes handling secrets, tokens or keys in the summary.
- Planned webhooks must verify HMAC on raw request bytes using constant-time comparison before processing.
  Track delivery IDs and processing state so duplicate delivery cannot duplicate an award and failed work can retry.
- Verify repository/installation scope and the merged PR author; do not trust a client-supplied identity or issue-close event.
- Rewards belong to stable GitHub numeric IDs. Registration and claiming must preserve ownership and idempotency.
- The ledger is append-only. Corrections are new entries with reasons.
- Keep extension permissions minimal and do not load remote executable code.
- Owner-funded Avalanche promises through required SmoothSend are approved in overview.md.
  Code moving funds or signing transfers requires explicit user review; each owner reviews and authorizes the individual transfer in their browser wallet.

## 6. Git

Commits stay local. Never push, force-push, amend, rebase or reset existing history without the user's request.
`origin` is a teammate's repository. Do not change unrelated files.

## 7. Respect decisions

Use [overview.md](overview.md) for scope and [plan.md](plan.md) for implementation status.
FastAPI, uv, SQLAlchemy and GitHub App webhooks are selected directions.
Do not treat planned work as already built. Explain why a new dependency is needed.
Open decisions stay open; ask rather than deciding through implementation.

## 8. Done means checked

Run or test the relevant behavior before claiming it works. For documentation-only work,
check references, commands against configuration, and current-versus-planned claims.
Report verification limits and any unrelated issue left untouched.
