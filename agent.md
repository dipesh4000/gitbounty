# Agent guide

For any AI coding agent working in this repo (Claude Code, Cursor, Codex, Gemini and so on).

**Read [`overview.md`](overview.md) first, in full, before this file or anything else.** It explains the project in
plain language, including the decision that matters most here: GitBounty is being built as a **points/XP** app, and
the real-money escrow design in `readme.md` is a deferred later phase, not the current spec. Skipping it means
working from the wrong picture of the project.

Then read this file and [rules.md](rules.md) before you touch anything. The rules are not optional.
The first two, read the git history and commit every small step, apply to every task.

## The project in five lines

- GitBounty rewards open-source contributors with **points (XP)**. An issue creator decides what their issue is
  worth; the contributor whose merged PR closes it receives exactly that.
- Flow: log in with GitHub, browse open issues by category, we check *your own* account for merged PRs, points are
  awarded and feed weekly and per-category leaderboards. No wallet, no escrow, no webhooks.
- Two surfaces: a **website** (issue browser, your points, leaderboards) and an optional **Chrome extension** that
  badges GitHub issue lists. The site must not require the extension.
- Hackathon project (CodeSlayer 2K26, Open Innovation track), built by a small team.
- Build plan and tech stack: [plan.md](plan.md). Who builds what: [feature-split.md](feature-split.md). The original
  money/escrow pitch is [readme.md](readme.md) — deferred, not current.

## What exists today

The points API and the Next.js website are implemented; GitHub OAuth and the issue browser remain planned.

| Area | Folder | State |
|---|---|---|
| Website | `frontend/web/` | Next.js app: landing page, leaderboard and personal points history |
| Extension | `frontend/extension/` | Not started |
| Backend | `backend/` | FastAPI points, leaderboard and development identity endpoints |
| Database | `migrations/` | Hand-written Postgres migrations for the points data |
| Escrow contract | `contracts/` | Deferred with the money version. Don't build it |

Do not describe planned things as if they work. Check the code before claiming a feature exists.

## The website, as it is now

- `frontend/web/app/page.tsx` is the landing route; `/leaderboard` and `/points` are separate App Router pages.
- Client components call the FastAPI points endpoints through `app/lib/api.ts`.
- GitHub sign-in is still an explicitly labelled browser-only test session. It authenticates nobody and must be
  replaced by Nishika's OAuth work.
- Leaderboard filters, loading/error/empty states, sync feedback, category totals and recent merges are implemented.
- There is no theme switcher. Light mode comes from a single `@media (prefers-color-scheme: light)` block that
  redefines the variables, so it follows the operating system. `localStorage` is used only for the labelled test
  login flag.
- `frontend/web/styles.css` defines colours, fonts and spacing as CSS variables in `:root`: the "Graphite Lime"
  palette, a near-black background with a lime accent (`--accent: #C5F53A`), Space Grotesk / Inter / JetBrains
  Mono. Use the variables and don't hard-code colours.

## Domain notes for backend work

For the points version. Not a fixed schema — the schema itself is Nishika's feature, see
[feature-split.md](feature-split.md).

- **No webhooks.** We don't own the repos whose issues we list, so we can't ask their maintainers to install one.
  Merged PRs are found by querying GitHub *as the logged-in user*, with their own token.
- **No points for self-merges** — merging your own PR into your own repo is the obvious way to fake a score. This
  does not catch two people colluding; see the cheat noted in [overview.md](overview.md), still unsolved.
- **Points come from the issue, not from us.** A creator sets a value with a `gitbounty:N` label or on the website
  (website wins). Every merged PR also earns a small flat amount so unmarked repos still count.
- Things to persist: users, the merged PRs we've already counted (so a re-sync doesn't double-award), points, the
  issue each PR closed, and the category each merge falls into.
- Categories, shared with the issue browser: `frontend`, `backend`, `fullstack`, `docs`, `testing`, `devops`,
  `design`, `mobile`, `other`. See [feature-seams.md](feature-seams.md) seam 3.

## Decided

- Backend: FastAPI (Python). Auth: GitHub OAuth via Authlib. Database: Postgres on Nishika's Supabase.
- Website: Next.js with React and TypeScript. Extension: Chrome Manifest V3, vanilla JS.
- See the tech stack table in [plan.md](plan.md).

## Undecided (ask, don't assume)

- How big the flat per-merge amount is, and whether a points-marked issue's value is capped.
- How to stop two people colluding to award each other points.
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
