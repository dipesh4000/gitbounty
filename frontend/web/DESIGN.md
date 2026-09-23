---
name: GitBounty Graphite Lime
description: A compact, GitHub-centered points interface with OS-aware graphite surfaces and a precise lime signal.
colors:
  graphite-canvas: "#101211"
  graphite-surface: "#191C19"
  graphite-raised: "#242923"
  graphite-border: "#384039"
  graphite-divider: "#292F2A"
  chalk-text: "#F1F4EC"
  sage-text: "#B2BBAE"
  muted-sage: "#788276"
  signal-lime: "#C5F53A"
  pressed-lime: "#9FC72E"
  lime-ink: "#141A0A"
  success-mint: "#7EF29B"
  paper-canvas: "#F4F7F0"
  paper-surface: "#FFFFFF"
  paper-raised: "#E9EFE3"
  paper-border: "#C7D0C2"
  paper-divider: "#DCE4D7"
  forest-text: "#172018"
  forest-secondary: "#4D5A4B"
  forest-muted: "#71806F"
  leaf-accent: "#6FAE13"
  leaf-accent-pressed: "#5D8310"
  leaf-accent-ink: "#F7FBEF"
  success-leaf: "#248044"
typography:
  display:
    fontFamily: "Space Grotesk, sans-serif"
    fontSize: "clamp(2.2rem, 1.5rem + 3.4vw, 3.6rem)"
    fontWeight: 600
    lineHeight: 1.05
    letterSpacing: "-0.03em"
  headline:
    fontFamily: "Space Grotesk, sans-serif"
    fontSize: "clamp(1.9rem, 1.4rem + 2vw, 2.6rem)"
    fontWeight: 600
    lineHeight: 1.15
    letterSpacing: "-0.02em"
  title:
    fontFamily: "Space Grotesk, sans-serif"
    fontSize: "1.15rem"
    fontWeight: 600
    lineHeight: 1.15
    letterSpacing: "-0.01em"
  body:
    fontFamily: "Inter, sans-serif"
    fontSize: "1rem"
    fontWeight: 400
    lineHeight: 1.55
  label:
    fontFamily: "Inter, sans-serif"
    fontSize: "0.9rem"
    fontWeight: 600
  mono:
    fontFamily: "JetBrains Mono, monospace"
    fontSize: "0.85rem"
    fontWeight: 600
rounded:
  compact: "4px"
  surface: "8px"
  pill: "999px"
spacing:
  xs: "8px"
  sm: "12px"
  md: "16px"
  lg: "24px"
components:
  button-primary:
    backgroundColor: "{colors.signal-lime}"
    textColor: "{colors.lime-ink}"
    typography: "{typography.label}"
    rounded: "{rounded.compact}"
    padding: "10px 18px"
  button-primary-hover:
    backgroundColor: "{colors.pressed-lime}"
    textColor: "{colors.lime-ink}"
  button-outline:
    backgroundColor: "transparent"
    textColor: "{colors.chalk-text}"
    typography: "{typography.label}"
    rounded: "{rounded.compact}"
    padding: "10px 18px"
  chip:
    backgroundColor: "transparent"
    textColor: "{colors.sage-text}"
    rounded: "{rounded.pill}"
    padding: "7px 14px"
  chip-selected:
    backgroundColor: "{colors.signal-lime}"
    textColor: "{colors.lime-ink}"
    rounded: "{rounded.pill}"
    padding: "7px 14px"
  card:
    backgroundColor: "{colors.graphite-surface}"
    textColor: "{colors.chalk-text}"
    rounded: "{rounded.surface}"
    padding: "24px"
---

# Design System: GitBounty Graphite Lime

## Overview

**Creative North Star: "The Merge Terminal"**

GitBounty looks like a focused contribution console: dark graphite working surfaces, compact controls, crisp dividers, and a lime signal that makes points and current state legible at a glance. It borrows GitHub's information density without imitating GitHub's chrome. The result should feel practical, technical, and earned rather than game-like or financial.

The same semantic roles switch to a pale, green-cast paper palette when the operating system requests light mode. Both modes preserve the hierarchy: quiet surfaces carry most content, typography does the structural work, and the accent is reserved for actions, scores, progress, selection, and focus. Authentication is still a test harness, so its status must remain explicit wherever it affects a user's interpretation of the interface.

**Key Characteristics:**

- Graphite-first surfaces with an OS-driven light counterpart.
- One lime/leaf accent used as a functional signal, not decoration.
- Compact square controls, gently rounded containers, and pill-shaped filters or identity tags.
- Space Grotesk hierarchy, Inter reading text, and JetBrains Mono for ranks, repositories, handles, and points.
- Responsive, readable application layouts with honest loading, empty, error, and test-login states.

## Colors

The palette is a semantic pair: every dark Graphite Lime role has a light paper-and-leaf counterpart selected through `prefers-color-scheme`.

### Primary

- **Signal Lime / Leaf Accent:** The primary action and status color. Use it for filled actions, selected filters, points, progress, active identity marks, links, and the global focus outline.
- **Pressed Lime / Pressed Leaf:** The darker interaction step for accent links and filled-button hover states.
- **Accent Ink:** High-contrast text and glyph color placed on the accent; it reverses from near-black in dark mode to near-white in light mode.

### Neutral

- **Graphite Canvas / Paper Canvas:** The page background and lowest visual plane.
- **Graphite Surface / Paper Surface:** Cards, leaderboard bodies, notices, and grouped controls.
- **Graphite Raised / Paper Raised:** Compact control wells, avatar placeholders, code fragments, and progress tracks.
- **Graphite Border / Paper Border:** Interactive and emphasized strokes.
- **Graphite Divider / Paper Divider:** Quiet row separators, header and footer rules, and low-emphasis container strokes.
- **Chalk / Forest Text:** Primary reading color.
- **Sage / Forest Secondary:** Paragraphs, labels, and secondary facts.
- **Muted Sage / Forest Muted:** Metadata, timestamps, helper copy, and low-priority counts.
- **Success Mint / Success Leaf:** Positive live-status dots only; success does not replace the main accent for scores.

### Named Rules

**The Signal, Not Wash Rule.** Keep the accent concentrated in actions, current state, points, progress, and focus; content surfaces remain neutral.

**The Semantic Pair Rule.** Author against the shared role variables so OS light mode remains a real equivalent, not a separate visual branch.

## Typography

**Display Font:** Space Grotesk (with sans-serif fallback)  
**Body Font:** Inter (with sans-serif fallback)  
**Label/Mono Font:** JetBrains Mono (with monospace fallback)

**Character:** Space Grotesk gives headings a compact, technical confidence; Inter keeps explanations and controls neutral and highly readable. JetBrains Mono makes contribution provenance and numeric rewards feel verifiable.

### Hierarchy

- **Display** (600, fluid 2.2–3.6rem, 1.05): Landing-page statement only; cap the line length near 16 characters per line through container width rather than forced breaks.
- **Headline** (600, fluid 1.9–2.6rem, 1.15): Route titles for leaderboard and personal points views.
- **Title** (600, 1.05–1.5rem, 1.15): Section headings, card titles, and empty-state headings.
- **Body** (400, 1rem, 1.55): Explanations and product copy; paragraphs stop at 62ch and hero copy is narrower.
- **Label** (500–700, 0.68–0.95rem): Controls and concise metadata. Uppercase with tracking is reserved for compact control labels and small identity/status tags.
- **Mono** (400–600, 0.7–1rem): Repositories, GitHub handles, ranks, counts, points, and dates where alignment or provenance matters.

### Named Rules

**The Verifiable Value Rule.** Render points, ranks, repository references, and account handles in mono; prose and actions stay in Inter.

**The Compact Hierarchy Rule.** Use weight, spacing, and font family before adding more type sizes; the interface intentionally keeps a tight ramp.

## Layout

Application content sits in a centered 1040px maximum-width region with 24px side padding. The header is a sticky 68px bar. Route pages use 44px top and 96px bottom spacing; landing sections use 60px vertical spacing, with the opening hero expanding to 76px top and 60px bottom on larger screens.

The recurring rhythm is 8px for compact gaps, 12–16px within controls and rows, and 24px for card or section interiors. Grids use flexible columns rather than fixed desktop assumptions: the landing step grid uses `auto-fit` with a 230px minimum, statistic cards use a 160px minimum, and leaderboard rows retain score visibility while lower-priority merge counts drop away on small screens.

At 880px, the desktop navigation becomes a menu button and stacked mobile navigation. At 620px, leaderboard rows compress, merge cards stack, the account handle hides, and hero spacing tightens. Component-specific grids also collapse at 980px, 900px, 780px, 700px, 660px, and 560px where their content demands it.

**The Score Survives Rule.** Responsive compression may hide secondary merge counts or stack metadata, but the identity, rank, and points remain visible.

## Elevation & Depth

The system is flat by default. Depth comes from three tonal planes and one-pixel borders, not ambient drop shadows. The sticky header uses a 10px backdrop blur over a 90% canvas mix so scrolling content remains perceptible without becoming a floating card. Two shadows are functional exceptions: an inset accent rail identifies the signed-in user on the leaderboard, and a small success halo supports a live status dot.

### Shadow Vocabulary

- **Current-user rail** (`inset 3px 0 0 var(--accent)`): Marks the viewer's leaderboard row alongside a faint accent tint.
- **Live-status halo** (`0 0 0 3px rgba(61,220,132,0.15)`): Reinforces the small success dot without lifting its container.

### Named Rules

**The Flat-by-Default Rule.** Use tonal contrast, dividers, and inset state marks for depth; do not add ambient card shadows.

## Shapes

The form language is compact and mostly square. Buttons, grouped controls, code fragments, and small fields use a 4px corner. Cards, boards, notices, and state containers use an 8px corner. Pills are reserved for filter chips, avatars, progress tracks, step numbers, and terse identity tags. One-pixel solid borders define structure; dashed borders distinguish informational notices and empty states.

**The Shape Carries Meaning Rule.** Use 4px for actions, 8px for surfaces, and full pills only for filters, identity, progress, or small circular markers.

## Components

Components feel compact and explicit. Their states change color or border before they move, and every keyboard-focusable control receives the shared 2px accent outline with a 2px offset.

### Buttons

- **Shape:** Compact corners (4px), 10px × 18px padding, 8px icon gap; large actions use 13px × 24px.
- **Primary:** Accent fill with accent-ink text at Inter 600. Hover steps to the darker accent; active moves down 1px.
- **Hover / Focus:** Color and border transitions run at 150ms ease; the active translation runs at 100ms ease; focus uses the global accent outline.
- **Outline / Ghost:** Outline buttons are transparent with a strong neutral border; ghost buttons remove the border and increase text contrast on hover.

### Chips

- **Style:** Full-pill corners, 7px × 14px padding, compact Inter text, transparent fill, neutral border, and secondary text.
- **State:** Hover strengthens border and text. Selected chips fill with the accent and switch to accent-ink text. Segmented controls use the same selected treatment inside a compact 4px well.

### Cards / Containers

- **Corner Style:** Gently rounded (8px).
- **Background:** First-level surface for boards, cards, notices, and statistics; raised surface only for nested wells or tracks.
- **Shadow Strategy:** Flat at rest; use the documented inset rail only for the viewer's leaderboard row.
- **Border:** One-pixel quiet divider by default, promoted to the stronger border on hover or emphasis.
- **Internal Padding:** Usually 14–24px; content-dense rows stay at the compact end.

### Navigation

- The 68px sticky header pairs a 28px logo mark and Space Grotesk wordmark with compact Inter links.
- Links begin in secondary text and become primary text on hover. The current route is expressed semantically with `aria-current`; any added visual treatment must use the existing accent and remain legible in both themes.
- At 880px the desktop links and account block give way to a 34px square menu control; mobile links become full-width rows with quiet dividers.

### Leaderboard Rows

- Use a structured grid for rank, contributor identity, merge count, and points. Ranks and points are mono; scores stay right-aligned.
- The first three ranks receive accent text as a secondary podium cue, never as the only rank indicator.
- The viewer's row combines a subtle accent tint, inset accent rail, and a visible `you` tag.

### Test-login Notices

- Test authentication must be named in visible text. Use the dashed 8px notice container on the points route and fine print beneath the landing action.
- Never let a GitHub-branded button imply real OAuth: the nearby copy must say that the login is a test and no GitHub account is needed or authenticated.

### Loading, Empty, and Error States

- Loading uses bordered board rows with a tonal shimmer; reduced-motion mode removes the animation.
- Empty and error states use centered copy inside an 8px dashed container and may include one primary recovery action.
- State changes use `aria-live` and `aria-busy`; visible appearance and assistive status must change together.

## Do's and Don'ts

### Do:

- **Do** bind new surfaces to the semantic color roles so dark and light OS themes stay equivalent.
- **Do** preserve the 1040px reading width, 24px edge padding, and compact 8/12/16/24px rhythm on application routes.
- **Do** keep points, ranks, repositories, and handles in JetBrains Mono while headings use Space Grotesk and prose uses Inter.
- **Do** keep test-login, loading, empty, error, selected, and disabled states visible and accurately labelled.
- **Do** use one-pixel borders and tonal planes before reaching for elevation.

### Don't:

- **Don't** introduce ambient card shadows, large soft radii, or decorative gradients as a new surface language.
- **Don't** use the accent as a broad background wash or for unrelated decoration.
- **Don't** hide rank, identity, or points when responsive layouts compress.
- **Don't** describe the test sign-in as real GitHub authentication.
- **Don't** extend the landing page's existing eyebrow into a reusable kicker pattern; it is a one-off treatment, not a system role.
