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

interface Props {
  ticker: string;
}

/** Translucent tint of a CSS-var color — var() can't take a hex-alpha suffix. */
const tint = (c: string, pct: number) => `color-mix(in srgb, ${c} ${pct}%, transparent)`;

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
    return { background: "transparent", border: `1px solid ${tint(color, 33)}`, opacity: 0.5 };
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

/** Structural role as plain text with a leading dot — reason on hover. */
function RoleText({ role, reason }: { role: StructuralRole; reason?: string }) {
  const color = ROLE_COLOR[role] ?? "var(--text-muted)";
  return (
    <span title={reason} className="inline-flex items-center gap-1.5 text-xs font-medium text-text-secondary">
      <span aria-hidden className="h-1.5 w-1.5 rounded-full" style={{ background: color }} />
      {role.charAt(0) + role.slice(1).toLowerCase()}
    </span>
  );
}

const NEUTRAL_DOT = "var(--text-muted)";

/** Clickable ticker link with an optional role suffix. */
function TickerChip({
  ticker,
  role,
  onClick,
}: {
  ticker: string;
  role?: StructuralRole | null;
  onClick: (t: string) => void;
}) {
  return (
    <button
      type="button"
      onClick={() => onClick(ticker)}
      title={role ? role.toLowerCase() : undefined}
      className="inline-flex items-baseline gap-1 cursor-pointer text-text-primary hover:text-accent-blue"
    >
      <span className="num font-semibold">{ticker}</span>
      {role && <span className="text-xs text-text-muted">{role.slice(0, 4).toLowerCase()}</span>}
    </button>
  );
}

/** Non-clickable concept (chokepoint / theme / entity) with a confidence dot. */
function ConceptChip({ name, confidence }: { name: string; confidence?: string }) {
  return (
    <span
      title={confidence ? `${confidence.toLowerCase()} edge` : undefined}
      className="inline-flex items-center gap-1.5 text-text-secondary"
    >
      {confidence && (
        <span aria-hidden className="inline-block w-1.5 h-1.5 rounded-full" style={confidenceDot(confidence, NEUTRAL_DOT)} />
      )}
      <span>{name}</span>
    </span>
  );
}

/** A labeled definition row: muted label, plain inline items. */
function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="grid grid-cols-[6.5rem_1fr] items-baseline gap-3 py-2">
      <div className="text-xs text-text-muted">{label}</div>
      <div className="flex flex-wrap gap-x-3 gap-y-1 text-sm">{children}</div>
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
    <div className="card flex flex-col gap-3">
      <div className="flex items-start justify-between gap-2">
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
          <h3 className="text-sm font-semibold text-text-primary">Graph context</h3>
          {role && <RoleText role={role.role} reason={role.reason} />}
        </div>
        <div className="text-xs text-text-muted text-right">
          <span className="num">{totalSignals}</span> signals
          {data.sector && (
            <span>
              {" "}· {data.sector}
              {data.theme ? ` · ${data.theme}` : ""}
            </span>
          )}
          {data.community?.label && <div>Cluster: {data.community.label}</div>}
        </div>
      </div>

      <MiniGraphSvg ticker={ticker} groups={svgGroups} />

      {keyFacts.length > 0 && (
        <div className="flex flex-col gap-1.5">
          <div className="text-sm font-semibold text-text-primary">Key facts</div>
          <ul className="flex flex-col gap-1.5 max-w-[72ch]">
            {keyFacts.map((f, i) => (
              <li key={i} className="flex gap-2 text-sm leading-relaxed text-text-secondary">
                <span aria-hidden className="mt-2 h-1 w-1 shrink-0 rounded-full bg-text-muted" />
                {f}
              </li>
            ))}
          </ul>
          {data.intel_as_of && (
            <div className="text-xs text-text-muted">Intel as of <span className="num">{data.intel_as_of}</span></div>
          )}
        </div>
      )}

      <div className="flex flex-col divide-y divide-border border-t border-border">
        {chokepoints.length > 0 && (
          <Row label="Chokepoints">
            {chokepoints.map((c) => (
              <ConceptChip key={c.name} name={c.name} confidence={c.confidence} />
            ))}
          </Row>
        )}

        {peers.length > 0 && (
          <Row label="Peers">
            {peers.map((p) => (
              <TickerChip key={p.ticker} ticker={p.ticker} role={p.role} onClick={setActiveTicker} />
            ))}
          </Row>
        )}

        {concepts.length > 0 && (
          <Row label="Concepts">
            {concepts.map((c) => (
              <ConceptChip key={c.name} name={c.name} />
            ))}
          </Row>
        )}

        {groups.length > 0 && (
          <Row label="Groups">
            {groups.map((g) => (
              <span key={g.id} title={g.rationale} className="text-text-secondary cursor-default">
                {g.id.replace(/_members$/, "").replace(/_/g, " ")}
                <span className="num text-xs text-text-muted"> {g.members.length + 1}</span>
              </span>
            ))}
          </Row>
        )}

        {tiedTo.length > 0 && (
          <Row label="Tied to">
            {tiedTo.map((t) => (
              <ConceptChip key={t.name} name={t.name} />
            ))}
          </Row>
        )}
      </div>
    </div>
  );
}
