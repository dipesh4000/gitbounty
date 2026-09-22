# What GitBounty actually is

Read this file before anything else in the repo. `readme.md` is the polished, public-facing pitch. This file is the
plain-language version, and it also says the parts the polished pitch leaves out: what's actually built, and the
fact that the product has changed shape since that pitch was written — points first, money later.

## The problem, in plain words

Open-source software runs most of the internet, but the people who fix bugs and add features for it usually get
nothing back except a green square on their GitHub profile. Two groups feel this:

- People who **want** to contribute to open source but can't find an issue that matches what they know how to do.
- People who **already** contribute but have no reason to keep doing it beyond the green chart.

GitBounty is trying to fix that. Exactly how is where things get interesting — see the next section.

## Settled: points now, money later

For a while there were two versions of "what GitBounty does" floating around. That is now settled, and this is the
decision: **GitBounty is being built as a points (XP) app first.** Real money is not cancelled — it moves to a later
phase, most likely as "redeem your points", rather than as the escrow flow `readme.md` still describes.

### What is being built now — points

There are two people in every GitBounty story, and it matters which is which:

- The **issue creator** — usually a maintainer. They have a problem they want fixed, and they decide what fixing it
  is worth: "this issue is worth 40 points."
- The **contributor** — the person who does the work. They fix it, their pull request is merged, and they receive
  exactly the points the creator put on that issue.

That's the whole mechanic, and it is deliberately the same shape as the money version in `readme.md` — a value
attached to an issue, paid out on merge — with points in place of dollars and nothing held in escrow. It's also why
"points become money later" is a change of unit rather than a rebuild.

Around that:

- A user signs in with their GitHub account.
- They browse open issues from across GitHub, sorted into categories, so someone who only knows CSS isn't shown a
  database migration issue.
- A merged pull request that closed a points-marked issue earns that issue's points. **Every** merged pull request
  also earns a small flat amount, so contributing to a repo that has never heard of GitBounty still counts for
  something and a new user's profile isn't empty.
- Points feed into **leaderboards** — "most points this week", or one just for backend contributions. This is the
  "gamification": the reward is competition and recognition, not cash.

No wallet, no blockchain, no escrow contract. Just GitHub login, a way to read what pull requests someone has
merged, and a running scoreboard.

#### How a creator sets the points

Two ways, because the two kinds of maintainer are different:

- **A GitHub label on the issue**, such as `gitbounty:40`. Works on any repository with no signup and nothing
  installed — it is just a label — which is what keeps "browse issues from across GitHub" honest.
- **Through the GitBounty website**, for a maintainer who has signed in and wants to manage points properly.

When both exist for one issue, the website value wins: it was set deliberately, by someone we authenticated, and
it can be corrected. A label can be edited by anyone with write access to the repo.

#### A known way to cheat

If a creator can set any number, anyone can create a repository, put 100,000 points on a trivial issue and have a
friend "fix" it. Merging your own pull request into your own repository already earns nothing, but that rule does
not catch two people helping each other. A cap per issue, or a rule about which repositories are eligible, is
needed before this is public. Not solved yet.

### What is deferred — money

`readme.md` (and the pitch deck and the demo site) describe the original design: a maintainer puts a real dollar
amount on a GitHub issue, like "$100 bounty". That money gets locked up ("escrow" — think of it like a security
deposit nobody can touch yet) in a small piece of blockchain code, and is released to the contributor's crypto
wallet when their fix is merged. That is a **Web3** product: it needs a wallet, a blockchain, and a stablecoin (a
cryptocurrency built to hold steady value, like USDC).

It is a later phase, not the current build. When money does arrive, the likely shape is points converting into
money — points you redeem — rather than the maintainer-funded escrow above. Nothing about it is decided yet.

### Why this matters for anyone working here

Points and money need almost entirely different backends (one just needs a database and GitHub's API; the other
needs a blockchain contract and a wallet provider). **Build the points version. Don't build escrow, wallets or
contracts**, and don't treat `readme.md`'s money/escrow design as the current spec — it's the original pitch, kept
for the deferred phase.

## The two "surfaces" people will actually use

Either way, the plan has always had two front doors:

- **The website** — where you browse issues, see your own points, and check the leaderboards.
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
├── readme.md          the public pitch (the deferred money/escrow design)
├── plan.md            the build plan: five features and the tech stack
├── feature-split.md   who builds which of those features, Aastha vs Nishika
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
  started, and works for the points version as easily as it would have for the money one.

- **`backend/`** — Empty except for a README. It will check who's logged in, answer requests from the website, and
  ask GitHub which pull requests a user has had merged. The stack is now chosen: **FastAPI**, in Python
  (see the tech stack table in [`plan.md`](plan.md)).

- **`migrations/`** — The database itself doesn't live on this computer; it lives on a teammate's Supabase account
  (Supabase is a hosted Postgres database with some extra tools). Because nobody else can just log in and change it
  directly, every change to the database's structure is written down here as a small, numbered text file
  (`0001_something.sql`, `0002_something_else.sql`...), and the teammate copies each one into the database by hand,
  in order. This folder is currently empty because no version of the product has a real database table yet.

- **`readme.md`** — The public-facing pitch: the problem, the money/escrow architecture diagram, the roadmap,
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

This repo has an `origin` remote pointing at a teammate's (Nishika's) GitHub repository. Her colour-theme tweak to
the demo site has been merged in here, so nothing of hers is at risk of being lost. This local copy is now a little
ahead of hers and neither side pushes without asking, so check `git status -sb` and `git fetch` before starting, and
reconcile before touching `frontend/web/` again.

## The build plan

[`plan.md`](plan.md) is the build plan for the points version: five features, the tech stack, and the order that
matters. [`feature-split.md`](feature-split.md) is the agreed split of those features between Aastha and Nishika —
it supersedes plan.md's own who-does-what.

## Where to go from here

- Read [`rules.md`](rules.md) for the hard rules.
- Read [`agent.md`](agent.md) if you're an AI coding assistant.
- Read [`plan.md`](plan.md) for the build plan and the tech stack.
- Read [`feature-split.md`](feature-split.md) for who is building what.
- Read [`readme.md`](readme.md) for the polished pitch (remember: it describes the deferred money version).
