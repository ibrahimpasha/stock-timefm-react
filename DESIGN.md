---
name: Stock-TimeFM
description: A precise, evidence-first operating surface for stock and options research.
colors:
  canvas-dark: "#0b0d10"
  surface-dark: "#13171c"
  surface-dark-hover: "#1d232a"
  boundary-dark: "#333b46"
  ink-dark: "#f4f7fb"
  secondary-dark: "#b6c0cc"
  muted-dark: "#8b96a5"
  action-blue: "#65a9ff"
  gain-green: "#42cf83"
  loss-red: "#ff7278"
  human-purple: "#bd91ff"
  caution-orange: "#ffad66"
  data-cyan: "#48c4d4"
  canvas-light: "#f2f4f7"
  surface-light: "#ffffff"
  boundary-light: "#ccd3dc"
  ink-light: "#11151a"
  secondary-light: "#3f4854"
  muted-light: "#5f6b78"
  action-blue-light: "#1769c2"
typography:
  title:
    fontFamily: "Inter Variable, Inter, system-ui, sans-serif"
    fontSize: "1.125rem"
    fontWeight: 600
    lineHeight: 1.3
    letterSpacing: "0"
  body:
    fontFamily: "Inter Variable, Inter, system-ui, sans-serif"
    fontSize: "0.875rem"
    fontWeight: 400
    lineHeight: 1.5
    letterSpacing: "0"
  label:
    fontFamily: "Inter Variable, Inter, system-ui, sans-serif"
    fontSize: "0.75rem"
    fontWeight: 600
    lineHeight: 1.25
    letterSpacing: "0.08em"
  numeric:
    fontFamily: "JetBrains Mono Variable, JetBrains Mono, monospace"
    fontSize: "0.75rem"
    fontWeight: 500
    lineHeight: 1.35
    letterSpacing: "0"
rounded:
  control: "6px"
  panel: "8px"
  chip: "999px"
spacing:
  compact: "4px"
  control: "8px"
  panel: "12px"
  section: "16px"
  page: "24px"
components:
  button-primary:
    backgroundColor: "{colors.action-blue}"
    textColor: "{colors.canvas-dark}"
    rounded: "{rounded.control}"
    padding: "0 12px"
    height: "44px"
  button-ghost:
    backgroundColor: "{colors.surface-dark}"
    textColor: "{colors.secondary-dark}"
    rounded: "{rounded.control}"
    padding: "0 12px"
    height: "44px"
  chip-neutral:
    backgroundColor: "{colors.surface-dark}"
    textColor: "{colors.secondary-dark}"
    rounded: "{rounded.chip}"
    padding: "4px 8px"
  panel:
    backgroundColor: "{colors.surface-dark}"
    textColor: "{colors.ink-dark}"
    rounded: "{rounded.panel}"
    padding: "12px"
---

# Design System: Stock-TimeFM

## Overview

**Creative North Star: "The Decision Observatory"**

Stock-TimeFM is a quiet operational instrument built for repeated scanning, comparison, and investigation. The interface uses neutral, high-contrast surfaces so price movement, risk state, human evidence, and interactive focus retain distinct visual roles. Density is intentional on desktop; hierarchy and progressive disclosure keep the same workflows usable on a 320px phone.

The shell should feel exact and trustworthy rather than theatrical. Persistent chrome may use restrained translucency to maintain context over scrolling data, while repeated data surfaces stay solid and flat for speed and legibility. Mobile changes structure instead of shrinking desktop: primary lists lead to full-width detail workspaces with explicit back and close actions.

**Key Characteristics:**
- Restrained graphite and neutral-white surfaces with one interaction accent.
- Dense desktop master/detail and touch-native mobile list/detail.
- Semantic color backed by text, icons, and labels.
- Solid repeated panels; blur only on persistent navigation and sticky context.
- Stable dimensions, tabular numerics, visible focus, and reduced motion.

## Colors

The palette is neutral and operational: blue identifies interaction, while all other accents carry a specific data meaning.

### Primary
- **Action Blue** (`#65a9ff` dark / `#1769c2` light): current navigation, selected controls, links, and keyboard focus.

### Secondary
- **Gain Green** (`#42cf83`): positive P/L, bullish direction, healthy state, and nothing else.
- **Loss Red** (`#ff7278`): negative P/L, bearish direction, destructive or failed state.
- **Human Purple** (`#bd91ff`): trader and human-authored evidence.
- **Caution Orange** (`#ffad66`): warnings, pending checks, and time-sensitive catalysts.
- **Data Cyan** (`#48c4d4`): neutral quantitative context that is neither positive nor negative.

### Neutral
- **Graphite Canvas** (`#0b0d10`): dark application background.
- **Graphite Surface** (`#13171c`): solid dark panels and data containers.
- **Graphite Boundary** (`#333b46`): dark separators and control edges.
- **Dark Ink** (`#f4f7fb`), **Secondary Ink** (`#b6c0cc`), **Muted Ink** (`#8b96a5`): dark-theme text hierarchy.
- **Cloud Canvas** (`#f2f4f7`) and **White Surface** (`#ffffff`): light application background and panels.
- **Cloud Boundary** (`#ccd3dc`): light-theme separators and control edges.
- **Light Ink** (`#11151a`), **Secondary Light Ink** (`#3f4854`), **Muted Light Ink** (`#5f6b78`): light-theme text hierarchy.

**The Semantic Rarity Rule.** Action blue marks selection and action only. Green and red never decorate; they always communicate a signed or health state.

## Typography

**Display Font:** Inter Variable (with Inter and system-ui fallbacks)  
**Body Font:** Inter Variable (with Inter and system-ui fallbacks)  
**Label/Mono Font:** JetBrains Mono Variable (with JetBrains Mono and monospace fallbacks)

**Character:** Inter keeps compact controls and prose neutral and highly legible. JetBrains Mono is reserved for tickers, prices, percentages, counts, dates, and aligned tabular values.

### Hierarchy
- **Title** (600, `1.125rem`, 1.3): page names and major workspace identity only.
- **Body** (400, `0.875rem`, 1.5): analysis prose and explanatory states, capped near 70 characters where practical.
- **Label** (600, `0.75rem`, `0.08em` only for functional headers): panel labels and table headings.
- **Numeric** (500, `0.75rem`, tabular): all market and model values.

**The Instrument Type Rule.** Numeric information uses the mono role and aligned figures; headings never scale with viewport width or use negative letter spacing.

## Elevation

The system is flat by default. Solid surface color and one-pixel boundaries organize repeated data. Low elevation appears only when a clickable surface is hovered; medium elevation is limited to sticky navigation, popovers, and the mobile detail workspace.

### Shadow Vocabulary
- **Interactive Lift** (`0 4px 8px -4px rgba(0, 0, 0, 0.4)`): hover feedback for genuinely clickable cards.
- **Chrome Separation** (`0 10px 24px -12px rgba(0, 0, 0, 0.62)`): bottom navigation and temporary overlays.

**The Flat Data Rule.** Repeated data panels do not use backdrop blur or resting shadows. Blur belongs only to persistent chrome with content moving beneath it.

## Components

### Buttons
- **Shape:** compact rectangle with a `6px` radius; icon buttons use a stable square hit area.
- **Primary:** action blue fill with strong contrast and a 44px mobile height.
- **Hover / Focus:** a 160ms color transition and a 2px action-blue focus outline; reduced-motion users receive an immediate state change.
- **Ghost:** solid or transparent neutral surface with secondary text and the same focus treatment.

### Chips
- **Style:** full-pill geometry is reserved for filters, statuses, and compact metadata. Neutral chips use a visible boundary; semantic chips use a low-chroma tint and matching label.
- **State:** selected filters use a solid action-blue control fill. Static chips are not enlarged to button size; interactive wrappers provide the 44px touch target.

### Cards / Containers
- **Corner Style:** `8px` panel radius.
- **Background:** solid Graphite Surface or White Surface.
- **Shadow Strategy:** none at rest; Interactive Lift only for clickable cards.
- **Border:** one-pixel theme boundary.
- **Internal Padding:** `12px` on phones and `16px` for roomier desktop summaries.

### Inputs / Fields
- **Style:** solid control background, visible boundary, `6px` radius, and readable placeholder contrast.
- **Focus:** boundary shifts to Action Blue with the shared 2px focus outline.
- **Error / Disabled:** error uses Loss Red plus text; disabled controls reduce emphasis but retain readable labels.

### Navigation
- Desktop uses a compact sticky top rail with icon-and-label destinations and a restrained selected fill. Mobile uses a safe-area-aware top context bar and a six-destination bottom rail with stable equal-width targets. The active destination uses both color and route state.

### Master / Detail Workspace
- Desktop preserves simultaneous dense list and analysis columns, with the analysis column independently sticky and scrollable. Phones show one workspace at a time; analysis opens full width between the top and bottom navigation and always exposes Back and Close controls.

## Do's and Don'ts

### Do:
- **Do** keep all primary mobile controls at least 44px and test from 320px portrait upward.
- **Do** contain wide tables and tapes inside their workspace scroller rather than allowing viewport overflow.
- **Do** use safe-area insets for the mobile top and bottom chrome.
- **Do** preserve both themes through the existing `--bg-*`, `--text-*`, `--accent-*`, and `--glass-*` compatibility tokens.
- **Do** pair semantic color with a label, number sign, icon, or status text.
- **Do** use list-to-detail navigation on phones and simultaneous master/detail on desktop.

### Don't:
- **Don't** make a marketing site or oversized hero experience.
- **Don't** make a generic SaaS card mosaic.
- **Don't** make a decorative imitation of a financial terminal.
- **Don't** scale a desktop table down until it technically fits a phone.
- **Don't** add live-trading or order-entry controls.
- **Don't** use decorative glass excess, backdrop blur on repeated cards, wide resting shadows, gradient text, or ornamental animation.
- **Don't** use green or red as decoration, or rely on color as the only carrier of meaning.
- **Don't** use side-stripe borders thicker than 1px, oversized rounded panels, or nested card framing.

## 2026-10 Redesign Rules (current; overrides anything above that conflicts)

Diagnosis that drove this pass: one endless home page doing eleven jobs,
11-12px monospace prose walls, uppercase tracked eyebrows on every block,
colored chips everywhere, nested bordered boxes, and filter bars with ~40
always-visible controls. Nothing had hierarchy, so nothing could be scanned.

**Information architecture.** Left sidebar (desktop) / bottom bar + More
sheet (phone). Desk: Brief `/`, Flow `/flow[/heatmap|/bounce]`, Books
`/books[/flow-trader]`, Intel `/intel[/voices|/news]`, Traders. Markets:
Pillars, Rotation, GEX, Map. `DeskPage` (src/pages/CommandCenterPage.tsx)
renders the page title, summary, underline view tabs, and the shared ticker
analysis side panel. Feature components must NOT render their own page-level
title ("Daily Brief", "Smart Trader", "iFlow Tracker" banners) — the page
header already says it.

**Type.**
- Section/panel titles: `text-sm font-semibold text-text-primary`, sentence
  case. NO `uppercase tracking-[...]` eyebrows anywhere. Table column heads:
  `text-xs font-medium text-text-muted`, no uppercase.
- Prose: `text-sm leading-relaxed text-text-secondary`, measure capped with
  `max-w-[72ch]`. Lead sentence/headline may be `text-base`/`text-lg`
  `font-semibold text-text-primary`.
- `num` (mono, tabular) ONLY for numbers, tickers, and contract strings —
  never for sentences or labels.
- Minimum size `text-xs` (no `text-[10px]`/`text-[11px]` except a numeric
  count badge).

**Color.** Restrained: neutral surfaces + one interaction accent (blue).
Green/red only on signed values (P/L, % move, bull/bear direction). Chips
default to `tone="neutral"`; give a tone only when the chip IS a state the
user must notice (AVOID/STOP, a breach). A row of ten colored pills is noise
— render it as plain text with colored numbers instead. Orange = warning,
purple = human/trader events, used sparingly.

**Structure.**
- One container level. A `.card` / `GlassPanel` must not contain another
  bordered/tinted box; inner groups separate by spacing (`gap-4`/`gap-6`) or a
  single `border-t border-border pt-3` divider.
- No side-stripe accents (`border-l-2`+ colored). Use a leading status dot,
  a text tag, or a full background tint instead.
- No `glass-strong` / backdrop blur inside page content; use `.card` or no
  container. Blur is shell-chrome only.
- Lists/tables: rows `py-2`, hover `bg-bg-card-hover`, dividers
  `divide-y divide-border`, no zebra.
- Filter bars: keep the 2-4 controls people use every visit visible; move the
  rest into a `<details>` "Filters" disclosure (or a compact select). Never
  wrap 3+ rows of controls.
- Progressive disclosure over deletion: secondary detail goes behind
  `<details>`, a "Show more", or a `title` tooltip — never dropped.

**Hard rules for restyle passes.** Don't change hooks, queries, data flow,
props contracts, routes, or behavior. JSX structure, classNames, and inline
styles may change freely. Tokens only (CSS vars / mapped Tailwind classes);
no new dependencies; no emojis. `npx --no-install tsc -b` must pass.

## 2026-10 v2 identity (current; layered on the Redesign Rules above)

User verdict on the first pass: "redesign the WHOLE UI" — a restyle inside the
old look wasn't enough. v2 changes identity, scale and composition.

**Scene.** One trader at a home desk before the 6:30 PT open, room still dim,
big monitor; later the phone between meetings. Dark default, light supported.

**Palette (index.css, OKLCH).** Ink-blue neutrals (hue 265). One interaction
accent = indigo, exposed as `--accent-blue` / `text-accent-blue` (name kept
for compat). Green/red ONLY for signed values. Orange = caution.

**Type, three voices.**
- Display serif (Newsreader) via `.font-display`: page h1 (DeskPage header),
  `.headline` (story headline), `.section-title` (section headings inside a
  page, e.g. "What moved & why", "Open positions"). Never for numbers/labels.
- `.prose-read`: serif reading prose, 1.0625rem/1.6 — for narrative paragraphs
  (brief summary, pillar report, theses, trader commentary bodies). Short UI
  sentences stay sans `text-sm text-text-secondary`.
- Mono (`num`, `.ticker`, `.delta-up/.delta-down`) for numbers/tickers only.

**Scale & hierarchy.** Every page must have ONE obvious focal element. Key
numbers are big (`Stat` renders text-xl; hero figures may go `text-3xl
font-semibold num`). Section rhythm: `gap-8`/`space-y-8` between sections,
`gap-3` inside. Section = `.section-title` (+ optional `.section-sub`) then
content — not a bordered card with a tiny title. Use `.card` only to group
a dense dataset (table, chart, rail list); max one level.

**Recipes (CSS classes in index.css).** `.section-title`, `.section-sub`,
`.headline`, `.prose-read`, `.ticker`, `.delta-up`, `.delta-down`, `.tag`
(neutral pill; state tint via `style={{"--tag":"var(--accent-orange)"}}`),
`.data-row` (hover row), `.callout` (tinted, full-border caveat; set
`--callout` for other tones). Prefer these over ad-hoc class soup.

**Rows.** Ticker-led rows: `.ticker` (text-sm) left, description middle,
signed delta right-aligned `.delta-*`. Row padding `py-2.5 px-2`, `.data-row`
hover, `divide-y divide-border`. Warnings under a row use `.callout`, not
orange inline text with a ⚠ glyph.

**Hard rules unchanged:** no hook/query/prop/route/behavior changes; no new
deps; no emojis; no uppercase tracked eyebrows; no side stripes; no nested
cards; `npx --no-install tsc -b` must pass.
