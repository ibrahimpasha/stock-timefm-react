/**
 * PatternsView — derivative signal that nobody can read from a chronological feed.
 *
 * Renders two stacked panels:
 *
 *   ┌─ Conviction Velocity (top) ─────────────────┐
 *   │ Per-ticker mention delta vs prior window,   │
 *   │ ranked by momentum_score. Flags `is_new`    │
 *   │ tickers that just entered the radar.        │
 *   ├─ Co-occurrence baskets (bottom) ────────────┤
 *   │ Greedy-clustered ticker groups — the        │
 *   │ implicit baskets the voice is building.     │
 *   │ Strongest internal pair edges shown.        │
 *   └────────────────────────────────────────────┘
 *
 * Window selector at the top (7d/30d/90d). Click a ticker to push it to the
 * global activeTicker so the rest of the dashboard re-aligns.
 */
import { useMemo } from "react";
import { TrendingUp, Sparkles, Zap, ArrowUp, ArrowDown, Minus } from "lucide-react";
import { useAppStore } from "../../../store/useAppStore";
import { relativeAge } from "../../../lib/utils";
import {
  useVoicesPatterns,
  type CooccurrenceCluster,
  type VelocityRow,
  type CooccurrencePair,
} from "../../../api/voices";

const WINDOWS: { label: string; days: number }[] = [
  { label: "7d", days: 7 },
  { label: "30d", days: 30 },
  { label: "90d", days: 90 },
];

function sentColor(s: VelocityRow["net_sentiment"]) {
  if (s === "bullish") return "var(--accent-green)";
  if (s === "bearish") return "var(--accent-red)";
  return "var(--text-muted)";
}

function VelocityArrow({ delta }: { delta: number }) {
  if (delta > 0) return <ArrowUp size={11} style={{ color: "var(--accent-green)" }} />;
  if (delta < 0) return <ArrowDown size={11} style={{ color: "var(--accent-red)" }} />;
  return <Minus size={11} style={{ color: "var(--text-muted)" }} />;
}

function VelocityTable({
  rows,
  onPick,
}: {
  rows: VelocityRow[];
  onPick: (t: string) => void;
}) {
  // Normalize bar widths against top momentum so the most-accelerating
  // ticker fills the bar; everything else is proportional.
  const maxMomentum = Math.max(1, ...rows.map((r) => r.momentum_score));
  return (
    <div className="space-y-0.5">
      {rows.length === 0 && (
        <div className="text-xs text-text-muted italic">
          No velocity data yet — backfill needs at least two windows of history.
        </div>
      )}
      {rows.map((r) => {
        const barPct = Math.max(2, Math.round((r.momentum_score / maxMomentum) * 100));
        return (
          <div
            key={r.ticker}
            className="grid grid-cols-12 items-center gap-2 py-1 px-2 rounded hover:bg-bg-card-hover cursor-pointer"
            onClick={() => onPick(r.ticker)}
          >
            <span className="col-span-2 font-mono font-semibold text-xs text-text-primary truncate">
              {r.ticker}
            </span>
            <span className="col-span-1 text-xs font-mono text-text-muted text-right">
              {r.mentions_recent}
            </span>
            <span className="col-span-2 inline-flex items-center gap-1 text-xs font-mono">
              <VelocityArrow delta={r.delta} />
              <span style={{ color: sentColor(r.net_sentiment) }}>
                {r.delta >= 0 ? "+" : ""}
                {r.delta}
              </span>
              {r.is_new && (
                <span className="text-[9px] uppercase px-1 rounded bg-accent-purple/15 text-accent-purple">
                  new
                </span>
              )}
            </span>
            <div className="col-span-5 h-1.5 rounded-full bg-bg-card overflow-hidden">
              <div
                className="h-full rounded-full"
                style={{
                  width: `${barPct}%`,
                  background: sentColor(r.net_sentiment),
                }}
              />
            </div>
            <span className="col-span-1 text-xs font-mono text-text-secondary text-right">
              {r.bullish}/{r.bearish}
            </span>
            <span className="col-span-1 text-xs text-text-muted text-right">
              {relativeAge(r.last_mentioned)}
            </span>
          </div>
        );
      })}
    </div>
  );
}

function ClusterCard({
  cluster,
  pairs,
  nodeStats,
  onPick,
}: {
  cluster: CooccurrenceCluster;
  pairs: CooccurrencePair[];
  nodeStats: Record<string, { mentions: number; bullish: number; bearish: number }>;
  onPick: (t: string) => void;
}) {
  // Internal edges = pairs where both endpoints are in this cluster.
  const internalPairs = useMemo(() => {
    const members = new Set(cluster.tickers);
    return pairs
      .filter((p) => members.has(p.a) && members.has(p.b))
      .sort((a, b) => b.weight - a.weight);
  }, [cluster, pairs]);

  // Pick the "hub" — the member with most internal connections (highest
  // sum of internal edge weights). Names the basket.
  const hub = useMemo(() => {
    const score: Record<string, number> = {};
    cluster.tickers.forEach((t) => (score[t] = 0));
    for (const p of internalPairs) {
      score[p.a] = (score[p.a] || 0) + p.weight;
      score[p.b] = (score[p.b] || 0) + p.weight;
    }
    return cluster.tickers
      .slice()
      .sort((a, b) => (score[b] || 0) - (score[a] || 0))[0];
  }, [cluster, internalPairs]);

  return (
    <div className="card p-3 space-y-2">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="text-xs uppercase text-text-muted font-semibold">
            Cluster C{cluster.id}
          </span>
          <span className="text-xs text-text-muted">
            {cluster.size} tickers · {cluster.internal_edges} edges · hub
          </span>
          <span className="font-mono font-semibold text-xs text-accent-purple">
            {hub}
          </span>
        </div>
      </div>

      {/* Member chips, sized by mention count */}
      <div className="flex items-center gap-1 flex-wrap">
        {cluster.tickers.map((t) => {
          const ns = nodeStats[t] || { mentions: 0, bullish: 0, bearish: 0 };
          const lean: "bullish" | "bearish" | "neutral" =
            ns.bullish > ns.bearish
              ? "bullish"
              : ns.bearish > ns.bullish
                ? "bearish"
                : "neutral";
          const c = sentColor(lean);
          return (
            <button
              key={t}
              type="button"
              onClick={() => onPick(t)}
              className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-xs font-mono font-semibold transition-colors hover:brightness-110"
              style={{
                background: `${c}18`,
                color: c,
                border: `1px solid ${c}40`,
              }}
              title={`${ns.mentions} mentions · ${ns.bullish}B / ${ns.bearish}S`}
            >
              {t}
              <span className="text-[9px] opacity-70">{ns.mentions}</span>
            </button>
          );
        })}
      </div>

      {/* Top 3 internal pair edges */}
      {internalPairs.length > 0 && (
        <div className="text-xs text-text-muted font-mono">
          {internalPairs.slice(0, 4).map((p) => (
            <span key={`${p.a}-${p.b}`} className="mr-3">
              {p.a}↔{p.b}
              <span className="ml-1 text-text-primary">×{p.weight}</span>
            </span>
          ))}
        </div>
      )}
    </div>
  );
}

export function PatternsView({
  windowDays,
  onWindowChange,
  voiceUsername,
}: {
  windowDays: number;
  onWindowChange: (d: number) => void;
  voiceUsername: string | null;
}) {
  const setActiveTicker = useAppStore((s) => s.setActiveTicker);
  const { data, isFetching } = useVoicesPatterns(windowDays, voiceUsername);
  const velocity = data?.velocity ?? [];
  const cooc = data?.cooccurrence;

  const handlePick = (t: string) => setActiveTicker(t);

  return (
    <div className="space-y-3">
      {/* Window selector */}
      <div className="flex items-center gap-2">
        <span className="text-xs uppercase text-text-muted font-semibold">
          Window
        </span>
        <div className="flex items-center rounded border border-border overflow-hidden">
          {WINDOWS.map((w) => {
            const active = w.days === windowDays;
            return (
              <button
                key={w.label}
                type="button"
                onClick={() => onWindowChange(w.days)}
                className="px-2 py-1 text-xs font-semibold transition-colors"
                style={{
                  background: active ? "var(--accent-blue)" : "transparent",
                  color: active ? "var(--bg-primary)" : "var(--text-secondary)",
                }}
              >
                {w.label}
              </button>
            );
          })}
        </div>
        {cooc && (
          <span className="ml-auto text-xs text-text-muted">
            {cooc.n_tickers} tickers across {cooc.n_tweets_considered} tweets ·{" "}
            {cooc.pairs.length} pairs · {cooc.clusters.length} clusters
          </span>
        )}
        {isFetching && (
          <span className="text-xs text-text-muted animate-pulse">refreshing…</span>
        )}
      </div>

      {/* Velocity panel */}
      <div className="card p-3 space-y-2">
        <div className="flex items-center gap-2">
          <Zap size={13} className="text-accent-orange" />
          <span className="text-sm font-semibold text-text-primary">
            Conviction Velocity
          </span>
          <span className="text-xs text-text-muted">
            mention delta vs prior {windowDays}d
          </span>
        </div>
        <VelocityTable rows={velocity.slice(0, 20)} onPick={handlePick} />
      </div>

      {/* Co-occurrence clusters */}
      <div className="space-y-2">
        <div className="flex items-center gap-2">
          <Sparkles size={13} className="text-accent-purple" />
          <span className="text-sm font-semibold text-text-primary">
            Co-occurrence Baskets
          </span>
          <span className="text-xs text-text-muted">
            tickers mentioned together — the implicit baskets
          </span>
        </div>
        {!cooc || cooc.clusters.length === 0 ? (
          <div className="card p-4 text-sm text-text-muted italic">
            No clusters yet — needs at least 2 tweets each mentioning 2+ tickers.
          </div>
        ) : (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
            {cooc.clusters.map((c) => (
              <ClusterCard
                key={c.id}
                cluster={c}
                pairs={cooc.pairs}
                nodeStats={cooc.node_stats}
                onPick={handlePick}
              />
            ))}
          </div>
        )}

        {/* Top single pairs that don't fit clusters */}
        {cooc && cooc.pairs.length > 0 && (
          <details className="mt-2">
            <summary className="cursor-pointer text-xs text-text-muted hover:text-text-primary">
              All pairs (top {Math.min(cooc.pairs.length, 30)})
            </summary>
            <div className="mt-2 grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-1 text-xs font-mono">
              {cooc.pairs.slice(0, 30).map((p) => {
                const bullDominant = p.both_bullish > p.both_bearish;
                const c = bullDominant
                  ? "var(--accent-green)"
                  : p.both_bearish > 0
                    ? "var(--accent-red)"
                    : "var(--text-secondary)";
                return (
                  <div
                    key={`${p.a}-${p.b}`}
                    className="flex items-center justify-between px-1.5 py-1 rounded bg-bg-card border border-border"
                    style={{ color: c }}
                  >
                    <span>
                      <button
                        type="button"
                        className="hover:underline"
                        onClick={() => handlePick(p.a)}
                      >
                        {p.a}
                      </button>
                      <span className="text-text-muted mx-1">↔</span>
                      <button
                        type="button"
                        className="hover:underline"
                        onClick={() => handlePick(p.b)}
                      >
                        {p.b}
                      </button>
                    </span>
                    <span>×{p.weight}</span>
                  </div>
                );
              })}
            </div>
          </details>
        )}
      </div>
    </div>
  );
}
