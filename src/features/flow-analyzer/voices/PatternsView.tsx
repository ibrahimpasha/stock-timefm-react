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
import { ArrowUp, ArrowDown, Minus } from "lucide-react";
import { useAppStore } from "../../../store/useAppStore";
import { Segmented, Stat } from "../../../components/Glass";
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
    <div className="divide-y divide-border">
      {rows.length > 0 && (
        <div className="grid grid-cols-12 gap-2 px-2 pb-1.5 text-xs font-medium text-text-muted">
          <span className="col-span-2">Ticker</span>
          <span className="col-span-1 text-right">Recent</span>
          <span className="col-span-2">Delta</span>
          <span className="col-span-5">Momentum</span>
          <span className="col-span-1 text-right">Bull/bear</span>
          <span className="col-span-1 text-right">Last</span>
        </div>
      )}
      {rows.length === 0 && (
        <div className="py-4 text-sm text-text-muted">
          No velocity data yet — backfill needs at least two windows of history.
        </div>
      )}
      {rows.map((r) => {
        const barPct = Math.max(2, Math.round((r.momentum_score / maxMomentum) * 100));
        return (
          <div
            key={r.ticker}
            className="data-row grid cursor-pointer grid-cols-12 items-center gap-2 px-2 py-2.5"
            onClick={() => onPick(r.ticker)}
          >
            <span className="ticker col-span-2 truncate text-sm">
              {r.ticker}
            </span>
            <span className="col-span-1 text-right text-sm num text-text-secondary">
              {r.mentions_recent}
            </span>
            <span className="col-span-2 inline-flex items-center gap-1 text-sm num font-semibold">
              <VelocityArrow delta={r.delta} />
              <span style={{ color: sentColor(r.net_sentiment) }}>
                {r.delta >= 0 ? "+" : ""}
                {r.delta}
              </span>
              {r.is_new && (
                <span className="tag font-sans" style={{ "--tag": "var(--accent-blue)" } as React.CSSProperties}>new</span>
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
            <span className="col-span-1 text-xs num text-text-secondary text-right">
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
    <div className="card space-y-3">
      <div className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
        <h4 className="font-display text-lg font-medium text-text-primary">
          <span className="ticker text-base">{hub}</span> basket
        </h4>
        <span className="text-xs text-text-muted">
          Cluster C{cluster.id} · <span className="num">{cluster.size}</span> tickers · <span className="num">{cluster.internal_edges}</span> edges
        </span>
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
              className="num inline-flex items-center gap-1 rounded-full border border-border px-2 py-0.5 text-xs font-semibold transition-colors hover:bg-bg-card-hover"
              style={{ color: c === "var(--text-muted)" ? "var(--text-secondary)" : c }}
              title={`${ns.mentions} mentions · ${ns.bullish}B / ${ns.bearish}S`}
            >
              {t}
              <span className="font-normal text-text-muted">{ns.mentions}</span>
            </button>
          );
        })}
      </div>

      {/* Top 3 internal pair edges */}
      {internalPairs.length > 0 && (
        <div className="border-t border-border pt-2 text-xs text-text-muted num">
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

  const top = velocity[0];

  return (
    <div className="space-y-8">
      {/* Window selector */}
      <div className="flex flex-wrap items-center gap-3">
        <Segmented
          ariaLabel="Patterns window"
          value={String(windowDays)}
          onChange={(v) => onWindowChange(Number(v))}
          options={WINDOWS.map((w) => ({ value: String(w.days), label: w.label }))}
        />
        {isFetching && (
          <span className="text-xs text-text-muted animate-pulse">Refreshing…</span>
        )}
      </div>

      {/* Headline numbers */}
      {(top || cooc) && (
        <div className="grid grid-cols-2 gap-6 sm:grid-cols-4">
          {top && (
            <button type="button" className="text-left" onClick={() => handlePick(top.ticker)}>
              <Stat
                label="Top momentum"
                value={top.ticker}
                sub={`${top.delta >= 0 ? "+" : ""}${top.delta} mentions vs prior ${windowDays}d`}
              />
            </button>
          )}
          {cooc && <Stat label="Tickers" value={cooc.n_tickers} sub={`across ${cooc.n_tweets_considered} tweets`} />}
          {cooc && <Stat label="Pairs" value={cooc.pairs.length} />}
          {cooc && <Stat label="Baskets" value={cooc.clusters.length} />}
        </div>
      )}

      {/* Velocity panel */}
      <section className="space-y-3">
        <div>
          <h3 className="section-title">Conviction velocity</h3>
          <p className="section-sub">Mention delta vs prior {windowDays}d, ranked by momentum</p>
        </div>
        <div className="card">
          <VelocityTable rows={velocity.slice(0, 20)} onPick={handlePick} />
        </div>
      </section>

      {/* Co-occurrence clusters */}
      <section className="space-y-3">
        <div>
          <h3 className="section-title">Co-occurrence baskets</h3>
          <p className="section-sub">Tickers mentioned together, the implicit baskets</p>
        </div>
        {!cooc || cooc.clusters.length === 0 ? (
          <div className="py-4 text-sm text-text-muted">
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
            <div className="mt-2 grid grid-cols-2 gap-x-6 md:grid-cols-3 lg:grid-cols-4 text-xs num">
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
                    className="flex items-center justify-between border-b border-border py-1.5"
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
      </section>
    </div>
  );
}
