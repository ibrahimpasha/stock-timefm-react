/**
 * PatternsView — derivative signal that nobody can read from a chronological feed.
 *
 * Renders a KPI strip, then two tiles side by side:
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
import { useAppStore } from "../../../store/useAppStore";
import { Segmented } from "../../../components/Glass";
import { BarRow, Kpi, KpiTile, Tile, TileGrid, toneOf } from "../../../components/Cockpit";
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

function VelocityTable({
  rows,
  onPick,
}: {
  rows: VelocityRow[];
  onPick: (t: string) => void;
}) {
  // Diverging bars on the signed mention delta; trailing = recent mentions.
  const maxDelta = Math.max(1, ...rows.map((r) => Math.abs(r.delta)));
  if (rows.length === 0) {
    return (
      <div className="py-4 text-sm text-text-muted">
        No velocity data yet — backfill needs at least two windows of history.
      </div>
    );
  }
  const fresh = rows.filter((r) => r.is_new);
  return (
    <>
      <div className="grid gap-2.5 px-1 text-xs text-text-muted" style={{ gridTemplateColumns: "4.25rem minmax(0,1fr) 4.5rem 2.75rem" }}>
        <span>Ticker</span>
        <span className="text-center">Mention delta vs prior window</span>
        <span className="text-right">Delta</span>
        <span className="text-right">Recent</span>
      </div>
      {rows.map((r) => (
        <BarRow
          key={r.ticker}
          label={
            <span className="inline-flex items-center gap-1.5">
              <span className="size-1.5 shrink-0 rounded-full" style={{ background: sentColor(r.net_sentiment) }} aria-hidden="true" />
              {r.ticker}
            </span>
          }
          value={r.delta}
          max={maxDelta}
          diverging
          display={`${r.delta >= 0 ? "+" : ""}${r.delta}`}
          trailing={r.mentions_recent}
          title={`${r.ticker}: ${r.mentions_recent} recent vs ${r.mentions_prior} prior · momentum ${r.momentum_score.toFixed(2)} · ${r.bullish} bull / ${r.bearish} bear · last ${relativeAge(r.last_mentioned)}${r.is_new ? " · new on radar" : ""}`}
          onClick={() => onPick(r.ticker)}
        />
      ))}
      <div className="mt-1 flex flex-wrap gap-x-5 gap-y-1 border-t border-border pt-2.5 text-xs text-text-muted">
        <span>Dot = net lean. Ranked by momentum; hover a row for bull/bear and last mention.</span>
        {fresh.length > 0 && (
          <span className="inline-flex flex-wrap items-center gap-1.5">
            <span className="font-medium text-accent">New on radar</span>
            {fresh.map((r) => (
              <button key={r.ticker} type="button" className="ticker hover:text-accent" onClick={() => onPick(r.ticker)}>
                {r.ticker}
              </button>
            ))}
          </span>
        )}
      </div>
    </>
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
    <div className="space-y-2 py-3 first:pt-0 last:pb-0">
      <div className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
        <h4 className="m-0 text-sm font-semibold text-text-primary">
          <span className="ticker">{hub}</span> basket
        </h4>
        <span className="text-xs text-text-muted">
          C{cluster.id} · <span className="num">{cluster.size}</span> tickers · <span className="num">{cluster.internal_edges}</span> edges
        </span>
      </div>

      {/* Member chips, sized by mention count */}
      <div className="flex flex-wrap items-center gap-1">
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
              className="num inline-flex items-center gap-1 rounded-md px-2 py-0.5 text-xs font-semibold transition-colors hover:brightness-110"
              style={{
                color: c === "var(--text-muted)" ? "var(--text-secondary)" : c,
                background: `color-mix(in srgb, ${c} 14%, var(--bg-card))`,
              }}
              title={`${ns.mentions} mentions · ${ns.bullish}B / ${ns.bearish}S`}
            >
              {t}
              <span className="font-normal text-text-muted">{ns.mentions}</span>
            </button>
          );
        })}
      </div>

      {/* Top internal pair edges */}
      {internalPairs.length > 0 && (
        <div className="num text-xs text-text-muted">
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
    <div className="space-y-6">
      {/* Window selector */}
      <div className="flex flex-wrap items-center gap-3">
        <Segmented
          ariaLabel="Patterns window"
          value={String(windowDays)}
          onChange={(v) => onWindowChange(Number(v))}
          options={WINDOWS.map((w) => ({ value: String(w.days), label: w.label }))}
        />
        {isFetching && (
          <span className="animate-pulse text-xs text-text-muted">Refreshing…</span>
        )}
      </div>

      {/* KPI strip */}
      {(top || cooc) && (
        <TileGrid>
          <Tile span={3}>
            {top ? (
              <button type="button" className="text-left" onClick={() => handlePick(top.ticker)} title={`Set ${top.ticker} as active ticker`}>
                <Kpi
                  label="Top momentum"
                  value={<span className="ticker">{top.ticker}</span>}
                  delta={`${top.delta >= 0 ? "+" : ""}${top.delta}`}
                  tone={toneOf(top.delta)}
                  sub={`mentions vs prior ${windowDays}d`}
                />
              </button>
            ) : (
              <Kpi label="Top momentum" value="—" />
            )}
          </Tile>
          <KpiTile label="Tickers" value={cooc?.n_tickers ?? "—"} sub={cooc ? `across ${cooc.n_tweets_considered} tweets` : undefined} />
          <KpiTile label="Pairs" value={cooc?.pairs.length ?? "—"} sub="co-mentioned together" />
          <KpiTile label="Baskets" value={cooc?.clusters.length ?? "—"} sub="greedy clusters" />
        </TileGrid>
      )}

      <TileGrid>
        <Tile span={7} title="Conviction velocity" meta={`mention delta vs prior ${windowDays}d · top 20`}>
          <VelocityTable rows={velocity.slice(0, 20)} onPick={handlePick} />
        </Tile>

        <Tile span={5} title="Co-occurrence baskets" meta="tickers mentioned together">
          {!cooc || cooc.clusters.length === 0 ? (
            <div className="py-4 text-sm text-text-muted">
              No clusters yet — needs at least 2 tweets each mentioning 2+ tickers.
            </div>
          ) : (
            <div className="divide-y divide-border">
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
            <details className="border-t border-border pt-2.5">
              <summary className="cursor-pointer text-xs text-text-muted hover:text-text-primary">
                All pairs (top {Math.min(cooc.pairs.length, 30)})
              </summary>
              <div className="num mt-2 grid grid-cols-2 gap-x-6 text-xs">
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
                        <span className="mx-1 text-text-muted">↔</span>
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
        </Tile>
      </TileGrid>
    </div>
  );
}
