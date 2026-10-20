import { useMemo, useState, type CSSProperties, type ReactNode } from "react";
import { ChevronRight, RefreshCw } from "lucide-react";
import {
  usePillars,
  usePillar,
  useWeeklyReport,
  type PillarBottleneck,
  type PillarCompany,
  type PillarTickerBrief,
  type PillarDetail,
  type SupplyChainLayer,
  type PreIpoCompany,
} from "../api/pillars";
import { useAppStore } from "../store/useAppStore";
import { Chip, type ChipTone } from "../components/Glass";
import { SupplyStackViz } from "../features/pillars/SupplyStackViz";

/* ── helpers ─────────────────────────────────────────────────────────── */

function fmtCap(n?: number | null): string {
  if (!n) return "—";
  if (n >= 1e12) return `$${(n / 1e12).toFixed(2)}T`;
  if (n >= 1e9) return `$${(n / 1e9).toFixed(0)}B`;
  if (n >= 1e6) return `$${(n / 1e6).toFixed(0)}M`;
  return `$${n.toFixed(0)}`;
}

const SEV: Record<string, { color: string; bg: string }> = {
  Critical: { color: "var(--accent-red)", bg: "color-mix(in srgb, var(--accent-red) 14%, transparent)" },
  High: { color: "var(--accent-orange)", bg: "color-mix(in srgb, var(--accent-orange) 14%, transparent)" },
  Moderate: { color: "var(--accent-yellow)", bg: "color-mix(in srgb, var(--accent-yellow) 12%, transparent)" },
};

// Only Critical is a state worth color; High/Moderate read as plain text.
const SEV_TONE: Record<string, ChipTone> = {
  Critical: "red",
  High: "orange",
};

function accumColor(label?: string): string {
  const l = (label || "").toUpperCase();
  if (l.includes("STRONG_ACCUM") || l.includes("ESCALAT")) return "var(--accent-green)";
  if (l.includes("ACCUM")) return "var(--accent-green)";
  if (l.includes("DIST")) return "var(--accent-red)";
  if (l.includes("BATTLE")) return "var(--accent-orange)";
  return "var(--text-muted)";
}

/* ── small atoms ─────────────────────────────────────────────────────── */

function TickerChip({
  b,
  tone,
  onClick,
}: {
  b: PillarTickerBrief;
  tone: "gated" | "owns";
  onClick: (t: string) => void;
}) {
  return (
    <button
      type="button"
      onClick={() => onClick(b.ticker)}
      title={`${b.name || b.ticker}${b.play_score != null ? ` · play ${b.play_score}` : ""}${
        b.accum_label ? ` · ${b.accum_label.replace(/_/g, " ").toLowerCase()}` : ""
      }`}
      className="cursor-pointer"
    >
      <Chip>
        <span className="num font-semibold text-text-primary">{b.ticker}</span>
        {b.play_score != null && (
          <span className="num" style={{ color: tone === "owns" ? "var(--accent-green)" : "var(--accent-red)" }}>
            {b.play_score}
          </span>
        )}
      </Chip>
    </button>
  );
}

function SeverityBadge({ severity }: { severity: string }) {
  const tone = SEV_TONE[severity];
  return (
    <span
      className="tag"
      style={tone ? ({ "--tag": `var(--accent-${tone})` } as CSSProperties) : undefined}
    >
      {severity}
    </span>
  );
}

/* ── bottleneck matrix ───────────────────────────────────────────────── */

function BottleneckCard({
  b,
  onTicker,
}: {
  b: PillarBottleneck;
  onTicker: (t: string) => void;
}) {
  return (
    <div className="flex flex-col gap-3 border-t border-border pt-4">
      <div className="flex items-baseline gap-2 flex-wrap">
        <h4 className="font-display text-lg font-medium leading-snug text-text-primary">{b.name}</h4>
        <SeverityBadge severity={b.severity} />
        {b.timeline && (
          <span className="ml-auto text-xs num text-text-muted">{b.timeline}</span>
        )}
      </div>
      {b.detail && <p className="text-sm leading-relaxed text-text-secondary max-w-[72ch]">{b.detail}</p>}
      {b.graphify_concept && (
        <div className="text-xs text-text-muted">
          Graph concept: <span className="text-text-secondary">{b.graphify_concept}</span>
        </div>
      )}
      <div className="flex flex-col gap-1.5 pt-1">
        {b.beneficiaries.length > 0 && (
          <div className="flex items-start gap-1.5 flex-wrap">
            <span className="w-12 shrink-0 text-xs font-medium text-text-muted pt-0.5">
              Owns
            </span>
            {b.beneficiaries.map((t) => (
              <TickerChip key={`o-${t.ticker}`} b={t} tone="owns" onClick={onTicker} />
            ))}
          </div>
        )}
        {b.gated.length > 0 && (
          <div className="flex items-start gap-1.5 flex-wrap">
            <span className="w-12 shrink-0 text-xs font-medium text-text-muted pt-0.5">
              Gated
            </span>
            {b.gated.map((t) => (
              <TickerChip key={`g-${t.ticker}`} b={t} tone="gated" onClick={onTicker} />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

/* ── value × purity scatter ──────────────────────────────────────────── */

function PurityScatter({
  companies,
  accent,
  onTicker,
}: {
  companies: PillarCompany[];
  accent: string;
  onTicker: (t: string) => void;
}) {
  // Only names with both a thesis-purity and a PEG estimate are plottable.
  const pts = companies.filter(
    (c) => typeof c.purity === "number" && typeof c.peg === "number" && (c.peg as number) > 0,
  );
  const W = 720;
  const H = 380;
  const PAD = 38;
  const PEG_MAX = 3; // clamp; left = cheaper
  const caps = pts.map((c) => c.market_cap || 0);
  const maxCap = Math.max(1, ...caps);

  if (pts.length < 3) {
    return (
      <div className="text-sm text-text-muted px-1 py-6 max-w-[72ch]">
        Value × purity scatter needs PEG + purity estimates from the research pass
        (still generating, or sparse for this pillar). The company table below has the full universe.
      </div>
    );
  }

  const x = (peg: number) => PAD + (Math.min(PEG_MAX, Math.max(0, peg)) / PEG_MAX) * (W - 2 * PAD);
  const y = (purity: number) => H - PAD - purity * (H - 2 * PAD);
  const r = (cap: number) => 4 + Math.sqrt((cap || 0) / maxCap) * 22;

  return (
    <div className="overflow-x-auto">
      <svg width={W} height={H} className="min-w-[680px]">
        {/* quadrant guides at PEG=1.0 (fair) and purity=0.6 (pure) */}
        <line x1={x(1)} y1={PAD} x2={x(1)} y2={H - PAD} stroke="var(--border)" strokeDasharray="3 3" />
        <line x1={PAD} y1={y(0.6)} x2={W - PAD} y2={y(0.6)} stroke="var(--border)" strokeDasharray="3 3" />
        <text x={PAD + 6} y={PAD + 12} className="fill-text-secondary" style={{ fontSize: 12 }}>
          Value + pure
        </text>
        <text x={W - PAD - 6} y={PAD + 12} textAnchor="end" className="fill-text-secondary" style={{ fontSize: 12 }}>
          Premium + pure
        </text>
        <text x={PAD + 6} y={H - PAD - 6} className="fill-text-secondary" style={{ fontSize: 12 }}>
          Value + diversified
        </text>
        {/* axis labels */}
        <text x={W / 2} y={H - 8} textAnchor="middle" className="fill-text-secondary" style={{ fontSize: 12 }}>
          PEG  ·  cheaper →← richer
        </text>
        <text
          x={12}
          y={H / 2}
          textAnchor="middle"
          transform={`rotate(-90 12 ${H / 2})`}
          className="fill-text-muted"
          style={{ fontSize: 11 }}
        >
          Purity % (revenue in thesis)
        </text>
        {pts.map((c) => {
          const cx = x(c.peg as number);
          const cy = y(c.purity as number);
          const col = accumColor(c.accum_label) === "var(--text-muted)" ? accent : accumColor(c.accum_label);
          return (
            <g
              key={c.ticker}
              className="cursor-pointer"
              role="button"
              tabIndex={0}
              aria-label={`Open ${c.ticker} details`}
              onClick={() => onTicker(c.ticker)}
              onKeyDown={(event) => {
                if (event.key === "Enter" || event.key === " ") {
                  event.preventDefault();
                  onTicker(c.ticker);
                }
              }}
            >
              <circle
                cx={cx}
                cy={cy}
                r={r(c.market_cap || 0)}
                fill={col}
                fillOpacity={0.22}
                stroke={col}
                strokeOpacity={0.7}
              />
              <text x={cx} y={cy + 4} textAnchor="middle" className="fill-text-primary num" style={{ fontSize: 11, fontWeight: 600 }}>
                {c.ticker}
              </text>
              <title>
                {`${c.ticker} — purity ${Math.round((c.purity as number) * 100)}% · PEG ${(c.peg as number).toFixed(
                  2,
                )} · ${fmtCap(c.market_cap)}${c.play_score != null ? ` · play ${c.play_score}` : ""}`}
              </title>
            </g>
          );
        })}
      </svg>
    </div>
  );
}

/* ── company table ───────────────────────────────────────────────────── */

function CompanyTable({
  companies,
  onTicker,
  active,
}: {
  companies: PillarCompany[];
  onTicker: (t: string) => void;
  active: string;
}) {
  const [showAll, setShowAll] = useState(false);
  const rows = showAll ? companies : companies.slice(0, 24);
  return (
    <div className="flex flex-col">
      <div className="divide-y divide-border md:hidden">
        {rows.map((c) => (
          <button
            key={c.ticker}
            type="button"
            onClick={() => onTicker(c.ticker)}
            className="data-row min-h-11 w-full px-2 py-2.5 text-left"
            style={{ background: c.ticker === active ? "color-mix(in srgb, var(--accent-blue) 8%, transparent)" : undefined }}
          >
            <span className="flex min-w-0 items-center gap-2">
              <span className="ticker flex items-center gap-1 text-sm">
                {c.ticker}
                {c.featured && <span className="h-1.5 w-1.5 rounded-full bg-accent-blue" title="Researched name" />}
              </span>
              <span className="min-w-0 flex-1 truncate text-sm text-text-secondary">
                {c.one_liner || c.name || ""}
              </span>
              <span className="num text-xs font-semibold" style={{ color: c.play_score != null && c.play_score >= 60 ? "var(--accent-green)" : "var(--text-secondary)" }}>
                Play {c.play_score ?? "—"}
              </span>
            </span>
            <span className="mt-1 block truncate text-xs" style={{ color: accumColor(c.accum_label) }}>
              {c.role || ""}
              {c.accum_label ? ` · ${c.accum_label.replace(/_/g, " ").toLowerCase()}` : ""}
            </span>
            <span className="mt-2 grid grid-cols-5 gap-1 text-center text-xs">
              <span><span className="block text-text-muted">Purity</span><span className="num text-text-secondary">{typeof c.purity === "number" ? `${Math.round(c.purity * 100)}%` : "—"}</span></span>
              <span><span className="block text-text-muted">PEG</span><span className="num text-text-secondary">{typeof c.peg === "number" ? c.peg.toFixed(1) : "—"}</span></span>
              <span><span className="block text-text-muted">30D</span><span className="num" style={{ color: c.return_30d == null ? "var(--text-muted)" : c.return_30d >= 0 ? "var(--accent-green)" : "var(--accent-red)" }}>{c.return_30d == null ? "—" : `${c.return_30d >= 0 ? "+" : ""}${c.return_30d.toFixed(0)}%`}</span></span>
              <span><span className="block text-text-muted">Target</span><span className="num" style={{ color: c.target_pct == null ? "var(--text-muted)" : c.target_pct >= 0 ? "var(--accent-green)" : "var(--accent-red)" }}>{c.target_pct == null ? "—" : `${c.target_pct >= 0 ? "+" : ""}${c.target_pct.toFixed(0)}%`}</span></span>
              <span><span className="block text-text-muted">Cap</span><span className="num text-text-secondary">{fmtCap(c.market_cap)}</span></span>
            </span>
          </button>
        ))}
      </div>

      <div className="hidden md:flex md:flex-col">
        <div className="grid grid-cols-[64px_1fr_44px_52px_44px_52px_56px_56px] gap-2 border-b border-border px-2 py-2 text-xs font-medium text-text-muted">
          <span>Ticker</span>
          <span>Why / role</span>
          <span className="text-right">Play</span>
          <span className="text-right">Purity</span>
          <span className="text-right">PEG</span>
          <span className="text-right">30d</span>
          <span className="text-right">Target</span>
          <span className="text-right">Cap</span>
        </div>
        <div className="flex flex-col divide-y divide-border">
        {rows.map((c) => (
          <button
            key={c.ticker}
            type="button"
            onClick={() => onTicker(c.ticker)}
            className="data-row grid grid-cols-[64px_1fr_44px_52px_44px_52px_56px_56px] items-center gap-2 px-2 py-2.5 text-left text-sm"
            style={{ background: c.ticker === active ? "color-mix(in srgb, var(--accent-blue) 8%, transparent)" : undefined }}
          >
            <span className="ticker flex items-center gap-1">
              {c.ticker}
              {c.featured && <span className="h-1.5 w-1.5 rounded-full bg-accent-blue" title="Researched name" />}
            </span>
            <span className="min-w-0">
              <span className="block truncate text-sm text-text-secondary">{c.one_liner || c.name || ""}</span>
              <span className="text-xs" style={{ color: accumColor(c.accum_label) }}>
                {c.role || ""}{c.accum_label ? ` · ${c.accum_label.replace(/_/g, " ").toLowerCase()}` : ""}
              </span>
            </span>
            <span className="num text-right" style={{ color: c.play_score != null && c.play_score >= 60 ? "var(--accent-green)" : "var(--text-secondary)" }}>{c.play_score ?? "—"}</span>
            <span className="num text-right text-text-secondary">{typeof c.purity === "number" ? `${Math.round(c.purity * 100)}%` : "—"}</span>
            <span className="num text-right" style={{ color: typeof c.peg !== "number" ? "var(--text-muted)" : c.peg <= 1 ? "var(--accent-green)" : c.peg <= 1.5 ? "var(--text-secondary)" : "var(--accent-orange)" }}>{typeof c.peg === "number" ? c.peg.toFixed(1) : "—"}</span>
            <span className="num text-right" style={{ color: c.return_30d == null ? "var(--text-muted)" : c.return_30d >= 0 ? "var(--accent-green)" : "var(--accent-red)" }}>{c.return_30d == null ? "—" : `${c.return_30d >= 0 ? "+" : ""}${c.return_30d.toFixed(0)}%`}</span>
            <span className="num text-right" style={{ color: c.target_pct == null ? "var(--text-muted)" : c.target_pct >= 0 ? "var(--accent-green)" : "var(--accent-red)" }}>{c.target_pct == null ? "—" : `${c.target_pct >= 0 ? "+" : ""}${c.target_pct.toFixed(0)}%`}</span>
            <span className="num text-right text-text-muted">{fmtCap(c.market_cap)}</span>
          </button>
        ))}
        </div>
      </div>
      {companies.length > 24 && (
        <button
          type="button"
          onClick={() => setShowAll((v) => !v)}
          className="min-h-11 self-start px-2 py-2 text-left text-sm font-medium text-accent-blue transition-colors hover:text-text-primary md:min-h-0"
        >
          {showAll ? "Show fewer" : `Show all ${companies.length} names →`}
        </button>
      )}
    </div>
  );
}

/* ── supply-chain layer map ──────────────────────────────────────────── */

function PlainTickerChip({ b, onClick }: { b: PillarTickerBrief; onClick: (t: string) => void }) {
  const lit = b.play_score != null && b.play_score >= 60;
  return (
    <button
      type="button"
      onClick={() => onClick(b.ticker)}
      title={`${b.name || b.ticker}${b.play_score != null ? ` · play ${b.play_score}` : ""}${
        b.accum_label ? ` · ${b.accum_label.replace(/_/g, " ").toLowerCase()}` : ""
      }`}
      className="cursor-pointer"
    >
      <Chip>
        <span className="num font-semibold text-text-primary">{b.ticker}</span>
        {b.play_score != null && (
          <span className="num" style={{ color: lit ? "var(--accent-green)" : "var(--text-muted)" }}>{b.play_score}</span>
        )}
      </Chip>
    </button>
  );
}

function SupplyChainMap({ layers, onTicker }: { layers: SupplyChainLayer[]; onTicker: (t: string) => void }) {
  return (
    <div className="flex flex-col divide-y divide-border">
      {layers.map((L, i) => (
        <div key={L.layer} className="flex items-start gap-4 py-3">
          <div className="shrink-0 w-7 font-display text-2xl leading-none text-text-muted num text-right">
            {i + 1}
          </div>
          <div className="min-w-0 flex-1">
            <div className="flex items-baseline gap-x-2 gap-y-0.5 flex-wrap">
              <span className="text-base font-semibold text-text-primary">{L.layer}</span>
              {L.role && <span className="text-sm text-text-muted">{L.role}</span>}
            </div>
            {L.tickers.length > 0 && (
              <div className="flex flex-wrap gap-1.5 mt-2">
                {L.tickers.map((t) => (
                  <PlainTickerChip key={t.ticker} b={t} onClick={onTicker} />
                ))}
              </div>
            )}
          </div>
        </div>
      ))}
    </div>
  );
}

/* ── where to allocate ───────────────────────────────────────────────── */

function AllocationCallout({ text, accent }: { text: string; accent: string }) {
  return (
    <div
      className="rounded-[var(--radius-panel)] px-5 py-4"
      style={{ background: `color-mix(in srgb, ${accent} 8%, transparent)`, border: `1px solid color-mix(in srgb, ${accent} 28%, transparent)` }}
    >
      <h3 className="section-title mb-2">Where to allocate</h3>
      <p className="prose-read text-text-primary max-w-[68ch]">{text}</p>
    </div>
  );
}

/* ── pre-IPO / private ───────────────────────────────────────────────── */

function PreIpoSection({ items, onTicker }: { items: PreIpoCompany[]; onTicker: (t: string) => void }) {
  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-x-6 gap-y-1">
      {items.map((c) => (
        <div key={c.name} className="flex flex-col gap-2 border-t border-border py-4">
          <div className="flex items-baseline gap-2 flex-wrap">
            <span className="text-base font-semibold text-text-primary">{c.name}</span>
            {c.category && (
              <span className="text-xs text-text-muted">{c.category}</span>
            )}
            {c.stage && <span className="text-xs text-text-muted ml-auto">{c.stage}</span>}
          </div>
          <p className="text-sm leading-relaxed text-text-secondary">{c.what}</p>
          <div className="flex flex-wrap gap-x-3 gap-y-0.5 text-xs text-text-muted">
            {c.valuation && <span>Valuation <span className="num text-text-secondary">{c.valuation}</span></span>}
            {c.funding_raised && <span>Raised <span className="num text-text-secondary">{c.funding_raised}</span></span>}
            {c.relevance && <span className="text-text-secondary">{c.relevance}</span>}
          </div>
          {!!(c.public_proxies && c.public_proxies.length) && (
            <div className="flex items-center gap-1 flex-wrap pt-0.5">
              <span className="text-xs text-text-muted">Public proxy</span>
              {c.public_proxies.map((t) => (
                <button key={t} type="button" onClick={() => onTicker(t)} className="cursor-pointer">
                  <Chip tone="neutral">
                    <span className="ticker">{t}</span>
                  </Chip>
                </button>
              ))}
            </div>
          )}
        </div>
      ))}
    </div>
  );
}

/* ── pillar detail ───────────────────────────────────────────────────── */

function Section({ title, sub, children }: { title: string; sub?: ReactNode; children: ReactNode }) {
  return (
    <section className="flex flex-col gap-3">
      <div>
        <h3 className="section-title">{title}</h3>
        {sub && <p className="section-sub">{sub}</p>}
      </div>
      {children}
    </section>
  );
}

function HeroFigure({ value, label, color }: { value: ReactNode; label: string; color?: string }) {
  return (
    <div className="flex min-w-0 flex-col gap-1">
      <span className="text-3xl font-semibold num tracking-tight" style={{ color: color ?? "var(--text-primary)" }}>
        {value}
      </span>
      <span className="text-sm text-text-muted">{label}</span>
    </div>
  );
}

function PillarBody({
  d,
  onTicker,
  active,
  title,
}: {
  d: PillarDetail;
  onTicker: (t: string) => void;
  active: string;
  title?: string;
}) {
  const s = d.stats;
  return (
    <div className="flex flex-col gap-10">
      {/* hero: pillar name, tagline, three big numbers */}
      <div className="flex flex-col gap-5">
        <div className="flex flex-col gap-3">
          {title && (
            <h2 className="font-display flex items-center gap-3 text-3xl font-medium leading-tight tracking-tight text-text-primary">
              <span className="size-3 shrink-0 rounded-full" style={{ background: d.accent }} aria-hidden="true" />
              {title}
            </h2>
          )}
          {d.tagline && <p className="prose-read text-text-primary max-w-[64ch]">{d.tagline}</p>}
        </div>
        <div className="grid grid-cols-3 gap-6 border-t border-border pt-4 max-w-2xl">
          <HeroFigure value={s.n_companies} label="companies" />
          <HeroFigure value={s.n_critical} label="critical bottlenecks" color="var(--accent-red)" />
          <HeroFigure value={fmtCap(s.total_market_cap)} label="aggregate cap" />
        </div>
        {!d.has_research && (
          <p className="text-sm text-text-muted animate-pulse">Research generating…</p>
        )}
      </div>

      {d.demand_thesis && (
        <Section title="Demand">
          <p className="prose-read max-w-[68ch]">{d.demand_thesis}</p>
        </Section>
      )}

      {d.supply_chain.length > 0 && (
        <Section title="Supply chain" sub="Upstream to downstream">
          <SupplyChainMap layers={d.supply_chain} onTicker={onTicker} />
        </Section>
      )}

      <Section title="Bottleneck matrix" sub="Who owns the chokepoint, and who is gated by it">
        {d.bottlenecks.length === 0 ? (
          <div className="text-sm text-text-muted">
            {d.has_research ? "No bottlenecks mapped." : "Generating from the graphify chokepoints + intel…"}
          </div>
        ) : (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-x-8 gap-y-6">
            {d.bottlenecks.map((b) => (
              <BottleneckCard key={b.name} b={b} onTicker={onTicker} />
            ))}
          </div>
        )}
      </Section>

      <Section title="Company universe" sub="Value × purity — bubble size is market cap, click any name">
        <div className="card flex flex-col gap-4">
          <PurityScatter companies={d.companies} accent={d.accent} onTicker={onTicker} />
          <div className="border-t border-border pt-3">
            <CompanyTable companies={d.companies} onTicker={onTicker} active={active} />
          </div>
        </div>
      </Section>

      {d.allocation && <AllocationCallout text={d.allocation} accent={d.accent} />}

      {d.pre_ipo.length > 0 && (
        <Section title="Pre-IPO & private" sub="The names you can't buy yet">
          <PreIpoSection items={d.pre_ipo} onTicker={onTicker} />
        </Section>
      )}

      {d.emerging_tech.length > 0 && (
        <Section title="Emerging tech radar">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-x-8 gap-y-1">
            {d.emerging_tech.map((t) => (
              <div key={t.name} className="flex flex-col gap-2 border-t border-border py-4">
                <div className="flex items-baseline gap-2 flex-wrap">
                  <span className="text-base font-semibold text-text-primary">{t.name}</span>
                  {t.status && <span className="text-xs text-text-muted">{t.status}</span>}
                  {t.timeline && <span className="text-xs num text-text-muted ml-auto">{t.timeline}</span>}
                </div>
                <p className="text-sm leading-relaxed text-text-secondary">{t.detail}</p>
                {!!(t.players && t.players.length) && (
                  <div className="text-xs text-text-muted">Players: <span className="text-text-secondary">{t.players.join(", ")}</span></div>
                )}
                <div className="flex flex-wrap gap-x-3 gap-y-0.5 text-xs text-text-muted">
                  {!!(t.enables && t.enables.length) && (
                    <span>Enables: <span className="text-text-secondary">{t.enables.join(", ")}</span></span>
                  )}
                  {!!(t.disrupts && t.disrupts.length) && (
                    <span>Disrupts: <span className="text-text-secondary">{t.disrupts.join(", ")}</span></span>
                  )}
                </div>
              </div>
            ))}
          </div>
        </Section>
      )}

      {d.risks.length > 0 && (
        <Section title="Risks & substitution threats">
          <ol className="flex flex-col gap-3 max-w-[72ch]">
            {d.risks.map((r) => (
              <li key={r.risk} className="text-sm leading-relaxed">
                <span className="font-semibold text-text-primary">{r.risk}.</span>{" "}
                <span className="text-text-secondary">{r.detail}</span>
              </li>
            ))}
          </ol>
        </Section>
      )}
    </div>
  );
}

/* ── page ────────────────────────────────────────────────────────────── */

/* ── Weekly AI Report — lightweight markdown render of the wiki synthesis ──── */

function mdInline(text: string): ReactNode[] {
  // **bold** and *italic* only — the report uses no other inline syntax.
  return text.split(/(\*\*[^*]+\*\*|\*[^*]+\*)/g).map((p, i) => {
    if (p.startsWith("**") && p.endsWith("**"))
      return <strong key={i} className="text-text-primary font-semibold">{p.slice(2, -2)}</strong>;
    if (p.length > 2 && p.startsWith("*") && p.endsWith("*"))
      return <em key={i} className="italic">{p.slice(1, -1)}</em>;
    return <span key={i}>{p}</span>;
  });
}

function MarkdownLite({ md }: { md: string }) {
  const out: ReactNode[] = [];
  let bullets: ReactNode[] = [];
  const flush = (k: string) => {
    if (bullets.length) {
      out.push(
        <ul key={`ul-${k}`} className="list-disc pl-6 my-3 space-y-2 marker:text-text-muted">{bullets}</ul>,
      );
      bullets = [];
    }
  };
  md.split("\n").forEach((raw, i) => {
    const line = raw.trimEnd();
    if (line.startsWith("- ")) {
      bullets.push(
        <li key={i} className="prose-read">{mdInline(line.slice(2))}</li>,
      );
      return;
    }
    flush(String(i));
    if (line === "") return;
    if (line === "---") { out.push(<hr key={i} className="my-8 border-border" />); return; }
    if (line.startsWith("#### ")) { out.push(<h4 key={i} className="text-base font-semibold text-text-primary mt-6 mb-1">{mdInline(line.slice(5))}</h4>); return; }
    if (line.startsWith("### ")) { out.push(<h3 key={i} className="font-display text-xl font-medium text-text-primary mt-8 mb-2">{mdInline(line.slice(4))}</h3>); return; }
    if (line.startsWith("## ")) { out.push(<h2 key={i} className="font-display text-2xl font-medium tracking-tight text-text-primary mt-10 mb-3">{mdInline(line.slice(3))}</h2>); return; }
    if (line.startsWith("# ")) { out.push(<h1 key={i} className="font-display text-3xl font-medium tracking-tight text-text-primary mt-2 mb-4">{mdInline(line.slice(2))}</h1>); return; }
    out.push(<p key={i} className="prose-read my-3">{mdInline(line)}</p>);
  });
  flush("end");
  return <div className="max-w-[68ch]">{out}</div>;
}

function RetryCallout({ text, onRetry }: { text: string; onRetry: () => void }) {
  return (
    <div
      className="callout flex flex-wrap items-center gap-3"
      style={{ "--callout": "var(--accent-red)" } as CSSProperties}
    >
      <span>{text}</span>
      <button
        type="button"
        onClick={onRetry}
        className="inline-flex min-h-8 items-center gap-1 rounded-full border border-border px-3 py-1 text-xs font-medium text-text-secondary hover:text-text-primary"
      >
        <RefreshCw size={12} /> Retry
      </button>
    </div>
  );
}

function WeeklyReportSection() {
  const [pick, setPick] = useState<string | null>(null);
  const { data, isError, refetch } = useWeeklyReport(pick);
  const [open, setOpen] = useState(true);
  const archive = data?.available_reports ?? [];
  if (isError && !data) {
    return <RetryCallout text="Unable to load the weekly AI report." onRetry={() => void refetch()} />;
  }
  if (!data?.available || !data.markdown) return null;
  return (
    <section className="flex flex-col gap-4">
      <div className="flex flex-col gap-2">
        <span className="text-sm text-text-muted">This week's synthesis</span>
        <h2 className="headline">{data.title || "Weekly AI Report"}</h2>
        <div className="flex flex-wrap items-center gap-3 text-sm text-text-muted">
          {archive.length <= 1 && data.date && <span className="num">{data.date}</span>}
          {archive.length > 1 && (
            // Archive picker — every past report stays reachable; nothing is
            // overwritten, each run adds a new dated file. Default = newest.
            <select
              value={data.file ?? ""}
              onChange={(e) => setPick(e.target.value || null)}
              title="Pick a past weekly report"
              className="control-surface num min-h-11 shrink-0 rounded-full border px-3 py-1 text-xs text-text-secondary sm:min-h-8"
            >
              {archive.map((r, i) => (
                <option key={r.file} value={r.file}>
                  {r.date}{i === 0 ? " (latest)" : ""}
                </option>
              ))}
            </select>
          )}
          <button
            type="button"
            onClick={() => setOpen((o) => !o)}
            aria-expanded={open}
            className="inline-flex min-h-11 items-center gap-1 text-sm font-medium text-accent-blue hover:text-text-primary sm:min-h-8"
          >
            {open ? "Hide report" : "Read the report"}
            <ChevronRight
              size={15}
              style={{ transform: open ? "rotate(90deg)" : "none", transition: "transform 0.15s" }}
            />
          </button>
        </div>
      </div>
      {open && (
        <div className="max-h-[72vh] overflow-y-auto border-y border-border py-2 pr-2">
          <MarkdownLite md={data.markdown} />
        </div>
      )}
    </section>
  );
}

export function PillarsPage() {
  const overviewQuery = usePillars();
  const { data: overview } = overviewQuery;
  const setActiveTicker = useAppStore((s) => s.setActiveTicker);
  const activeTicker = useAppStore((s) => s.activeTicker);
  const [selected, setSelected] = useState<string>("ai_inference");
  const detailQuery = usePillar(selected);
  const { data: detail, isLoading } = detailQuery;

  const tabs = useMemo(() => overview?.pillars ?? [], [overview?.pillars]);
  const sel = useMemo(() => tabs.find((t) => t.key === selected), [tabs, selected]);

  return (
    <div className="desk-page">
      <header className="desk-header">
        <div className="desk-header__title">
          <h1>Pillars</h1>
          <p>Start from what the world physically needs, trace the supply chain, find where it gets stuck</p>
        </div>
      </header>
      <div className="xl:flex xl:items-start xl:gap-10">
      <div className="flex-1 min-w-0 flex flex-col gap-12">
      {overview?.intro && (
        <p className="prose-read max-w-[68ch]">{overview.intro}</p>
      )}

      {/* Weekly AI Report — the latest cross-layer synthesis (wiki-archived) */}
      <WeeklyReportSection />

      {/* cross-pillar chokepoints */}
      {!!overview?.cross_pillar_chokepoints?.length && (
        <section className="flex flex-col gap-3">
          <div>
            <h2 className="section-title">Chokepoints that span pillars</h2>
            <p className="section-sub">Constraints that bind more than one buildout at once</p>
          </div>
          {/* Each evidence row owns the same responsive column template. */}
          <div className="divide-y divide-border border-y border-border">
            {overview.cross_pillar_chokepoints.map((c) => (
              <div key={c.name} className="pillar-chokepoint-row grid items-baseline gap-x-4 gap-y-1 px-2 py-3">
                <span className="text-base font-semibold text-text-primary">{c.name}</span>
                <span className="text-xs text-text-muted">
                  {c.pillars.map((p) => p.replace(/_/g, " ")).join(" · ")}
                </span>
                <span className="text-sm text-text-secondary leading-relaxed">{c.why}</span>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* pillar tabs + detail */}
      <div className="flex flex-col gap-8">
      <div className="flex flex-col gap-3">
        <h2 className="section-title">Pillars</h2>
        {overviewQuery.isError && !overview && (
          <RetryCallout text="Unable to load structural pillars." onRetry={() => void overviewQuery.refetch()} />
        )}
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 2xl:grid-cols-3" role="group" aria-label="Choose a pillar">
          {tabs.map((t) => {
            const on = t.key === selected;
            return (
              <button
                key={t.key}
                type="button"
                aria-pressed={on}
                onClick={() => setSelected(t.key)}
                className="min-h-11 rounded-[var(--radius-panel)] border px-4 py-3 text-left transition-colors hover:bg-bg-card-hover"
                style={{
                  borderColor: on ? `color-mix(in srgb, ${t.accent} 60%, transparent)` : "var(--border)",
                  background: on ? `color-mix(in srgb, ${t.accent} 10%, var(--bg-card))` : "transparent",
                }}
              >
                <div className="flex items-center justify-between gap-2">
                  <span className="flex min-w-0 items-center gap-2 font-display text-lg font-medium text-text-primary">
                    <span className="size-2.5 shrink-0 rounded-full" style={{ background: t.accent }} />
                    <span className="truncate">{t.title}</span>
                  </span>
                  <ChevronRight size={15} className="text-text-muted shrink-0" />
                </div>
                <div className="flex items-center gap-2 mt-1 text-xs text-text-muted">
                  <span><span className="num text-text-secondary">{t.stats?.n_companies ?? 0}</span> companies</span>
                  <span>·</span>
                  <span><span className="num" style={{ color: "var(--accent-red)" }}>{t.stats?.n_critical ?? 0}</span> critical</span>
                  <span>·</span>
                  <span className="num text-text-secondary">{fmtCap(t.stats?.total_market_cap)}</span>
                </div>
                {!!t.top_bottlenecks?.length && (
                  <div className="mt-2 flex flex-wrap gap-x-3 gap-y-0.5 text-xs text-text-secondary">
                    {t.top_bottlenecks.map((b) => (
                      <span key={b.name} className="inline-flex items-center gap-1" title={`${b.severity} bottleneck`}>
                        <span
                          className="size-1.5 shrink-0 rounded-full"
                          style={{ background: (SEV[b.severity] || SEV.Moderate).color }}
                        />
                        {b.name}
                      </span>
                    ))}
                  </div>
                )}
              </button>
            );
          })}
        </div>
      </div>

      {/* detail */}
      <section className="border-t border-border pt-8">
        {isLoading ? (
          <div className="animate-pulse space-y-3">
            <div className="h-8 w-1/2 rounded bg-text-muted/20" />
            <div className="h-24 w-full rounded bg-text-muted/10" />
          </div>
        ) : detailQuery.isError || !detail ? (
          <RetryCallout text="Unable to load this pillar." onRetry={() => void detailQuery.refetch()} />
        ) : (
          <PillarBody d={detail} onTicker={setActiveTicker} active={activeTicker} title={sel?.title} />
        )}
      </section>
      </div>
      </div>

      {/* AI buildout stack — interactive supply-chain viz, sticky side rail */}
      <aside className="mt-12 xl:mt-0 xl:w-[380px] shrink-0 xl:sticky xl:top-4 xl:max-h-[calc(100vh-2rem)] xl:overflow-y-auto">
        <SupplyStackViz />
      </aside>
      </div>
    </div>
  );
}

export default PillarsPage;
