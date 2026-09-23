# What GitBounty actually is

Read this file before anything else in the repo. `readme.md` is the polished, public-facing pitch. This file is the
plain-language version: what the product is, what is actually built, and what to build next.

## The problem, in plain words

Open-source software runs most of the internet, but the people who fix bugs and add features for it usually get
nothing back except a green square on their GitHub profile. Two groups feel this:

- People who **want** to contribute to open source but can't find an issue that matches what they know how to do.
- People who **already** contribute but have no reason to keep doing it beyond the green chart.

## The product: one system, two reward rails

An earlier version of this file described two competing products — a money/escrow version and a points/leaderboard
version — and told you not to build either until it was settled. **That is settled now: it is both, built as one
system.** They are not two products. One is a subset of the other plus a leaderboard.

### Rail 1 — Points, on every repo

A user signs in with GitHub and browses open issues sorted by category (frontend, backend, full-stack, docs), so
someone who only knows CSS isn't shown a database migration. When their pull request gets merged anywhere on GitHub,
they earn **points** — an internal score, not a currency. Points feed leaderboards ("most points this week", "top
backend contributor").

Points work on **any** repository, because earning them only needs the contributor's own GitHub login. We never need
the maintainer's permission, which matters: we don't own the repos whose issues we list, so we can't ask every
maintainer to install a webhook.

### Rail 2 — Bounties, where someone funded the work

A maintainer puts a real dollar amount on one of their own issues, like "$100 bounty". That money is locked up
("escrow" — think of a security deposit nobody can touch yet) in a small piece of blockchain code. When the fix is
merged, the money is released to the contributor's wallet the same day. No invoice, no maintainer manually sending
anything.

This rail is **opt-in**: it only works on repos whose owner installs the app and funds an issue. That is fine,
because the person paying is the person installing.

### The one sentence that ties them together

> **Points are what you earn everywhere. Money is what you earn where someone funded it.**

## Why both, and not just one

Each rail alone has a hole. Together they fill each other's.

- **Bounties alone start empty.** On day one nobody has funded anything, so there is nothing to browse and nothing to
  demo. Points run across all of GitHub, so the site has real content from the first minute and funded bounties sit
  on top as the premium layer.
- **Points alone are just another green chart.** The problem above is that contributors have no reason to continue
  beyond the green chart. A second chart does not fix a problem caused by no money. Points that build toward real
  paid work do.
- **Together they make a reputation layer.** A contributor's points history is the evidence for who should be trusted
  with a large bounty, and the defence against someone farming payouts with fresh throwaway accounts. Bounty
  platforms that only do money have no such signal.

## Rules that hold this together

These are product rules, not coding rules (those live in `rules.md`). Breaking any of them breaks the design.

1. **Points never convert to money.** The moment they are exchangeable we have created a currency, with all the fraud
   and legal surface that brings. Points are reputation. Money is money. They never trade.
2. **Points can't be farmed.** No points for merging your own pull request, or for a pull request into a repo you or
   your organisation owns. Repositories below a minimum age and popularity don't count either — otherwise the
   leaderboard is won by whoever creates the most fake repos.
3. **A merge is not a payout by itself.** A merged pull request has to be linked to the funded issue (the pull request
   body says `Fixes #123`) and merged into the default branch before any money moves.
4. **Funding your own issue and paying your own second account is the obvious attack.** Anything that moves funds has
   to assume it will be tried.
5. **Merge detection is written once.** Polling each user's own merged pull requests works on every repo and is the
   base. Webhooks are a faster path for repos that installed the app. Same handler, one code path, not two.

## What's actually built right now

One thing is real: the website demo in `frontend/web/`. It is a normal website (an HTML file, a CSS file, a JS file)
with made-up sample bounties typed directly into the code. Search, filters and the colour-theme switcher work, but
there is no server behind it and no real data. **Treat it as a mockup, not as a foundation** — it was made to answer
"how should this feel", not "how should this be built". The look and colours are worth keeping; the layout and copy
need to change, because the product now has two rails instead of one.

Everything else — the backend, the database tables, the extension, the escrow contract, the login flow, the points
system — is design and conversation, not code.

## Build order

The two rails share most of their plumbing, so the order below means there is always something that works. Build the
shared core first, then the cheap rail, then the expensive one.

1. **Shared core** — GitHub login, the database, issue browsing by category, and detecting a merged pull request.
   Both rails need every piece of this.
2. **Points and leaderboards** — a small addition on top of the core.
3. **Wallets, escrow and payout** — the money rail. This is the part that makes the Web3 track apply.
4. **The Chrome extension** — optional, and the website must work without it.

If time runs out after step 2, there is still a complete, working product. If the escrow contract is built first and
time runs out, there is nothing to show.

[`plan.md`](plan.md) is a chunk-by-chunk build plan that covers the points rail (steps 1, 2 and 4) in more detail. It was
written when the points version was the whole product, so it does not cover step 3 yet.

## Still undecided

Per [`rules.md`](rules.md) section 7, these are open and should be proposed rather than decided by scaffolding:

- The backend language and framework. `plan.md` proposes FastAPI (Python).
- The wallet provider. `readme.md` proposes the Dynamic SDK, for non-custodial wallets from a GitHub login.
- The chain and the stablecoin. `readme.md` assumes an EVM chain and USDC, testnet first.
- What a point is actually worth — whether every merged pull request is worth the same, or whether size and repo
  significance weight it.

## Two surfaces people will actually use

- **The website** — browse issues and bounties, see your own points, the leaderboards, and (for maintainers) manage
  the bounties on your repos.
- **A Chrome extension** — optional, so the website has to work without it. It would show a small badge directly on
  GitHub's own issue pages, so a user doesn't need to visit the GitBounty site at all. Nothing about it is built yet.

## Folder-by-folder, in plain language

```
gitbounty/
├── frontend/
│   ├── web/          the website
│   └── extension/    the Chrome extension
├── backend/          the server that ties everything together
├── migrations/       the database's history, as plain text files
├── contracts/        the escrow contract (planned, folder not created yet)
├── overview.md        <- you are here
├── readme.md          the public pitch
├── plan.md            the build plan for the points rail
├── agent.md           how an AI coding assistant should behave here
├── rules.md           the actual rules agent.md points to
└── CLAUDE.md / AGENTS.md   short files telling specific tools to read agent.md and rules.md
```

- **`frontend/web/`** — the demo mockup described above.
- **`frontend/extension/`** — empty except for a README explaining what a browser extension even is (it has to inject
  itself into GitHub's own pages, which is a different kind of programming). Not started.
- **`backend/`** — empty except for a README listing what it will need to do: check who is logged in, answer requests
  from the website, poll GitHub for merged pull requests, receive webhooks from repos that installed the app, and
  call the escrow contract. No language chosen yet.
- **`migrations/`** — the database lives on a teammate's Supabase account, not on this machine, so every change to its
  structure is written here as a small numbered file (`0001_init.sql`, `0002_...`) and applied by hand, in order.
  Currently empty.
- **`contracts/`** — planned, not created. Holds the escrow contract for rail 2.
- **`readme.md`** — the public-facing pitch. It currently describes only the bounty rail, and hasn't caught up to the
  points rail yet.
- **`agent.md`, `rules.md`, `CLAUDE.md`, `AGENTS.md`** — not about the product; about how to work in this repo.

## Docs that still need updating

Now that the product is both rails, two files are out of date. Whoever picks this up next should fix them:

- **[`readme.md`](readme.md)** — describes the bounty rail only. Needs the points rail, and the shared architecture.
- **[`plan.md`](plan.md)** — its first step is a conversation about dropping the money version. That conversation happened and
  the answer was to keep both, so that step is done and the plan needs a section for rail 2.

## Where to go from here

- Read [`rules.md`](rules.md) for the hard rules.
- Read [`agent.md`](agent.md) if you're an AI coding assistant.
- Read [`plan.md`](plan.md) for the build plan for the points rail.
- Read [`readme.md`](readme.md) for the public pitch of the bounty rail.
