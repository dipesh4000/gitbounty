# What GitBounty actually is

Read this file before anything else in the repo. `readme.md` is the polished, public-facing pitch. This file is the
plain-language version, and it also says the parts the polished pitch leaves out: what's actually built, and a real
disagreement about what the product even is that isn't settled yet.

## The problem, in plain words

Open-source software runs most of the internet, but the people who fix bugs and add features for it usually get
nothing back except a green square on their GitHub profile. Two groups feel this:

- People who **want** to contribute to open source but can't find an issue that matches what they know how to do.
- People who **already** contribute but have no reason to keep doing it beyond the green chart.

GitBounty is trying to fix that. Exactly how is where things get interesting — see the next section.

## Two different ideas for how this works (not yet settled)

There are currently two versions of "what GitBounty does" floating around, and they are genuinely different
products. Whoever reads this repo next needs to know both exist, because the committed docs (`readme.md`, `agent.md`)
describe one of them and haven't caught up to the other.

### Version A — real money (what `readme.md`, the pitch deck and the demo site describe)

A maintainer puts a real dollar amount on a GitHub issue, like "$100 bounty". That money gets locked up ("escrow" —
think of it like a security deposit nobody can touch yet) in a small piece of blockchain code. When someone's fix
gets merged, the money is automatically released to their crypto wallet, the same day. No PayPal, no invoice, no
maintainer manually sending money.

This is a **Web3** product: it needs a wallet, a blockchain, and a stablecoin (a cryptocurrency built to hold
steady value, like USDC, so contributors aren't paid in something that swings wildly in price).

### Version B — points and leaderboards (what the project's builder described in conversation, still rough)

No real money changes hands. Instead:

- A user signs in with their GitHub account.
- They browse open issues from across GitHub, sorted into categories like frontend, backend, full-stack, or
  documentation — so someone who only knows CSS isn't shown a database migration issue.
- When their pull request gets merged, they earn **points** (an internal score, not a currency).
- Points feed into **leaderboards** — for example, "most points this week", or a separate leaderboard just for
  backend contributions. This is the "gamification": the reward is competition and recognition, not cash.

This is a much simpler product to build: no wallet, no blockchain, no escrow contract. Just GitHub login, a way to
read what pull requests someone has merged, and a running scoreboard.

### Why this matters for anyone working here

These two ideas need almost entirely different backends (one needs a blockchain contract and a wallet provider, the
other just needs a database and GitHub's API). **Don't build either one further without checking which one is
current** — ask, don't assume from the README. Until it's settled, treat `readme.md`'s money/escrow design as
"the original plan, maybe still true, maybe not."

## The two "surfaces" people will actually use

Whichever version wins, the plan has always had two front doors:

- **The website** — where you browse bounties/issues, see your own stats, and (for maintainers, in Version A) manage
  bounties on your repos.
- **A Chrome extension** — optional, so the website has to work without it. It would show a small badge directly on
  GitHub's own issue list pages, without the user needing to visit the GitBounty website at all. Nothing about the
  extension is built yet.

## Folder-by-folder, in plain language

```
gitbounty/
├── frontend/
│   ├── web/          the website
│   └── extension/    the Chrome extension
├── backend/          the server that ties everything together
├── migrations/       the database's history, as plain text files
├── overview.md        <- you are here
├── readme.md          the public pitch (Version A, money/escrow)
├── agent.md            how an AI coding assistant should behave here
├── rules.md            the actual rules agent.md points to
└── CLAUDE.md / AGENTS.md   short files that just tell specific tools ("Claude Code", "Codex") to go read agent.md and rules.md
```

- **`frontend/web/`** — This is a working demo, built first, before any backend existed, just to nail down what the
  site should look and feel like. It's a normal website (an HTML file, a CSS file for styling, a JS file for
  behaviour) with made-up sample bounties typed directly into the code. Nothing on it is real yet: search, filters
  and the colour-theme switcher all work, but there's no server behind it and no real data. **Treat it as a mockup,
  not as a foundation to build the real product on top of** — it was made to answer "how should this feel", not
  "how should this be built".

- **`frontend/extension/`** — Empty except for a README explaining what a browser extension even is (it's more than
  a small website — it has to inject itself into GitHub's own pages, which is a different kind of programming). Not
  started, and works with either Version A or B.

- **`backend/`** — Empty except for a README listing what it will eventually need to do: check who's logged in,
  answer requests from the website, and listen for events from GitHub (like "a pull request was merged"). No
  programming language has been chosen for it yet, and that choice depends on which version (A or B) is being built.

- **`migrations/`** — The database itself doesn't live on this computer; it lives on a teammate's Supabase account
  (Supabase is a hosted Postgres database with some extra tools). Because nobody else can just log in and change it
  directly, every change to the database's structure is written down here as a small, numbered text file
  (`0001_something.sql`, `0002_something_else.sql`...), and the teammate copies each one into the database by hand,
  in order. This folder is currently empty because no version of the product has a real database table yet.

- **`readme.md`** — The public-facing pitch: the problem, the (Version A, money) architecture diagram, the roadmap,
  and how to run things. Written to look good on GitHub and to a hackathon judge.

- **`agent.md`, `rules.md`, `CLAUDE.md`, `AGENTS.md`** — Not about the product at all; they're about *how to work in
  this repo*. `rules.md` has the actual hard rules (read git history first, commit in small steps, keep secrets out
  of the code, etc). `agent.md` explains the project to any AI coding tool. `CLAUDE.md` and `AGENTS.md` are just
  thin files so that Claude Code and Codex specifically know to go read `agent.md` and `rules.md` — they hold no
  independent instructions.

## What's actually built right now

Only one thing is real: the website demo mockup in `frontend/web/`. Everything else described above — the real
backend, the database tables, the extension, the escrow contract, the login flow, the points system — is design and
conversation, not code.

## A note on where this repo stands with the teammate's copy

This repo has a `origin` remote pointing at a teammate's GitHub repository. As of the last check, this local copy has
commits the teammate's copy doesn't have yet (this whole restructuring and these docs), and the teammate's copy has
at least one commit this local copy doesn't have yet (a small visual tweak to the demo site's colour theme). Neither
side has been pushed or pulled to match the other. Whoever picks this up should reconcile that before touching
`frontend/web/` again, so the teammate's latest visual tweaks aren't accidentally lost or overwritten.

## Where to go from here

- Read [`rules.md`](rules.md) for the hard rules.
- Read [`agent.md`](agent.md) if you're an AI coding assistant.
- Read [`readme.md`](readme.md) for the polished pitch (remember: it currently only describes Version A).
