# Private repositories, and why they need a GitHub App

Not built. This is what it would take, and the seam it would plug into.

## Why not just ask for a bigger OAuth scope

The obvious move is to add `repo` to the OAuth scope. It is also the wrong one.

`repo` grants **read and write** to every repository the user can touch — public and private, including
every organisation they belong to — for as long as the grant lasts. GitBounty needs to read issue metadata
on a handful of repositories somebody has chosen. Asking for `repo` means asking a maintainer to let
GitBounty write to all of their employer's private code in order to label two issues. Many will refuse, and
they will be right to.

The benchmarked project does request `repo` (and `admin:repo_hook`). That is one of the places its approach
should not be copied.

## What a GitHub App gives instead

| | OAuth app (today) | GitHub App |
|---|---|---|
| Granted by | the user, for everything the scope covers | the user **or an organisation owner**, per repository |
| Scope | coarse (`repo` is all-or-nothing) | fine-grained (Issues: read-only, Metadata: read-only) |
| Credentials | one user token | short-lived installation tokens, per installation |
| Revocation | all or nothing | per repository, from the repository's settings |
| Rate limit | the user's | the installation's, separate |
| Leak blast radius | everything in scope | the chosen repositories, read-only, until the token expires in an hour |

For GitBounty, **Issues: Read-only** and **Metadata: Read-only** on selected repositories is the whole
requirement.

## What would change in this codebase

The seam already exists. `app/github.py` is the only module that talks to GitHub for repository and issue
data, and every function takes the token it should act with — nothing reaches for a global token. The work:

1. **A token source.** Today `CurrentUser.github_token`. Add an installation-token path: sign a JWT with
   the app's private key, exchange it for an installation token, cache it until just before it expires.
   New module, `app/github_app.py`; `app/github.py` is unchanged apart from where the token comes from.
2. **Installation records.** A table mapping a GitHub installation id to the account that installed it and
   the repositories it covers. A migration.
3. **Authorization.** `can_publish_bounties` gains a second accepted answer: the repository is covered by an
   installation this user administers. The *one definition* property must be kept.
4. **A setup callback.** GitHub redirects to a URL after installation; record the installation id there.
5. **Private repositories stop being refused.** `_blocked_reason` drops the private check for a repository
   reached through an installation. Public repositories keep working through OAuth exactly as now.
6. **The private key is a new secret** — the strongest one in the system, since it mints tokens. It goes in
   the environment, in [`security.md`](security.md)'s rotation checklist, and never in the repository.

## Exact setup, when the owner decides to

1. <https://github.com/settings/apps> → **New GitHub App** (or under an organisation, to transfer it later).
2. **GitHub App name**: `GitBounty`. **Homepage URL**: the deployment, or `http://localhost:3000`.
3. **Callback URL**: `http://localhost:8001/auth/github/callback`; tick **Request user authorization (OAuth)
   during installation**.
4. **Setup URL**: `http://localhost:8001/auth/github/installed`, and tick **Redirect on update**.
5. **Webhook**: **uncheck Active.** GitBounty uses none.
6. **Repository permissions**: `Issues: Read-only`, `Metadata: Read-only`. Nothing else. No account
   permissions, no organisation permissions.
7. **Where can this app be installed**: Any account.
8. Create it. Note the **App ID**, generate a **private key** (a `.pem` download), and generate a **client
   secret** for the OAuth-during-install flow.
9. Environment: `GITHUB_APP_ID`, `GITHUB_APP_PRIVATE_KEY` (the PEM, newlines preserved),
   `GITHUB_APP_CLIENT_ID`, `GITHUB_APP_CLIENT_SECRET`. Placeholders go in `.env.example`; values never go in
   the repository.
10. Install it on one test repository and confirm `/ready` and the maintainer workspace both still work for
    OAuth-only users.

## Until then

Public repositories work through OAuth with `read:user`, and a private repository is refused with an
explanation rather than a silent absence. That is the honest intermediate state.
