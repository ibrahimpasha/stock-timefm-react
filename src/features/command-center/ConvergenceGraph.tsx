import { useMemo } from "react";
import { Info } from "lucide-react";
import { Kpi, Tile } from "../../components/Cockpit";

import { useConvergenceGraph } from "../../api/intelV3";
import type {
  ConvergenceGraphEdge,
  ConvergenceGraphNode,
} from "../../api/intelV3";

const SOURCE_COLOR: Record<string, string> = {
  news: "var(--accent-blue)",
  flow: "var(--accent-cyan)",
  iflow: "var(--accent-cyan)",
  voice: "var(--accent-purple)",
  voices: "var(--accent-purple)",
  trader: "var(--accent-fuchsia)",
  traders: "var(--accent-fuchsia)",
  forecast: "var(--accent-green)",
  earnings: "var(--accent-orange)",
  macro: "var(--accent-yellow)",
};

const TYPE_COLOR: Record<string, string> = {
  source: "var(--accent-blue)",
  event: "var(--accent-green)",
  structural: "var(--accent-orange)",
  ticker: "var(--accent-green)",
  theme: "var(--accent-purple)",
  macro: "var(--accent-yellow)",
  catalyst: "var(--accent-orange)",
};

type PositionedNode = ConvergenceGraphNode & {
  x: number;
  y: number;
  color: string;
  bucket: "source" | "event" | "structural" | "other" | "ticker";
};

function norm(value?: string): string {
  return (value || "").trim().toLowerCase();
}

function fmtLabel(value: string): string {
  const v = value.toLowerCase();
  if (v === "iflow" || v === "flow") return "iFlow";
  return value;
}

function nodeBucket(node: ConvergenceGraphNode): PositionedNode["bucket"] {
  const type = norm(node.type);
  if (type.includes("source")) return "source";
  if (type.includes("event") || node.ts) return "event";
  if (
    type.includes("structural") ||
    type.includes("context") ||
    type === "theme" ||
    type === "macro" ||
    type === "catalyst"
  ) {
    return "structural";
  }
  if (type.includes("ticker")) return "ticker";
  return "other";
}

function nodeColor(node: ConvergenceGraphNode): string {
  const source = norm(node.source);
  const type = norm(node.type);
  return SOURCE_COLOR[source] ?? SOURCE_COLOR[type] ?? TYPE_COLOR[type] ?? "var(--text-secondary)";
}

function timeLabel(ts?: string): string | null {
  if (!ts) return null;
  const d = new Date(ts);
  if (Number.isNaN(d.getTime())) return null;
  return d.toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    hour: "numeric",
  });
}

function scoreLabel(score?: number): string | null {
  if (score == null || !Number.isFinite(score)) return null;
  return Math.abs(score) <= 1 ? score.toFixed(2) : Math.round(score).toString();
}

function spreadNodes(
  nodes: ConvergenceGraphNode[],
  bucket: PositionedNode["bucket"],
  x: number,
  startY: number,
  endY: number,
): PositionedNode[] {
  const count = nodes.length;
  const step = count > 1 ? (endY - startY) / (count - 1) : 0;
  return nodes.map((node, idx) => ({
    ...node,
    bucket,
    x,
    y: count > 1 ? startY + step * idx : (startY + endY) / 2,
    color: nodeColor(node),
  }));
}

function buildLayout(
  ticker: string,
  nodes: ConvergenceGraphNode[],
  edges: ConvergenceGraphEdge[],
) {
  const tickerNode = nodes.find(
    (node) => norm(node.id) === norm(ticker) || norm(node.label) === norm(ticker),
  );
  const centerId = tickerNode?.id ?? `ticker:${ticker}`;
  const graphNodes = tickerNode
    ? nodes
    : [
        {
          id: centerId,
          type: "ticker",
          label: ticker,
        },
        ...nodes,
      ];

  const buckets = graphNodes.reduce(
    (acc, node) => {
      if (node.id === centerId) return acc;
      acc[nodeBucket(node)].push(node);
      return acc;
    },
    {
      source: [] as ConvergenceGraphNode[],
      event: [] as ConvergenceGraphNode[],
      structural: [] as ConvergenceGraphNode[],
      other: [] as ConvergenceGraphNode[],
      ticker: [] as ConvergenceGraphNode[],
    },
  );

  const positioned: PositionedNode[] = [
    {
      ...(tickerNode ?? { id: centerId, type: "ticker", label: ticker }),
      bucket: "ticker",
      x: 50,
      y: 50,
      color: TYPE_COLOR.ticker,
    },
    ...spreadNodes(buckets.source.slice(0, 8), "source", 16, 18, 82),
    ...spreadNodes(buckets.event.slice(0, 10), "event", 84, 14, 86),
    ...spreadNodes(buckets.structural.slice(0, 6), "structural", 50, 13, 87),
    ...spreadNodes(buckets.other.slice(0, 6), "other", 68, 20, 80),
    ...spreadNodes(buckets.ticker.slice(0, 4), "ticker", 38, 24, 76),
  ];

  const nodeIds = new Set(positioned.map((node) => node.id));
  const resolvedEdges = edges
    .filter((edge) => nodeIds.has(edge.source) && nodeIds.has(edge.target))
    .slice(0, 64);

  const connected = new Set<string>();
  resolvedEdges.forEach((edge) => {
    connected.add(edge.source);
    connected.add(edge.target);
  });

  const fallbackEdges = positioned
    .filter((node) => node.id !== centerId && !connected.has(node.id))
    .map((node) => ({
      source: centerId,
      target: node.id,
      type: node.bucket,
      weight: node.score,
    }));

  return {
    centerId,
    nodes: positioned,
    edges: [...resolvedEdges, ...fallbackEdges],
    hiddenCount: Math.max(0, graphNodes.length - positioned.length),
  };
}

function edgeKey(edge: ConvergenceGraphEdge, idx: number): string {
  return edge.id || `${edge.source}-${edge.target}-${edge.type}-${idx}`;
}

export function ConvergenceGraph({
  ticker,
  hours = 72,
  limit = 50,
}: {
  ticker: string;
  hours?: number;
  limit?: number;
}) {
  const { data, isLoading, isError } = useConvergenceGraph(ticker, hours, limit);

  const layout = useMemo(
    () => buildLayout(ticker, data?.nodes ?? [], data?.edges ?? []),
    [data?.edges, data?.nodes, ticker],
  );

  const nodeById = useMemo(
    () => new Map(layout.nodes.map((node) => [node.id, node])),
    [layout.nodes],
  );

  const sources = data?.summary.sources_seen ?? [];
  const convergence = data?.summary.convergence;

  return (
    <section className="flex flex-col gap-3.5" aria-label="Convergence graph">
      {isLoading ? (
        <div className="flex animate-pulse flex-col gap-3 rounded-xl border border-border bg-bg-card p-4">
          <div className="h-56 rounded bg-text-muted/10" />
          <div className="h-4 rounded bg-text-muted/15" />
          <div className="h-4 w-2/3 rounded bg-text-muted/15" />
        </div>
      ) : isError ? (
        <div role="alert" className="callout flex items-start gap-2">
          <Info size={14} className="mt-0.5 shrink-0" />
          Convergence graph is unavailable for {ticker}. Overview and narrative tabs are unchanged.
        </div>
      ) : !data || data.nodes.length === 0 ? (
        <Tile title="No graph nodes in this window">
          <p className="max-w-[72ch] text-sm leading-relaxed text-text-secondary">
            The endpoint returned no source, event, or structural graph evidence for {ticker} over
            the last {data?.window_hours ?? hours} hours.
          </p>
        </Tile>
      ) : (
        <>
          <Tile bodyClassName="grid grid-cols-3 gap-4">
            <Kpi label="Score" value={scoreLabel(convergence?.score) ?? "n/a"} size="md" />
            <Kpi label="Alignment" value={<span className="font-sans">{convergence?.alignment ?? "unknown"}</span>} size="md" />
            <Kpi label="Events" value={data.summary.event_count ?? 0} size="md" />
          </Tile>

          <Tile
            title="Convergence graph"
            meta={
              <>
                Last <span className="num">{data.window_hours ?? hours}h</span> ·{" "}
                <span className="num">{data.summary.node_count ?? data.nodes.length}</span> nodes ·{" "}
                <span className="num">{data.summary.edge_count ?? data.edges.length}</span> edges
              </>
            }
          >
          <div className="relative h-80 overflow-hidden rounded-lg" style={{ background: "var(--bg-primary)" }}>
            <svg viewBox="0 0 100 100" className="absolute inset-0 h-full w-full">
              {layout.edges.map((edge, idx) => {
                const a = nodeById.get(edge.source);
                const b = nodeById.get(edge.target);
                if (!a || !b) return null;
                const color = b.id === layout.centerId ? a.color : b.color;
                const width = Math.max(0.7, Math.min(2.4, Number(edge.weight ?? 0.7) * 1.5));
                return (
                  <line
                    key={edgeKey(edge, idx)}
                    x1={a.x}
                    y1={a.y}
                    x2={b.x}
                    y2={b.y}
                    stroke={color}
                    strokeWidth={width}
                    opacity={0.34}
                  />
                );
              })}
            </svg>

            {layout.nodes.map((node) => {
              const isCenter = node.id === layout.centerId;
              const time = timeLabel(node.ts);
              return (
                <div
                  key={node.id}
                  className="absolute -translate-x-1/2 -translate-y-1/2"
                  style={{ left: `${node.x}%`, top: `${node.y}%` }}
                >
                  <div
                    className={
                      isCenter
                        ? "max-w-28 rounded-md px-2.5 py-1.5 text-center text-sm font-semibold"
                        : "max-w-24 rounded-md px-2 py-1 text-center text-xs"
                    }
                    title={`${node.type}${node.source ? ` · ${node.source}` : ""}`}
                    style={{
                      color: isCenter ? "var(--bg-primary)" : "var(--text-primary)",
                      background: isCenter ? node.color : "var(--bg-card)",
                      border: `1px solid color-mix(in srgb, ${node.color} 55%, var(--border))`,
                    }}
                  >
                    <div className={`truncate ${isCenter ? "num" : ""}`}>{node.label}</div>
                    {!isCenter && (
                      <div className="mt-0.5 truncate text-text-muted">
                        {fmtLabel(node.source || node.type)}
                        {time ? ` · ${time}` : ""}
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>

          <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-text-secondary">
            {sources.length > 0
              ? sources.map((source) => {
                  const color = SOURCE_COLOR[norm(source)] ?? "var(--text-secondary)";
                  return (
                    <span key={source} className="inline-flex items-center gap-1">
                      <span aria-hidden className="h-1.5 w-1.5 rounded-full" style={{ background: color }} />
                      {fmtLabel(source)}
                    </span>
                  );
                })
              : ["source", "event", "structural"].map((kind) => (
                  <span key={kind} className="inline-flex items-center gap-1">
                    <span
                      aria-hidden
                      className="h-1.5 w-1.5 rounded-full"
                      style={{ background: TYPE_COLOR[kind] }}
                    />
                    {kind}
                  </span>
                ))}
            {data.summary.structural_context && (
              <span className="text-text-muted">Includes structural context</span>
            )}
            {layout.hiddenCount > 0 && (
              <span className="text-text-muted">+{layout.hiddenCount} more hidden locally</span>
            )}
          </div>
          </Tile>
        </>
      )}
    </section>
  );
}
