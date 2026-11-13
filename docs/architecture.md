# GitBounty Architecture Specification

---

## 1. System Overview & Shipped Status

GitBounty connects GitHub's developer platform with the Avalanche C-Chain network through an attested escrow architecture. The backend cryptographically validates GitHub repository events, and the on-chain smart contract enforces fund escrow, authorization verification, and non-reentrant token settlement.

### Implementation Status Matrix

| Component | Implemented Technologies & Artifacts | Status |
|---|---|---|
| **Web Frontend** | Next.js 16.4.6, React 19.3.0, TypeScript 5.9, Tailwind CSS, viem 2.57 | **Production Ready** |
| **Backend API** | FastAPI, Python 3.12, asyncpg, SQLAlchemy, Pydantic, httpx | **Production Ready** |
| **Database** | PostgreSQL with 20 numbered migrations applied (Supabase compatible) | **Production Ready** |
| **Smart Contract** | Solidity 0.8.30 (EVM `cancun`), OpenZeppelin Contracts v5.2.0 | **Deployed on Fuji** |
| **Escrow Address** | `0xc8ff1527BF4d43A3bC7EA3d9fb415D5647739f65` (Fuji Block 59609397) | **Verified on Snowtrace** |
| **Wallet & Account Abstraction** | SmoothSend ERC-4337 Smart Accounts + Injected EOA Discovery | **Production Ready** |
| **GitHub Integration** | GitHub OAuth + GitHub App HMAC Webhook Inbox + GraphQL Timeline | **Production Ready** |

---

## 2. Component Topology

```mermaid
flowchart TD
    subgraph ClientLayer["Frontend Layer (Next.js 16 & viem)"]
        Browser["User Browser / Client"]
        BrowserUI["App Router Pages & Tailwind UI"]
        ManagedWallet["SmoothSend Smart Account SDK"]
        InjectedWallet["Injected EOA (Core / MetaMask / Rabby)"]
        Browser --> BrowserUI
        BrowserUI --> ManagedWallet
        BrowserUI --> InjectedWallet
    end

    subgraph APILayer["Backend Services (FastAPI & Python 3.12)"]
        Proxy["Same-Origin Next.js Proxy"]
        Endpoints["REST API Endpoints (/bounties, /wallet, /ready)"]
        AuthMiddleware["Signed HttpOnly Session Auth"]
        CSRF["Origin / Referer / Token CSRF Protection"]
        VoucherSigner["EIP-712 Voucher Signer (eth_account)"]
        ChainWatcher["Avalanche JSON-RPC Log Verifier"]
        
        BrowserUI --> Proxy
        Proxy --> Endpoints
        Endpoints --> AuthMiddleware
        AuthMiddleware --> CSRF
    end

    subgraph WorkerLayer["Asynchronous Ingestion & Ledger Engine"]
        WebhookInbox["HMAC-SHA256 Webhook Receiver"]
        TimelineService["GitHub GraphQL Timeline Validator"]
        AllocationEngine["ACID Winning Allocation Service"]
        PointsEngine["Append-Only Points Ledger (points-v1)"]

        WebhookInbox --> TimelineService
        TimelineService --> AllocationEngine
        AllocationEngine --> PointsEngine
        AllocationEngine --> VoucherSigner
    end

    subgraph DataStore["Data Tier"]
        DB[("PostgreSQL\n• Users & GitHub IDs\n• Bounties & Terms\n• Allocations & Snapshots\n• Webhook Ingestion Events\n• Points Ledger Entries")]
    end

    subgraph Blockchain["Avalanche Fuji C-Chain (Chain ID 43113)"]
        Bundler["SmoothSend Paymaster / Bundler"]
        Escrow["GitBountyEscrow.sol\n(0xc8ff...9f65)"]
        USDC["Official Fuji Test USDC\n(0x5425...Bc65)"]

        ManagedWallet --> Bundler
        Bundler --> Escrow
        InjectedWallet --> Escrow
        Escrow --> USDC
        Escrow -- "Logs & Events" --> ChainWatcher
    end

    Endpoints --> DB
    AllocationEngine --> DB
    ChainWatcher --> DB

    classDef clientStyle fill:#1E40AF,stroke:#60A5FA,stroke-width:2px,color:#FFFFFF;
    classDef apiStyle fill:#047857,stroke:#34D399,stroke-width:2px,color:#FFFFFF;
    classDef workerStyle fill:#B45309,stroke:#FDE68A,stroke-width:2px,color:#FFFFFF;
    classDef dbStyle fill:#6D28D9,stroke:#C084FC,stroke-width:2px,color:#FFFFFF;
    classDef chainStyle fill:#B91C1C,stroke:#F87171,stroke-width:2px,color:#FFFFFF;

    class ClientLayer clientStyle;
    class APILayer apiStyle;
    class WorkerLayer workerStyle;
    class DataStore dbStyle;
    class Blockchain chainStyle;
```

---

## 3. GitHub Verification & Eligibility Pipeline

GitBounty does not allow clients to self-report merges or winners. Eligibility is authoritatively proven through the GitHub App and GraphQL APIs:

```mermaid
sequenceDiagram
    autonumber
    participant Contributor as Contributor
    participant GH as GitHub Platform
    participant GB as GitBounty Ingestion Worker
    participant DB as PostgreSQL Database

    Contributor->>GH: Open Pull Request targeting repository default branch
    Note over Contributor, GH: Body contains closing reference e.g., "Fixes #10"
    GH->>GH: Maintainer reviews and merges PR
    GH->>GB: Webhook: pull_request (action: closed, merged: true)
    
    GB->>GB: 1. Validate HMAC-SHA256 signature using GITHUB_WEBHOOK_SECRET
    GB->>GB: 2. Check delivery_id idempotency (prevent replay)
    GB->>GH: 3. Query GraphQL issue timelineItems(itemTypes: [CLOSED_EVENT])
    GH-->>GB: Return ClosedEvent with closer PR ID and timestamp
    
    GB->>GB: 4. Assert closer PR ID matches merged PR
    GB->>GB: 5. Assert canonical fundedAt <= mergedAt < workEndsAt
    GB->>GB: 6. Assert author is distinct from repository owner and payer
    
    GB->>DB: 7. Atomic transaction: Lock winning allocation to author numeric ID
    GB->>DB: 8. Append baseline points (5) and bounty points to points ledger
```

---

## 4. Smart Contract Architecture

The escrow smart contract [`GitBountyEscrow.sol`](file:///c:/Users/dipes/Coding/Webdev/Gitbounty/main-gitbounty/gitbounty/contracts/contracts/GitBountyEscrow.sol) is non-upgradeable and deployed on Avalanche Fuji.

### Escrow State Machine

```mermaid
stateDiagram-v2
    direction LR
    [*] --> Absent : Uninitialized

    Absent --> Funded : fund(referenceId, amount, workEndsAt)\n[transferFrom exact amount]
    
    Funded --> Settled : settle(voucher, signature)\n[block.timestamp < deadline <= claimUntil]
    
    Funded --> Refunded : refund(bountyId)\n[block.timestamp >= claimUntil]

    Settled --> [*]
    Refunded --> [*]

    note right of Funded
      Tracks totalLiabilities.
      Direct token donations cannot
      increase liabilities or allow drain.
    end note
```

### Identifier Derivation

To prevent identifier collisions, front-running, or cross-chain replays, bounty IDs are derived using standard ABI encoding:

$$\text{referenceId} = \text{keccak256}(\text{abi.encode}(\text{namespace}, \text{databaseBountyId}))$$
$$\text{bountyId} = \text{keccak256}(\text{abi.encode}(\text{block.chainid}, \text{address}(this), \text{payer}, \text{referenceId}))$$

Because `msg.sender` is bound as `payer`, funding from an unexpected wallet derives a different `bountyId`, protecting the intended funding parameters.

### EIP-712 Settlement Authorization

Settlement authorization digests are computed according to the EIP-712 specification:

```mermaid
classDef structStyle fill:#F8FAFC,stroke:#475569,stroke-width:2px,color:#0F172A;

class GitBountyDomain {
    +string name: "GitBountyEscrow"
    +string version: "1"
    +uint256 chainId: 43113
    +address verifyingContract: 0xc8ff...9f65
}
class Settlement {
    +bytes32 bountyId
    +address recipient
    +address token
    +uint256 amount
    +uint256 nonce
    +uint256 deadline
}
```

The voucher specifies:
* `bountyId`: The unique 32-byte hash identifying the escrow deposit.
* `recipient`: The verified contributor's linked wallet (EOA or Smart Account).
* `token`: The token contract address (`0x5425890298aed601595a70AB815c96711a31Bc65`).
* `amount`: The exact token units (USDC with 6 decimals).
* `nonce`: `0` for initial settlement (protects against authorization re-use).
* `deadline`: Voucher expiry timestamp, which must satisfy $\text{block.timestamp} < \text{deadline} \le \text{claimUntil}$.

---

## 5. Wallet Architecture & Account Abstraction

GitBounty implements a hybrid wallet model:

```mermaid
flowchart TD
    User(["Authenticated GitHub User"]) --> SessionCheck{"Wallet Binding Status"}

    SessionCheck -- "New / First-Time User" --> DeriveAccount["Derive Managed Signer & SmoothSend Smart Account"]
    DeriveAccount --> SmartAccount["Gasless ERC-4337 Smart Account\n• Zero gas needed\n• Operations sponsored by paymaster"]

    SessionCheck -- "Existing Linked EOA" --> ExistingEOA["Preserved Linked Wallet Address\n• Immutable binding per GitHub ID\n• Prevents address reassignment attacks"]

    SessionCheck -- "Direct Browser Provider" --> InjectedProvider["Injected EIP-1193 Provider\n• Core / MetaMask / Rabby via viem\n• Direct user-signed transactions"]

    classDef default fill:#F8FAFC,stroke:#64748B,stroke-width:1.5px,color:#0F172A;
```

* **SmoothSend Account Abstraction:** Eliminates onboarding friction by provisioning an encrypted managed signer for GitHub users. Funding and settlement UserOperations are submitted to the SmoothSend bundler with developer paymaster sponsorship.
* **Direct EOA Discovery:** For power users, the frontend uses `viem` to detect and interact with standard EVM browser wallets.
* **Immutable Wallet Binding:** Once a receiving wallet address is bound to a numeric GitHub ID in PostgreSQL, it cannot be silently rewritten by subsequent sessions.

---

## 6. Security Boundaries & Trust Disclosures

1. **Attested Settlement Model:** GitBounty is an **attested escrow system**, not a fully trustless oracle. The backend signer (`0xf066119be9A9684a81Bd40B153A2E79d5451a8e0`) is trusted to honestly attest GitHub eligibility.
2. **Contract Enforces Custody:** The smart contract ensures the backend *cannot* steal funds or redirect an active bounty to an arbitrary address—the contract requires a valid voucher and respects the immutable token, recipient, and payer rules.
3. **Payer Protection:** Maintainers are guaranteed their funds cannot be locked indefinitely. Once `claimUntil` passes without a verified settlement, the maintainer can call `refund(bountyId)` directly on-chain without backend cooperation.
