# GitBounty product overview

This document defines the product direction for the Avalanche hackathon build. Implementation status and sequencing live in [plan.md](plan.md).

## One-line description

GitBounty turns verified GitHub contributions into transparent points and funded Avalanche rewards for the developer who actually authored the merged pull request.

## The problem

Open-source maintainers struggle to make valuable issues visible and reward contributors reliably. Contributors cannot easily tell which rewards are real, who will receive them, or whether a merge will be recognized. Existing bounty flows often depend on manual screenshots, mutable labels, usernames that can change, and payments that happen outside the product.

## The product

Maintainers connect public repositories, publish bounties, and optionally fund a USDC reward on Avalanche. Contributors discover those issues, work through normal GitHub pull requests, and earn rewards when GitBounty verifies an eligible merge.

The reward always belongs to the pull request author. GitBounty keys identity to the stable GitHub numeric ID and links that identity to a user-controlled wallet. Points remain an off-chain reputation record. Funded USDC rewards settle on Avalanche and are independently verifiable.

## Hackathon promise

The submission must demonstrate one complete journey on Avalanche Fuji:

1. A maintainer signs in and connects a public GitHub repository.
2. The maintainer publishes an issue bounty and funds its USDC reward on Fuji.
3. A different GitHub user authors a pull request that closes the issue.
4. GitBounty verifies the merge and reserves the reward for that author's numeric GitHub ID.
5. The contributor signs in, links or creates a wallet, and claims the reward.
6. The Avalanche transaction succeeds and GitBounty shows the verified Snowtrace transaction.

Everything else is secondary until this flow works in the deployed application.

## Product principles

- **GitHub proves the work.** A client cannot self-report a merge, author, repository, or issue.
- **The PR author owns eligibility.** The backend binds the verified author to a proven recipient; the contract pays that signed address. The backend signer remains a disclosed trust dependency.
- **Avalanche proves settlement.** A reward is paid only after the expected on-chain transfer is independently verified.
- **Funded means funded.** Cash rewards should be escrowed before contributors rely on them.
- **Points and money stay separate.** Points are reputation; USDC is an explicit funded reward.
- **Users control their wallets.** Embedded-wallet convenience must retain an export or recovery path.
- **Core data stays portable.** GitBounty owns its users, GitHub IDs, bounty records, ledger, and transaction evidence.
- **Provider integrations are replaceable.** Privy and SmoothSend may improve UX, but neither defines reward ownership or settlement truth.

## Target experience

### Maintainer

- Sign in with GitHub.
- Connect selected public repositories through the GitHub App.
- Choose an open issue, points, category, and optional Fuji USDC amount.
- Fund the reward into the GitBounty escrow contract.
- See funding and lifecycle status, work cutoff, claim deadline, settlement, and expiry-based refund.

### Contributor

- Browse funded and points-only bounties.
- Open a normal GitHub pull request with a closing reference.
- Sign in after the merge without losing a pre-registration award.
- Use a Privy embedded wallet or a supported external wallet.
- Claim funded USDC and open the verified transaction on Snowtrace.

### Public visitor

- Browse real published bounties without signing in.
- Distinguish points-only, promised, and contract-funded rewards.
- Inspect repository, issue, reward amount, lifecycle, and settlement evidence.

## Target architecture decisions

- **Frontend:** Next.js and React.
- **Backend:** FastAPI and PostgreSQL.
- **GitHub:** OAuth-linked identity plus GitHub App installations and signed webhooks.
- **Authentication:** Privy native GitHub OAuth is the preferred upgrade; verified identity maps to the existing GitBounty session and numeric GitHub ID. Existing GitHub OAuth remains the tested fallback.
- **Wallet UX:** Privy embedded/external EVM wallets, mapped to an authenticated GitHub user and backed by wallet proof.
- **Chain:** Avalanche C-Chain; Fuji for the hackathon demo.
- **Asset:** official Fuji USDC for the demo.
- **Settlement:** a minimal non-upgradeable `GitBountyEscrow` Solidity contract with focused tests; testing does not constitute an independent security audit.
- **Transaction UX:** direct Privy wallet transactions first; SmoothSend may add account abstraction, sponsored execution, recovery, or fee improvements where it helps.
- **Source of truth:** GitBounty validates GitHub eligibility; the contract validates authorization and prevents duplicate settlement.

The full service-dependency policy is in [dependency boundaries](docs/dependency-boundaries.md).

## Contract scope

The first contract should do only what the demo requires:

- Accept a funded bounty identified by an immutable `bytes32 bountyId`.
- Store payer, amount, work cutoff, claim deadline, and state; token and signer are immutable contract-wide.
- Accept a backend-signed EIP-712 settlement authorization naming the exact recipient and amount.
- Prevent replay and double payment.
- Transfer the escrowed token to the recipient.
- Allow a refund to the recorded payer at or after the seven-day claim grace expires; no early cancellation.
- Emit events for funding, settlement, and refund.

Repository metadata, PR validation, points, search, moderation, and GitHub identities stay off-chain.

An off-chain award does not extend the on-chain claim window. Contributors must settle before the displayed claim deadline. The backend signer is trusted to attest GitHub eligibility, and an embedded-wallet outage can prevent that wallet from signing. Exact policies are in [reward rules](docs/points-rules.md).

## Non-goals for the hackathon MVP

- Private repositories.
- A marketplace token or points-to-money conversion.
- Custodial balances, withdrawals, or exchange services.
- Automatic server control over user wallets.
- Multi-chain settlement.
- A custom Avalanche L1.
- eERC, ICM, or ICTT unless the complete Fuji C-Chain flow is already proven.
- Production-grade dispute arbitration.

## Success metrics

- One funded Fuji bounty completed end to end by two distinct GitHub accounts.
- One verified USDC transfer visible on Snowtrace.
- No duplicate award or settlement after retries.
- A deployed demo that a judge can understand without local setup.
- A source repository, concise architecture explanation, pitch slides, and demo video at most three minutes.

## After the hackathon

Potential expansion includes maintainer organizations, reusable escrow factories, dispute windows, gas sponsorship, multi-chain rewards, privacy-preserving payouts with eERC, and cross-L1 rewards with ICM/ICTT. These are roadmap options, not prerequisites for the submission.
