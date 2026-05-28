/**
 * TickerHero — replaces DecisionHero in CC v2. Expanded ticker presence:
 * identity + price/OHLCV + 52-week range + sparkline + forecast verdict
 * laid out in a single full-width band.
 *
 * Wires to existing Signal + MarketPrice types. range52, ohlc, marketCap
 * are optional — they degrade gracefully when the snapshot doesn't expose
 * them (which is the case today).
 */
import { TrendingUp, TrendingDown } from "lucide-react";
import type { Signal, MarketPrice } from "../../lib/types";
import { formatCurrency, formatPercentRaw } from "../../lib/utils";
import { DIRECTION_COLORS } from "../../lib/constants";
import { Sparkline, RangeBar, DotGauge, Tag, useSparkSeed } from "../../components/CCPrimitives";

interface TickerHeroProps {
  ticker: string;
  name?: string;
  sector?: string;
  signal: Signal | null;
  marketPrice: MarketPrice | null;
  range52?: [number, number];
  ohlc?: { open: number; high: number; low: number; vwap: number };
  marketCap?: string;
  isLoading?: boolean;
}

export function TickerHero({
  ticker,
  name,
  sector,
  signal,
  marketPrice,
  range52,
  ohlc,
  marketCap,
  isLoading,
}: TickerHeroProps) {
  const sparkPts = useSparkSeed(`${ticker}-hero`, 80, signal?.direction === "BEAR" ? -1.2 : 1.2);
  const price = marketPrice?.price;
  const dir = signal?.direction;
  const dirColor = dir ? DIRECTION_COLORS[dir] : "var(--text-muted)";

  if (isLoading) {
    return (
      <div className="card animate-pulse" style={{ height: 140 }}>
        <div className="h-full w-full rounded bg-text-muted/10" />
      </div>
    );
  }

  const range52pct =
    price !== undefined && range52
      ? ((price - range52[0]) / (range52[1] - range52[0])) * 100
      : null;

  return (
    <div
      className="card"
      style={{
        background: "linear-gradient(180deg, var(--bg-card) 0%, rgba(8,11,18,0.5) 100%)",
        padding: "14px 18px",
        display: "grid",
        gridTemplateColumns: "auto auto 1fr auto",
        gap: 28,
        alignItems: "center",
      }}
    >
      {/* identity */}
      <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
        <div style={{ display: "flex", alignItems: "baseline", gap: 10 }}>
          <span
            className="font-mono"
            style={{
              fontSize: 32,
              fontWeight: 700,
              letterSpacing: -0.5,
              color: "var(--text-primary)",
              lineHeight: 1,
            }}
          >
            {ticker}
          </span>
          {name && <span style={{ color: "var(--text-muted)", fontSize: 11 }}>{name}</span>}
        </div>
        <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
          {sector && <Tag color="var(--text-secondary)" border="var(--border)">{sector}</Tag>}
          {dir && (
            <Tag color={dirColor} border={dirColor} bg={`${dirColor}20`}>
              FORECAST · {dir}
            </Tag>
          )}
        </div>
      </div>

      {/* price block */}
      {marketPrice && (
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            gap: 4,
            borderLeft: "1px solid var(--border)",
            paddingLeft: 24,
          }}
        >
          <div style={{ display: "flex", alignItems: "baseline", gap: 10 }}>
            <span
              className="font-mono"
              style={{ fontSize: 36, fontWeight: 700, color: "var(--text-primary)", lineHeight: 1 }}
            >
              {formatCurrency(marketPrice.price)}
            </span>
            <span
              className="font-mono"
              style={{
                color: marketPrice.change_pct >= 0 ? "var(--accent-green)" : "var(--accent-red)",
                fontSize: 14,
                fontWeight: 600,
              }}
            >
              {marketPrice.change >= 0 ? "+" : ""}
              {formatCurrency(marketPrice.change)}
            </span>
            <span
              className="font-mono"
              style={{
                color: marketPrice.change_pct >= 0 ? "var(--accent-green)" : "var(--accent-red)",
                fontSize: 13,
                fontWeight: 600,
              }}
            >
              {formatPercentRaw(marketPrice.change_pct)}
            </span>
          </div>
          <div style={{ display: "flex", gap: 14, fontSize: 10 }}>
            {ohlc && (
              <>
                <span className="font-mono"><span style={{ color: "var(--text-muted)" }}>O</span> {ohlc.open.toFixed(2)}</span>
                <span className="font-mono"><span style={{ color: "var(--text-muted)" }}>H</span> <span style={{ color: "var(--accent-green)" }}>{ohlc.high.toFixed(2)}</span></span>
                <span className="font-mono"><span style={{ color: "var(--text-muted)" }}>L</span> <span style={{ color: "var(--accent-red)" }}>{ohlc.low.toFixed(2)}</span></span>
                <span className="font-mono"><span style={{ color: "var(--text-muted)" }}>VWAP</span> {ohlc.vwap.toFixed(2)}</span>
              </>
            )}
            {marketPrice.volume > 0 && (
              <span className="font-mono">
                <span style={{ color: "var(--text-muted)" }}>VOL</span> {(marketPrice.volume / 1e6).toFixed(1)}M
              </span>
            )}
            {marketCap && (
              <span className="font-mono">
                <span style={{ color: "var(--text-muted)" }}>MCAP</span> {marketCap}
              </span>
            )}
          </div>
        </div>
      )}

      {/* sparkline + 52w range */}
      <div style={{ display: "flex", flexDirection: "column", gap: 6, paddingLeft: 12, paddingRight: 24 }}>
        <Sparkline
          points={sparkPts}
          width={320}
          height={42}
          color={dir === "BEAR" ? "var(--accent-red)" : "var(--accent-green)"}
          fill
        />
        {range52 && price !== undefined && range52pct !== null && (
          <div style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 10 }}>
            <span className="font-mono" style={{ color: "var(--text-muted)" }}>{range52[0].toFixed(2)}</span>
            <div style={{ flex: 1 }}>
              <RangeBar low={range52[0]} high={range52[1]} last={price} width="100%" />
            </div>
            <span className="font-mono" style={{ color: "var(--text-muted)" }}>{range52[1].toFixed(2)}</span>
            <span className="font-mono" style={{ color: "var(--text-secondary)", marginLeft: 4 }}>
              52W · {range52pct.toFixed(0)}%ile
            </span>
          </div>
        )}
      </div>

      {/* forecast verdict */}
      {signal && (
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            gap: 6,
            borderLeft: "1px solid var(--border)",
            paddingLeft: 24,
            minWidth: 280,
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            {dir === "BEAR" ? (
              <TrendingDown size={14} color={dirColor} />
            ) : (
              <TrendingUp size={14} color={dirColor} />
            )}
            <span
              className="font-mono"
              style={{ color: dirColor, fontSize: 18, fontWeight: 700, letterSpacing: 0.5 }}
            >
              {signal.direction} · 5d
            </span>
            <span className="font-mono" style={{ color: "var(--text-muted)", fontSize: 10 }}>
              {signal.agreeing}/{signal.total_models} models agree
            </span>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
            <DotGauge value={signal.confidence} color={dirColor} />
            <span
              className="font-mono"
              style={{
                fontSize: 22,
                fontWeight: 700,
                color: "var(--text-primary)",
                lineHeight: 1,
              }}
            >
              {signal.confidence}
            </span>
            <div style={{ display: "flex", flexDirection: "column", fontSize: 9, lineHeight: 1.2 }}>
              <span style={{ color: "var(--text-muted)" }}>CONFIDENCE</span>
              <span style={{ color: "var(--text-secondary)" }}>FORECAST MOVE</span>
              <span className="font-mono" style={{ color: dirColor, fontWeight: 600, fontSize: 11 }}>
                {formatPercentRaw(signal.pct_move)}
              </span>
            </div>
          </div>
          <div style={{ display: "flex", gap: 14, fontSize: 10, marginTop: 4 }}>
            <span className="font-mono"><span style={{ color: "var(--text-muted)" }}>T1</span> <span style={{ color: dirColor }}>{formatCurrency(signal.t1)}</span></span>
            <span className="font-mono"><span style={{ color: "var(--text-muted)" }}>T2</span> <span style={{ color: dirColor }}>{formatCurrency(signal.t2)}</span></span>
            <span className="font-mono"><span style={{ color: "var(--text-muted)" }}>ENTRY</span> {formatCurrency(signal.entry_low)}–{formatCurrency(signal.entry_high)}</span>
          </div>
        </div>
      )}
    </div>
  );
}
