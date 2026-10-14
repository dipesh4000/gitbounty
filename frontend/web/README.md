# GitBounty website

React/TypeScript using the standard Next.js App Router.
Includes public landing and informational pages, plus the signed-in explorer, maintainer/contributor workspace and leaderboard. `/login` preserves the selected workspace through GitHub OAuth.

From this folder:

```text
npm ci
npm run dev
```

The site serves port 3000 and calls the API on port 8001 by default during local development.
On Vercel, API calls use the same-origin `/api` and `/auth` routes configured in the repository-root
`vercel.json`; leave `NEXT_PUBLIC_GITBOUNTY_API` unset there. Set it only when intentionally targeting
a separate API origin, such as in end-to-end tests.
[Local setup](../../docs/setup.md) covers the backend and OAuth.

Checks: `npm run lint`, `npm run typecheck`, `npm test`, `npm run build`.
Also verify `npm run start` after toolchain upgrades; a successful build alone has previously missed runtime failures.

Small `page.tsx` files are framework route entries. Shared content, metadata and layout live in
`app/components`; keep route entries thin.

Use existing styles in `app/globals.css` and API helpers in `app/lib/api.ts`.
[DESIGN.md](DESIGN.md) is the visual reference; [plan](../../plan.md) is implementation status.

## Reward implementation

The current screen dynamically loads `@smoothsend/sdk/avax` from `app/lib/wallet.ts`.
`AvaxRewards.tsx` provides external-wallet setup, funding, review, submission, and recovery for that
earlier provider-specific path. Only its public provider key belongs in the browser.

The hackathon target replaces the required provider flow with Privy login/wallets and direct interaction
with the funded `GitBountyEscrow` contract on Fuji. SmoothSend can remain as an optional sponsored or
account-abstraction execution path, but the same claim must work without it. UI copy must distinguish
off-chain points, an escrow-funded reward, an eligible claim, a submitted transaction, and a verified
settlement. See [target architecture](../../docs/architecture.md#target-hackathon-architecture) and the
[live Fuji runbook](../../docs/testing-data.md#final-live-fuji-runbook).
