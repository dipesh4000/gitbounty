# Rules

Hard rules for anyone changing this repo, human or AI agent. If a rule here clashes with a habit, the rule wins.
If a rule is wrong or in the way, say so and change it here. Don't quietly ignore it.

## 1. Before you start anything, read the git history

Run these from the repo root before the first edit of any task:

- `git log --stat -n 20` shows what changed recently and who changed it.
- `git log -p -- <path>` shows the history of the folder or file you are about to touch.
- `git status -sb` shows uncommitted work, and whether you are ahead of or behind `origin`.

Then read the files you are about to change (not just their names) and say in one or two lines what the history
showed and how it affects the task.

Why: teammates commit in bursts (the README was rewritten on two days in a row). Work that ignores recent history
overwrites somebody else's decision.

## 2. Commit every small step

Break the work into small steps. When a step is done and checked, make a git commit for it before starting the next one.

- One step is one logical change, such as "move the demo into `frontend/web`" or "add migration 0001, users table".
  If the commit message needs an "and", it was two steps.
- Before committing, look at `git status` and `git diff --staged` so only this step's files go in.
- The subject line says what changed. Add a line or two on why when the reason isn't obvious.
- Commit only work that runs or reads correctly (rule 8) and holds no secrets (rule 5). No half-done steps.
- Commits are local. Never push unless the user asks (rule 6).

## 3. Repo layout

| Folder | Holds |
|---|---|
| `frontend/web/` | The website, as plain HTML/CSS/JS. Still the one being served |
| `frontend/web-next/` | The same website being rebuilt in Next.js. The landing page is ported; the rest is not |
| `frontend/extension/` | The Chrome extension (optional add-on, the site must work without it) |
| `backend/` | The API and webhook receiver |
| `migrations/` | Every SQL change to the database, and nothing else |
| `contracts/` | The escrow contract. Planned, not created yet |

Don't add new top-level folders without asking.

## 4. Database and migrations

- The Supabase database lives in a teammate's account. Nobody applies migrations from their own machine automatically.
- Every schema change is a new file in `migrations/`, named `NNNN_short_description.sql`.
  Check the highest existing number in the folder and in `git log` first.
- Never edit a migration that may already have been applied. Add a new one.
- Put a header comment on the file saying what it changes and what it depends on, since a teammate applies it by hand.
- Tell the user before writing anything destructive: `DROP`, `TRUNCATE`, `DELETE` without `WHERE`, or a column type change.
- Never assume a migration has been applied. Ask.
- Don't use ORM auto-migration tools (Prisma migrate and similar). The SQL files are the record.

## 5. Money and security

- Never commit secrets: `.env` files, private keys, webhook secrets, OAuth secrets, database passwords, service-role keys.
  Commit `.env.example` with empty values only.
- Every GitHub webhook is verified before anything else runs: check the HMAC signature on the raw body with a
  constant-time comparison, and reject a delivery ID that has been seen before.
- Code that moves funds (`deposit`, `claim`, `release`, `refund`), or the key that signs those calls, is never changed
  without the user reviewing it explicitly. Flag it in your summary.
- Anything shipped in a browser bundle (the website or the extension) is public. No private keys or server secrets there.
- The extension asks for the fewest permissions it can: `github.com` and the backend's origin only. No remotely loaded code.

## 6. Git

- Commit after every small step (rule 2). Don't push, force-push or rewrite history unless the user asks.
  `origin` is a teammate's repository.
- Don't amend, rebase or reset commits that already exist unless the user asks.
- Don't edit files outside the task. If the task truly needs it, say so first.

## 7. Undecided things stay undecided

The backend framework, wallet provider and chain are not chosen yet. Propose and wait for the answer.
Don't decide by scaffolding. Don't add a dependency without saying why it is needed.

## 8. Done means checked

Run it or test it before saying it works. Say what you verified and what you did not (for example, "served the page
and got 200, did not click through the filters").
