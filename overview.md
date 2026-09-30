# Project Description

GitBounty is a platform that connects open-source projects with developers, streamlining the way developers find work and contribute to projects.

## How It Works

- Users log in with their GitHub accounts. This automatically creates a digital wallet and lists their GitHub projects on a dedicated page.

- Project owners link their GitHub repo to GitBounty by copying a webhook URL into GitHub settings and depositing ERC-20 tokens through GitBounty.

- Owners tag specific issues with a bounty label (e.g. `100 usdc`) on GitHub. These issues appear on GitBounty for all logged-in users, showing the problem and the reward.

- Developers browse issues by language or bounty size, submit a fix via GitHub, and get paid automatically when a maintainer merges and closes the issue.

GitBounty levels the playing field — unlike Fiverr or Airtasker, there are no biases or review gates. Blockchain ensures transparency and equal opportunity.

---

## How It's Made

### Frontend
Next.js with shadcn components.

### Cloud Services
AWS Lambda (Go) handles two functions: GitHub webhook notifications and app API requests. DynamoDB stores all state.

### GitHub Integration
Tightly coupled with GitHub's webhook system and OAuth for login.

### Smart Contract
A single escrow contract deployable across EVM chains — deployed on Base and Arbitrum.

### Wallets
Dynamic Wallet abstracts web3 complexity, giving users a web2-like experience.

---

## How These Come Together

- **Login** — GitHub OAuth via Next.js + Dynamic Wallet provisions a non-custodial wallet on sign-in.
- **Data loading** — Lambda fetches and stores user/repo data in DynamoDB post-login.
- **Transactions** — Smart contracts execute automatically on merge, triggered by the Lambda webhook handler.


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

- **`frontend/web/`** — The original single-page landing site ported exactly to Next.js. Its live issue board calls
  the FastAPI issue endpoints and its sign-in controls use the GitHub OAuth endpoints. The Graphite Lime identity,
  copy, responsive behavior, interactions, stylesheet values, and image assets are preserved from the vanilla page.

- **`frontend/extension/`** — Empty except for a README explaining what a browser extension even is (it's more than
  a small website — it has to inject itself into GitHub's own pages, which is a different kind of programming). Not
  started, and works for the points version as easily as it would have for the money one.

- **`backend/`** — Empty except for a README. It will check who's logged in, answer requests from the website, and
  ask GitHub which pull requests a user has had merged. The stack is now chosen: **FastAPI**, in Python