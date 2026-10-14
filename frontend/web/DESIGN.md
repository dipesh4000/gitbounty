# GitBounty design

Use the owner's October 2026 landing-page reference: charcoal surfaces, lavender details,
rounded cards, Mona Sans and the supplied cat mascot. The React website and extension share this direction.

- Website canvas: `#08090d`; surfaces: `#101219`, `#141722`.
- Main text: `#f4f4f8`; secondary text: `#bcc0ce`; muted text: `#a3a8ba`.
- Landing primary buttons: `#7150e8` with white text and lavender accents. Extension retains purple surfaces.
- Signed-in workspace uses GitHub-style neutral dark surfaces (`#0d1117`, `#161b22`), blue
  accents/focus (`#79c0ff`), system typography, 13–16px labels/body text and consistent controls.
  Open statuses are green; merged statuses are purple. These tokens are scoped to `.app-shell`.
- Hero preview straightens on scroll using CSS view timelines. Browsers without support show a
  static preview; small screens and reduced-motion preferences disable the transform.
- Marketing contribution graph uses purple intensity levels, visibly labelled as illustrative.
- Use the bundled Mona Sans files; no runtime font service is needed.
- Preserve accessible names, keyboard operation, sufficient contrast and reduced-motion preferences.

The homepage has two primary actions: **Explore bounties** and **Create a bounty**.
Explore, Create and Leaderboard open the sign-in page for signed-out visitors. Creating also
requires repository maintainer permissions. Docs, policies and extension setup stay public.
The current native-anchor navigation is intentional and covered by browser tests.
Use the existing API helpers and task controls rather than duplicate forms in marketing sections.

Marketing examples must visibly say they are illustrative. The published bounty list, account,
points, claims and leaderboard always use API data. Loading, empty and error states are distinct.
Points are contribution credit, separate from an owner's exact Avalanche reward promise.
Label Fuji USDC as test tokens. A promise is unpaid until its payment is verified; wallet funds
are not earned points or guaranteed rewards. GitBounty does not fund or guarantee owner promises.

Landing styles are scoped in `app/reward.css`. Shared tokens live in `app/globals.css`;
functional screen layouts use `app/workspace.css`. Extension styles live in `popup/popup.css`
and `styles/content.css`. Artwork is local and extension permissions remain unchanged.

## Supplied landing preview and interior UX

The October 10 supplied HTML is a suitable landing-page foundation and shared visual direction.
Its purple palette, typography, mascot, cards and contributor/maintainer paths fit GitBounty.
The fixed copy is `landing-preview.html`; the live React homepage has not been replaced.
This is a visual prototype: sample profiles, activity and rewards are illustrative, and primary
actions still open explanatory dialogs. Production integration must reuse real routes, authentication,
API data and loading/empty/error states rather than ship those placeholders.

Inside the app, use the scoped workspace tokens and system typography with compact task layouts.
Keep persistent navigation, readable tables and one clear next action per stage. Reserve hero-scale
art and scroll effects for marketing; activity and payment screens need stable, predictable controls.

- Contributor flow: discover and filter → inspect the GitHub issue and reward terms → submit a PR →
  follow review/merge status → claim eligible points → connect or create a Privy wallet → claim a funded
  reward from escrow → see verified settlement. A merge or points award alone must not read as a paid reward.
- Maintainer flow: select repository → configure issues, points and exact reward promises → review
  and publish → fund the escrowed reward → review contributions → merge an eligible PR → follow the
  contributor claim and verified settlement.
- Payment review must identify network, escrow contract, recipient, token, exact reward and claim state.
  Show work cutoff and claim deadline before funding or contribution; a cash award can expire while
  points remain. Approval and funding are separate actions. Show AVAX gas separately from test USDC.
  Payment lists separate owner payouts from contributor rewards, with merge/claim/payment progress
  and a role-specific next action. A linked address is not proof of a current browser connection;
  show these states separately and detect account mismatch before a claim is submitted.
  Missing escrow funds, an expired authorization, a network mismatch, a pending transaction, and failed
  verification each need a specific next step.
- Name Privy when explaining login or wallet custody. Name SmoothSend only when its optional transaction
  path is actually active. Do not call either service a GitBounty wallet, bank account, or proof of payment.
  Keep wallet setup available before a reward exists and payment-workflow help expandable.
- Preserve the existing permanent receiving address during Privy onboarding. Explain same-address
  recovery; connecting a different external wallet cannot recover an embedded wallet's control.
- Make funded/awarded/paid/refundable states readable without login on the public proof page. Explain
  that GitBounty attests GitHub eligibility and the contract enforces the authorized transfer.
- Extension flow: Discover is the default, with title search and the beginner filter visible.
  Language/category/sort live in expandable filters; paging preserves the query. Issue cards link
  directly to GitHub. Account & wallet holds full balances, network, address and recent activity.
  A compact balance summary stays visible above discovery. Missing balances never become zero.
- Beginner means an explicit maintainer label, not an invented difficulty or time estimate.
  Discovery currently covers published GitBounty bounties, not the entire GitHub issue index.

The preview fixes honor reduced motion in JavaScript as well as CSS, improve extension-example
contrast and allow the public Terms dialog without implying sign-in is required. Local assets,
keyboard tabs, dialogs, contrast and reflow are checked at 1440, 960 and 320 pixels.
