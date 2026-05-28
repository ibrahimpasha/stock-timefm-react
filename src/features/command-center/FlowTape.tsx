/**
 * FlowTape — horizontal scrolling marquee of unusual options activity.
 *
 * Pulls today's iFlow entries from /flow/iflow/entries (richer than the
 * /flow/alerts list, which is currently empty). Maps each entry into a
 * compact tape row showing premium, side, sweep/ask hints, and timing.
 * Pauses on hover.
 */
import { useState, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import apiClient from "../../api/client";
import { Tag } from "../../components/CCPrimitives";
import { STALE_TIMES } from "../../lib/constants";

interface IFlowEntry {
  ticker: string;
  strike: number | string;
  type: string;
  expiry: string;
  side: string;
  premium: string;
  vol_oi_ratio?: number;
  ask_pct?: number;
  flow_time?: string;
  underlying_price?: number;
}

function todayIso(): string {
  return new Date().toISOString().slice(0, 10);
}

function useTodayIFlow() {
  return useQuery<{ entries: IFlowEntry[] }>({
    queryKey: ["flow-tape", "iflow", todayIso()],
    queryFn: () => apiClient.get(`/flow/iflow/entries?date=${todayIso()}`).then((r) => r.data),
    staleTime: STALE_TIMES.flow,
    refetchInterval: 5 * 60_000,
  });
}

function parsePremiumNum(s: string): number {
  const c = (s || "").replace("$", "").replace(/,/g, "").trim();
  if (c.toUpperCase().endsWith("M")) return parseFloat(c) * 1e6;
  if (c.toUpperCase().endsWith("K")) return parseFloat(c) * 1e3;
  return parseFloat(c) || 0;
}

export function FlowTape() {
  const { data, isLoading } = useTodayIFlow();
  const [paused, setPaused] = useState(false);

  // Filter and rank: keep entries with size + signal, biggest premium first.
  const rows = useMemo(() => {
    const entries = data?.entries ?? [];
    return entries
      .filter((e) => e.ticker && e.premium && parsePremiumNum(e.premium) > 50_000)
      .sort((a, b) => parsePremiumNum(b.premium) - parsePremiumNum(a.premium))
      .slice(0, 60);
  }, [data]);

  const items = useMemo(() => [...rows, ...rows], [rows]);

  return (
    <>
      <style>{`
        @keyframes ccTapeScroll { from { transform: translateX(0); } to { transform: translateX(-50%); } }
        .cc-tape-track { animation: ccTapeScroll 240s linear infinite; }
        .cc-tape-track[data-paused="true"] { animation-play-state: paused; }
        @keyframes ccBlink { 0%, 100% { opacity: 1; } 50% { opacity: 0.35; } }
        .cc-live-dot { animation: ccBlink 1.6s ease-in-out infinite; }
      `}</style>
      <div
        onMouseEnter={() => setPaused(true)}
        onMouseLeave={() => setPaused(false)}
        style={{
          height: 36,
          background: "var(--bg-card)",
          border: "1px solid var(--border)",
          borderRadius: 8,
          display: "flex",
          alignItems: "center",
          position: "relative",
          overflow: "hidden",
        }}
      >
        <div
          style={{
            flexShrink: 0,
            padding: "0 12px",
            height: "100%",
            display: "flex",
            alignItems: "center",
            gap: 8,
            background: "rgba(22,27,34,0.6)",
            borderRight: "1px solid var(--border)",
            zIndex: 2,
          }}
        >
          <span
            className="cc-live-dot"
            style={{
              width: 6,
              height: 6,
              borderRadius: 3,
              background: "var(--accent-red)",
              boxShadow: "0 0 6px var(--accent-red)",
            }}
          />
          <span
            className="font-mono"
            style={{
              fontSize: 10,
              letterSpacing: 1.2,
              textTransform: "uppercase",
              color: "var(--text-primary)",
              fontWeight: 700,
            }}
          >
            Unusual Flow
          </span>
          <span className="font-mono" style={{ fontSize: 10, color: "var(--text-muted)" }}>
            · {rows.length} entries · {todayIso()}
          </span>
        </div>

        {isLoading ? (
          <div className="font-mono" style={{ paddingLeft: 12, fontSize: 10, color: "var(--text-muted)" }}>
            loading flow…
          </div>
        ) : rows.length === 0 ? (
          <div className="font-mono" style={{ paddingLeft: 12, fontSize: 10, color: "var(--text-muted)" }}>
            no qualifying flow today (waiting for iFlow fetcher)
          </div>
        ) : (
          <div
            className="cc-tape-track"
            data-paused={paused}
            style={{ display: "flex", alignItems: "center", height: "100%", whiteSpace: "nowrap", paddingLeft: 12 }}
          >
            {items.map((f, i) => {
              const sideUp = (f.side || "").toUpperCase();
              const bull = sideUp.includes("BULL");
              const sweep = (f.vol_oi_ratio ?? 0) >= 5;
              const aboveAsk = (f.ask_pct ?? 0) >= 75;
              const optType = (f.type || "").toUpperCase();
              return (
                <div
                  key={`${i}-${f.ticker}-${f.strike}`}
                  style={{
                    display: "inline-flex",
                    alignItems: "center",
                    gap: 8,
                    padding: "0 14px",
                    height: "100%",
                    borderRight: "1px solid var(--border)",
                  }}
                >
                  {f.flow_time && (
                    <span className="font-mono" style={{ color: "var(--text-muted)", fontSize: 10 }}>{f.flow_time}</span>
                  )}
                  <span className="font-mono" style={{ color: "var(--text-primary)", fontWeight: 700, fontSize: 12 }}>{f.ticker}</span>
                  <Tag color={bull ? "var(--accent-green)" : "var(--accent-red)"} border={bull ? "var(--accent-green)" : "var(--accent-red)"}>
                    {bull ? "BULL" : "BEAR"} {optType.includes("PUT") ? "PUT" : "CALL"}
                  </Tag>
                  <span className="font-mono" style={{ color: "var(--text-secondary)" }}>${f.strike}</span>
                  <span className="font-mono" style={{ color: "var(--text-muted)", fontSize: 10 }}>{f.expiry}</span>
                  {f.vol_oi_ratio != null && f.vol_oi_ratio > 0 && (
                    <span className="font-mono" style={{ color: "var(--accent-cyan)", fontSize: 10 }}>
                      {f.vol_oi_ratio.toFixed(1)}× v/OI
                    </span>
                  )}
                  <span className="font-mono" style={{ color: "var(--accent-blue)", fontWeight: 600 }}>{f.premium}</span>
                  {sweep && <Tag color="var(--accent-orange)" border="var(--accent-orange)">SWP</Tag>}
                  {aboveAsk && <Tag color="var(--accent-purple)" border="var(--accent-purple)">ASK</Tag>}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </>
  );
}
