# Accessibility

Measured, not asserted. This records what was actually checked, what it found, what was fixed, and — just
as importantly — what these checks cannot tell you.

Last run: 2026-10-02, against the **production build** on Chromium 153 (Playwright), with axe-core via
`@axe-core/playwright`. The suite is `e2e/tests/accessibility.spec.ts` and runs in CI.

## What is checked automatically

`npm test` in `e2e/` runs 22 accessibility checks. Every one of the pages below is audited against the
**WCAG 2.0 A/AA and 2.1 A/AA** rule tags.

| Page | Result |
|---|---|
| `/` (landing) | no violations — 29 checks passed |
| `/explore` (signed out) | no violations — 29 checks |
| `/leaderboard`, `/maintainers`, `/docs`, `/extension`, `/status`, `/privacy`, `/terms`, `/contributors`, `/how-it-works` | no violations — 21 checks each |
| 404 page | no violations — 19 checks |
| Workspace: Opportunities | no violations — 19 checks |
| Workspace: My repositories | no violations — 23 checks |
| Workspace: My PRs | no violations — 19 checks |
| Workspace: Points history | no violations — 16 checks |
| Workspace: Leaderboard | no violations — 19 checks |
| The bounty publication form, with an issue selected | no violations — 24 checks |

Beyond axe, the same suite checks:

| | Result |
|---|---|
| **Keyboard operation** — tab to "My repositories", activate with Enter, tab to "Choose issues", activate, focus the checkbox, tick it with Space | passes; the publish flow is reachable with no mouse |
| **Visible focus** — every element reached in 20 consecutive Tab presses on the landing page has an outline or a box-shadow | passes |
| **Heading structure** — exactly one `h1`, and no level skipped | passes |
| **Accessible names** — every `button`, `a[href]`, `input`, `select` and `textarea` has a label, `aria-label`, `title` or wrapping `<label>` | passes |
| **Form labels** — the checkbox, the points field and the category select each have an accessible name | passes |
| **Status announcements** — a change that arrives asynchronously is inside an `aria-live` region | passes |
| **Reduced motion** — under `prefers-reduced-motion: reduce`, **zero** elements still have a non-zero transition or animation duration | passes |
| **Reflow** — no horizontal scrolling at 320px, or at 640×400 (standing in for 1280 at 200% zoom) | passes |
| **Table semantics** — nothing claims `role="table"` without rows | passes |

## What it found, and what was changed

Three real failures, all found by measuring rather than by reading the code:

1. **The "How it works" step tabs were unreadable.** They are real tabs (`role="tab"`) and the unselected
   ones were dimmed to 0.4 opacity, which axe measured at **1.95:1** against a required 4.5:1. Dimming a
   *control* is the worst place to do it. Fixed by leaving the text at full opacity and carrying the
   selected state through the border, the step number's colour and the dot, all of which already changed.

2. **The hero sequence's un-reached steps were unreadable.** Dimmed to 0.14 opacity, so their text was
   effectively invisible. Raised to 0.85, which keeps the sequence legible as a sequence; the progression
   is also carried by the status line, the progress bar and the lit cell background, so it never depended
   on the fade.

3. **A toolbar button had no styling at all.** A bare `<button>` inside `.app-toolbar` fell through to the
   browser's default button face — a light background under inherited light text. Given the same styling
   as every other secondary button.

And one gap rather than a failure:

4. **No status announcements.** The opportunity explorer, points history and leaderboard filled in
   asynchronously with nothing in a live region, so a screen-reader user had no way to know the table had
   loaded or that a filter had changed it. Each now has a visually-hidden `aria-live="polite"` summary,
   and the pull-request summary line is `aria-live` with `aria-atomic`.

## What these results do **not** establish

This matters more than the table above.

- **axe finds roughly a third to a half of WCAG issues.** A clean run means a specific set of
  machine-checkable rules passes. It is not a statement that the product is accessible.
- **No screen reader has been used.** Nothing here has been heard in NVDA, JAWS, VoiceOver or Orca. Reading
  order, the usefulness of the announcements, and whether the tables are comprehensible when read aloud are
  all unverified. This is the single biggest gap.
- **No testing with disabled users.** None at all.
- **Keyboard testing is partial.** One flow (publish) is driven end to end and the landing page's first
  twenty tab stops are checked. Tab order has not been verified against visual order everywhere, there is
  no check that focus is trapped or restored around the edit and history panels — those are rendered
  inline with `role="dialog"` but **focus is not moved into them and not restored on close**, which is a
  known defect listed below.
- **Colour contrast is checked only where axe can compute it**: it skips text over images, over gradients,
  and anything it cannot resolve to a solid background.
- **Only Chromium.** Not Firefox, not WebKit, not a real mobile browser.
- **Zoom is approximated** by a smaller viewport. Real browser zoom reflows text differently.

## Known defects

| | Severity |
|---|---|
| The edit and history panels use `role="dialog"` but do not move focus into themselves, do not trap focus, and do not restore focus on close. A keyboard user can reach them by tabbing, but the experience is wrong. | real, unfixed |
| There is no live-region announcement when a publish succeeds or fails; the message is rendered with `role="alert"` for errors but the success message is not announced. | minor, unfixed |
| The workspace tables are CSS grids built from `div`s with `data-label` attributes. They read as a sequence of text rather than as a table, so a screen-reader user cannot navigate by column. This is a deliberate trade (the layout collapses on narrow screens) but it is a real limitation. | real, by design |
| No skip link on the signed-in workspace. The marketing shell has one; the app shell does not. | real, unfixed |

## Running the checks

```bash
cd e2e
npm ci && npx playwright install chromium
npx playwright test tests/accessibility.spec.ts
```

Each page prints its own result, so a regression names the page and the rule.
