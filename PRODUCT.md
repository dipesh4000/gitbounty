# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Users

- Open-source contributors who want to find issues suited to their skills and receive visible credit for merged work.
- Repository maintainers who want to attach a points value to work they need completed.

## Product Purpose

GitBounty turns merged open-source contributions into points. Maintainers assign points to issues, contributors earn those points when qualifying pull requests merge, and the resulting scores power personal histories and leaderboards.

## Positioning

GitBounty keeps the reward loop inside familiar GitHub work: issue selection, pull requests, and merges. The current product uses points and recognition rather than payments, wallets, or escrow.

## Operating Context

People sign in with GitHub, browse categorized issues, complete work through GitHub, review their awarded points, and compare scores on leaderboards. The website must remain useful without the optional browser extension.

## Capabilities and Constraints

- Current frontend behavior is demonstrated with local sample data and an authentication stub; planned backend behavior must not be described as live.
- The current website is the exact single-page landing design with an API-backed issue board.
- GitHub OAuth, persisted users, merged-PR synchronization, and real issue data belong to later backend integration.
- The backend stack is FastAPI with Postgres, but this frontend rebuild must not invent API contracts.
- No wallet, blockchain, escrow, webhook, or funds-moving behavior belongs to the points version.
- The per-merge baseline award, issue-value cap, and anti-collusion rules remain undecided.

## Brand Commitments

- Product name: GitBounty.
- Preserve the established Graphite Lime visual identity, logo assets, direct voice, and GitHub-centered terminology.
- The Next.js rebuild must match the existing `frontend/web` experience rather than redesign it.

## Evidence on Hand

- `overview.md`, `agent.md`, `plan.md`, and `feature-split.md` define the current points product and ownership boundaries.
- The vanilla HTML, CSS, and JavaScript page on the teammate branch is the visual and interaction specification for `frontend/web/`.
- There are no production usage metrics, customer claims, or testimonials to present as evidence.

## Product Principles

1. Reward shipped open-source work without requiring maintainers or contributors to change their GitHub workflow.
2. Make points and their provenance understandable at a glance.
3. Keep planned features visibly distinct from functionality that already works.
4. Preserve the website as the complete product surface; the extension remains optional.
5. Treat money and escrow as a separate future phase.
