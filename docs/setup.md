# GitBounty Development & Setup Guide

This guide covers local environment setup, configuration, smart contract deployment, and testing workflows for GitBounty.

---

## 1. Prerequisites

* **Node.js:** v24.x (LTS recommended)
* **Python:** 3.12 (managed via `uv`)
* **PostgreSQL:** v15+ (Local instance or Supabase)
* **Git:** Installed and configured
* **Avalanche Wallet:** An EVM wallet with Fuji test AVAX and Fuji test USDC

---

## 2. Repository Layout

GitBounty is organized into distinct functional workspaces:

```text
gitbounty/
├── contracts/               # Solidity workspace (Hardhat 3)
├── backend/                 # FastAPI application (Python 3.12)
├── frontend/web/            # Next.js 16 Web Application
├── migrations/              # Numbered PostgreSQL schema migrations
└── docs/                    # Architectural and setup specifications
```

---

## 3. Environment Configuration

Copy `.env.example` in `gitbounty/` to `.env`:

```powershell
cp gitbounty/.env.example gitbounty/.env
```

### Essential Environment Variables

```ini
# Database
DATABASE_URL=postgresql://postgres:postgres@localhost:5432/gitbounty

# Security & Sessions
SESSION_SECRET=your-32-byte-hex-session-secret
TOKEN_ENCRYPTION_KEY=your-fernet-token-encryption-key
WALLET_ENCRYPTION_KEY=your-fernet-wallet-encryption-key

# GitHub OAuth & GitHub App
GITHUB_CLIENT_ID=your-github-client-id
GITHUB_CLIENT_SECRET=your-github-client-secret
GITHUB_CALLBACK_URL=http://localhost:8001/auth/github/callback
GITHUB_APP_ID=your-app-id
GITHUB_APP_SLUG=gitbounty-app
GITHUB_APP_PRIVATE_KEY_PATH=/path/to/private-key.pem
GITHUB_WEBHOOK_SECRET=your-webhook-secret

# Avalanche Fuji Escrow Configuration
ESCROW_ENABLED=true
ESCROW_CHAIN_ID=43113
ESCROW_CONTRACT_ADDRESS=0xc8ff1527BF4d43A3bC7EA3d9fb415D5647739f65
ESCROW_TOKEN_ADDRESS=0x5425890298aed601595a70AB815c96711a31Bc65
ESCROW_AUTHORIZATION_SIGNER_KEY=your-64-char-hex-signer-private-key
ESCROW_RPC_URL=https://api.avax-test.network/ext/bc/C/rpc

# Account Abstraction (SmoothSend)
MANAGED_WALLETS_ENABLED=true
ESCROW_EXECUTION_MODE=sponsored
SMOOTHSEND_SERVER_KEY=your-smoothsend-server-key
NEXT_PUBLIC_SMOOTHSEND_PUBLISHABLE_KEY=your-smoothsend-publishable-key
```

---

## 4. Smart Contracts Workspace

```mermaid
flowchart LR
    A["Install Dependencies"] --> B["Run Hardhat Tests"] --> C["Inspect Fuji Deployment"]
    
    A -->|"npm install"| B
    B -->|"npm test"| C
    C -->|"node scripts/fuji.mjs inspect"| D["Verified!"]

    classDef default fill:#F8FAFC,stroke:#64748B,stroke-width:1.5px,color:#0F172A;
```

```powershell
cd gitbounty/contracts
npm install
npm test
```

### Deploying to Avalanche Fuji (Optional / Operator Only)
```powershell
node scripts/fuji.mjs deploy --network fuji
node scripts/fuji.mjs inspect --network fuji
```

---

## 5. Backend API Setup

```powershell
cd gitbounty/backend
uv sync --locked
```

### Running Backend Tests
```powershell
& .venv\Scripts\python.exe -m pytest tests -q
```

### Starting the FastAPI Server
```powershell
& .venv\Scripts\uvicorn.exe app.main:app --reload --port 8001
```

Useful endpoints:
* **API Documentation:** [http://localhost:8001/docs](http://localhost:8001/docs)
* **Health Check:** [http://localhost:8001/health](http://localhost:8001/health)
* **Readiness Diagnostic:** [http://localhost:8001/ready](http://localhost:8001/ready)

---

## 6. Frontend Web Setup

```powershell
cd gitbounty/frontend/web
npm install
```

### Validating Code and Types
```powershell
# TypeScript Typecheck
npm run typecheck

# Unit and Integration Tests
npm test
```

### Running Next.js Dev Server
```powershell
npm run dev
```
Open [http://localhost:3000](http://localhost:3000) in your browser.

---

## 7. PostgreSQL Migrations

Migrations are stored in [`gitbounty/migrations/`](file:///c:/Users/dipes/Coding/Webdev/Gitbounty/main-gitbounty/gitbounty/migrations/).

To inspect or apply migrations:
```powershell
cd gitbounty/backend
uv run python dev/migrate.py status
uv run python dev/migrate.py up
```
Migrations 0001 through 0020 establish user identity, webhook queue tables, points ledger, escrow contracts, and smart account bindings.
