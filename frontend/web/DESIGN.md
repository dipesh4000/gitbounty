---
name: GitBounty Graphite Lime
description: A dark-first, OS-aware landing system for browsing and funding GitHub work.
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
    fontSize: "clamp(2.1rem, 1.5rem + 2.6vw, 3.2rem)"
    fontWeight: 600
    lineHeight: 1.15
    letterSpacing: "-0.01em"
  headline:
    fontFamily: "Space Grotesk, sans-serif"
    fontSize: "clamp(1.6rem, 1.2rem + 1.6vw, 2.1rem)"
    fontWeight: 600
    lineHeight: 1.15
    letterSpacing: "-0.01em"
  title:
    fontFamily: "Space Grotesk, sans-serif"
    fontSize: "1.05rem"
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
    fontSize: "0.82rem"
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
  filter-pill:
    backgroundColor: "transparent"
    textColor: "{colors.sage-text}"
    rounded: "{rounded.pill}"
    padding: "7px 14px"
  filter-pill-active:
    backgroundColor: "{colors.signal-lime}"
    textColor: "{colors.lime-ink}"
    rounded: "{rounded.pill}"
    padding: "7px 14px"
  issue-card:
    backgroundColor: "{colors.graphite-surface}"
    textColor: "{colors.chalk-text}"
    rounded: "{rounded.surface}"
    padding: "18px"
---

# Design System: GitBounty Graphite Lime

## Overview

**Creative North Star: "The Open-Source Ledger"**

GitBounty's shipped landing page pairs the density of a technical issue tracker with the clarity of a financial ledger. Graphite surfaces, hairline separators, compact controls, and mono-formatted values make repositories and rewards easy to scan. Lime identifies action, value, selection, progress, and live state.

The page is dark-first and switches the same semantic roles to a pale green-cast theme through the operating system's light-mode preference. The structure stays deliberately flat: broad full-width bands, bordered grids, and tonal surface changes organize a long single-page narrative from hero through issue board, process, audiences, security, pricing, and final action.

**Key Characteristics:**

- OS-driven Graphite Lime dark and paper-and-leaf light themes.
- Full-width section bands with 24px horizontal gutters and responsive internal grids.
- Compact square controls, 8px containers, and pills for filters or short tags.
- Space Grotesk headings, Inter body and controls, JetBrains Mono repositories and values.
- Lime emphasis for primary actions, stars, live status, selected filters, rules, and focus.
- Restrained fade-and-rise reveals that disappear under reduced-motion preferences.

## Colors

The palette uses one shared set of semantic roles whose values swap under `prefers-color-scheme: light`.

### Primary

- **Signal Lime / Leaf Accent:** Filled actions, selected filters, star values, links, top rules, progress marks, and focus outlines.
- **Pressed Lime / Pressed Leaf:** Hover treatment for filled actions and accent links.
- **Lime Ink / Leaf Accent Ink:** High-contrast text placed directly on accent fills.

### Secondary

- **Success Mint / Success Leaf:** The live dot in the hero's open-issue preview.

### Neutral

- **Graphite Canvas / Paper Canvas:** Page background and alternating card background.
- **Graphite Surface / Paper Surface:** Issue cards, preview board, flow nodes, and dark-band card inversions.
- **Graphite Raised / Paper Raised:** Search, sort, and other nested control surfaces.
- **Graphite Border / Paper Border:** Interactive outlines and emphasized container strokes.
- **Graphite Divider / Paper Divider:** Header, footer, row, and section separators.
- **Chalk / Forest Text:** Primary headings and content.
- **Sage / Forest Secondary:** Paragraphs, navigation, control text, and supporting information.
- **Muted Sage / Forest Muted:** Repository names, timestamps, counts, footnotes, and low-priority labels.

### Named Rules

**The Lime Signal Rule.** Lime marks action, value, selection, progress, or live state; neutral surfaces carry the content.

**The Semantic Theme Rule.** Components consume the shared color roles so the OS light-mode override preserves hierarchy without component-specific theme branches.

## Typography

**Display Font:** Space Grotesk (with sans-serif fallback)  
**Body Font:** Inter (with sans-serif fallback)  
**Label/Mono Font:** JetBrains Mono (with monospace fallback)

**Character:** Space Grotesk gives the long-form landing page a compact technical voice, Inter keeps explanations and controls readable, and JetBrains Mono makes repositories, star counts, prices, indices, and facts scan like structured data.

### Hierarchy

- **Display** (600, fluid 2.1–3.2rem, 1.15): The two-line hero statement.
- **Headline** (600, fluid 1.6–2.1rem, 1.15): Major section headings and the final CTA heading.
- **Title** (600, 1–1.2rem, 1.15): Cards, features, trust statements, and flow nodes.
- **Body** (400, 1rem, 1.55): Explanatory copy, capped at 62ch; the hero summary narrows to 46ch.
- **Label** (500–600, 0.72–0.95rem): Buttons, navigation, tags, field labels, and metadata.
- **Mono** (400–600, 0.72–2rem): Repository names, star amounts, fact figures, step indices, and prices.

### Named Rules

**The Structured Value Rule.** Repository identifiers and compact numeric or monetary values use JetBrains Mono; actions and explanatory copy remain in Inter.

## Layout

The page uses full-width section bands. A shared wrapper fills available width and supplies 24px horizontal padding rather than a global maximum width. The sticky header is 68px tall. The hero is a 1.05/0.95 two-column grid with a 56px gap and 68px/56px vertical padding; later sections use 84px vertical padding.

The issue grid moves from three columns to two at 980px and one at 660px. Four-column steps and features become two columns at 900px and one at 560px. Facts change from four columns to two at 780px; audience and pricing pairs stack at 780px; trust cards stack at 700px. At 880px the desktop navigation and actions give way to the compact menu button and stacked mobile navigation.

Spacing is dense inside working UI—6–16px for tags, controls, rows, and cards—and broader between narrative groups, usually 20–60px. Text columns remain bounded even when the section itself spans the viewport.

**The Full-Band Rule.** Section color and borders run edge to edge; content alignment comes from the shared 24px gutter and each component's grid.

## Elevation & Depth

The interface is flat by default. Three tonal planes and one-pixel borders establish hierarchy; cards do not carry ambient shadows. The sticky header adds a 10px backdrop blur over a 90% canvas mix. The live issue dot has a small halo, while the accent CTA uses concentric outlined rings and a repeating diagonal line pattern as a section-specific graphic layer.

### Shadow Vocabulary

- **Live-status halo** (`0 0 0 3px rgba(61,220,132,0.15)`): Supports the hero board's 7px success dot.
- **CTA orbit rings** (`0 0 0 34px var(--accent-line-soft), 0 0 0 70px var(--accent-line-soft)`): Extends the large circular motif inside the final accent band only.

### Named Rules

**The Bordered Plane Rule.** Structure comes from surface tone, one-pixel borders, and section bands; ordinary cards remain shadowless.

## Shapes

Controls use compact 4px corners. Cards, issue boards, empty states, flow nodes, trust panels, and pricing panels use 8px corners. Full pills are reserved for category filters, issue tags, audience tags, and circular status geometry. Most structure uses solid one-pixel borders; empty issue states use a dashed border.

## Components

### Buttons

- **Shape:** 4px radius, 10px × 18px padding, 8px internal gap; large hero and CTA buttons use 13px × 24px.
- **Primary:** Accent background with accent-ink text at Inter 600; hover uses the darker accent.
- **Hover / Focus:** Color and border transitions run at 150ms ease, active state moves down 1px over 100ms, and focus uses a 2px accent outline with 2px offset.
- **Outline / Ghost:** Outline buttons are transparent with the strong neutral border; ghost buttons remove the border and strengthen text on hover.

### Chips

- **Style:** Category filters use 999px corners, 7px × 14px padding, a neutral border, and secondary text. Issue tags use 3px × 9px padding.
- **State:** Hover strengthens border and text; the selected filter fills with the accent and switches to accent-ink text.

### Cards / Containers

- **Corner Style:** 8px.
- **Background:** Issue and preview cards use the first surface; feature cards reverse to the canvas inside a surfaced section.
- **Shadow Strategy:** No ambient card shadows.
- **Border:** One-pixel strong borders for issue and audience cards; quieter dividers inside the hero preview.
- **Internal Padding:** 18px for issue cards, 22–30px for narrative and pricing cards.

### Inputs / Fields

- **Style:** Search and sort controls use the raised surface, 4px corners, a strong one-pixel border, and compact Inter text. The search wrapper uses 9px × 12px padding and an inline 16px SVG magnifier.
- **Focus:** All keyboard focus inherits the 2px accent outline; the input itself removes its native inner outline so the shared control surface remains visually coherent.

### Navigation

- The sticky header combines a 28px logo mark, Space Grotesk wordmark, two anchor links, a ghost sign-in action, and a primary GitHub connection action.
- Navigation text begins in secondary color, becomes primary on hover, and the active section is set to primary by the intersection observer.
- Below 880px, a 34px square three-line menu control reveals full-width anchor rows and the primary connection action.

### Issue Board

- Controls wrap across search, category pills, and a right-aligned sort select.
- Issue cards form a responsive 3/2/1-column grid. Repository and star count are mono; title is compact Inter; category and GitHub labels are pills; update age and the accent link close the card.
- Loading, API error, and no-match states share a full-grid dashed container. Additional pages load through a centered outline button, and a muted italic footnote reports synced issue counts or backend availability.

### Hero Preview Board

- The hero's right column uses an 8px bordered panel with a compact header, live success dot, mono issue count, and divided rows.
- Each row truncates long titles, keeps the repository visible in mono, and right-aligns the accent star value.

### Accent CTA Band

- The band reverses the palette to an accent background with accent-ink heading and dark action button.
- A diagonal 28–29px line repeat and two clipped circular orbits sit behind content at reduced opacity.

## Do's and Don'ts

### Do:

- **Do** bind every new component to the existing semantic roles so both OS themes remain equivalent.
- **Do** use full-width section bands with the shared 24px horizontal gutter.
- **Do** preserve the 3/2/1 issue-grid collapse and the component-specific responsive breakpoints already in the stylesheet.
- **Do** keep repositories, star values, facts, step indices, and prices in JetBrains Mono.
- **Do** preserve the existing loading, error, empty, hover, focus, active, and reduced-motion states.

### Don't:

- **Don't** add ambient shadows or large soft radii to ordinary cards.
- **Don't** use the accent as a general content-surface color outside the shipped CTA band.
- **Don't** replace the OS preference with a component-by-component theme implementation.
- **Don't** add a page-wide maximum width that collapses the shipped full-width section bands.
- **Don't** generalize the existing audience-tag label or text-arrow glyphs into new reusable kicker or icon patterns.
