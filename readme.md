<p align="center">
  <img src="assets/logo.png" alt="GitBounty" width="160"/>
</p>

<h1 align="center">GitBounty</h1>

<p align="center">
  <strong>Open-source work, paid the day it ships.</strong><br/>
  Maintainers attach a dollar amount to any GitHub issue. Contributors merge a fix and get paid straight to their wallet — no invoices, no 20% cut, no five-day wait.
</p>

<p align="center">
  <a href="#-demo">Demo</a> ·
  <a href="#-how-it-works">How it works</a> ·
  <a href="#-architecture">Architecture</a> ·
  <a href="#-tech-stack">Tech stack</a> ·
  <a href="#-getting-started">Getting started</a> ·
  <a href="#-security">Security</a> ·
  <a href="#-roadmap">Roadmap</a> ·
  <a href="#-contributing">Contributing</a>
</p>

<p align="center">
  <img alt="License" src="https://img.shields.io/badge/license-MIT-yellow?style=flat-square"/>
  <img alt="Hackathon" src="https://img.shields.io/badge/CodeSlayer%202K26-DevSphereIndia-red?style=flat-square"/>
  <img alt="Track" src="https://img.shields.io/badge/tracks-Web3%20%7C%20Open%20Innovation-blueviolet?style=flat-square"/>
  <img alt="Status" src="https://img.shields.io/badge/status-MVP%20in%20progress-orange?style=flat-square"/>
</p>

---

## 🎯 The problem

90 %+ of enterprise software is built on open-source, yet the people fixing bugs and shipping features are almost never compensated. Existing platforms that try to solve this have three recurring problems:

| Problem | Status quo |
|---|---|
| **High commissions** | Upwork / Fiverr-style platforms take 10–20 % of every payment |
| **Slow payouts** | Manual release cycles run 5–14 days after work is verified |
| **Context switching** | Separate dashboards, dispute portals, and invoice flows pull contributors away from GitHub |

GitBounty collapses all three into a single, GitHub-native loop: label → escrow → merge → paid.

---

## ✨ How it works

```
Maintainer labels issue          Contributor opens PR
        │                                 │
        ▼                                 ▼
  ┌─────────────┐               ┌──────────────────┐
  │  $X bounty  │               │  PR merged into   │
  │  label set  │               │  main / master    │
  └──────┬──────┘               └────────┬─────────┘
         │                               │
         ▼                               ▼
  Funds deposited              Webhook fires → escrow
  into escrow                  releases to contributor
  immediately                  wallet — same day
```

1. **Tag the issue** — a maintainer adds a `$100 bounty` label. Funds move into escrow immediately.
2. **Escrow holds it** — a chain-agnostic Solidity contract locks ERC-20 stablecoins until work is verified as done.
3. **Contributor merges** — anyone picks up the issue, opens a PR, and gets it reviewed as usual.
4. **Wallet gets paid** — the `pull_request.merged` webhook releases escrow directly to the contributor's embedded wallet, the same day.

---

## 🏗️ Architecture

GitBounty is a lean, event-driven system split into four layers:

```
┌──────────────────────────────────────────────────────────────────┐
│  CLIENT LAYER                                                    │
│  Next.js + shadcn/ui — bounty explorer, maintainer dashboard,   │
│  embedded non-custodial wallet UI (Dynamic SDK)                  │
└────────────────────────────┬─────────────────────────────────────┘
                             │  GitHub OAuth + REST
                             ▼
┌──────────────────────────────────────────────────────────────────┐
│  EVENT & INTEGRATION ENGINE                                      │
│  Webhook listener + REST API                                     │
│  Handles: issues.labeled / issues.closed / pull_request.merged  │
│  All payloads verified with per-repo HMAC secrets               │
└────────────────────────────┬─────────────────────────────────────┘
                             │  State reads / writes
                             ▼
┌──────────────────────────────────────────────────────────────────┐
│  PERSISTENCE / STATE STORE                                       │
│  Tracks: users, bounties, repositories, webhook delivery status  │
└────────────────────────────┬─────────────────────────────────────┘
                             │  on-chain calls
                             ▼
┌──────────────────────────────────────────────────────────────────┐
│  ESCROW CONTRACT (Solidity)                                      │
│  Chain-agnostic EVM contract — holds ERC-20 / stablecoins       │
│  Four functions: deposit · claim · release · refund              │
│  Releases automatically on verified merge event                  │
└──────────────────────────────────────────────────────────────────┘
```

### Data flow — step by step

| Step | Trigger | What happens |
|---|---|---|
| 1 | Maintainer sets bounty label | Client calls REST API → funds deposited into escrow contract |
| 2 | GitHub fires `issues.labeled` | Event engine verifies HMAC signature, records bounty in state store |
| 3 | Contributor opens PR | No action — standard GitHub flow |
| 4 | Maintainer merges PR | GitHub fires `pull_request.merged` |
| 5 | Event engine receives webhook | Verifies HMAC, looks up bounty → calls contract `release()` |
| 6 | Escrow contract executes | ERC-20 transfer to contributor's embedded wallet |
| 7 | Client updates | Dashboard shows bounty as `Paid`, contributor sees balance |

---

## 🛠️ Tech stack

| Layer | Technology | Why |
|---|---|---|
| **Frontend** | Next.js 14 (App Router) | Server components, file-based routing, easy Vercel deploy |
| **UI** | Tailwind CSS + shadcn/ui | Accessible, composable components with zero design-system overhead |
| **Wallet** | Dynamic SDK | Non-custodial embedded wallets provisioned from a GitHub login — no seed phrases, no extensions |
| **Auth** | GitHub OAuth (via Dynamic) | Single login covers GitHub identity and wallet provisioning |
| **Backend** | Node.js REST API / webhook listener | Lightweight, easy to self-host |
| **State** | PostgreSQL (via Prisma) | Reliable relational store for bounties, repos, users, webhook log |
| **Smart contract** | Solidity (EVM-compatible) | Minimal four-function contract; auditable and chain-agnostic |
| **Chain** | EVM chains + ERC-20 stablecoins (USDC) | Broad compatibility; stablecoins avoid price volatility for contributors |

### Smart contract interface

```solidity
// Simplified interface — full contract in /contracts/GitBountyEscrow.sol

function deposit(
    bytes32 issueId,
    address token,
    uint256 amount
) external;

function claim(bytes32 issueId) external;

function release(
    bytes32 issueId,
    address contributor
) external onlyEngine;

function refund(bytes32 issueId) external;   // timelock-gated
```

The escrow holds funds until `release()` is called by the trusted event engine address. A configurable timelock on `refund()` ensures stale bounties are returned automatically — nothing gets stuck.

### Webhook security

Every webhook is verified using a per-repository HMAC secret before touching any escrow logic:

```js
// Event engine — simplified verification
const sig = req.headers['x-hub-signature-256'];
const expected = `sha256=${createHmac('sha256', repo.webhookSecret)
  .update(rawBody)
  .digest('hex')}`;

if (!timingSafeEqual(Buffer.from(sig), Buffer.from(expected))) {
  return res.status(401).json({ error: 'Invalid signature' });
}
```

Forged or replayed events never reach escrow.

---

## 🚀 Getting started

### Prerequisites

- Node.js 18+
- PostgreSQL 14+
- A GitHub OAuth App (`Settings → Developer settings → OAuth Apps`)
- A Dynamic SDK account (free tier) — [dashboard.dynamic.xyz](https://dashboard.dynamic.xyz)
- An EVM-compatible RPC endpoint (Alchemy / Infura / local Hardhat)

### 1. Clone

```bash
git clone https://github.com/your-org/gitbounty.git
cd gitbounty
```

### 2. Install dependencies

```bash
npm install
```

### 3. Environment variables

```bash
cp .env.example .env
```

```env
# GitHub OAuth
GITHUB_CLIENT_ID=
GITHUB_CLIENT_SECRET=
GITHUB_WEBHOOK_SECRET=        # global fallback; per-repo secrets stored in DB

# Dynamic SDK
NEXT_PUBLIC_DYNAMIC_ENV_ID=

# Database
DATABASE_URL=postgresql://user:pass@localhost:5432/gitbounty

# Chain / contract
RPC_URL=https://...
ESCROW_CONTRACT_ADDRESS=0x...
ENGINE_PRIVATE_KEY=            # the wallet that calls release() on-chain

# App
NEXT_PUBLIC_APP_URL=http://localhost:3000
```

### 4. Database setup

```bash
npx prisma migrate dev --name init
npx prisma generate
```

### 5. Deploy the escrow contract

```bash
cd contracts
npm install
npx hardhat compile
npx hardhat run scripts/deploy.js --network <your-network>
# copy the deployed address into ESCROW_CONTRACT_ADDRESS
```

### 6. Run

```bash
# development — runs Next.js and the webhook listener concurrently
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

### 7. Register the GitHub webhook

In your test repo: **Settings → Webhooks → Add webhook**

| Field | Value |
|---|---|
| Payload URL | `https://your-tunnel.ngrok.io/api/webhook/github` |
| Content type | `application/json` |
| Secret | value of `GITHUB_WEBHOOK_SECRET` |
| Events | `Issues`, `Pull requests` |

For local testing, use [ngrok](https://ngrok.com) or [smee.io](https://smee.io) to expose your local server.

---

## 📁 Project structure

```
gitbounty/
├── app/                        # Next.js App Router pages
│   ├── (marketing)/            # Landing page, pricing
│   ├── dashboard/              # Maintainer dashboard
│   ├── bounties/               # Public bounty explorer
│   ├── api/
│   │   ├── auth/               # GitHub OAuth flow
│   │   ├── bounties/           # REST endpoints
│   │   └── webhook/
│   │       └── github/         # Webhook receiver + verifier
├── components/                 # Reusable UI components
├── contracts/                  # Solidity escrow contract + Hardhat config
│   ├── GitBountyEscrow.sol
│   └── scripts/deploy.js
├── lib/
│   ├── escrow.ts               # On-chain interaction helpers
│   ├── github.ts               # GitHub API wrapper
│   └── webhook.ts              # HMAC verification
├── prisma/
│   └── schema.prisma
├── public/
│   └── assets/
├── .env.example
└── README.md
```

---

## 🔐 Security

| Concern | Mitigation |
|---|---|
| **Forged webhooks** | Per-repo HMAC secrets verified on every request using `timingSafeEqual` |
| **Replayed events** | Webhook delivery IDs stored in DB; duplicates rejected |
| **Stale bounties** | Configurable timelock on `refund()` — maintainer gets funds back automatically |
| **Contract risk** | Minimal 4-function surface area; no upgradeable proxy pattern by default |
| **Private key exposure** | Engine key used only for `release()` calls; recommend an MPC wallet or KMS in production |
| **Custody** | Contributor wallets are non-custodial (Dynamic SDK) — GitBounty never holds user funds directly |

---

## 🗺️ Roadmap

### MVP (hackathon scope)
- [x] GitHub OAuth + embedded wallet provisioning
- [x] Bounty label → escrow deposit flow
- [x] Webhook listener with HMAC verification
- [x] `pull_request.merged` → automatic escrow release
- [x] Public bounty explorer (web interface)
- [x] Maintainer dashboard
- [ ] Escrow contract deployment (testnet)
- [ ] End-to-end integration test

### Post-MVP
- [ ] Multi-contributor bounty splits
- [ ] Milestone streaming (partial payouts on intermediate PRs)
- [ ] AI-assisted bounty amount estimation
- [ ] Per-organization spend analytics
- [ ] Browser extension: bounty badge overlay on GitHub issues
- [ ] Multi-chain support (Polygon, Base, Arbitrum)
- [ ] Dispute / arbitration flow

---

<p align="center">
  Made with ☕ and a lot of unmerged PRs.
</p>