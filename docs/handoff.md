# Ownership transfer checklist

For handing GitBounty to a new owner. Everything here needs an account or a decision that cannot be made
from inside the repository.

## Decisions only the owner can make

### 1. The licence — blocking

There is **no `LICENSE` file**, so by default no rights are granted to anybody. The old `readme.md` carried
an MIT badge; that badge was removed rather than a licence invented to match it, because picking a licence
is the owner's choice and a wrong guess is worse than an open question.

If MIT is intended:

```bash
curl -s https://raw.githubusercontent.com/licenses/license-templates/master/templates/mit.txt \
  | sed "s/{{ year }}/2026/; s/{{ organization }}/<the copyright holder>/" > LICENSE
```

Then add the badge back to `readme.md`. If something else is intended, add that instead. Either way,
confirm that every dependency's licence permits the intended use — the inventory is below.

### 2. Data retention and deletion

GitBounty deletes nothing automatically and has no account-deletion endpoint. Deciding what is kept, for how
long, and how somebody asks to be removed is a product **and legal** decision. See
[`database-runbook.md`](database-runbook.md).

### 3. Privacy and terms

The `/privacy` and `/terms` pages are engineer-written summaries and say so on their faces. They must be
reviewed by a lawyer before anybody but the owner uses GitBounty.

### 4. Whether to deploy at all

See [`deployment-readiness.md`](deployment-readiness.md). The current owner has asked that it stay local.

## Accounts and credentials to transfer or recreate

| | What | How |
|---|---|---|
| [ ] | **GitHub repository** | Settings → Transfer ownership. Confirm Actions, Pages and webhook settings afterwards |
| [ ] | **GitHub OAuth app** | Cannot be transferred between accounts. The new owner creates their own and sets `GITHUB_CLIENT_ID`/`GITHUB_CLIENT_SECRET`. [`setup.md`](setup.md) step 2 |
| [ ] | **GitHub App**, if private-repository support is added | [`github-app.md`](github-app.md) |
| [ ] | **Supabase / database** | Transfer the project, or dump and restore into a new one. [`database-runbook.md`](database-runbook.md) |
| [ ] | **Secrets rotated** | All four. **Every one used during development must be treated as compromised.** [`security.md`](security.md) |
| [ ] | **Domain**, if any | None registered today |
| [ ] | **CI credentials** | None needed: the workflow uses only the automatic `GITHUB_TOKEN` |
| [ ] | **Branch protection** | A repository setting. Recommended: require the five CI jobs, require a pull request, no force pushes |
| [ ] | **Backups** | Who takes them, where they live, who can restore. Restore one to prove it works |
| [ ] | **Monitoring** | None exists. [`deployment-readiness.md`](deployment-readiness.md) |
| [ ] | **A security contact** | None exists. Needed before anybody else uses it |
| [ ] | **A real GitHub OAuth authorization** | Never performed; it needs a human at github.com. [`oauth-verification.md`](oauth-verification.md) is a twenty-minute checklist |
| [ ] | **`ADMIN_GITHUB_IDS`** | Empty, so nobody can moderate. Set it to the stable GitHub numeric ids of whoever should be able to withdraw an award |

## Third-party services

| Service | Used for | Required? | Notes |
|---|---|---|---|
| GitHub | OAuth and the REST API | **Yes.** The product is about GitHub | Only the `read:user` scope |
| Postgres (Supabase) | All storage | **Yes** | Any Postgres 17 works; nothing is Supabase-specific |
| Docker Hub | The local `postgres:17-alpine` image | Development only | |
| npm, PyPI | Dependencies | Build only | |

No analytics, no error-reporting vendor, no CDN, no email provider, no payment provider, no blockchain. The
product sends no data to any third party except GitHub, on the user's own behalf.

## Dependency and licence inventory

**Backend** (`backend/requirements.txt`, pinned exactly):

| | Version | Licence |
|---|---|---|
| fastapi | 0.115.6 | MIT |
| uvicorn[standard] | 0.34.0 | BSD-3-Clause |
| httpx | 0.28.1 | BSD-3-Clause |
| pydantic-settings | 2.7.0 | MIT |
| asyncpg | 0.30.0 | Apache-2.0 |
| itsdangerous | 2.2.0 | BSD-3-Clause |
| cryptography | 44.0.0 | Apache-2.0 OR BSD-3-Clause |

Development only: pytest (MIT), pytest-asyncio (Apache-2.0), respx (BSD-3-Clause).

**Website** (`frontend/web/package.json`): react and react-dom (MIT) at runtime; everything else —
typescript, eslint and its plugins, vite, vinext, wrangler, the Cloudflare plugin — is build-time, and all
MIT or Apache-2.0.

**Extension** (`frontend/extension/package.json`): no runtime dependencies at all. `jsdom` (MIT) for tests
only.

All of the above are permissive and permit commercial use. **Confirm this independently** before relying on
it — `npm ls --omit=dev` and `pip-licenses` produce the current tree, and CI runs `npm audit` on every push.

## Provenance of the code and documentation

The brief for this work used [sundai-club/git-paid](https://github.com/sundai-club/git-paid) as a
**product-flow benchmark only**.

- **No code from it is in this repository.** The stacks do not even overlap: GitPaid is Node/Express/Prisma
  with a Radius blockchain integration; GitBounty is FastAPI with plain SQL and nothing blockchain-shaped.
- **No branding, name, asset or copy from it is used.**
- **Its documentation is not in this repository.** An earlier `PRODUCT.md` on `origin/main` *was* a verbatim
  copy of its README — "Git Paid - GitHub Bounty Platform", the Radius SDK, escrow, Prisma. That file was
  rejected in full and replaced by one written from this codebase. The merge commit records the decision,
  and the copy survives only in git history on `origin/main`, where the original commit put it.
- Everything in `docs/`, `PRODUCT.md` and `readme.md` was written against this codebase and describes it.
  Where a document describes something that is not built, it says so.

Verifiable:

```bash
git log --oneline --all -- PRODUCT.md     # the replacement and its rationale
git grep -i "radius\|escrow\|usdc\|erc-20\|wallet" -- ':!docs/original-money-pitch.md' ':!docs/future-paid-bounties.md'
```

The second command should return nothing but discussion of what GitBounty deliberately is not.

## Before signing it over

- [ ] `pytest` passes (277 tests), `npm run lint && npm run typecheck && npm run build` pass, `npm run check`
      passes (35 tests)
- [ ] A clean database bootstraps from `migrations/` alone
- [ ] The new owner has completed sign-in on their own OAuth app, published a bounty and seen it in the
      explorer
- [ ] Every secret rotated, with the `TOKEN_ENCRYPTION_KEY` consequences understood
      ([`security.md`](security.md))
- [ ] A backup taken and **restored** at least once
- [ ] The licence decided and a `LICENSE` file added
- [ ] [`known-limitations.md`](known-limitations.md) read in full — especially that collusion between two
      cooperating accounts is not defended against
