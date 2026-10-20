import { useEffect, useState, type CSSProperties, type ReactNode } from "react";
import { useSupplyStack, type StackGroup, type StackMember, type SupplyStack } from "../../api/pillars";
import { useAppStore } from "../../store/useAppStore";
import { ArrowDown, Zap, Snowflake, Bot, Maximize2, X } from "lucide-react";

/** Translucent tint of a CSS-var color — var() can't take a hex-alpha suffix. */
const tint = (c: string, pct: number) => `color-mix(in srgb, ${c} ${pct}%, transparent)`;

/** Layer hue, top (application) -> bottom (minerals), echoing the classic
 *  supply-chain poster's warm-to-earth gradient but from our token palette. */
const LAYER_HUES: Record<string, string> = {
  apps: "var(--accent-blue)",
  cloud: "var(--accent-cyan)",
  compute: "var(--accent-orange)",
  memory: "var(--accent-yellow)",
  interconnect: "var(--accent-purple)",
  foundry: "var(--accent-green)",
  equipment: "var(--accent-fuchsia)",
  minerals: "var(--accent-red)",
  power: "var(--accent-red)",
  thermal: "var(--accent-cyan)",
  physical: "var(--accent-fuchsia)",
};

/** Edge labels between adjacent layers (the "runs on" arrows in the poster). */
const FLOW_LABELS = [
  "runs on", "racks", "each unit needs", "linked by", "packaged by", "tooled by", "built from",
];

const RAIL_ICONS: Record<string, ReactNode> = {
  power: <Zap size={11} />,
  thermal: <Snowflake size={11} />,
  physical: <Bot size={11} />,
};

const ROLE_ABBR: Record<string, string> = {
  PLATFORM: "PLAT", ENABLER: "ENAB", BOTTLENECK: "BOTT", CONSUMER: "CONS", NEUTRAL: "NEUT",
};

const BOTT_TAG = { "--tag": "var(--accent-yellow)" } as CSSProperties;

/** Continuous heat color for a 0-100 play score (red -> green). */
function heatColor(play: number | null | undefined): string {
  if (play == null) return "var(--text-muted)";
  const pct = Math.max(0, Math.min(100, ((play - 20) / 60) * 100));
  return `color-mix(in srgb, var(--accent-green) ${pct}%, var(--accent-red))`;
}

function MemberChip({ m, active, onClick }: {
  m: StackMember; active: boolean; onClick: (t: string) => void;
}) {
  const ret = m.return_30d;
  const retColor = ret == null ? "var(--text-muted)"
    : ret >= 0 ? "var(--accent-green)" : "var(--accent-red)";
  const bits = [
    m.name || m.ticker,
    m.play_score != null ? `play ${m.play_score}` : null,
    m.accum_label ? m.accum_label.replace(/_/g, " ").toLowerCase() : null,
    ret != null ? `${ret >= 0 ? "+" : ""}${ret.toFixed(0)}% 30d` : null,
    m.role || null,
    m.days_to_earnings != null ? `ER ${m.days_to_earnings}d` : null,
  ].filter(Boolean);
  return (
    <button
      type="button"
      onClick={() => onClick(m.ticker)}
      title={bits.join(" · ")}
      className="num inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full text-xs cursor-pointer transition-colors hover:bg-bg-card-hover"
      style={{
        background: active ? tint(retColor, 22) : tint(retColor, 9),
        color: "var(--text-primary)",
        border: `1px solid ${active ? retColor : tint(retColor, 30)}`,
      }}
    >
      <span className="font-semibold">{m.ticker}</span>
      {m.play_score != null && (
        <span style={{ color: heatColor(m.play_score) }}>{m.play_score}</span>
      )}
      {m.role === "BOTTLENECK" && (
        <span className="text-xs" style={{ color: "var(--accent-yellow)" }}>
          {ROLE_ABBR.BOTTLENECK}
        </span>
      )}
    </button>
  );
}

function GroupCard({ g, rail, open, onToggle, activeTicker, onPick }: {
  g: StackGroup; rail?: boolean; open: boolean;
  onToggle: (k: string) => void; activeTicker: string; onPick: (t: string) => void;
}) {
  const [showAll, setShowAll] = useState(false);
  const hue = LAYER_HUES[g.key] ?? "var(--accent-blue)";
  const { n, median_play, n_bulls, n_bears, n_bottleneck } = g.stats;
  const split = n_bulls + n_bears;
  const shown = showAll ? g.members : g.members.slice(0, 14);
  return (
    <div
      className="rounded-[10px] px-3 py-2.5 transition-colors"
      style={{
        background: tint(hue, open ? 12 : 7),
        border: `1px ${rail ? "dashed" : "solid"} ${tint(hue, open ? 50 : 28)}`,
      }}
    >
      <button type="button" onClick={() => onToggle(g.key)} className="w-full text-left cursor-pointer">
        <div className="flex items-center gap-1.5">
          {rail && <span style={{ color: hue }}>{RAIL_ICONS[g.key]}</span>}
          <span className="text-sm font-semibold text-text-primary">{g.title}</span>
          <span className="num text-xs text-text-muted">{n}</span>
          {n_bottleneck > 0 && (
            <span
              className="tag num"
              title={`${n_bottleneck} names with a BOTTLENECK structural role`}
              style={BOTT_TAG}
            >
              {n_bottleneck} bott
            </span>
          )}
          <span className="ml-auto num text-base font-semibold" title="median play score"
            style={{ color: heatColor(median_play) }}>
            {median_play ?? "—"}
          </span>
        </div>
        <div className="flex items-center gap-2 mt-0.5">
          <span className="text-xs text-text-muted truncate">{g.note}</span>
          {split > 0 && (
            <span
              className="ml-auto shrink-0 inline-flex h-1 w-12 rounded-full overflow-hidden"
              title={`30d: ${n_bulls} up / ${n_bears} down`}
              style={{ background: tint("var(--accent-red)", 45) }}
            >
              <span style={{ width: `${(n_bulls / split) * 100}%`, background: "var(--accent-green)" }} />
            </span>
          )}
        </div>
      </button>
      {open && (
        <div className="mt-1.5 pt-1.5 flex flex-wrap gap-1" style={{ borderTop: `1px solid ${tint(hue, 22)}` }}>
          {shown.map((m) => (
            <MemberChip key={m.ticker} m={m} active={m.ticker === activeTicker} onClick={onPick} />
          ))}
          {g.members.length > 14 && (
            <button
              type="button"
              onClick={() => setShowAll((v) => !v)}
              className="num text-xs text-text-muted hover:text-text-secondary px-1 cursor-pointer"
            >
              {showAll ? "less" : `+${g.members.length - 14} more`}
            </button>
          )}
        </div>
      )}
    </div>
  );
}

/** Prettify a taxonomy theme key for a sub-box label. */
const themeLabel = (t: string) => t.replace(/_/g, " ").toLowerCase();

/** One theme sub-box inside a poster band (mirrors the inner boxes of the
 *  classic supply-chain poster, but every ticker is live + clickable). */
function ThemeBox({ theme, tickers, memberOf, hue, activeTicker, onPick }: {
  theme: string; tickers: string[]; memberOf: Map<string, StackMember>;
  hue: string; activeTicker: string; onPick: (t: string) => void;
}) {
  const [showAll, setShowAll] = useState(false);
  const members = tickers.map((t) => memberOf.get(t)).filter(Boolean) as StackMember[];
  if (members.length === 0) return null;
  members.sort((a, b) => (b.play_score ?? 0) - (a.play_score ?? 0));
  const shown = showAll ? members : members.slice(0, 6);
  return (
    <div
      className="rounded-[8px] px-2 py-1.5 min-w-0"
      style={{ background: "color-mix(in srgb, var(--bg-card) 55%, transparent)", border: `1px solid ${tint(hue, 30)}` }}
    >
      <div className="text-xs font-medium text-text-secondary mb-1">{themeLabel(theme)}</div>
      <div className="flex flex-wrap gap-1">
        {shown.map((m) => (
          <MemberChip key={m.ticker} m={m} active={m.ticker === activeTicker} onClick={onPick} />
        ))}
        {members.length > 6 && (
          <button
            type="button"
            onClick={() => setShowAll((v) => !v)}
            className="num text-xs text-text-muted hover:text-text-secondary px-1 cursor-pointer"
          >
            {showAll ? "less" : `+${members.length - 6}`}
          </button>
        )}
      </div>
    </div>
  );
}

/** One full-width poster band: layer title bar + theme sub-boxes. */
function PosterBand({ g, activeTicker, onPick }: {
  g: StackGroup; activeTicker: string; onPick: (t: string) => void;
}) {
  const hue = LAYER_HUES[g.key] ?? "var(--accent-blue)";
  const memberOf = new Map(g.members.map((m) => [m.ticker, m]));
  const themes = Object.entries(g.by_theme ?? {});
  return (
    <div
      className="rounded-[12px] px-3 py-2.5"
      style={{ background: tint(hue, 12), border: `1px solid ${tint(hue, 42)}` }}
    >
      <div className="flex items-baseline gap-2 mb-1.5">
        <span className="font-display text-lg font-medium text-text-primary">{g.title}</span>
        <span className="text-xs text-text-muted">{g.note}</span>
        {g.stats.n_bottleneck > 0 && (
          <span className="tag num" style={BOTT_TAG}>
            {g.stats.n_bottleneck} bott
          </span>
        )}
        <span className="ml-auto num text-lg font-semibold" title="median play score"
          style={{ color: heatColor(g.stats.median_play) }}>
          {g.stats.median_play ?? "—"}
        </span>
      </div>
      <div className="grid gap-1.5" style={{ gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))" }}>
        {themes.map(([th, tks]) => (
          <ThemeBox key={th} theme={th} tickers={tks} memberOf={memberOf}
            hue={hue} activeTicker={activeTicker} onPick={onPick} />
        ))}
      </div>
    </div>
  );
}

/** Full-screen "poster mode" — the literal layout of the classic AI-buildout
 *  supply-chain poster (center stack of layer bands, power rail left, thermal
 *  + physical-AI rails right), but every box is live data and clickable. */
function PosterView({ data, onClose }: { data: SupplyStack; onClose: () => void }) {
  const activeTicker = useAppStore((s) => s.activeTicker);
  const setActiveTicker = useAppStore((s) => s.setActiveTicker);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const rail = (key: string) => data.rails.find((r) => r.key === key);
  const power = rail("power");
  const thermal = rail("thermal");
  const physical = rail("physical");
  const railBand = (g?: StackGroup) => g && (
    <div className="space-y-1.5">
      <div className="flex items-center gap-1.5 font-display text-lg font-medium text-text-primary">
        <span style={{ color: LAYER_HUES[g.key] }}>{RAIL_ICONS[g.key]}</span> {g.title}
        <span className="ml-auto num" style={{ color: heatColor(g.stats.median_play) }}>
          {g.stats.median_play ?? "—"}
        </span>
      </div>
      {Object.entries(g.by_theme ?? {}).map(([th, tks]) => (
        <ThemeBox key={th} theme={th} tickers={tks}
          memberOf={new Map(g.members.map((m) => [m.ticker, m]))}
          hue={LAYER_HUES[g.key]} activeTicker={activeTicker} onPick={setActiveTicker} />
      ))}
    </div>
  );

  return (
    // --bg-primary (NOT the nonexistent --bg-base, whose #0b0e14 fallback
    // painted a dark scrim under light-theme text) keeps the poster legible
    // in both themes.
    <div className="fixed inset-0 z-50 overflow-y-auto" style={{ background: "color-mix(in srgb, var(--bg-primary) 97%, transparent)" }}>
      {/* Fixed exit button — survives scrolling anywhere in the poster. */}
      <button
        type="button"
        onClick={onClose}
        aria-label="Close poster"
        className="fixed top-4 right-5 z-10 inline-flex items-center gap-1 rounded border border-border px-2.5 py-1.5 text-xs text-text-secondary hover:text-text-primary cursor-pointer"
        style={{ background: "var(--bg-card-hover)" }}
      >
        <X size={13} /> Close
      </button>
      <div className="max-w-[110rem] mx-auto px-4 py-6">
        <div className="mb-6 pr-24">
          <h2 className="headline">AI buildout supply chain</h2>
          <p className="mt-2 text-sm text-text-secondary">
            From application layer to critical minerals · live desk data · click any name
          </p>
        </div>

        <div className="grid gap-4 items-start" style={{ gridTemplateColumns: "minmax(200px, 240px) minmax(0, 1fr) minmax(200px, 240px)" }}>
          {/* left rail — POWER (in) */}
          <div className="space-y-2">
            <div className="text-sm font-medium text-text-secondary">Power comes in</div>
            {railBand(power)}
          </div>

          {/* center — the layer stack */}
          <div>
            {data.layers.map((g, i) => (
              <div key={g.key}>
                <PosterBand g={g} activeTicker={activeTicker} onPick={setActiveTicker} />
                {i < data.layers.length - 1 && (
                  <div className="flex items-center justify-center gap-1 py-1 text-text-muted">
                    <ArrowDown size={11} />
                    <span className="text-xs">{FLOW_LABELS[i] ?? ""}</span>
                  </div>
                )}
              </div>
            ))}
          </div>

          {/* right rail — THERMAL (out) + PHYSICAL AI (edge) */}
          <div className="space-y-4">
            <div className="space-y-2">
              <div className="text-sm font-medium text-text-secondary">Heat comes out</div>
              {railBand(thermal)}
            </div>
            <div className="space-y-2">
              <div className="text-sm font-medium text-text-secondary">Atoms at the edge</div>
              {railBand(physical)}
            </div>
          </div>
        </div>

        <div className="text-sm text-text-muted mt-6">
          Number = median play score · chip tint = 30d return · BOTT = graph structural bottleneck · Esc to close
        </div>
      </div>
    </div>
  );
}

/** Interactive "AI buildout stack" — application layer down to critical
 *  minerals, every layer live-colored by median play score and 30d breadth,
 *  cross-cutting power / thermal / physical-AI rails below. Click a layer to
 *  expand its names; click a name to load it everywhere (activeTicker). */
export function SupplyStackViz() {
  const { data, isLoading } = useSupplyStack();
  const activeTicker = useAppStore((s) => s.activeTicker);
  const setActiveTicker = useAppStore((s) => s.setActiveTicker);
  const [open, setOpen] = useState<string | null>("compute");
  const [poster, setPoster] = useState(false);
  const toggle = (k: string) => setOpen((o) => (o === k ? null : k));

  if (isLoading && !data) {
    return (
      <div className="card animate-pulse">
        <div className="h-4 w-44 rounded bg-text-muted/20 mb-3" />
        {[...Array(6)].map((_, i) => (
          <div key={i} className="h-10 w-full rounded bg-text-muted/10 mb-2" />
        ))}
      </div>
    );
  }
  if (!data?.available) return null;

  return (
    <div className="card flex flex-col gap-1">
      <div className="flex items-start gap-3 mb-3">
        <div className="min-w-0">
          <h2 className="section-title">AI buildout stack</h2>
          <p className="section-sub">Apps down to minerals, live</p>
        </div>
        <button
          type="button"
          onClick={() => setPoster(true)}
          title="Open full-screen poster view"
          aria-label="Open poster view"
          className="ml-auto inline-flex min-h-8 shrink-0 items-center gap-1.5 rounded-full border border-border px-2.5 py-1 text-xs font-medium text-text-secondary transition-colors hover:text-text-primary cursor-pointer"
        >
          <Maximize2 size={12} /> Poster
        </button>
      </div>
      {poster && <PosterView data={data} onClose={() => setPoster(false)} />}

      {data.layers.map((g, i) => (
        <div key={g.key}>
          <GroupCard
            g={g} open={open === g.key} onToggle={toggle}
            activeTicker={activeTicker} onPick={setActiveTicker}
          />
          {i < data.layers.length - 1 && (
            <div className="flex items-center justify-center gap-1 py-0.5 text-text-muted">
              <ArrowDown size={10} />
              <span className="text-xs">{FLOW_LABELS[i] ?? ""}</span>
            </div>
          )}
        </div>
      ))}

      <div className="mt-3 pt-4 border-t border-border">
        <div className="font-display text-base font-medium text-text-primary">Cross-cutting</div>
        <div className="text-xs text-text-muted mb-2">Power in · heat out · atoms at the edge</div>
        <div className="flex flex-col gap-1.5">
          {data.rails.map((g) => (
            <GroupCard
              key={g.key} g={g} rail open={open === g.key} onToggle={toggle}
              activeTicker={activeTicker} onPick={setActiveTicker}
            />
          ))}
        </div>
      </div>

      <div className="text-xs text-text-muted pt-3 mt-2 border-t border-border leading-relaxed">
        Number = median play score · bar = 30d up/down breadth · chip tint = 30d return ·
        click a name to load it everywhere
      </div>
    </div>
  );
}
