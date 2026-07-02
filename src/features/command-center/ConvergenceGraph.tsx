import { useMemo } from "react";
import { GitBranch, Info, Network } from "lucide-react";

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
    <section className="card">
      <div className="mb-3 flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <Network size={14} className="text-accent-purple" />
          <h3 className="text-xs font-semibold uppercase tracking-[0.08em] text-text-secondary">
            Convergence Graph
          </h3>
        </div>
        <div className="num flex items-center gap-2 text-xs uppercase text-text-muted">
          <span>{data?.window_hours ?? hours}h</span>
          <span>{data?.summary.node_count ?? data?.nodes.length ?? 0} nodes</span>
          <span>{data?.summary.edge_count ?? data?.edges.length ?? 0} edges</span>
        </div>
      </div>

      {isLoading ? (
        <div className="space-y-3 animate-pulse">
          <div className="h-56 rounded bg-text-muted/10" />
          <div className="h-4 rounded bg-text-muted/15" />
          <div className="h-4 w-2/3 rounded bg-text-muted/15" />
        </div>
      ) : isError ? (
        <div className="flex items-start gap-2 rounded border border-border bg-bg-card px-3 py-2 text-xs text-text-secondary">
          <Info size={13} className="mt-0.5 shrink-0 text-accent-orange" />
          Convergence graph is unavailable for {ticker}. Overview and narrative tabs are unchanged.
        </div>
      ) : !data || data.nodes.length === 0 ? (
        <div className="rounded border border-border bg-bg-card px-3 py-3 text-xs text-text-secondary">
          <p className="font-medium text-text-primary">No graph nodes in this window.</p>
          <p className="mt-1">
            The endpoint returned no source, event, or structural graph evidence for {ticker} over
            the last {data?.window_hours ?? hours} hours.
          </p>
        </div>
      ) : (
        <>
          <div className="mb-3 grid grid-cols-3 gap-2 text-xs">
            <div className="rounded-lg border border-border bg-bg-card px-2.5 py-1.5">
              <div className="uppercase tracking-[0.08em] text-text-muted">Score</div>
              <div className="num mt-0.5 text-sm font-semibold text-text-primary">
                {scoreLabel(convergence?.score) ?? "n/a"}
              </div>
            </div>
            <div className="rounded-lg border border-border bg-bg-card px-2.5 py-1.5">
              <div className="uppercase tracking-[0.08em] text-text-muted">Alignment</div>
              <div className="mt-0.5 truncate text-sm font-semibold text-text-primary">
                {convergence?.alignment ?? "unknown"}
              </div>
            </div>
            <div className="rounded-lg border border-border bg-bg-card px-2.5 py-1.5">
              <div className="uppercase tracking-[0.08em] text-text-muted">Events</div>
              <div className="num mt-0.5 text-sm font-semibold text-text-primary">
                {data.summary.event_count ?? 0}
              </div>
            </div>
          </div>

          <div
            className="relative h-72 overflow-hidden rounded-lg border border-border bg-bg-card"
            style={{
              background:
                "linear-gradient(180deg, color-mix(in srgb, var(--text-primary) 3%, transparent), transparent)",
            }}
          >
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
                        ? "max-w-28 rounded px-2.5 py-1.5 text-center text-sm font-semibold shadow"
                        : "max-w-24 rounded px-2 py-1 text-center text-xs shadow"
                    }
                    title={`${node.type}${node.source ? ` · ${node.source}` : ""}`}
                    style={{
                      color: isCenter ? "var(--bg-primary)" : node.color,
                      background: isCenter
                        ? node.color
                        : `color-mix(in srgb, ${node.color} 14%, var(--bg-card))`,
                      border: `1px solid color-mix(in srgb, ${node.color} 48%, var(--border))`,
                      boxShadow: `0 0 0 3px color-mix(in srgb, ${node.color} 10%, transparent)`,
                    }}
                  >
                    <div className="truncate font-mono uppercase">{node.label}</div>
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

          <div className="mt-3 flex flex-wrap items-center gap-2 text-xs text-text-secondary">
            <span className="inline-flex items-center gap-1 font-mono uppercase tracking-wider text-text-muted">
              <GitBranch size={12} />
              Legend
            </span>
            {sources.length > 0
              ? sources.map((source) => {
                  const color = SOURCE_COLOR[norm(source)] ?? "var(--text-secondary)";
                  return (
                    <span key={source} className="inline-flex items-center gap-1">
                      <span className="h-2 w-2 rounded-full" style={{ background: color }} />
                      {fmtLabel(source)}
                    </span>
                  );
                })
              : ["source", "event", "structural"].map((kind) => (
                  <span key={kind} className="inline-flex items-center gap-1">
                    <span
                      className="h-2 w-2 rounded-full"
                      style={{ background: TYPE_COLOR[kind] }}
                    />
                    {kind}
                  </span>
                ))}
            {data.summary.structural_context && (
              <span className="rounded bg-bg-card px-1.5 py-0.5 font-mono uppercase tracking-wider text-accent-orange">
                structural context
              </span>
            )}
            {layout.hiddenCount > 0 && (
              <span className="text-text-muted">+{layout.hiddenCount} more hidden locally</span>
            )}
          </div>
        </>
      )}
    </section>
  );
}
