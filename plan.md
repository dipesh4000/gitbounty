# GitBounty Hackathon Implementation Plan & Roadmap

---

## 1. Roadmap & Milestone Progress

```mermaid
flowchart LR
    P1["Phase 1: Escrow Contract\n(Solidity, Cancun, Fuji Deploy)"]:::done
    P2["Phase 2: Backend Attestation\n(EIP-712, GraphQL, Pytest)"]:::done
    P3["Phase 3: Managed Smart Accounts\n(SmoothSend AA, Vitest)"]:::done
    P4["Phase 4: Deterministic Vectors\n(Migrations 0001-0020)"]:::done
    P5["Phase 5: Two-Account Live Demo\n(Video & Public Receipts)"]:::inProgress

    P1 --> P2 --> P3 --> P4 --> P5

    classDef done fill:#DCFCE7,stroke:#16A34A,stroke-width:2px,color:#166534;
    classDef inProgress fill:#FEF3C7,stroke:#D97706,stroke-width:2px,color:#78350F;
```

---

## 2. Milestone Status Matrix

| Phase | Milestone Description | Exit Criteria | Status |
|---|---|---|---|
| **Phase 1** | **Escrow Contract & Fuji Deployment** | `GitBountyEscrow.sol` tested (9/9 pass) and deployed to Fuji C-Chain at `0xc8ff1527BF4d43A3bC7EA3d9fb415D5647739f65`. | **Completed** |
| **Phase 2** | **Backend Attestation & Eligibility** | EIP-712 signer implemented; GraphQL timeline closer check; 217 backend tests passing. | **Completed** |
| **Phase 3** | **Frontend & Account Abstraction** | SmoothSend SDK gas-sponsored execution; explicit review panels; 86 Vitest tests passing; 0 type errors. | **Completed** |
| **Phase 4** | **Schema Migrations & Golden Vectors** | Numbered PostgreSQL migrations 0001–0020 applied; cross-language EIP-712 vector matching Solidity, Python, and viem. | **Completed** |
| **Phase 5** | **Live Rehearsal & Submission Package** | Two-account GitHub run (`dipesh4000` / `dipesh-BS`), 3-minute video recording, and slide deck. | **In Progress** |

---

## 3. Account Abstraction & Custody Architecture

Per product requirements:
1. **GitHub Native OAuth:** Preserves standard GitHub OAuth for login and repository App installations.
2. **Managed Signer Provisioning:** On verified GitHub sign-in, the backend provisions an encrypted managed signer bound to the user's numeric GitHub ID.
3. **SmoothSend ERC-4337 Smart Account:** Maintainers and contributors execute funding, claims, and refunds via developer-sponsored `UserOperation` bundles without paying native gas or managing seed phrases.
4. **Direct Web3 Wallet Fallback:** Injected browser wallets (Core, MetaMask, Rabby) remain fully supported via `viem`.

---

## 4. Verification & Testing Deliverables

```mermaid
pie title Verified Monorepo Test Coverage
    "FastAPI Backend Tests (217)" : 217
    "Frontend Vitest Suites (86)" : 86
    "Hardhat Smart Contract Tests (9)" : 9
```

* **Smart Contracts:** 9/9 passing in Hardhat (`node:test`).
* **Frontend:** 86/86 passing in Vitest; Next.js route typegen clean.
* **Backend:** 217 passing unit, mock, and cryptographic tests in Pytest.
