import { useMemo } from "react";
import { useIntelGraphContext } from "../../api/intelGraph";
import { useAppStore } from "../../store/useAppStore";
import type {
  GraphConcept,
  GraphThemePeer,
  GraphThematicGroup,
  GraphTiedTo,
  StructuralRole,
} from "../../lib/types";
import {
  Network,
  Users,
  Lightbulb,
  Anchor,
  Layers,
  Link2,
  Zap,
} from "lucide-react";

interface Props {
  ticker: string;
}

/** Edge color tokens — keep in sync with the row icons + SVG spokes. */
const EDGE_COLOR = {
  related: "var(--accent-cyan, #22d3ee)",
  chokepoint: "var(--accent-orange, #e37f2e)",
  peer: "var(--accent-purple, #c084fc)",
  concept: "var(--accent-yellow, #eab308)",
  group: "var(--accent-blue)",
  tied: "var(--text-muted)",
} as const;

/** Structural-role chip color — PLATFORM/ENABLER are "good infra position",
 *  BOTTLENECK is the scarce-supply tell, CONSUMER is demand-side. */
const ROLE_COLOR: Record<StructuralRole, string> = {
  PLATFORM: "var(--accent-blue)",
  ENABLER: "var(--accent-cyan, #22d3ee)",
  BOTTLENECK: "var(--accent-red)",
  CONSUMER: "var(--accent-purple, #c084fc)",
  NEUTRAL: "var(--text-muted)",
};

/** Confidence → dot style. EXTRACTED is stated-in-source (solid), INFERRED is
 *  model-deduced (ring), AMBIGUOUS is low-confidence (faint). */
function confidenceDot(conf: string | undefined, color: string) {
  if (conf === "EXTRACTED")
    return { background: color, border: `1px solid ${color}` };
  if (conf === "AMBIGUOUS")
    return { background: "transparent", border: `1px solid ${color}55`, opacity: 0.5 };
  return { background: "transparent", border: `1px solid ${color}` }; // INFERRED
}

/** Tiny static SVG: center node + spokes to related / chokepoint / peer
 *  neighbors, colored by group. Decorative — the chips below are the real
 *  navigation, but the diagram conveys edge density at a glance. */
function MiniGraphSvg({
  ticker,
  groups,
}: {
  ticker: string;
  groups: Array<{ items: string[]; color: string; angleStart: number; angleSpan: number }>;
}) {
  const W = 460;
  const H = 130;
  const CX = W / 2;
  const CY = H / 2;
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
        label: g.items[i],
      });
    }
  }

  return (
    <svg
      viewBox={`0 0 ${W} ${H}`}
      className="w-full h-[130px]"
      style={{ background: "color-mix(in srgb, var(--text-primary) 2%, transparent)", borderRadius: 6 }}
    >
      {spokes.map((s, i) => (
        <line key={`l-${i}`} x1={CX} y1={CY} x2={s.x} y2={s.y} stroke={s.color} strokeWidth={1} opacity={0.45} />
      ))}
      {spokes.map((s, i) => (
        <g key={`n-${i}`}>
          <circle cx={s.x} cy={s.y} r={4} fill={s.color} opacity={0.85} />
          <text x={s.x} y={s.y - 8} textAnchor="middle" fontSize={9} fontFamily="ui-monospace, monospace" fill="var(--text-secondary)">
            {s.label.length > 6 ? s.label.slice(0, 6) : s.label}
          </text>
        </g>
      ))}
      <circle cx={CX} cy={CY} r={11} fill="var(--accent-green)" />
      <text x={CX} y={CY + 3} textAnchor="middle" fontSize={10} fontFamily="ui-monospace, monospace" fontWeight={700} fill="var(--bg-card, #0d1117)">
        {ticker.length > 4 ? ticker.slice(0, 4) : ticker}
      </text>
    </svg>
  );
}

/** Role pill — shown in the header and inline on peer chips. */
function RolePill({ role, reason }: { role: StructuralRole; reason?: string }) {
  const color = ROLE_COLOR[role] ?? "var(--text-muted)";
  return (
    <span
      title={reason}
      className="px-1.5 py-0.5 rounded text-[10px] font-mono uppercase tracking-wider"
      style={{ background: `${color}1a`, color, border: `1px solid ${color}40` }}
    >
      {role}
    </span>
  );
}

/** Clickable ticker chip with a confidence dot + optional role tag. */
function TickerChip({
  ticker,
  color,
  confidence,
  role,
  onClick,
}: {
  ticker: string;
  color: string;
  confidence?: string;
  role?: StructuralRole | null;
  onClick: (t: string) => void;
}) {
  return (
    <button
      type="button"
      onClick={() => onClick(ticker)}
      title={confidence ? `${confidence.toLowerCase()} edge` : undefined}
      className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs font-mono hover:bg-bg-card-hover cursor-pointer transition-colors"
      style={{ background: `${color}14`, color, border: `1px solid ${color}33` }}
    >
      {confidence && (
        <span className="inline-block w-1.5 h-1.5 rounded-full" style={confidenceDot(confidence, color)} />
      )}
      <span>{ticker}</span>
      {role && (
        <span className="text-[9px] opacity-60" style={{ color: ROLE_COLOR[role] }}>
          {role.slice(0, 4)}
        </span>
      )}
    </button>
  );
}

/** Non-clickable concept chip (chokepoint / theme / entity). */
function ConceptChip({ name, color, confidence }: { name: string; color: string; confidence?: string }) {
  return (
    <span
      title={confidence ? `${confidence.toLowerCase()} edge` : undefined}
      className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs cursor-default"
      style={{ background: `${color}12`, color, border: `1px solid ${color}2e` }}
    >
      {confidence && (
        <span className="inline-block w-1.5 h-1.5 rounded-full" style={confidenceDot(confidence, color)} />
      )}
      <span>{name}</span>
    </span>
  );
}

/** A labeled row of chips. `children` is the chip content. */
function Row({
  label,
  icon,
  color,
  children,
}: {
  label: string;
  icon: React.ReactNode;
  color: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex items-start gap-2 py-1">
      <div
        className="flex items-center gap-1 min-w-[104px] pt-0.5 text-[10px] font-mono uppercase tracking-wider"
        style={{ color }}
      >
        {icon}
        {label}
      </div>
      <div className="flex flex-wrap gap-1.5">{children}</div>
    </div>
  );
}

export function GraphContextCard({ ticker }: Props) {
  const setActiveTicker = useAppStore((s) => s.setActiveTicker);
  const { data, isLoading } = useIntelGraphContext(ticker, 10);

  // NOTE: graphify "related companies" (semantic-similarity edges) are
  // deliberately NOT shown — they conflate adjacency with rivalry and pull
  // ETFs/noise. Theme peers (same corrected-taxonomy theme) are the reliable
  // competitive set, so that's what we surface as peers/competitors.
  const chokepoints = useMemo<GraphConcept[]>(() => data?.chokepoints ?? [], [data]);
  const concepts = useMemo<GraphConcept[]>(() => data?.concepts ?? [], [data]);
  const peers = useMemo<GraphThemePeer[]>(() => data?.theme_peers ?? [], [data]);
  const groups = useMemo<GraphThematicGroup[]>(() => data?.thematic_groups ?? [], [data]);
  const tiedTo = useMemo<GraphTiedTo[]>(() => data?.tied_to ?? [], [data]);
  const role = data?.structural_role;
  const keyFacts = data?.key_facts ?? [];

  const totalSignals =
    chokepoints.length + concepts.length + peers.length +
    groups.length + tiedTo.length + keyFacts.length;

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
  if (!data?.available || (totalSignals === 0 && !role)) return null;

  const svgGroups = [
    { items: peers.slice(0, 3).map((p) => p.ticker), color: EDGE_COLOR.peer, angleStart: 150, angleSpan: 60 },
    { items: chokepoints.slice(0, 3).map((c) => c.name), color: EDGE_COLOR.chokepoint, angleStart: 330, angleSpan: 60 },
    { items: concepts.slice(0, 3).map((c) => c.name), color: EDGE_COLOR.concept, angleStart: 30, angleSpan: 60 },
  ];

  return (
    <div className="card flex flex-col gap-2">
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2 text-xs font-mono uppercase tracking-wider text-text-secondary">
          <Network size={14} className="text-accent-purple" />
          Graph context
          {role && <RolePill role={role.role} reason={role.reason} />}
        </div>
        <div className="text-[10px] font-mono text-text-muted text-right">
          {totalSignals} signals
          {data.sector && (
            <span className="ml-2">
              · {data.sector}
              {data.theme ? ` · ${data.theme}` : ""}
            </span>
          )}
          {data.community?.label && (
            <div className="text-accent-purple/70">cluster: {data.community.label}</div>
          )}
        </div>
      </div>

      <MiniGraphSvg ticker={ticker} groups={svgGroups} />

      {keyFacts.length > 0 && (
        <div className="flex items-start gap-2 py-1">
          <div
            className="flex items-center gap-1 min-w-[104px] pt-0.5 text-[10px] font-mono uppercase tracking-wider"
            style={{ color: "var(--accent-orange, #e37f2e)" }}
          >
            <Zap size={11} />
            Key facts
          </div>
          <div className="flex flex-col gap-1 flex-1 min-w-0">
            {keyFacts.map((f, i) => (
              <div key={i} className="text-xs leading-snug text-text-secondary">
                <span
                  className="inline-block w-1 h-1 rounded-full mr-1.5 align-middle"
                  style={{ background: "var(--accent-orange, #e37f2e)" }}
                />
                {f}
              </div>
            ))}
            {data.intel_as_of && (
              <div className="text-[10px] text-text-muted font-mono">intel {data.intel_as_of}</div>
            )}
          </div>
        </div>
      )}

      <div className="flex flex-col gap-0.5">
        {chokepoints.length > 0 && (
          <Row label="Chokepoints" icon={<Anchor size={11} />} color={EDGE_COLOR.chokepoint}>
            {chokepoints.map((c) => (
              <ConceptChip key={c.name} name={c.name} color={EDGE_COLOR.chokepoint} confidence={c.confidence} />
            ))}
          </Row>
        )}

        {peers.length > 0 && (
          <Row label="Peers" icon={<Users size={11} />} color={EDGE_COLOR.peer}>
            {peers.map((p) => (
              <TickerChip key={p.ticker} ticker={p.ticker} color={EDGE_COLOR.peer} role={p.role} onClick={setActiveTicker} />
            ))}
          </Row>
        )}

        {concepts.length > 0 && (
          <Row label="Concepts" icon={<Lightbulb size={11} />} color={EDGE_COLOR.concept}>
            {concepts.map((c) => (
              <ConceptChip key={c.name} name={c.name} color={EDGE_COLOR.concept} />
            ))}
          </Row>
        )}

        {groups.length > 0 && (
          <Row label="Groups" icon={<Layers size={11} />} color={EDGE_COLOR.group}>
            {groups.map((g) => (
              <span
                key={g.id}
                title={g.rationale}
                className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs font-mono cursor-default"
                style={{ background: "var(--accent-blue)10", color: "var(--accent-blue)", border: "1px solid var(--accent-blue)30" }}
              >
                {g.id.replace(/_members$/, "").replace(/_/g, " ")}
                <span className="opacity-50">· {g.members.length + 1}</span>
              </span>
            ))}
          </Row>
        )}

        {tiedTo.length > 0 && (
          <Row label="Tied to" icon={<Link2 size={11} />} color={EDGE_COLOR.tied}>
            {tiedTo.map((t) => (
              <ConceptChip key={t.name} name={t.name} color={EDGE_COLOR.tied} />
            ))}
          </Row>
        )}
      </div>
    </div>
  );
}
