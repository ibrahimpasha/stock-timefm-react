# Design Spec — "Modern Glass" remodel (2026-07)

The single source of truth for the visual remodel. Every component edit must
follow these rules; deviations break cross-page coherence.

## Concept

Layered translucent panels floating over an ambient gradient field. Calm,
spacious, springy. Data is the hero: chrome recedes, numbers and state color
step forward. Think Linear/Vercel dashboard, not Bloomberg terminal.

## Tokens (already defined in `src/index.css` — consume, never redefine)

Surfaces:
- `.card` — the standard glass panel (blur + hairline border + inner highlight
  + `--radius-panel` 16px). All existing `.card` usages upgraded automatically.
- `.glass-strong` — higher-opacity glass for chrome (navbar, sticky headers,
  popovers) that must stay readable over busy content.
- `.card-interactive` — add to clickable cards; hover lifts 1px + shadow-2.
- `--shadow-1/2/3` — resting / hover / overlay elevation. Never invent shadows.
- `--radius-panel` 16px, `--radius-control` 10px, `--radius-chip` 999px.

Color:
- ONLY CSS vars: `--bg-*`, `--text-*`, `--accent-*`, `--glass-*`. Tailwind
  utilities that map to them (`text-accent-blue`, `bg-bg-card`, `border-border`)
  are fine. NO literal hex/rgb in components (exception: chart/SVG palettes
  that already exist).
- Tinted fills derive from accents via
  `color-mix(in srgb, var(--accent-x) 14%, transparent)` — see `Chip` in
  `src/components/Glass.tsx`.
- `.gradient-text` for the wordmark / one hero number per page, max.

Type:
- Inter Variable (body) and JetBrains Mono Variable (numerals) are self-hosted
  and loaded in `main.tsx`.
- Tailwind scale only: `text-xs` / `text-sm` for almost everything; `text-lg+`
  reserved for hero numbers. NO arbitrary `text-[Npx]` (tiny accent badges
  exempt).
- Panel headers: `text-xs font-semibold uppercase tracking-[0.08em]
  text-text-secondary` (or use `GlassPanel`'s `title` prop).
- ALL numeric data (prices, %, P/L, counts, ages) gets the `num` class —
  mono + tabular-nums so columns align.

Motion:
- Transitions 150-200ms ease, on colors/shadow/transform only. No layout
  animations, no bounce keyframes. Respect the existing `animate-pulse` for
  loading.

## Primitives (`src/components/Glass.tsx` — use these, don't reinvent)

- `GlassPanel` — titled panel (header row + actions slot).
- `Chip` — pill with tone (`green|red|blue|purple|orange|yellow|cyan|neutral`).
  Replaces every ad-hoc badge/tag span.
- `Stat` — label-over-value block for summary strips.
- `Segmented` — pill-style segmented control. THE tab language: replace every
  row of ad-hoc tab buttons with this.

## Patterns

- Page layout: cards separated by `gap-3` / `gap-4`, no `border-b` dividers
  between sections — separation comes from panel edges, not rules.
- State color: green/red ONLY for P/L, bull/bear, up/down. Blue = interactive
  accent. Purple = trader/human events. Never color decoratively.
- Empty states: one muted sentence, centered, `text-sm text-text-muted` —
  never a bare blank panel.
- Loading: `animate-pulse` skeleton bars inside the panel (keep panel frame
  visible), or the existing `isFetching && !data` pattern for inline.
- Tables/tapes: header row `text-xs text-text-muted` sticky where the list
  scrolls; row hover `bg-bg-card-hover`; no zebra striping.
- NO emojis anywhere. State via text tags + color.

## Hard rules

1. RESTYLE, don't refactor: do not change hooks, data flow, props contracts,
   or behavior. Only JSX structure/classNames/inline styles may change.
2. Both themes must work: never assume dark. Test mentally against light
   (`data-theme="light"`); anything using tokens is automatically safe.
3. `npx --no-install tsc --noEmit -p tsconfig.json` must pass after your edits.
4. Do not touch files outside your assigned list.
5. Do not add dependencies.
6. Keep the mobile affordances that exist (`max-md:` variants) — adapt them to
   the new classes rather than dropping them.
