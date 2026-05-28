import { useMemo } from "react";
import { useIntelGraphContext } from "../../api/intelGraph";
import { useAppStore } from "../../store/useAppStore";
import type {
  GraphEdgeBrief,
  GraphThemePeer,
  IntelBiasDirection,
} from "../../lib/types";
import {
  Network,
  GitBranch,
  GitMerge,
  Swords,
  Users,
  Lightbulb,
  Anchor,
} from "lucide-react";

interface Props {
  ticker: string;
}

/** Edge color tokens. Match the legend at the bottom of the card so the SVG
 *  spokes and the chip headers stay visually consistent. */
const EDGE_COLOR = {
  competitor: "var(--accent-red)",
  depends_on: "var(--accent-blue)",
  powers: "var(--accent-purple, #c084fc)",
  peer: "var(--accent-cyan, #22d3ee)",
  fact: "var(--accent-orange, #e37f2e)",
  tied: "var(--accent-yellow, #eab308)",
} as const;

/** Bias dot color — matches the existing IntelBiasDirection styling so the
 *  inline dots on competitor / peer chips read the same way as the bias chip
 *  in the panel header. */
function biasDotColor(bias: IntelBiasDirection | null | undefined): string {
  if (bias === "BULLISH") return "var(--accent-green)";
  if (bias === "BEARISH") return "var(--accent-red)";
  if (bias === "NEUTRAL") return "var(--text-muted)";
  return "transparent";
}

/** Trim duplicate neighbor entries — the graph often emits two edges to the
 *  same node from different LLM extraction passes (e.g. AMD shows up twice
 *  in NVDA's contradicts list). Keep the first occurrence per `name`. */
function dedupeByName(edges: GraphEdgeBrief[] | undefined): GraphEdgeBrief[] {
  if (!edges) return [];
  const seen = new Set<string>();
  const out: GraphEdgeBrief[] = [];
  for (const e of edges) {
    if (seen.has(e.name)) continue;
    seen.add(e.name);
    out.push(e);
  }
  return out;
}

/** Tiny static SVG: center node + spokes to up to N neighbors, colored by
 *  edge group. Decorative — clicking the chips below is the real navigation
 *  affordance, but the diagram conveys edge density at a glance. */
function MiniGraphSvg({
  ticker,
  competitors,
  dependsOn,
  powers,
}: {
  ticker: string;
  competitors: GraphEdgeBrief[];
  dependsOn: GraphEdgeBrief[];
  powers: GraphEdgeBrief[];
}) {
  const W = 460;
  const H = 130;
  const CX = W / 2;
  const CY = H / 2;
  const groups: Array<{ items: GraphEdgeBrief[]; color: string; angleStart: number; angleSpan: number }> = [
    { items: competitors.slice(0, 3), color: EDGE_COLOR.competitor, angleStart: 150, angleSpan: 60 },
    { items: dependsOn.slice(0, 3),  color: EDGE_COLOR.depends_on, angleStart: 330, angleSpan: 60 },
    { items: powers.slice(0, 3),     color: EDGE_COLOR.powers,     angleStart: 30,  angleSpan: 60 },
  ];

  const RADIUS = 52;
  const spokes: Array<{ x: number; y: number; color: string; label: string }> = [];
  for (const g of groups) {
    const n = g.items.length;
    if (n === 0) continue;
    for (let i = 0; i < n; i++) {
      const t = n === 1 ? 0.5 : i / (n - 1);
      const angleDeg = g.angleStart + g.angleSpan * t;
      const rad = (angleDeg * Math.PI) / 180;
      spokes.push({
        x: CX + RADIUS * Math.cos(rad),
        y: CY + RADIUS * Math.sin(rad),
        color: g.color,
        label: g.items[i].name,
      });
    }
  }

  return (
    <svg
      viewBox={`0 0 ${W} ${H}`}
      className="w-full h-[130px]"
      style={{ background: "rgba(255,255,255,0.02)", borderRadius: 6 }}
    >
      {spokes.map((s, i) => (
        <line
          key={`line-${i}`}
          x1={CX}
          y1={CY}
          x2={s.x}
          y2={s.y}
          stroke={s.color}
          strokeWidth={1}
          opacity={0.45}
        />
      ))}
      {spokes.map((s, i) => (
        <g key={`node-${i}`}>
          <circle cx={s.x} cy={s.y} r={4} fill={s.color} opacity={0.85} />
          <text
            x={s.x}
            y={s.y - 8}
            textAnchor="middle"
            fontSize={9}
            fontFamily="ui-monospace, monospace"
            fill="var(--text-secondary)"
          >
            {s.label.length > 5 ? s.label.slice(0, 5) : s.label}
          </text>
        </g>
      ))}
      <circle cx={CX} cy={CY} r={11} fill="var(--accent-green)" />
      <text
        x={CX}
        y={CY + 3}
        textAnchor="middle"
        fontSize={10}
        fontFamily="ui-monospace, monospace"
        fontWeight={700}
        fill="var(--bg-card, #0d1117)"
      >
        {ticker.length > 4 ? ticker.slice(0, 4) : ticker}
      </text>
    </svg>
  );
}

/** Reusable colored chip with an optional bias dot. Ticker chips are
 *  clickable to swap activeTicker; other types render disabled. */
function NeighborChip({
  name,
  edgeDesc,
  bias,
  color,
  isTicker,
  onClick,
}: {
  name: string;
  edgeDesc?: string;
  bias?: IntelBiasDirection | null;
  color: string;
  isTicker: boolean;
  onClick: (ticker: string) => void;
}) {
  return (
    <button
      type="button"
      onClick={() => isTicker && onClick(name)}
      disabled={!isTicker}
      title={edgeDesc}
      className={`inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs font-mono transition-colors ${
        isTicker ? "hover:bg-bg-card-hover cursor-pointer" : "cursor-default opacity-70"
      }`}
      style={{
        background: `${color}14`,
        color,
        border: `1px solid ${color}33`,
      }}
    >
      {bias && (
        <span
          className="inline-block w-1.5 h-1.5 rounded-full"
          style={{ background: biasDotColor(bias) }}
          aria-label={`bias ${bias}`}
        />
      )}
      <span>{name}</span>
    </button>
  );
}

/** Chip row — clickable tickers swap the global activeTicker. */
function ChipRow({
  label,
  icon,
  color,
  items,
  onClick,
}: {
  label: string;
  icon: React.ReactNode;
  color: string;
  items: GraphEdgeBrief[];
  onClick: (ticker: string) => void;
}) {
  return (
    <div className="flex items-start gap-2 py-1">
      <div
        className="flex items-center gap-1 min-w-[100px] pt-0.5 text-[10px] font-mono uppercase tracking-wider"
        style={{ color }}
      >
        {icon}
        {label}
      </div>
      <div className="flex flex-wrap gap-1.5">
        {items.length === 0 && (
          <span className="text-xs text-text-muted italic">none</span>
        )}
        {items.map((e) => (
          <NeighborChip
            key={e.id}
            name={e.name}
            edgeDesc={e.edge_desc || e.summary}
            bias={e.bias}
            color={color}
            isTicker={e.file.startsWith("tickers/")}
            onClick={onClick}
          />
        ))}
      </div>
    </div>
  );
}

/** Theme peers — same-theme tickers (excluding the active one) with their
 *  bias dot inline. Best "what else moves with this" view in one row;
 *  divergent biases inside an otherwise-aligned theme are the standout. */
function ThemePeersRow({
  peers,
  onClick,
}: {
  peers: GraphThemePeer[];
  onClick: (ticker: string) => void;
}) {
  if (peers.length === 0) return null;
  return (
    <div className="flex items-start gap-2 py-1">
      <div
        className="flex items-center gap-1 min-w-[100px] pt-0.5 text-[10px] font-mono uppercase tracking-wider"
        style={{ color: EDGE_COLOR.peer }}
      >
        <Users size={11} />
        Theme peers
      </div>
      <div className="flex flex-wrap gap-1.5">
        {peers.map((p) => (
          <NeighborChip
            key={p.ticker}
            name={p.ticker}
            edgeDesc={p.summary}
            bias={p.bias}
            color={EDGE_COLOR.peer}
            isTicker
            onClick={onClick}
          />
        ))}
      </div>
    </div>
  );
}

/** Key facts row — LLM-extracted claim statements (Q1 results, market share
 *  numbers, regulatory wins). Surfaced as a small bullet list rather than
 *  chips because they're sentences, not entities. */
function KeyFactsRow({ claims }: { claims: GraphEdgeBrief[] }) {
  if (claims.length === 0) return null;
  return (
    <div className="flex items-start gap-2 py-1">
      <div
        className="flex items-center gap-1 min-w-[100px] pt-0.5 text-[10px] font-mono uppercase tracking-wider"
        style={{ color: EDGE_COLOR.fact }}
      >
        <Lightbulb size={11} />
        Key facts
      </div>
      <div className="flex flex-col gap-1 flex-1 min-w-0">
        {claims.slice(0, 3).map((c) => (
          <div
            key={c.id}
            className="text-xs leading-snug text-text-secondary"
            title={c.summary}
          >
            <span
              className="inline-block w-1 h-1 rounded-full mr-1.5 align-middle"
              style={{ background: EDGE_COLOR.fact }}
            />
            <span className="font-mono font-semibold text-text-primary">
              {c.name}
            </span>
            {c.summary && (
              <span className="ml-1.5 text-text-muted">
                — {c.summary.slice(0, 160)}
                {c.summary.length > 160 ? "…" : ""}
              </span>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

export function GraphContextCard({ ticker }: Props) {
  const setActiveTicker = useAppStore((s) => s.setActiveTicker);
  const { data, isLoading } = useIntelGraphContext(ticker, 8);

  const competitors = useMemo(() => dedupeByName(data?.competitors), [data]);
  const dependsOn   = useMemo(() => dedupeByName(data?.builds_on),   [data]);
  const powers      = useMemo(() => dedupeByName(data?.enabled_by),  [data]);
  const tiedTo      = useMemo(() => dedupeByName(data?.exemplifies), [data]);
  const peers       = data?.theme_peers ?? [];
  const claims      = data?.claims ?? [];
  const totalEdges  = competitors.length + dependsOn.length + powers.length + tiedTo.length + peers.length + claims.length;

  if (!ticker) return null;
  if (isLoading) {
    return (
      <div className="card animate-pulse">
        <div className="h-4 w-32 rounded bg-text-muted/20 mb-3" />
        <div className="h-[130px] rounded bg-text-muted/10 mb-3" />
        <div className="h-3 w-full rounded bg-text-muted/10" />
      </div>
    );
  }
  if (!data?.available || totalEdges === 0) return null;

  return (
    <div className="card flex flex-col gap-2">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2 text-xs font-mono uppercase tracking-wider text-text-secondary">
          <Network size={14} className="text-accent-purple" />
          Graph context
        </div>
        <div className="text-[10px] font-mono text-text-muted">
          {totalEdges} signals
          {data.sector && (
            <span className="ml-2">
              · {data.sector}
              {data.theme ? ` · ${data.theme}` : ""}
            </span>
          )}
        </div>
      </div>

      <MiniGraphSvg
        ticker={ticker}
        competitors={competitors}
        dependsOn={dependsOn}
        powers={powers}
      />

      <div className="flex flex-col gap-0.5">
        <ChipRow
          label="Competitors"
          icon={<Swords size={11} />}
          color={EDGE_COLOR.competitor}
          items={competitors}
          onClick={setActiveTicker}
        />
        <ChipRow
          label="Depends on"
          icon={<GitMerge size={11} />}
          color={EDGE_COLOR.depends_on}
          items={dependsOn}
          onClick={setActiveTicker}
        />
        <ChipRow
          label="Powers"
          icon={<GitBranch size={11} />}
          color={EDGE_COLOR.powers}
          items={powers}
          onClick={setActiveTicker}
        />
        <ThemePeersRow peers={peers} onClick={setActiveTicker} />
        <ChipRow
          label="Tied to"
          icon={<Anchor size={11} />}
          color={EDGE_COLOR.tied}
          items={tiedTo}
          onClick={setActiveTicker}
        />
        <KeyFactsRow claims={claims} />
      </div>
    </div>
  );
}
