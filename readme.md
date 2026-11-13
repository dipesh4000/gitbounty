# GitBounty

> **Turn verified GitHub contributions into transparent reputation points and escrow-backed Avalanche rewards for the developer who actually authored the merged pull request.**

[![Avalanche Fuji C-Chain](https://img.shields.io/badge/Avalanche-Fuji%20Testnet%20(43113)-E84142?logo=avalanche&logoColor=white)](https://testnet.snowtrace.io/address/0xc8ff1527BF4d43A3bC7EA3d9fb415D5647739f65)
[![Contract Deployed](https://img.shields.io/badge/Escrow%20Contract-0xc8ff...9f65-22c55e)](https://testnet.snowtrace.io/address/0xc8ff1527BF4d43A3bC7EA3d9fb415D5647739f65)
[![Next.js 16](https://img.shields.io/badge/Next.js-16.4.6-black?logo=next.js)](https://nextjs.org/)
[![FastAPI](https://img.shields.io/badge/FastAPI-Python%203.12-009688?logo=fastapi&logoColor=white)](https://fastapi.tiangolo.com/)
[![Tests Passing](https://img.shields.io/badge/Tests-Contract%20(9)%20|%20Web%20(86)%20|%20Backend%20(217)-success)](#verification-and-test-results)

**Live Demo Application:** [gitbounty-web.vercel.app](https://gitbounty-web.vercel.app)  
**Escrow Contract on Snowtrace:** [0xc8ff1527BF4d43A3bC7EA3d9fb415D5647739f65](https://testnet.snowtrace.io/address/0xc8ff1527BF4d43A3bC7EA3d9fb415D5647739f65)

---

## Table of Contents

1. [Executive Summary](#executive-summary)
2. [The Problem & The Solution](#the-problem--the-solution)
3. [Core Invariants & Guarantees](#core-invariants--guarantees)
4. [System Architecture](#system-architecture)
5. [End-to-End User Journey](#end-to-end-user-journey)
6. [Smart Contract & Escrow Mechanics](#smart-contract--escrow-mechanics)
7. [GitHub Eligibility Verification Engine](#github-eligibility-verification-engine)
8. [Wallet Strategy & Account Abstraction](#wallet-strategy--account-abstraction)
9. [Technology Stack](#technology-stack)
10. [Repository Structure](#repository-structure)
11. [Verification and Test Results](#verification-and-test-results)
12. [Local Development Setup](#local-development-setup)
13. [Deployed Network Artifacts](#deployed-network-artifacts)

---

## Executive Summary

**GitBounty** is an open-source contribution incentivization platform combining cryptographic verification from GitHub with decentralized escrow settlements on the **Avalanche (Fuji C-Chain)** network.

Maintainers connect their public GitHub repositories, publish bounties on selected issues, and pre-fund cash rewards using testnet USDC into a non-upgradeable Solidity escrow contract (`GitBountyEscrow.sol`). Contributors browse issues, solve them through standard pull requests, and receive automated attribution. Once GitBounty authoritatively verifies the PR merge, branch target, closing reference, and author identity, the author can claim the escrowed reward via gas-sponsored smart accounts or standard web3 wallets.

Reputation points exist as an immutable, off-chain ledger that tracks developer contributions across categories without monetary speculation.

---

## The Problem & The Solution

```mermaid
flowchart TB
    subgraph Comparison[" "]
        direction LR

        subgraph Traditional["Traditional Bounty Platforms"]
            direction TB
            T1["Subjective Review & Bias"]:::redNode
            T2["Unfunded Promises & Fake Rewards"]:::redNode
            T3["Mutable Usernames / Impersonation"]:::redNode
            T4["Manual Off-Platform Payouts"]:::redNode
            T1 --> T2 --> T3 --> T4
        end

        subgraph GitBountyFlow["GitBounty System"]
            direction TB
            G1["GitHub App Proves PR & Merge"]:::greenNode
            G2["On-Chain Escrow Locks USDC Upfront"]:::greenNode
            G3["Immutable Numeric GitHub IDs"]:::greenNode
            G4["EIP-712 Attested Smart Contract Claim"]:::greenNode
            G1 --> G2 --> G3 --> G4
        end
    end

    classDef redNode fill:#991B1B,stroke:#F87171,stroke-width:2px,color:#FFFFFF;
    classDef greenNode fill:#065F46,stroke:#34D399,stroke-width:2px,color:#FFFFFF;
```

* **Trustless Pre-funding ("Funded means Funded"):** Maintainers cannot announce cash bounties without locking the exact token amount into the smart contract. Contributors work knowing funds exist.
* **Objective GitHub Evidence:** Merges, closing keywords, and timeline events are verified via signed GitHub webhooks and authenticated GraphQL queries.
* **Resilient Identity:** Rewards belong strictly to the author's immutable numeric GitHub ID (`author.id`), protecting contributors against username changes or handle re-registrations.
* **Clean Boundary:** Points quantify open-source reputation and never convert to currency; cash rewards are funded in USDC and settled transparently on Avalanche.

---

## Core Invariants & Guarantees

* **Numeric Identity Ownership:** Every allocation is keyed to `github_user_id` (e.g. `87355477`), not a string username.
* **First Eligible Allocation Processing:** The first verified pull request that fulfills all conditions claims the allocation under an ACID database lock.
* **Pre-Registration Safety:** If a contributor authors an eligible PR before registering on GitBounty, their allocation is preserved safely in the database and can be claimed immediately upon signing in.
* **Replay & Double-Spend Protection:** The escrow contract enforces single-use settlement with unique `bountyId` derivations (`keccak256(chainid, contract, payer, referenceId)`), nonce checks, and EIP-712 typed voucher verification.
* **Bounded Work and Claim Deadlines:** Each bounty enforces a `workEndsAt` cutoff for code merges, followed by a strict 7-day claim grace window (`claimUntil = workEndsAt + 7 days`).
* **Non-Custodial Refund Path:** If a bounty expires without an eligible claim, the original maintainer can reclaim the escrowed USDC directly on-chain after `claimUntil`.

---

## System Architecture

```mermaid
flowchart TD
    subgraph External["External Ecosystem"]
        GH["GitHub API & Webhooks"]:::githubNode
        AVAX["Avalanche Fuji C-Chain"]:::avaxNode
        SS["SmoothSend Bundler / Paymaster"]:::ssNode
    end

    subgraph Frontend["Frontend Layer (Next.js 16)"]
        UI["Landing & Workspace UI"]:::webNode
        MaintainerUI["Maintainer Studio & Funding Form"]:::webNode
        ClaimUI["Contributor Wallet & Claim Portal"]:::webNode
        ViemClient["viem Client & Managed Signer"]:::webNode
    end

    subgraph Backend["Backend Layer (FastAPI)"]
        API["FastAPI REST Endpoints"]:::apiNode
        WebhookHandler["HMAC Webhook Ingestion & Worker"]:::apiNode
        EligibilityService["Cash & Points Eligibility Engine"]:::apiNode
        VoucherSigner["EIP-712 Voucher Signer"]:::apiNode
        ChainWatcher["Avalanche RPC Receipt Verifier"]:::apiNode
    end

    subgraph Storage["Persistent Ledger"]
        DB[("PostgreSQL\n(Users, Bounties, Allocations, Points Ledger)")]:::dbNode
    end

    subgraph Blockchain["Smart Contract Layer"]
        Escrow["GitBountyEscrow.sol\n(0xc8ff1527BF4d43A3bC7EA3d9fb415D5647739f65)"]:::contractNode
        USDC["Official Fuji USDC\n(0x5425890298aed601595a70AB815c96711a31Bc65)"]:::contractNode
    end

    GH -- "Signed HMAC Webhooks" --> WebhookHandler
    GH -- "GraphQL Timeline Queries" --> EligibilityService
    MaintainerUI -- "Create Bounty & Terms" --> API
    API --> DB
    EligibilityService --> DB
    VoucherSigner -- "Generate Typed EIP-712" --> ClaimUI
    ClaimUI -- "Sponsored Claim / UserOp" --> SS
    SS -- "Execute Batch Settlement" --> Escrow
    Escrow -- "SafeERC20 Transfer" --> USDC
    Escrow -- "BountyFunded / BountySettled" --> ChainWatcher
    ChainWatcher -- "Confirm Settlement" --> DB
    ViemClient -- "Read State / Balance" --> AVAX

    classDef githubNode fill:#24292e,stroke:#9CA3AF,stroke-width:2px,color:#FFFFFF;
    classDef avaxNode fill:#DC2626,stroke:#FCA5A5,stroke-width:2px,color:#FFFFFF;
    classDef ssNode fill:#2563EB,stroke:#93C5FD,stroke-width:2px,color:#FFFFFF;
    classDef webNode fill:#1E40AF,stroke:#60A5FA,stroke-width:2px,color:#FFFFFF;
    classDef apiNode fill:#047857,stroke:#34D399,stroke-width:2px,color:#FFFFFF;
    classDef dbNode fill:#B45309,stroke:#FDE68A,stroke-width:2px,color:#FFFFFF;
    classDef contractNode fill:#6D28D9,stroke:#C084FC,stroke-width:2px,color:#FFFFFF;
```

---

## End-to-End User Journey

```mermaid
sequenceDiagram
    autonumber
    actor Maintainer as Maintainer (Account A)
    participant GH as GitHub Platform
    participant GB as GitBounty Backend
    participant Escrow as GitBountyEscrow (Fuji)
    actor Contributor as Contributor (Account B)

    Note over Maintainer, Escrow: Phase 1: Publishing and Funding
    Maintainer->>GB: Connect Public Repo & Select Issue #42
    Maintainer->>GB: Specify Terms (40 pts, 1.00 USDC, workEndsAt)
    Maintainer->>Escrow: fund(referenceId, 1.00 USDC, workEndsAt)
    Escrow-->>GB: Event BountyFunded(bountyId, payer, amount, claimUntil)
    GB->>GB: Freeze Terms & Mark Bounty Active

    Note over Contributor, GH: Phase 2: Contribution and Merge
    Contributor->>GH: Open Pull Request with "Fixes #42" in Body
    Maintainer->>GH: Review and Merge into Default Branch (main)

    Note over GH, GB: Phase 3: Eligibility Attestation
    GH->>GB: Webhook: pull_request.closed (merged=true)
    GB->>GH: GraphQL Query: Verify ClosedEvent.closer matches PR
    GB->>GB: Validate: fundedAt <= mergedAt < workEndsAt
    GB->>GB: Reserve Win for Contributor's Numeric GitHub ID

    Note over Contributor, Escrow: Phase 4: Claiming Reward
    Contributor->>GB: Sign in & Link Receiving Wallet (EOA / Smart Account)
    GB->>Contributor: Issue Signed EIP-712 Settlement Voucher
    Contributor->>Escrow: settle(voucher, signature) via Sponsored UserOp
    Escrow->>Escrow: Verify Signer, Recipient, Nonce, Deadline
    Escrow->>Contributor: Transfer 1.00 USDC
    Escrow-->>GB: Event BountySettled(bountyId, recipient, amount)
    GB->>GB: Record Snowtrace TX & Mark Paid
```

---

## Smart Contract & Escrow Mechanics

The core contract is [`GitBountyEscrow.sol`](file:///c:/Users/dipes/Coding/Webdev/Gitbounty/main-gitbounty/gitbounty/contracts/contracts/GitBountyEscrow.sol), written in Solidity 0.8.30 with OpenZeppelin cryptographic and security libraries.

### State Transition Diagram

```mermaid
stateDiagram-v2
    [*] --> Absent: Unfunded
    Absent --> Funded: fund(referenceId, amount, workEndsAt)
    Funded --> Settled: settle(settlement, signature)\n[block.timestamp < deadline <= claimUntil]
    Funded --> Refunded: refund(bountyId)\n[block.timestamp >= claimUntil]
    Settled --> [*]
    Refunded --> [*]

    note right of Funded
        Holds USDC liability.
        claimUntil = workEndsAt + 7 days
    end note
```

### Key Contract Features
* **Payer-Bound Bounty IDs:**
  $$\text{bountyId} = \text{keccak256}(\text{abi.encode}(\text{block.chainid}, \text{address}(this), \text{msg.sender}, \text{referenceId}))$$
  Ensures third parties cannot front-run or disrupt a maintainer's funding parameters.
* **EIP-712 Settlement Voucher:**
  ```solidity
  struct Settlement {
      bytes32 bountyId;
      address recipient;
      address token;
      uint256 amount;
      uint256 nonce;
      uint256 deadline;
  }
  ```
  The digest is hashed according to EIP-712 domain rules (`name: "GitBountyEscrow"`, `version: "1"`, `chainId: 43113`, `verifyingContract: 0xc8ff...9f65`).
* **Conservation of Liabilities:** Direct accidental donations to the contract address do not dilute tracked liabilities or permit unauthorized balance withdrawals.
* **Fail-Safe Reentrancy & SafeERC20:** Protected with OpenZeppelin `ReentrancyGuard` and `SafeERC20`. State mutations precede all external token transfers.

---

## GitHub Eligibility Verification Engine

GitBounty strictly enforces automated validation before any cash allocation is authorized:

```mermaid
flowchart TD
    Start(["Webhook: PR Merged"]) --> CheckRepo{"Installed & Public\nRepository?"}
    CheckRepo -- No --> Reject["Ignore / No Reward"]
    CheckRepo -- Yes --> CheckBranch{"Merged into\nDefault Branch?"}
    CheckBranch -- No --> Reject
    CheckBranch -- Yes --> CheckAuthor{"Human Author & Not\nMaintainer/Payer?"}
    CheckAuthor -- No --> Reject
    CheckAuthor -- Yes --> ParseKeywords{"Single Same-Repo\nIssue Reference in Body?"}
    ParseKeywords -- No --> Reject
    ParseKeywords -- Yes --> CheckTimeline{"GraphQL ClosedEvent.closer\nMatches this PR?"}
    CheckTimeline -- No --> Reject
    CheckTimeline -- Yes --> CheckTiming{"fundedAt <= mergedAt\n< workEndsAt?"}
    CheckTiming -- No --> Reject
    CheckTiming -- Yes --> Allocate["Lock Winning Allocation\nto Numeric GitHub ID"]:::greenNode

    classDef greenNode fill:#065F46,stroke:#34D399,stroke-width:2px,color:#FFFFFF;
```

1. **Closing Keywords:** Requires standard GitHub keywords (`close`, `closes`, `closed`, `fix`, `fixes`, `fixed`, `resolve`, `resolves`, `resolved`) explicitly in the PR body.
2. **GraphQL Event Verification:** Uses GitHub's GraphQL API to read the issue `timelineItems` and confirm that the issue was closed by a `ClosedEvent` whose `closer` is the exact merged PR.
3. **No Retrospective Exploits:** Adding keywords to PR bodies or issues *after* merge does not establish closure.

---

## Wallet Strategy & Account Abstraction

GitBounty supports both frictionless developer onboarding and decentralized custody:

```mermaid
flowchart LR
    User["GitHub Authenticated User"] --> AuthChoice{"Wallet Provider"}
    
    AuthChoice -- "Managed Smart Account" --> SS["SmoothSend ERC-4337 Smart Account\n• Zero gas friction for contributor\n• Developer-sponsored execution\n• Encrypted signer derivation"]:::blueCard
    AuthChoice -- "Direct EOA Wallet" --> Ext["Injected Web3 Wallet (MetaMask / Core / Rabby)\n• User controls keys & pays gas\n• viem EIP-1193 discovery\n• Direct contract interaction"]:::purpleCard

    classDef blueCard fill:#1E40AF,stroke:#60A5FA,stroke-width:2px,color:#FFFFFF;
    classDef purpleCard fill:#6D28D9,stroke:#C084FC,stroke-width:2px,color:#FFFFFF;
```

* **SmoothSend Account Abstraction:** Automatically provisions an encrypted managed signer for GitHub users. Claims and funding can execute via sponsored `UserOperation` bundles without requiring contributors to hold native Fuji AVAX.
* **Direct EOA Fallback:** Developers preferring standalone wallets can connect their browser extension (Core, MetaMask, Rabby) via `viem`.

---

## Technology Stack

```text
┌────────────────────────────────────────────────────────────────────────┐
│                              FRONTEND                                  │
│  Next.js 16.4.6 (App Router) • React 19.3.0 • TypeScript • viem 2.57   │
│  Tailwind CSS • Vitest 5.0.3 • Testing Library • SmoothSend SDK 2.3    │
└───────────────────────────────────┬────────────────────────────────────┘
                                    │ Same-origin proxy / REST
┌───────────────────────────────────▼────────────────────────────────────┐
│                              BACKEND                                   │
│  FastAPI (Python 3.12) • SQLAlchemy / asyncpg • Pydantic • httpx       │
│  eth-account • eth-abi • cryptography (Fernet) • Pytest                │
└───────────────────────────────────┬────────────────────────────────────┘
                                    │ SQL & EVM RPC
┌─────────────────────────┬─────────┴────────────────────────────────────┐
│       DATABASE          │                  BLOCKCHAIN                  │
│  PostgreSQL (Supabase)  │  Solidity 0.8.30 (cancun EVM target)         │
│  20 Migrations          │  Avalanche Fuji C-Chain (Chain ID: 43113)    │
│  Durable Webhook Queue  │  OpenZeppelin Contracts v5.2.0 • Hardhat 3   │
└─────────────────────────┴──────────────────────────────────────────────┘
```

---

## Repository Structure

```text
gitbounty/
├── contracts/               # Solidity workspace (Hardhat)
│   ├── contracts/
│   │   ├── GitBountyEscrow.sol  # Primary escrow contract
│   │   └── test/MockUSDC.sol    # Deterministic test token
│   ├── deployments/fuji/        # Recorded Fuji deployment artifacts & env
│   ├── scripts/fuji.mjs         # Deployment and inspection scripts
│   └── test/GitBountyEscrow.ts  # Hardhat / node:test contract test suite
├── backend/                 # FastAPI application
│   ├── app/
│   │   ├── features/
│   │   │   ├── merged_prs/  # PR categorization, parsing, and lifecycle
│   │   │   └── points/      # Off-chain points ledger engine
│   │   ├── routes/          # REST endpoints (escrow, maintainer, issues, auth)
│   │   ├── crypto.py        # EIP-712 typed signing & hash validation
│   │   ├── escrow_chain.py  # Avalanche Fuji RPC and log decoder
│   │   └── managed_wallets.py # SmoothSend smart account management
│   └── tests/               # Backend test suite (Pytest)
├── frontend/
│   ├── web/                 # Next.js 16 Web Application
│   │   ├── app/             # App router pages (bounties, wallet, maintainers)
│   │   ├── components/      # UI components (escrow cards, claim modal)
│   │   └── tests/           # Vitest component & integration tests
│   └── extension/           # Optional browser extension
├── migrations/              # Numbered PostgreSQL schema migrations (0001 - 0020)
└── docs/                    # Architecture, specifications, and runbooks
```

---

## Verification and Test Results

All test suites and compilers across the entire monorepo pass cleanly:

### 1. Smart Contract Suite (Hardhat & Node.js)
```text
  GitBountyEscrow
    ✔ funds the payer-derived ID with the exact token amount
    ✔ rejects fee-on-transfer funding without leaving state behind
    ✔ settles permissionlessly to the signed recipient and blocks replay/refund
    ✔ rejects altered terms, the wrong signer/domain, and malformed signatures
    ✔ allows settlement just before the boundary and refund at the boundary
    ✔ preserves funded state when a token transfer fails
    ✔ keeps cross-bounty liabilities conserved despite direct donations
    ✔ rejects invalid constructor and funding terms
    ✔ matches the shared viem, Solidity, and Python EIP-712 golden vector

  9 passing (100% pass rate)
```

### 2. Frontend Test Suite & Static Analysis (Next.js / Vitest)
```text
  Test Files  11 passed (11)
       Tests  86 passed (86)
   Typecheck  next typegen && tsc --noEmit (0 errors)
```

### 3. Backend Test Suite (FastAPI / Pytest)
```text
  217 passed, 144 skipped (isolated local postgres DB tests), 0 failed
```

---

## Local Development Setup

### Prerequisites
* **Node.js:** v24.x
* **Python:** 3.12 with `uv`
* **PostgreSQL:** v15+

### 1. Smart Contracts
```powershell
cd gitbounty/contracts
npm install
npm test
```

### 2. Backend API
```powershell
cd gitbounty/backend
uv sync --locked
& .venv\Scripts\python.exe -m pytest tests -q
& .venv\Scripts\uvicorn.exe app.main:app --reload --port 8001
```

### 3. Frontend Web
```powershell
cd gitbounty/frontend/web
npm install
npm run typecheck
npm test
npm run dev
```
Open [http://localhost:3000](http://localhost:3000) in your browser.

---

## Deployed Network Artifacts

| Parameter | Value | Explorer Link |
|---|---|---|
| **Network** | Avalanche Fuji C-Chain | Chain ID `43113` |
| **Escrow Contract** | `0xc8ff1527BF4d43A3bC7EA3d9fb415D5647739f65` | [Snowtrace Address](https://testnet.snowtrace.io/address/0xc8ff1527BF4d43A3bC7EA3d9fb415D5647739f65) |
| **Deployment TX** | `0x302e9e0dce61ad1dd1fa8a7dccbca71c9f7d3f15a185ee0204fa728b84952e4d` | [Snowtrace Transaction](https://testnet.snowtrace.io/tx/0x302e9e0dce61ad1dd1fa8a7dccbca71c9f7d3f15a185ee0204fa728b84952e4d) |
| **Deployment Block**| `59609397` | Block confirmation on Fuji |
| **Official Test USDC**| `0x5425890298aed601595a70AB815c96711a31Bc65` | [Snowtrace Token](https://testnet.snowtrace.io/token/0x5425890298aed601595a70AB815c96711a31Bc65) |
| **Authorization Signer**| `0xf066119be9A9684a81Bd40B153A2E79d5451a8e0` | Backend attestation EOA |
| **Deployer Address**| `0x2867ab18c8E9a31AD29fE501d45ce3E50fB016aB` | Deployer EOA |
| **Compiler Target** | Solidity `0.8.30`, EVM `cancun` | Optimized (200 runs) |

---

## Documentation Directory

| Document | Purpose |
|---|---|
| [Product Overview](overview.md) | High-level product vision, user personas, and principles |
| [Architecture Specification](docs/architecture.md) | Technical topology, EIP-712 voucher structure, and boundaries |
| [Points & Eligibility Rules](docs/points-rules.md) | Detailed requirements for automated PR merge eligibility |
| [Implementation Audit](docs/implementation-audit.md) | Verification checklist and milestone tracking |
| [Hackathon Submission](docs/hackathon-submission.md) | Avalanche Builder Hub submission package & evidence |
| [Security Controls](docs/security.md) | Threat modeling, cryptographic controls, and signer isolation |
| [Setup Guide](docs/setup.md) | Complete environment configuration and local setup instructions |
| [Verification Runbook](docs/testing-data.md) | Deterministic and live verification runbooks |
