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
