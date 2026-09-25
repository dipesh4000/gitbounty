---
name: GitBounty Open-Source Ledger
description: A near-black editorial ledger that turns merged GitHub work into inspectable contribution history.
colors:
  canvas: "#080b09"
  canvas-raised: "#0d110e"
  surface: "#111713"
  surface-raised: "#172019"
  surface-active: "#1d2a20"
  line-soft: "#202923"
  line: "#303c33"
  line-strong: "#465449"
  text: "#f2f6ef"
  text-secondary: "#aab5ab"
  text-muted: "#89968b"
  signal: "#b7f34a"
  signal-hover: "#9ddd32"
  signal-dark: "#172b12"
  status: "#3ddb82"
  focus: "#d7ff8f"
  danger: "#f08b73"
  signal-ink: "#0a0d0a"
  operate-canvas: "#0a0d0b"
typography:
  display:
    fontFamily: "Space Grotesk, sans-serif"
    fontSize: "clamp(70px, 6.2vw, 94px)"
    fontWeight: 600
    lineHeight: 0.96
    letterSpacing: "-0.035em"
  headline:
    fontFamily: "Space Grotesk, sans-serif"
    fontSize: "clamp(49px, 5.2vw, 68px)"
    fontWeight: 600
    lineHeight: 1
    letterSpacing: "-0.035em"
  title:
    fontFamily: "Space Grotesk, sans-serif"
    fontSize: "18px"
    fontWeight: 600
    lineHeight: 1.28
    letterSpacing: "-0.01em"
  body:
    fontFamily: "Inter, sans-serif"
    fontSize: "17px"
    fontWeight: 400
    lineHeight: 1.6
  label:
    fontFamily: "Inter, sans-serif"
    fontSize: "14px"
    fontWeight: 700
    lineHeight: 1
  mono:
    fontFamily: "JetBrains Mono, monospace"
    fontSize: "10px"
    fontWeight: 500
    lineHeight: 1.4
    letterSpacing: "0.06em"
  operate-heading:
    fontFamily: "Inter, sans-serif"
    fontSize: "32px"
    fontWeight: 600
    lineHeight: 1.15
    letterSpacing: "-0.025em"
  operate-body:
    fontFamily: "Inter, sans-serif"
    fontSize: "13px"
    fontWeight: 400
    lineHeight: 1
  operate-mono:
    fontFamily: "JetBrains Mono, monospace"
    fontSize: "10px"
    fontWeight: 500
    lineHeight: 1.4
rounded:
  control: "3px"
  pill: "999px"
spacing:
  xs: "6px"
  sm: "10px"
  md: "16px"
  lg: "24px"
  desktop-gutter: "32px"
  section: "144px"
  operate-gutter: "24px"
  operate-row-gap: "24px"
components:
  button-primary:
    backgroundColor: "{colors.signal}"
    textColor: "{colors.signal-ink}"
    typography: "{typography.label}"
    rounded: "{rounded.control}"
    padding: "0 18px"
    height: "44px"
  button-primary-hover:
    backgroundColor: "{colors.signal-hover}"
    textColor: "{colors.signal-ink}"
  button-secondary:
    backgroundColor: "transparent"
    textColor: "{colors.text}"
    typography: "{typography.label}"
    rounded: "{rounded.control}"
    padding: "0 18px"
    height: "44px"
  filter-active:
    backgroundColor: "{colors.signal}"
    textColor: "{colors.signal-ink}"
    rounded: "{rounded.pill}"
    padding: "0 13px"
    height: "34px"
  artifact:
    backgroundColor: "{colors.canvas-raised}"
    textColor: "{colors.text}"
    rounded: "0"
  operate-field:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.text}"
    typography: "{typography.operate-body}"
    rounded: "{rounded.control}"
    padding: "0 12px"
    height: "40px"
  operate-row:
    backgroundColor: "{colors.canvas}"
    textColor: "{colors.text-secondary}"
    typography: "{typography.operate-body}"
    rounded: "0"
    padding: "0 18px"
    height: "78px"
  bounty-action:
    backgroundColor: "{colors.signal}"
    textColor: "{colors.signal-ink}"
    typography: "{typography.operate-body}"
    rounded: "{rounded.control}"
    padding: "0 16px"
    height: "42px"
  bounty-field:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.text}"
    typography: "{typography.operate-body}"
    rounded: "{rounded.control}"
    padding: "0 9px"
    height: "38px"
  bounty-selected-row:
    backgroundColor: "{colors.signal-dark}"
    textColor: "{colors.text-secondary}"
    typography: "{typography.operate-body}"
    rounded: "0"
    padding: "0 18px"
    height: "86px"
---

# Design System: GitBounty Open-Source Ledger

## Overview

**Creative North Star: "The Living Contribution Ledger"**

GitBounty ships as a dark editorial record of open-source work, not a centered SaaS pitch. Large, tightly set statements share the page with dense graphite artifacts: issue rows, code diffs, system traces, receipts, policy logs, and rankings. The visual story follows work from an open issue to a verified merge and makes the evidence feel inspectable at every step.

The world is near-black, square-edged, and ruled by fine lines. Off-white type provides the reading layer; lime is deliberately scarce and marks actions, selected states, points, and moments of verification. Broad alternating bands create cinematic pacing while the artifacts stay disciplined and technical.

**Key Characteristics:**

- Dark-only graphite bands separated by one-pixel rules.
- Oversized Space Grotesk statements paired with compact JetBrains Mono evidence.
- Lime reserved for action, points, selection, progress, and verified state.
- Square artifacts and controls, with pills used only for compact taxonomy.
- Full-width editorial pacing around a centered 1320px content shell.
- Evidence-first signature surfaces: the contribution ledger, issue explorer, system trace, receipt, audit log, and leaderboard.
- Maintainer selection stays inside the same flat Operate grammar as contributor records.
- Authenticated Operate mode uses a compact 1180px shell and fixed sans/mono typography.
- Issues, Add issues, My PRs, and Leaderboard share one task frame and appear one at a time.

### Operate Mode: Authenticated Contributor Workspace

The authenticated workspace is the product's compact operating surface, not a continuation of the landing-page narrative. It retains the same graphite ground, fine rules, lime semantics, and evidence typography while replacing oversized display statements with fixed, workmanlike Inter and mono sizes. A sticky horizontal header exposes Issues, My PRs, Leaderboard, the signed-in username, and an explicit Sign out action; Add issues is a contextual action inside Issues rather than a permanent navigation destination.

Operate mode is intentionally dense and quiet. Search, filters, account-derived issue loading, selection controls, summaries, and records join into ruled planes rather than floating cards. The maintainer path makes its publication boundary explicit: issues from repositories personally owned by the signed-in GitHub user stay inside the selection surface until chosen, assigned a category and positive whole-number point value, and published. Points, merged pull requests, and leaderboard positions must come from the live backend; unavailable or empty data is shown honestly instead of being replaced by samples.

### Raster Inventory

- `public/og.png` — 1731 × 909 social card. Its exact ImageGen edit prompt is embedded in the PNG's `impeccable:prompt` text metadata, so future edits retain the shipped asset's provenance.

## Colors

The palette is a narrow graphite ramp with off-white reading tones, one high-energy lime signal, green verification, and coral reserved for unresolved or failed states.

### Primary

- **Signal Lime** (`signal`): Primary buttons, selected controls, point values, progress rails, and the final conversion band.
- **Pressed Lime** (`signal-hover`): Hover treatment for lime actions.
- **Ledger Green** (`signal-dark`): Low-contrast selected rows and verified-state fields.

### Secondary

- **Verification Mint** (`status`): Merged, approved, passed, and live indicators.
- **Focus Lime** (`focus`): The global keyboard focus outline.
- **Exception Coral** (`danger`): Offline, unresolved, and removal states only.

### Neutral

- **Ledger Black** (`canvas`): Page ground and dominant editorial bands.
- **Raised Graphite** (`canvas-raised`): Artifact bodies and alternating bands.
- **Graphite Surface** (`surface`): Hovered rows, process bands, and inset totals.
- **Raised Surface** (`surface-raised`): Skeleton lines, field fills, and compact control surfaces.
- **Active Graphite** (`surface-active`): Strong active-state plane.
- **Hairline Graphite** (`line-soft`): Quiet section and row separation.
- **Rule Graphite** (`line`): Default artifact, control, and table borders.
- **Strong Rule** (`line-strong`): Structural boundaries and secondary buttons.
- **Chalk Text** (`text`): Headlines and primary information.
- **Cool Gray Text** (`text-secondary`): Body copy and secondary values.
- **Muted Ledger Text** (`text-muted`): Metadata, labels, and captions.
- **Signal Ink** (`signal-ink`): Dark text placed on lime.
- **Operate Canvas** (`operate-canvas`): The authenticated shell and sticky header ground, a near-black companion to Ledger Black.

### Named Rules

**The Signal Has Meaning Rule.** Lime marks action, selection, points, progress, or verification; it is not decorative fill for ordinary content.

**The Dark Ledger Rule.** New surfaces remain inside the shipped near-black graphite world; there is no light-mode counterpart in this build.

**The Operate Signal Rule.** In the authenticated workspace, lime is limited to active underlines, point values, current-user emphasis, focus, and verified status; ordinary navigation and rows stay neutral.

## Typography

**Display Font:** Space Grotesk (with sans-serif fallback)  
**Body Font:** Inter (with sans-serif fallback)  
**Label/Mono Font:** JetBrains Mono (with monospace fallback)

**Character:** Space Grotesk gives the page blunt editorial authority, Inter keeps longer explanations readable, and JetBrains Mono makes repository names, states, values, identifiers, and evidence read like a technical record.

### Hierarchy

- **Display** (600, fluid 70–94px, 0.96): The two-line hero manifesto; it contracts to 45–54px on small screens.
- **Headline** (600, fluid 49–68px, 1): Major section statements, usually broken into two deliberate lines.
- **Title** (600, 18px, 1.28): Issue names and compact artifact titles.
- **Body** (400, 17px, 1.6): Explanatory copy, constrained to 65 characters where the global paragraph rule applies.
- **Label** (700, 14px): Buttons and direct actions.
- **Mono** (400–600, generally 8–12px): Repository paths, point values, timestamps, system state, rankings, and audit evidence; uppercase labels often use restrained tracking.
- **Operate Heading** (600, 32px, 1.15): Page identity inside the authenticated workspace; it contracts to 28px at phone width.
- **Operate Body** (400–600, 11–14px): Navigation, controls, row titles, metadata, and table values in the task surface.
- **Operate Mono** (500–600, 8–14px): Table headers, identifiers, repository paths, ranks, account names, and tabular point values.

### Named Rules

**The Evidence Typeface Rule.** Use JetBrains Mono for machine-like evidence and compact system state; use Inter for explanation and Space Grotesk for assertions.

**The Statement Break Rule.** Major headings use intentional line breaks and tight leading to create editorial rhythm, not generic centered marketing copy.

**The Operate Scale Rule.** Authenticated task surfaces do not use the marketing display ramp; hierarchy comes from weight, rules, and compact fixed sizes.

## Layout

Content sits in a centered shell capped at 1320px. The desktop shell leaves 32px per side, tightening to 20px below 1100px, 16px below 820px, and 14px below 520px. Primary sections use 144px vertical spacing, reduced to 100px and then 82px as the viewport narrows.

The first viewport is a two-column manifesto and contribution ledger, followed immediately by a ruled manifesto strip. Subsequent sections alternate reading copy with structured artifacts using asymmetric columns. The issue explorer and leaderboard expand horizontally because scanability matters more than card-like packaging.

At 1100px the full desktop navigation disappears. At 820px, paired grids stack, the mobile menu becomes available, the sticky trace returns to document flow, and wide tabular content becomes horizontally scrollable. At 520px, actions stack, issue rows become single-column records, low-priority technical fields disappear, and six-stage diagrams collapse to two columns.

**The Full-Band Rule.** Background changes and rules run edge to edge; alignment comes from the shared shell rather than boxed page containers.

**The Artifact Follows Copy Rule.** On narrow screens, the claim leads and its proof artifact follows directly beneath it.

### Operate Mode

The authenticated workspace uses a centered 1180px shell with 24px desktop gutters, a 64px sticky header, 48px top padding, and 88px bottom padding. The page heading reserves a compact 74px block before the active task surface. Desktop tables use explicit content-weighted grids and 24px column gaps; headers are 40px high and records are at least 78px high.

The maintainer surface opens from a compact Add issues action in the Issues heading and immediately loads open issues from public repositories personally owned by the signed-in GitHub user. It is a vertical sequence with 20px gaps: account source bar, result message when present, then one contiguous selection plane. On desktop, the publish bar is a three-column 58px minimum band, and 86px issue rows use Select / Issue / Repository / Category / Points columns. The publish bar and issue table touch edge-to-edge so they read as one operational object rather than separate cards.

At 820px the shell gutter tightens to 16px, the header wraps its navigation into a full-width second row, the filter toolbar stacks, table headers disappear, and every record becomes a labeled two-column definition layout. The publish action moves beneath the count and explanation, and each bounty row becomes a checkbox beside the issue with full-width labeled Repository, Category, and Points fields. At 480px the gutter tightens to 12px, headings reduce to 28px, repositories may wrap, the account source bar remains compact, messages collapse to one column, the publish bar becomes one column with a full-width button, and the demo-data disclosure is hidden.

**The One Task Surface Rule.** Issues, Add issues, My PRs, and Leaderboard occupy the same workspace frame one at a time; do not assemble them into a dashboard of simultaneous cards or charts.

**The Dense Record Rule.** Preserve ruled rows and scan-friendly columns on desktop, then re-label fields in-place on narrow screens instead of converting records into decorative cards.

**The Published Selection Rule.** Add issues may list every open issue from the signed-in user's public personal repositories, but only selected issues cross into the public Issues surface after publication.

## Elevation & Depth

The system is flat by default. Depth comes from alternating graphite planes, borders, inset bands, and sticky positioning. The hero contribution ledger alone uses a deep ambient shadow (`0 24px 60px rgba(0,0,0,.22)`) to establish it as the first proof object; live dots may carry a three-pixel translucent status halo.

### Shadow Vocabulary

- **Hero Ledger Lift** (`0 24px 60px rgba(0,0,0,.22)`): Only the first-viewport contribution ledger.
- **Live Status Halo** (`0 0 0 3px rgba(61,219,130,.12)`): Tiny live or verified dots.

### Named Rules

**The Ruled Plane Rule.** Ordinary surfaces use tone and one-pixel borders, never ambient card shadows.

Operate mode uses no shadows or blur. Its sticky header, toolbar, account source bar, messages, summaries, publish bar, tabs, and tables are separated only by graphite tone and one-pixel rules.

## Shapes

The dominant form is rectilinear: sections, artifacts, tables, rows, and receipts have square corners. Interactive controls use a restrained 3px radius. Fully rounded geometry is reserved for filters, issue labels, compact future-status labels, avatars, and status dots.

**The Taxonomy Pill Rule.** A pill must contain a short category, label, or status; it is not a general container shape.

Operate-mode controls use the shared restrained 3px radius. Tables, toolbars, summaries, and tab frames remain square; only categories, avatars, status dots, and the compact “You” marker are fully rounded.

## Components

### Buttons

- **Shape:** Compact rectangular controls with a restrained 3px radius and a 44px minimum height; large actions rise to 52px.
- **Primary:** Signal lime with signal ink, bold Inter, and 18px horizontal padding.
- **Secondary:** Transparent graphite field, strong rule border, and chalk text.
- **Hover / Focus:** Buttons lift by 1px on hover; colors or borders strengthen over 160ms. Every focus-visible state uses the global focus outline.
- **Reversed CTA:** The final lime band uses a dark button with lime text and a transparent dark-outline companion.

### Chips

- **Style:** Filter and taxonomy pills use a one-pixel rule, 999px radius, compact 9–12px type, and short horizontal padding.
- **State:** Selected filters fill with signal lime and switch to signal ink; unselected pills remain transparent.

### Cards / Containers

- **Corner Style:** Square.
- **Background:** Raised graphite or ledger black, selected according to the containing band.
- **Shadow Strategy:** Flat and bordered; only the hero ledger receives ambient lift.
- **Border:** One-pixel graphite rule, with stronger graphite for primary structural bounds.
- **Internal Padding:** Dense 15–22px artifact padding; larger 42px breathing room inside the system trace.

### Inputs / Fields

- **Style:** Search is an integrated 62px ruled toolbar row; selects use raised graphite, a one-pixel rule, and 3px corners. Add issues uses a compact lime action with guaranteed dark signal ink. Selected issue rows enable compact 38px Category and Points fields; unselected rows keep those fields disabled and visibly muted.
- **Focus:** The global two-pixel focus-lime outline sits 3px outside the control. The search input itself removes the browser outline because its containing control supplies structure.
- **States:** Loading, empty, and offline occupy the same explorer frame so the layout does not jump. Maintainer failures and permission denials use a flat 54px-minimum message row with an exception-coral border, while successful publication uses the same structure with a verification-mint border. Loading and publishing labels replace their action text in place; unavailable actions use the muted surface treatment and a not-allowed cursor.

### Navigation

The fixed 70px header begins transparent and gains a translucent near-black fill, bottom rule, and 12px blur after scrolling. Links use compact Inter and brighten on hover. At 1100px the link row is removed; at 820px the action cluster becomes a bordered menu button and an in-flow ruled menu.

#### Operate Header

The authenticated header is a solid 64px sticky bar. Brand, Issues, My PRs, and Leaderboard stay visible; the account group joins the mono username to a separate Sign out button inside one 3px outlined control. The active destination uses chalk text and a two-pixel lime underline. Below 820px the brand and account remain on the first row while navigation spans a 44px second row and may scroll horizontally.

#### Operate Toolbar and Tabs

The issue toolbar is a ruled 66px plane with a flexible search field and a 210px category selector; both controls are 40px high. The pull-request summary and status tabs attach directly to the table. Active tabs use a two-pixel lime bottom rule, never a filled pill.

#### Operate Data Table

Issues, pull requests, and leaderboard entries share one bounded table grammar: 40px mono headers, 78px minimum rows, 18px horizontal inset, muted secondary values, and a surface-tone hover. The primary cell stacks a mono identifier above a semibold 14px title. Repository strings and points use mono; points align right and use tabular numerals. Merged status uses verification mint, and the signed-in leaderboard row uses the dark lime selected plane.

#### Operate Empty and Loading States

Empty results stay inside the table frame with a restrained underlined lime action. Authentication loading occupies the full viewport with a single muted mono status line. Neither state introduces illustration, metric cards, or promotional copy.

#### Maintainer Bounty Manager

The maintainer flow begins with Add issues in the Issues page heading. The destination automatically requests open issues from public repositories personally owned by the signed-in GitHub account; no repository URL or organization picker is shown. Loading and GitHub errors remain inline. A successful load produces a compact account source bar followed by a darker publish bar showing selected count, issue and repository totals, the selected-only publication rule, and the publication action.

Issue candidates reuse the Operate table grammar at a slightly taller 86px minimum. A selected checkbox changes the row to the dark lime plane and enables its category selector and tabular mono points field; neither field is editable before selection. Each issue keeps its GitHub number, external title link, and up to three labels together in the primary cell. The publish action stays disabled until at least one issue is selected, and selected points must be positive whole numbers. Empty repositories and the 500-issue truncation notice remain in the same ruled context rather than spawning a separate surface.

### Contribution Ledger

The signature first-viewport artifact is a square ruled stack: contribution caption, issue-to-points path, issue record, diff, merge evidence, and earned total. Mono labels, sequential reveals, verification mint, and the final lime value make provenance visible without illustration.

### Issue Explorer

Search, sort, filter, state controls, and issue records share one bounded artifact. Rows prioritize repository and title, then technical metadata, then points and the outbound action. Hover changes only the row plane; mobile reflows metadata and actions instead of turning every issue into a floating card.

### Provenance Receipt

The receipt is a two-column evidence list followed by a darker total band. Its final earned value is the only oversized colored number, preserving a clear audit hierarchy.

### Motion

Path drawing and ledger rows enter sequentially with 520–560ms eased motion; point confirmation uses a short scale settle. Routine hover transitions last 150–180ms. All animation and smooth scrolling collapse to effectively zero under `prefers-reduced-motion: reduce`.

## Do's and Don'ts

### Do:

- **Do** reserve lime for actions, selected controls, points, progress, and verified moments.
- **Do** build new sections as full-width ruled bands aligned to the shared shell.
- **Do** pair assertions with inspectable graphite artifacts such as rows, traces, receipts, or logs.
- **Do** preserve the display/body/mono division between statements, explanations, and evidence.
- **Do** keep responsive reflow and reduced-motion behavior alongside every new interactive pattern.
- **Do** keep authenticated work inside the scoped Operate shell: compact header, one active task surface, and dense ruled records.
- **Do** keep account-derived issue loading, ownership feedback, selection, category, points, and publication in one continuous maintainer flow.
- **Do** make selection the visible gate that enables category and point editing and determines what reaches Issues.
- **Do** disclose sample data once at page-heading level while the workspace remains backed by demo content.

### Don't:

- **Don't** introduce a centered generic SaaS hero, floating gradient cards, glow, or decorative glass.
- **Don't** add rounded corners or ambient shadows to ordinary artifacts.
- **Don't** spend lime on large decorative areas outside the shipped final CTA band.
- **Don't** turn compact uppercase metadata into a reusable eyebrow above every section; the few live labels belong to specific artifacts and audiences.
- **Don't** use glyphs as general-purpose icons; keep interface symbols structural, minimal, and accessible.
- **Don't** treat the generated social card's visible composition as editable without preserving the prompt embedded in its PNG metadata.
- **Don't** carry the landing page's hero, marketing navigation, cinematic section pacing, gradients, glass, decorative metrics, or complex charts into Operate mode.
- **Don't** show unselected repository issues in Issues or imply that loading a repository publishes its full backlog.
- **Don't** place illustrative activity inside the authenticated workspace; operational totals and records must come from the live backend.
