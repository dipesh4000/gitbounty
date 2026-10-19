# App custody rollout

## October 19 workspace correction

The workspace Payments screen now always uses the custodial app wallet. Loading,
failed or direct-mode configuration never mounts legacy browser-wallet controls.
Publishing new cash rewards in the web UI requires enabled sponsored escrow; points-only
publishing remains available. The backend blocks legacy payment signing while custody is
enabled, and sponsored publishing provisions the smart account before checking a legacy
wallet address. Historical external receiving addresses and issued rewards remain immutable.

The shared header reads the existing smart account balance through authenticated
`GET /api/sponsored/wallet`, without unlocking keys or creating an account. It checks
the RPC chain before displaying USDC. The dropdown reads saved operations and labels
submitted, confirmed-but-unverified, verified and failed states separately. Wallet status
and activity refresh after app actions, on focus and every 30 seconds. A missing account
is created only through the authenticated, CSRF-protected wallet POST or an approved bounty flow.
External wallets can deposit official Fuji USDC directly into the displayed smart account.
Generic transfers/withdrawals are not implemented.

The public production config was read on October 19: escrow was enabled on 43113,
but `execution_mode` was still `direct`. Deploy both frontend and backend changes and set
`ESCROW_EXECUTION_MODE=sponsored`, `MANAGED_WALLETS_ENABLED=true`, keeping the existing
`WALLET_ENCRYPTION_KEY` and `SMOOTHSEND_SECRET_KEY` in backend secret storage.
Do not regenerate an existing custody key. Verify migrations 0018–0020, sponsor origin
allowlist and credits. No deployment settings or shared database were changed in this pass.
The existing GitHub OAuth session and numeric GitHub identity remain authoritative;
Privy is not required for this custody implementation.

The owner authorized GitBounty custody on October 17, 2026. GitHub OAuth remains
the login mechanism. Privy is not part of this rollout.

Implemented: opt-in wallet generation during verified OAuth callback; one wallet
per numeric GitHub identity under a database lock; a separate Fernet secret for
encrypted private keys; identity/address checks when decrypting; preservation of
existing immutable external wallets; authenticated public-only wallet status.
No generic signing endpoint, private-key response or arbitrary transaction endpoint
is exposed.

Activation requires migrations 0018–0020 and WALLET_ENCRYPTION_KEY in backend secret
storage, separate from TOKEN_ENCRYPTION_KEY. Back up both the database and custody
secret securely before enabling MANAGED_WALLETS_ENABLED. Losing the secret loses
access to these wallets. This is application-level encrypted custody, not an HSM
or non-exportable managed signing service. Database ciphertext rotation and key
recovery procedures are not implemented; do not replace the secret for existing
wallets. Fuji is the only enabled custody chain.

Sponsored execution is implemented in app/sponsored.py. It derives and persists the
SmoothSend smart account, stores signed operations before broadcast, binds new
funding/refunds and unbound reward recipients to that account, and independently
verifies inner UserOperation success plus exact escrow/USDC evidence. Only
server-resolved fund/settle/refund actions approved by the signed-in user are
accepted; arbitrary calldata, amounts and recipients are rejected. Pending retries
reuse the stored operation. Historical receiving addresses and voucher bindings
are preserved; existing users receive a separate managed signer without moving funds.

The app wallet and escrow screens use this flow without browser-wallet signing.
The sponsored workspace hides the historical external-wallet payment controls.
SmoothSend developer sponsorship pays gas; maintainers still supply reward USDC.
There is no fallback to charging user gas or ERC-20 sponsorship fees.

Migrations 0018–0020 are applied to the configured database with owner authorization.
The server key passed a read-only Fuji gateway chain check; this does not establish
sponsor credit availability or transaction success. Production has not yet run the
new build's complete two-account sponsored flow. After deployment, configure
MANAGED_WALLETS_ENABLED=true and ESCROW_EXECUTION_MODE=sponsored with
ESCROW_ENABLED=true, the separate encryption secret and SMOOTHSEND_SECRET_KEY.
Check the deployment origin's sponsor allowlist and credits. Verify readiness,
funding, a genuine eligible GitHub merge, settlement and expiry/refund recovery
before describing the release as production-verified.
