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

### Named Rules

**The Signal Has Meaning Rule.** Lime marks action, selection, points, progress, or verification; it is not decorative fill for ordinary content.

**The Dark Ledger Rule.** New surfaces remain inside the shipped near-black graphite world; there is no light-mode counterpart in this build.

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

### Named Rules

**The Evidence Typeface Rule.** Use JetBrains Mono for machine-like evidence and compact system state; use Inter for explanation and Space Grotesk for assertions.

**The Statement Break Rule.** Major headings use intentional line breaks and tight leading to create editorial rhythm, not generic centered marketing copy.

## Layout

Content sits in a centered shell capped at 1320px. The desktop shell leaves 32px per side, tightening to 20px below 1100px, 16px below 820px, and 14px below 520px. Primary sections use 144px vertical spacing, reduced to 100px and then 82px as the viewport narrows.

The first viewport is a two-column manifesto and contribution ledger, followed immediately by a ruled manifesto strip. Subsequent sections alternate reading copy with structured artifacts using asymmetric columns. The issue explorer and leaderboard expand horizontally because scanability matters more than card-like packaging.

At 1100px the full desktop navigation disappears. At 820px, paired grids stack, the mobile menu becomes available, the sticky trace returns to document flow, and wide tabular content becomes horizontally scrollable. At 520px, actions stack, issue rows become single-column records, low-priority technical fields disappear, and six-stage diagrams collapse to two columns.

**The Full-Band Rule.** Background changes and rules run edge to edge; alignment comes from the shared shell rather than boxed page containers.

**The Artifact Follows Copy Rule.** On narrow screens, the claim leads and its proof artifact follows directly beneath it.

## Elevation & Depth

The system is flat by default. Depth comes from alternating graphite planes, borders, inset bands, and sticky positioning. The hero contribution ledger alone uses a deep ambient shadow (`0 24px 60px rgba(0,0,0,.22)`) to establish it as the first proof object; live dots may carry a three-pixel translucent status halo.

### Shadow Vocabulary

- **Hero Ledger Lift** (`0 24px 60px rgba(0,0,0,.22)`): Only the first-viewport contribution ledger.
- **Live Status Halo** (`0 0 0 3px rgba(61,219,130,.12)`): Tiny live or verified dots.

### Named Rules

**The Ruled Plane Rule.** Ordinary surfaces use tone and one-pixel borders, never ambient card shadows.

## Shapes

The dominant form is rectilinear: sections, artifacts, tables, rows, and receipts have square corners. Interactive controls use a restrained 3px radius. Fully rounded geometry is reserved for filters, issue labels, compact future-status labels, avatars, and status dots.

**The Taxonomy Pill Rule.** A pill must contain a short category, label, or status; it is not a general container shape.

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

- **Style:** Search is an integrated 62px ruled toolbar row; selects use raised graphite, a one-pixel rule, and 3px corners.
- **Focus:** The global two-pixel focus-lime outline sits 3px outside the control. The search input itself removes the browser outline because its containing control supplies structure.
- **States:** Loading, empty, and offline occupy the same explorer frame so the layout does not jump.

### Navigation

The fixed 70px header begins transparent and gains a translucent near-black fill, bottom rule, and 12px blur after scrolling. Links use compact Inter and brighten on hover. At 1100px the link row is removed; at 820px the action cluster becomes a bordered menu button and an in-flow ruled menu.

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

### Don't:

- **Don't** introduce a centered generic SaaS hero, floating gradient cards, glow, or decorative glass.
- **Don't** add rounded corners or ambient shadows to ordinary artifacts.
- **Don't** spend lime on large decorative areas outside the shipped final CTA band.
- **Don't** turn compact uppercase metadata into a reusable eyebrow above every section; the few live labels belong to specific artifacts and audiences.
- **Don't** use glyphs as general-purpose icons; keep interface symbols structural, minimal, and accessible.
- **Don't** treat the generated social card's visible composition as editable without preserving the prompt embedded in its PNG metadata.
