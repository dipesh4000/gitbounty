# Agent guide

For any AI coding agent working in this repo (Claude Code, Cursor, Codex, Gemini and so on).

**Read [`overview.md`](overview.md) first, in full, before this file or anything else.** It explains the project in
plain language, including the decision that matters most here: GitBounty is being built as a **points/XP** app, and
the real-money escrow design in `readme.md` is a deferred later phase, not the current spec. Skipping it means
working from the wrong picture of the project.

Then read this file and [rules.md](rules.md) before you touch anything. The rules are not optional.
The first two, read the git history and commit every small step, apply to every task.

## The project in five lines

- GitBounty rewards open-source contributors with **points (XP)**: sign in with GitHub, find an issue to work on,
  and earn points when your pull request is merged.
- Flow: log in with GitHub, browse open issues by category, we check *your own* account for merged PRs, points are
  awarded and feed weekly and per-category leaderboards. No wallet, no escrow, no webhooks.
- Two surfaces: a **website** (issue browser, your points, leaderboards) and an optional **Chrome extension** that
  badges GitHub issue lists. The site must not require the extension.
- Hackathon project (CodeSlayer 2K26, Open Innovation track), built by a small team.
- Build plan and tech stack: [plan.md](plan.md). Who builds what: [feature-split.md](feature-split.md). The original
  money/escrow pitch is [readme.md](readme.md) — deferred, not current.

## What exists today

Only the static website demo. Everything else is planned.

| Area | Folder | State |
|---|---|---|
| Website | `frontend/web/` | Demo: plain HTML/CSS/JS with sample data, no API calls |
| Extension | `frontend/extension/` | Not started |
| Backend | `backend/` | Not started. Stack chosen: FastAPI (Python) |
| Database | `migrations/` | Postgres on a teammate's Supabase. No migrations written yet |
| Escrow contract | `contracts/` | Deferred with the money version. Don't build it |

Do not describe planned things as if they work. Check the code before claiming a feature exists.

## The website demo, as it is now

- `frontend/web/index.html` has these sections, each with an `id` used by the nav: `top` (hero), `bounties`,
  `how-it-works`, `why`, `audience`, `security`, `pricing`, plus a facts strip, a CTA band and the footer.
- `frontend/web/script.js` holds the behaviour. Places where the real backend plugs in:
  - the `BOUNTIES` array at the top is sample data. Replace it with an API call.
  - `AUTH_URL` inside `initCTAButtons()` is `"#"`. Point it at the GitHub login endpoint.
- The bounty board (search, label pills, sort) works client-side over `BOUNTIES`.
- The colour theme is set by `data-theme` on `<html>` and saved in `localStorage` under `gitbounty-theme`.
- `frontend/web/styles.css` defines colours, fonts and spacing as CSS variables in `:root`
  (near-black background, gold accent, Space Grotesk / Inter / JetBrains Mono). Use the variables and don't hard-code colours.

## Domain notes for backend work

For the points version. Not a fixed schema — the schema itself is Nishika's feature, see
[feature-split.md](feature-split.md).

- **No webhooks.** We don't own the repos whose issues we list, so we can't ask their maintainers to install one.
  Merged PRs are found by querying GitHub *as the logged-in user*, with their own token.
- **No points for self-merges** — merging your own PR into your own repo is the obvious way to fake a score.
- Things to persist: users, the merged PRs we've already counted (so a re-sync doesn't double-award), points, and
  the category each merge falls into (frontend / backend / docs / ...).
- Categories are what make the issue browser useful: someone who only writes CSS shouldn't be shown a database
  migration issue.

## Decided

- Backend: FastAPI (Python). Auth: GitHub OAuth via Authlib. Database: Postgres on Nishika's Supabase.
- Website: stays plain HTML/CSS/JS. Extension: Chrome Manifest V3, vanilla JS.
- See the tech stack table in [plan.md](plan.md).

## Undecided (ask, don't assume)

- How points are actually scored (per merge? weighted by category, repo size, lines changed?).
- Everything about the deferred money phase: whether points redeem for money, which chain, which token, which
  wallet provider. Don't build toward it.
- Hosting specifics (Render or Railway for the backend, Vercel or Netlify for the site).

## How to work

1. Read the git history and the files you'll change ([rules.md](rules.md) section 1).
2. Do one small step.
3. Check it and say what you checked.
4. Commit it ([rules.md](rules.md) section 2), then go back to step 2 for the next step.
5. Report what changed, what you didn't verify, and anything you noticed but left alone.

Some contributors have not built a browser extension before. When you introduce an extension concept
(manifest, content script, service worker), explain it in a line.
