import { useMemo, useState, type ReactNode } from "react";
import { Layers, AlertTriangle, Cpu, Activity, ChevronRight, Network, Compass, Rocket, BookOpen, RefreshCw } from "lucide-react";
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
  High: { color: "var(--accent-orange, #e3a008)", bg: "color-mix(in srgb, var(--accent-orange) 14%, transparent)" },
  Moderate: { color: "var(--accent-yellow, #d4a72c)", bg: "color-mix(in srgb, var(--accent-yellow) 12%, transparent)" },
};

const SEV_TONE: Record<string, ChipTone> = {
  Critical: "red",
  High: "orange",
  Moderate: "yellow",
};

function accumColor(label?: string): string {
  const l = (label || "").toUpperCase();
  if (l.includes("STRONG_ACCUM") || l.includes("ESCALAT")) return "var(--accent-green)";
  if (l.includes("ACCUM")) return "var(--accent-green)";
  if (l.includes("DIST")) return "var(--accent-red)";
  if (l.includes("BATTLE")) return "var(--accent-orange, #e3a008)";
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
      <Chip tone={tone === "owns" ? "green" : "red"}>
        <span className="font-mono font-semibold">{b.ticker}</span>
        {b.play_score != null && <span className="opacity-60 num">{b.play_score}</span>}
      </Chip>
    </button>
  );
}

function SeverityBadge({ severity }: { severity: string }) {
  return (
    <Chip tone={SEV_TONE[severity] ?? "neutral"} className="uppercase tracking-[0.08em]">
      {severity}
    </Chip>
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
    <div className="card card-interactive flex flex-col gap-2">
      <div className="flex items-start justify-between gap-2">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-sm font-semibold text-text-primary">{b.name}</span>
          <SeverityBadge severity={b.severity} />
          {b.timeline && (
            <span className="text-xs num text-text-muted">{b.timeline}</span>
          )}
        </div>
      </div>
      {b.detail && <p className="text-xs leading-relaxed text-text-secondary">{b.detail}</p>}
      {b.graphify_concept && (
        <div className="text-xs font-mono text-accent-cyan opacity-80">
          graph: {b.graphify_concept}
        </div>
      )}
      <div className="flex flex-col gap-1.5 pt-1">
        {b.beneficiaries.length > 0 && (
          <div className="flex items-start gap-1.5 flex-wrap">
            <span className="text-xs font-semibold uppercase tracking-[0.08em] text-accent-green pt-0.5">
              owns
            </span>
            {b.beneficiaries.map((t) => (
              <TickerChip key={`o-${t.ticker}`} b={t} tone="owns" onClick={onTicker} />
            ))}
          </div>
        )}
        {b.gated.length > 0 && (
          <div className="flex items-start gap-1.5 flex-wrap">
            <span className="text-xs font-semibold uppercase tracking-[0.08em] text-accent-red pt-0.5">
              gated
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
      <div className="text-sm text-text-muted text-center px-1 py-6">
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
        <text x={PAD + 6} y={PAD + 12} className="fill-text-muted" style={{ fontSize: 9 }}>
          VALUE + PURE
        </text>
        <text x={W - PAD - 96} y={PAD + 12} className="fill-text-muted" style={{ fontSize: 9 }}>
          PREMIUM + PURE
        </text>
        <text x={PAD + 6} y={H - PAD - 6} className="fill-text-muted" style={{ fontSize: 9 }}>
          VALUE + DIVERSIFIED
        </text>
        {/* axis labels */}
        <text x={W / 2} y={H - 8} textAnchor="middle" className="fill-text-muted" style={{ fontSize: 10 }}>
          PEG  ·  cheaper →← richer
        </text>
        <text
          x={12}
          y={H / 2}
          textAnchor="middle"
          transform={`rotate(-90 12 ${H / 2})`}
          className="fill-text-muted"
          style={{ fontSize: 10 }}
        >
          PURITY % (revenue in thesis)
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
              <text x={cx} y={cy + 3} textAnchor="middle" className="fill-text-primary font-mono" style={{ fontSize: 9 }}>
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
      <div className="grid grid-cols-[64px_1fr_44px_52px_44px_52px_56px_56px] gap-2 px-2 py-1.5 text-xs text-text-muted uppercase tracking-[0.08em]">
        <span>ticker</span>
        <span>why / role</span>
        <span className="text-right">play</span>
        <span className="text-right">purity</span>
        <span className="text-right">peg</span>
        <span className="text-right">30d</span>
        <span className="text-right">target</span>
        <span className="text-right">cap</span>
      </div>
      {rows.map((c) => (
        <button
          key={c.ticker}
          type="button"
          onClick={() => onTicker(c.ticker)}
          className="grid grid-cols-[64px_1fr_44px_52px_44px_52px_56px_56px] gap-2 px-2 py-1.5 text-xs items-center text-left rounded-[var(--radius-control)] hover:bg-bg-card-hover transition-colors"
          style={{ background: c.ticker === active ? "color-mix(in srgb, var(--accent-blue) 8%, transparent)" : undefined }}
        >
          <span className="font-mono font-semibold text-text-primary flex items-center gap-1">
            {c.ticker}
            {c.featured && <span className="w-1.5 h-1.5 rounded-full bg-accent-cyan" title="researched name" />}
          </span>
          <span className="min-w-0">
            <span className="block truncate text-text-secondary">{c.one_liner || c.name || ""}</span>
            <span className="text-xs" style={{ color: accumColor(c.accum_label) }}>
              {c.role || ""}
              {c.accum_label ? ` · ${c.accum_label.replace(/_/g, " ").toLowerCase()}` : ""}
            </span>
          </span>
          <span className="text-right num" style={{ color: c.play_score != null && c.play_score >= 60 ? "var(--accent-green)" : "var(--text-secondary)" }}>
            {c.play_score ?? "—"}
          </span>
          <span className="text-right num text-text-secondary">
            {typeof c.purity === "number" ? `${Math.round(c.purity * 100)}%` : "—"}
          </span>
          <span
            className="text-right num"
            style={{ color: typeof c.peg !== "number" ? "var(--text-muted)" : c.peg <= 1 ? "var(--accent-green)" : c.peg <= 1.5 ? "var(--text-secondary)" : "var(--accent-orange)" }}
            title="PEG (lower = cheaper vs growth)"
          >
            {typeof c.peg === "number" ? c.peg.toFixed(1) : "—"}
          </span>
          <span
            className="text-right num"
            style={{ color: c.return_30d == null ? "var(--text-muted)" : c.return_30d >= 0 ? "var(--accent-green)" : "var(--accent-red)" }}
          >
            {c.return_30d == null ? "—" : `${c.return_30d >= 0 ? "+" : ""}${c.return_30d.toFixed(0)}%`}
          </span>
          <span
            className="text-right num"
            style={{ color: c.target_pct == null ? "var(--text-muted)" : c.target_pct >= 0 ? "var(--accent-green)" : "var(--accent-red)" }}
          >
            {c.target_pct == null ? "—" : `${c.target_pct >= 0 ? "+" : ""}${c.target_pct.toFixed(0)}%`}
          </span>
          <span className="text-right num text-text-muted">{fmtCap(c.market_cap)}</span>
        </button>
      ))}
      {companies.length > 24 && (
        <button
          type="button"
          onClick={() => setShowAll((v) => !v)}
          className="text-xs text-text-muted hover:text-text-secondary transition-colors py-1.5 text-left"
        >
          {showAll ? "show fewer" : `show all ${companies.length} names →`}
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
      <Chip tone={lit ? "green" : "neutral"}>
        <span className="font-mono font-semibold">{b.ticker}</span>
        {b.play_score != null && <span className="opacity-60 num">{b.play_score}</span>}
      </Chip>
    </button>
  );
}

function SupplyChainMap({ layers, onTicker }: { layers: SupplyChainLayer[]; onTicker: (t: string) => void }) {
  return (
    <div className="flex flex-col gap-1.5">
      {layers.map((L, i) => (
        <div key={L.layer} className="card flex items-start gap-3 py-2">
          <div
            className="shrink-0 w-6 h-6 rounded-full flex items-center justify-center text-[11px] font-mono font-bold"
            style={{ background: "color-mix(in srgb, var(--accent-blue) 14%, transparent)", color: "var(--accent-blue)" }}
          >
            {i + 1}
          </div>
          <div className="min-w-0 flex-1">
            <div className="flex items-baseline gap-2 flex-wrap">
              <span className="text-sm font-semibold text-text-primary">{L.layer}</span>
              {L.role && <span className="text-[11px] text-text-muted">{L.role}</span>}
            </div>
            {L.tickers.length > 0 && (
              <div className="flex flex-wrap gap-1 mt-1.5">
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
    <div className="card border-l-2" style={{ borderLeftColor: accent }}>
      <div className="text-xs font-semibold uppercase tracking-wider text-text-muted mb-1.5 flex items-center gap-1.5">
        <Compass size={13} /> Where to allocate
      </div>
      <p className="text-sm leading-relaxed text-text-secondary">{text}</p>
    </div>
  );
}

/* ── pre-IPO / private ───────────────────────────────────────────────── */

function PreIpoSection({ items, onTicker }: { items: PreIpoCompany[]; onTicker: (t: string) => void }) {
  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-2">
      {items.map((c) => (
        <div key={c.name} className="card flex flex-col gap-1.5">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-sm font-semibold text-text-primary">{c.name}</span>
            {c.category && (
              <span className="text-[10px] font-mono px-1 rounded bg-bg-card-hover text-text-muted">{c.category}</span>
            )}
            {c.stage && <span className="text-[10px] font-mono text-accent-purple ml-auto">{c.stage}</span>}
          </div>
          <p className="text-xs leading-relaxed text-text-secondary">{c.what}</p>
          <div className="flex flex-wrap gap-x-3 gap-y-0.5 text-[10px] font-mono text-text-muted">
            {c.valuation && <span>val {c.valuation}</span>}
            {c.funding_raised && <span>raised {c.funding_raised}</span>}
            {c.relevance && <span className="text-accent-cyan">{c.relevance}</span>}
          </div>
          {!!(c.public_proxies && c.public_proxies.length) && (
            <div className="flex items-center gap-1 flex-wrap pt-0.5">
              <span className="text-[10px] font-mono text-text-muted">proxy:</span>
              {c.public_proxies.map((t) => (
                <button key={t} type="button" onClick={() => onTicker(t)} className="cursor-pointer">
                  <Chip tone="neutral">
                    <span className="font-mono font-semibold">{t}</span>
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

function PillarBody({ d, onTicker, active }: { d: PillarDetail; onTicker: (t: string) => void; active: string }) {
  const s = d.stats;
  return (
    <div className="flex flex-col gap-5">
      {/* stat strip */}
      <div className="flex items-center gap-4 flex-wrap text-xs">
        <span className="text-text-secondary">{d.tagline}</span>
      </div>
      <div className="flex items-center gap-3 flex-wrap text-xs font-mono">
        <span className="text-text-muted">{s.n_companies} companies</span>
        <span className="text-text-muted">·</span>
        <span style={{ color: "var(--accent-red)" }}>{s.n_critical} critical bottlenecks</span>
        <span className="text-text-muted">·</span>
        <span className="text-text-muted">{fmtCap(s.total_market_cap)} aggregate cap</span>
        {!d.has_research && (
          <span className="text-accent-cyan animate-pulse">· research generating…</span>
        )}
      </div>

      {/* demand thesis */}
      {d.demand_thesis && (
        <section>
          <h3 className="text-xs font-semibold uppercase tracking-wider text-text-muted mb-1.5 flex items-center gap-1.5">
            <Activity size={13} /> Demand
          </h3>
          <p className="text-sm leading-relaxed text-text-secondary">{d.demand_thesis}</p>
        </section>
      )}

      {/* supply-chain map */}
      {d.supply_chain.length > 0 && (
        <section>
          <h3 className="text-xs font-semibold uppercase tracking-wider text-text-muted mb-2 flex items-center gap-1.5">
            <Network size={13} /> Supply chain — upstream → downstream
          </h3>
          <SupplyChainMap layers={d.supply_chain} onTicker={onTicker} />
        </section>
      )}

      {/* bottleneck matrix */}
      <section>
        <h3 className="text-xs font-semibold uppercase tracking-wider text-text-muted mb-2 flex items-center gap-1.5">
          <AlertTriangle size={13} /> Bottleneck matrix
        </h3>
        {d.bottlenecks.length === 0 ? (
          <div className="text-xs text-text-muted italic">
            {d.has_research ? "No bottlenecks mapped." : "Generating from the graphify chokepoints + intel…"}
          </div>
        ) : (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-2">
            {d.bottlenecks.map((b) => (
              <BottleneckCard key={b.name} b={b} onTicker={onTicker} />
            ))}
          </div>
        )}
      </section>

      {/* scatter + table */}
      <section>
        <h3 className="text-xs font-semibold uppercase tracking-wider text-text-muted mb-2 flex items-center gap-1.5">
          <Layers size={13} /> Company universe — value × purity
        </h3>
        <div className="card mb-3">
          <PurityScatter companies={d.companies} accent={d.accent} onTicker={onTicker} />
        </div>
        <CompanyTable companies={d.companies} onTicker={onTicker} active={active} />
      </section>

      {/* pre-IPO / private */}
      {d.pre_ipo.length > 0 && (
        <section>
          <h3 className="text-xs font-semibold uppercase tracking-wider text-text-muted mb-2 flex items-center gap-1.5">
            <Rocket size={13} /> Pre-IPO &amp; private — the names you can't buy yet
          </h3>
          <PreIpoSection items={d.pre_ipo} onTicker={onTicker} />
        </section>
      )}

      {/* where to allocate */}
      {d.allocation && (
        <section>
          <AllocationCallout text={d.allocation} accent={d.accent} />
        </section>
      )}

      {/* emerging tech */}
      {d.emerging_tech.length > 0 && (
        <section>
          <h3 className="text-xs font-semibold uppercase tracking-wider text-text-muted mb-2 flex items-center gap-1.5">
            <Cpu size={13} /> Emerging tech radar
          </h3>
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-2">
            {d.emerging_tech.map((t) => (
              <div key={t.name} className="card flex flex-col gap-1.5">
                <div className="flex items-center gap-2">
                  <span className="text-sm font-semibold text-text-primary">{t.name}</span>
                  {t.status && <span className="text-[10px] font-mono text-text-muted">{t.status}</span>}
                  {t.timeline && <span className="text-[10px] font-mono text-accent-cyan ml-auto">{t.timeline}</span>}
                </div>
                <p className="text-xs leading-relaxed text-text-secondary">{t.detail}</p>
                {!!(t.players && t.players.length) && (
                  <div className="text-[10px] font-mono text-text-muted">players: {t.players.join(", ")}</div>
                )}
                <div className="flex gap-3 text-[10px] font-mono">
                  {!!(t.enables && t.enables.length) && (
                    <span style={{ color: "var(--accent-green)" }}>enables: {t.enables.join(", ")}</span>
                  )}
                  {!!(t.disrupts && t.disrupts.length) && (
                    <span style={{ color: "var(--accent-red)" }}>disrupts: {t.disrupts.join(", ")}</span>
                  )}
                </div>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* risks */}
      {d.risks.length > 0 && (
        <section>
          <h3 className="text-xs font-semibold uppercase tracking-wider text-text-muted mb-2">Risks & substitution threats</h3>
          <div className="flex flex-col gap-1.5">
            {d.risks.map((r) => (
              <div key={r.risk} className="text-xs leading-relaxed">
                <span className="font-semibold text-text-primary">{r.risk}.</span>{" "}
                <span className="text-text-secondary">{r.detail}</span>
              </div>
            ))}
          </div>
        </section>
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
        <ul key={`ul-${k}`} className="list-disc pl-5 my-1.5 space-y-1">{bullets}</ul>,
      );
      bullets = [];
    }
  };
  md.split("\n").forEach((raw, i) => {
    const line = raw.trimEnd();
    if (line.startsWith("- ")) {
      bullets.push(
        <li key={i} className="text-xs leading-relaxed text-text-secondary">{mdInline(line.slice(2))}</li>,
      );
      return;
    }
    flush(String(i));
    if (line === "") return;
    if (line === "---") { out.push(<hr key={i} className="my-3 border-border" />); return; }
    if (line.startsWith("#### ")) { out.push(<h4 key={i} className="text-sm font-semibold text-text-primary mt-3 mb-1">{mdInline(line.slice(5))}</h4>); return; }
    if (line.startsWith("### ")) { out.push(<h3 key={i} className="text-sm font-bold text-accent-blue mt-3 mb-1">{mdInline(line.slice(4))}</h3>); return; }
    if (line.startsWith("## ")) { out.push(<h2 key={i} className="text-base font-bold text-text-primary mt-4 mb-1.5">{mdInline(line.slice(3))}</h2>); return; }
    if (line.startsWith("# ")) { out.push(<h1 key={i} className="text-lg font-bold text-text-primary mt-2 mb-2">{mdInline(line.slice(2))}</h1>); return; }
    out.push(<p key={i} className="text-xs leading-relaxed text-text-secondary my-1.5">{mdInline(line)}</p>);
  });
  flush("end");
  return <div>{out}</div>;
}

function WeeklyReportSection() {
  const [pick, setPick] = useState<string | null>(null);
  const { data, isError, refetch } = useWeeklyReport(pick);
  const [open, setOpen] = useState(true);
  const archive = data?.available_reports ?? [];
  if (isError && !data) {
    return (
      <div className="card flex items-center gap-2 text-xs text-accent-red">
        <AlertTriangle size={13} />
        <span>Unable to load the weekly AI report.</span>
        <button
          type="button"
          onClick={() => void refetch()}
          className="inline-flex items-center gap-1 rounded border border-border px-2 py-1 text-text-secondary hover:text-text-primary"
        >
          <RefreshCw size={11} /> Retry
        </button>
      </div>
    );
  }
  if (!data?.available || !data.markdown) return null;
  return (
    <div className="card border-l-2" style={{ borderLeftColor: "var(--accent-purple)" }}>
      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={() => setOpen((o) => !o)}
          className="flex items-center gap-2 flex-1 min-w-0 text-left"
        >
          <BookOpen size={16} className="text-accent-purple shrink-0" />
          <span className="text-sm font-semibold text-text-primary truncate">
            {data.title || "Weekly AI Report"}
          </span>
          {archive.length <= 1 && data.date && (
            <span className="text-[10px] font-mono text-text-muted">{data.date}</span>
          )}
        </button>
        {archive.length > 1 && (
          // Archive picker — every past report stays reachable; nothing is
          // overwritten, each run adds a new dated file. Default = newest.
          <select
            value={data.file ?? ""}
            onChange={(e) => setPick(e.target.value || null)}
            title="Pick a past weekly report"
            className="num text-xs bg-bg-card border border-border rounded px-1.5 py-0.5 text-text-secondary shrink-0"
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
          className="flex items-center gap-1 shrink-0"
          aria-label={open ? "hide report" : "show report"}
        >
          <span className="text-[10px] font-mono text-text-muted">{open ? "hide" : "show"}</span>
          <ChevronRight
            size={15}
            className="text-text-muted"
            style={{ transform: open ? "rotate(90deg)" : "none", transition: "transform 0.15s" }}
          />
        </button>
      </div>
      {open && (
        <div className="mt-2 pt-2 border-t border-border max-h-[72vh] overflow-y-auto pr-1">
          <MarkdownLite md={data.markdown} />
        </div>
      )}
    </div>
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
    <div className="max-w-[110rem] mx-auto px-4 py-4 xl:flex xl:items-start xl:gap-4">
      <div className="flex-1 min-w-0 space-y-4">
      {/* header */}
      <div>
        <h1 className="text-lg font-semibold text-text-primary flex items-center gap-2">
          <Layers size={18} className="text-accent-blue" /> Structural Pillars
        </h1>
        <p className="text-xs text-text-muted mt-0.5">
          Start from what the world physically needs, trace the supply chain, find where it gets stuck.
        </p>
        {overview?.intro && (
          <p className="text-sm text-text-secondary mt-2 leading-relaxed max-w-4xl">{overview.intro}</p>
        )}
      </div>

      {/* Weekly AI Report — the latest cross-layer synthesis (wiki-archived) */}
      <WeeklyReportSection />

      {/* cross-pillar chokepoints */}
      {!!overview?.cross_pillar_chokepoints?.length && (
        <div className="card">
          <div className="text-[10px] font-mono uppercase tracking-wider text-text-muted mb-2">
            Chokepoints that span pillars
          </div>
          {/* Aligned 3-column grid — name | pillar chips | why. The old
              per-row flex made every row's columns start at different x
              positions, which read as a broken table. */}
          <div className="grid gap-x-3 gap-y-2 text-xs items-start"
               style={{ gridTemplateColumns: "minmax(120px, 190px) minmax(110px, 200px) 1fr" }}>
            {overview.cross_pillar_chokepoints.map((c) => (
              <div key={c.name} className="contents">
                <span className="font-semibold text-text-primary">{c.name}</span>
                <span className="flex gap-1 flex-wrap">
                  {c.pillars.map((p) => (
                    <span key={p} className="text-[9px] font-mono px-1 rounded bg-bg-card-hover text-text-muted whitespace-nowrap">
                      {p.replace(/_/g, " ")}
                    </span>
                  ))}
                </span>
                <span className="text-text-secondary leading-relaxed">{c.why}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* pillar tabs */}
      {overviewQuery.isError && !overview && (
        <div className="card flex items-center gap-2 text-sm text-accent-red">
          <AlertTriangle size={14} />
          <span>Unable to load structural pillars.</span>
          <button
            type="button"
            onClick={() => void overviewQuery.refetch()}
            className="inline-flex items-center gap-1 rounded border border-border px-2.5 py-1 text-xs text-text-secondary hover:text-text-primary"
          >
            <RefreshCw size={11} /> Retry
          </button>
        </div>
      )}
      <div className="flex items-stretch gap-2 flex-wrap">
        {tabs.map((t) => {
          const on = t.key === selected;
          return (
            <button
              key={t.key}
              onClick={() => setSelected(t.key)}
              className="flex-1 min-w-[220px] text-left rounded-lg border px-3 py-2 transition-colors"
              style={{
                borderColor: on ? t.accent : "var(--border)",
                background: on ? `${t.accent}14` : "var(--bg-card)",
              }}
            >
              <div className="flex items-center justify-between">
                <span className="text-sm font-semibold" style={{ color: on ? t.accent : "var(--text-primary)" }}>
                  {t.title}
                </span>
                <ChevronRight size={14} className="text-text-muted" />
              </div>
              <div className="flex items-center gap-2 mt-1 text-[10px] font-mono text-text-muted">
                <span>{t.stats?.n_companies ?? 0} co</span>
                <span style={{ color: "var(--accent-red)" }}>{t.stats?.n_critical ?? 0} critical</span>
                <span>{fmtCap(t.stats?.total_market_cap)}</span>
              </div>
              <div className="flex gap-1 mt-1.5 flex-wrap">
                {(t.top_bottlenecks || []).map((b) => (
                  <span
                    key={b.name}
                    className="text-[9px] font-mono px-1 py-0.5 rounded"
                    style={{ background: (SEV[b.severity] || SEV.Moderate).bg, color: (SEV[b.severity] || SEV.Moderate).color }}
                  >
                    {b.name}
                  </span>
                ))}
              </div>
            </button>
          );
        })}
      </div>

      {/* detail */}
      <div className="card" style={{ borderTop: `2px solid ${sel?.accent || "var(--accent-blue)"}` }}>
        {isLoading ? (
          <div className="animate-pulse space-y-2">
            <div className="h-4 w-1/2 rounded bg-text-muted/20" />
            <div className="h-24 w-full rounded bg-text-muted/10" />
          </div>
        ) : detailQuery.isError || !detail ? (
          <div className="flex items-center justify-center gap-2 py-8 text-sm text-accent-red">
            <AlertTriangle size={14} />
            <span>Unable to load this pillar.</span>
            <button
              type="button"
              onClick={() => void detailQuery.refetch()}
              className="inline-flex items-center gap-1 rounded border border-border px-2.5 py-1 text-xs text-text-secondary hover:text-text-primary"
            >
              <RefreshCw size={11} /> Retry
            </button>
          </div>
        ) : (
          <PillarBody d={detail} onTicker={setActiveTicker} active={activeTicker} />
        )}
      </div>
      </div>

      {/* AI buildout stack — interactive supply-chain viz, sticky side rail */}
      <aside className="mt-4 xl:mt-0 xl:w-[380px] shrink-0 xl:sticky xl:top-4 xl:max-h-[calc(100vh-2rem)] xl:overflow-y-auto">
        <SupplyStackViz />
      </aside>
    </div>
  );
}

export default PillarsPage;
