# Agent guide

For any AI coding agent working in this repo (Claude Code, Cursor, Codex, Gemini and so on).

**Read [`overview.md`](overview.md) first, in full, before this file or anything else.** It explains the project in
plain language, including a real unresolved disagreement about what the product even is (a real-money bounty system
versus a points/leaderboard system) that the rest of the docs in this repo have not caught up to. Skipping it means
working from the wrong picture of the project.

Then read this file and [rules.md](rules.md) before you touch anything. The rules are not optional.
The first two, read the git history and commit every small step, apply to every task.

## The project in five lines

- GitBounty pays open-source contributors: a maintainer puts a dollar bounty on a GitHub issue, and the contributor is
  paid to their wallet when the fixing PR is merged.
- Flow: label the issue, funds go to escrow, PR merged, webhook fires, escrow releases to the contributor's wallet.
- Two surfaces: a **website** (bounty explorer, maintainer dashboard) and an optional **Chrome extension** that shows
  bounty badges on GitHub issue lists. The site must not require the extension.
- Hackathon project (CodeSlayer 2K26, Web3 and Open Innovation tracks), built by a small team.
- Full pitch and design: [readme.md](readme.md). A candidate build plan for the points/leaderboard version described
  in [overview.md](overview.md) lives at [plan.md](plan.md) — not yet confirmed with the whole team, see its
  "team sync" chunk before treating it as final.

## What exists today

Only the static website demo. Everything else is planned.

| Area | Folder | State |
|---|---|---|
| Website | `frontend/web/` | Demo: plain HTML/CSS/JS with sample data, no API calls |
| Extension | `frontend/extension/` | Not started |
| Backend | `backend/` | Not started, stack not chosen |
| Database | `migrations/` | Postgres on a teammate's Supabase. No migrations written yet |
| Escrow contract | `contracts/` | Not started, folder not created |

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

These come from the README's design and are not a fixed schema.

- GitHub events that matter: `issues.labeled`, `issues.closed`, `pull_request.merged`.
- Things to persist: users, repositories (with a per-repo webhook secret), bounties, and webhook deliveries
  (to reject replays).
- A bounty is open until it is paid on merge or refunded after a timelock.
- The escrow contract has four functions: `deposit`, `claim`, `release` (engine only), `refund` (timelock).

## Undecided (ask, don't assume)

- Backend language and framework
- How users log in, and who issues the wallet (the original plan was Dynamic SDK)
- Which chain and token (the original plan was an EVM chain with USDC, on a testnet first)
- GitHub OAuth App versus GitHub App for receiving webhooks
- Whether the website stays plain HTML/CSS/JS or moves to a framework

## How to work

1. Read the git history and the files you'll change ([rules.md](rules.md) section 1).
2. Do one small step.
3. Check it and say what you checked.
4. Commit it ([rules.md](rules.md) section 2), then go back to step 2 for the next step.
5. Report what changed, what you didn't verify, and anything you noticed but left alone.

Some contributors have not built a browser extension before. When you introduce an extension concept
(manifest, content script, service worker), explain it in a line.
