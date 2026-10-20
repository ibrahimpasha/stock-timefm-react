import { useEffect, useRef, useCallback, useMemo } from "react";
import {
  createChart,
  type IChartApi,
  type ISeriesApi,
  ColorType,
  LineStyle,
  CrosshairMode,
} from "lightweight-charts";
import { BarChart3 } from "lucide-react";
import type { OHLCV, ModelForecast, Prediction } from "../../lib/types";
import { MODEL_COLORS, MODEL_LABELS } from "../../lib/constants";
import { parseLocalDate, toLocalDateOnly } from "../../lib/dateOnly";
import { forecastPoints } from "../../lib/forecastSeries";

interface ChartOverlays {
  showMA: string[];       // e.g. ["MA20", "MA50"]
  showBB: boolean;
  showVWAP: boolean;
  showRSI: boolean;
  showMACD: boolean;
  showATR: boolean;
}

interface ForecastChartProps {
  historicalData: OHLCV[] | undefined;
  forecasts: ModelForecast[];
  selectedModels: string[];
  isLoading: boolean;
  actualPrices?: { date: string; price: number }[];
  forecastOrigin?: string;
  intraday?: boolean;
  overlays?: ChartOverlays;
  className?: string;
  /** Inner chart-canvas height in px. Default 420 — pass a smaller value
   *  for compact embeds (e.g., in side panels). The card itself adds
   *  ~50px more for legend + padding. */
  height?: number;
}

/** Convert YYYY-MM-DD to time value for lightweight-charts */
function toTime(dateStr: string) {
  return dateStr as unknown as import("lightweight-charts").Time;
}

/** Compute a simple moving average over close prices */
function computeMA(data: OHLCV[], period: number) {
  const result: { time: import("lightweight-charts").Time; value: number }[] = [];
  for (let i = period - 1; i < data.length; i++) {
    let sum = 0;
    for (let j = 0; j < period; j++) {
      sum += data[i - j].close;
    }
    result.push({ time: toTime(data[i].date), value: sum / period });
  }
  return result;
}

/** Generate future business dates starting from a date string */
function futureDates(startDate: string, count: number): string[] {
  const dates: string[] = [];
  const d = parseLocalDate(startDate);
  while (dates.length < count) {
    d.setDate(d.getDate() + 1);
    const day = d.getDay();
    if (day !== 0 && day !== 6) {
      dates.push(toLocalDateOnly(d));
    }
  }
  return dates;
}

/** Lightweight Charts requires strictly ascending, unique times. Forecast
 * APIs may include the origin candle as prediction[0], so keep our observed
 * close as the sole origin point and deduplicate every future date. */
function pointsFromOrigin(
  originDate: string,
  originValue: number,
  dates: string[],
  values: number[],
) {
  return forecastPoints(dates, values, false, { time: originDate, value: originValue });
}

type PredictionWithBands = Prediction & {
  q10: number;
  q25: number;
  q75: number;
  q90: number;
};

function hasQuantileBands(
  predictions: Prediction[],
): predictions is PredictionWithBands[] {
  return predictions.length > 0 && predictions.every((prediction) =>
    [prediction.q10, prediction.q25, prediction.q75, prediction.q90].every(
      (value) => typeof value === "number" && Number.isFinite(value),
    ),
  );
}

export function ForecastChart({
  historicalData,
  forecasts,
  selectedModels,
  isLoading,
  actualPrices,
  forecastOrigin,
  intraday = false,
  overlays,
  className = "",
  height = 420,
}: ForecastChartProps) {
  const showMA = useMemo(() => overlays?.showMA ?? ["MA20", "MA50"], [overlays?.showMA]);
  const showBB = overlays?.showBB ?? false;
  const showRSI = overlays?.showRSI ?? false;
  const containerRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<IChartApi | null>(null);
  const seriesRefs = useRef<ISeriesApi<"Candlestick" | "Line" | "Histogram" | "Area">[]>([]);
  const chartHistory = useMemo(() => intraday ? [] : historicalData ?? [], [intraday, historicalData]);

  const buildChart = useCallback(() => {
    // Clean up previous chart
    if (chartRef.current) {
      chartRef.current.remove();
      chartRef.current = null;
      seriesRefs.current = [];
    }
    if (!containerRef.current || (!intraday && chartHistory.length === 0)) return;
    const historicalData = chartHistory;

    const chart = createChart(containerRef.current, {
      layout: {
        background: { type: ColorType.Solid, color: "transparent" },
        textColor: "#8b949e",
        fontFamily: "'JetBrains Mono', monospace",
        fontSize: 11,
      },
      grid: {
        vertLines: { color: "rgba(48, 54, 61, 0.2)" },
        horzLines: { color: "rgba(48, 54, 61, 0.2)" },
      },
      crosshair: {
        mode: CrosshairMode.Normal,
        vertLine: { color: "rgba(88, 166, 255, 0.3)", width: 1, style: LineStyle.Dashed },
        horzLine: { color: "rgba(88, 166, 255, 0.3)", width: 1, style: LineStyle.Dashed },
      },
      rightPriceScale: {
        borderColor: "rgba(48, 54, 61, 0.45)",
        scaleMargins: { top: 0.05, bottom: 0.2 },
      },
      timeScale: {
        borderColor: "rgba(48, 54, 61, 0.45)",
        timeVisible: intraday,
        rightOffset: 5,
      },
      handleScroll: { vertTouchDrag: false },
    });

    chartRef.current = chart;

    // --- Candlestick series ---
    const candleSeries = chart.addCandlestickSeries({
      upColor: "#3fb950",
      downColor: "#f85149",
      borderUpColor: "#3fb950",
      borderDownColor: "#f85149",
      wickUpColor: "#3fb950",
      wickDownColor: "#f85149",
    });

    const candleData = historicalData.map((d) => ({
      time: toTime(d.date),
      open: d.open,
      high: d.high,
      low: d.low,
      close: d.close,
    }));
    candleSeries.setData(candleData);
    seriesRefs.current.push(candleSeries);

    // --- Volume histogram ---
    const volumeSeries = chart.addHistogramSeries({
      priceFormat: { type: "volume" },
      priceScaleId: "volume",
    });

    chart.priceScale("volume").applyOptions({
      scaleMargins: { top: 0.85, bottom: 0 },
    });

    const volumeData = historicalData.map((d) => ({
      time: toTime(d.date),
      value: d.volume,
      color: d.close >= d.open ? "rgba(63,185,80,0.25)" : "rgba(248,81,73,0.25)",
    }));
    volumeSeries.setData(volumeData);
    seriesRefs.current.push(volumeSeries);

    // --- Moving Averages (configurable) ---
    const maConfig: Record<string, { period: number; color: string }> = {
      MA10: { period: 10, color: "#40e0d0" },
      MA20: { period: 20, color: "#ffa500" },
      MA50: { period: 50, color: "#bc8cff" },
      MA100: { period: 100, color: "#58a6ff" },
      MA200: { period: 200, color: "#f0c040" },
    };
    for (const maKey of showMA) {
      const cfg = maConfig[maKey];
      if (!cfg) continue;
      const maData = computeMA(historicalData, cfg.period);
      if (maData.length > 0) {
        const maSeries = chart.addLineSeries({
          color: cfg.color,
          lineWidth: 1,
          lineStyle: LineStyle.Solid,
          priceLineVisible: false,
          lastValueVisible: false,
          crosshairMarkerVisible: false,
          title: maKey,
        });
        maSeries.setData(maData);
        seriesRefs.current.push(maSeries);
      }
    }

    // --- Bollinger Bands (configurable) ---
    if (showBB && historicalData.length >= 20) {
      const bbPeriod = 20;
      const bbStd = 2;
      const bbUpper: { time: import("lightweight-charts").Time; value: number }[] = [];
      const bbLower: { time: import("lightweight-charts").Time; value: number }[] = [];
      for (let i = bbPeriod - 1; i < historicalData.length; i++) {
        let sum = 0;
        for (let j = 0; j < bbPeriod; j++) sum += historicalData[i - j].close;
        const mean = sum / bbPeriod;
        let sqSum = 0;
        for (let j = 0; j < bbPeriod; j++) sqSum += (historicalData[i - j].close - mean) ** 2;
        const std = Math.sqrt(sqSum / bbPeriod);
        bbUpper.push({ time: toTime(historicalData[i].date), value: mean + bbStd * std });
        bbLower.push({ time: toTime(historicalData[i].date), value: mean - bbStd * std });
      }
      const bbUpSeries = chart.addLineSeries({
        color: "rgba(139,148,158,0.4)", lineWidth: 1, lineStyle: LineStyle.Dotted,
        priceLineVisible: false, lastValueVisible: false, crosshairMarkerVisible: false,
      });
      const bbLoSeries = chart.addLineSeries({
        color: "rgba(139,148,158,0.4)", lineWidth: 1, lineStyle: LineStyle.Dotted,
        priceLineVisible: false, lastValueVisible: false, crosshairMarkerVisible: false,
      });
      bbUpSeries.setData(bbUpper);
      bbLoSeries.setData(bbLower);
      seriesRefs.current.push(bbUpSeries, bbLoSeries);
    }

    // --- RSI subplot (configurable) ---
    if (showRSI && historicalData.length >= 15) {
      const rsiPeriod = 14;
      const rsiData: { time: import("lightweight-charts").Time; value: number }[] = [];
      for (let i = rsiPeriod; i < historicalData.length; i++) {
        let gains = 0, losses = 0;
        for (let j = 0; j < rsiPeriod; j++) {
          const diff = historicalData[i - j].close - historicalData[i - j - 1].close;
          if (diff > 0) gains += diff; else losses -= diff;
        }
        const avgGain = gains / rsiPeriod;
        const avgLoss = losses / rsiPeriod;
        const rs = avgLoss === 0 ? 100 : avgGain / avgLoss;
        rsiData.push({ time: toTime(historicalData[i].date), value: 100 - 100 / (1 + rs) });
      }
      const rsiSeries = chart.addLineSeries({
        color: "#58a6ff", lineWidth: 1, priceScaleId: "rsi",
        priceLineVisible: false, lastValueVisible: true, crosshairMarkerVisible: false,
        title: "RSI",
      });
      chart.priceScale("rsi").applyOptions({
        scaleMargins: { top: 0.80, bottom: 0 },
      });
      rsiSeries.setData(rsiData);
      seriesRefs.current.push(rsiSeries);

    }

    // --- Forecast lines per model ---
    // Anchor to forecastOrigin if provided (saved forecast), else last candle date
    let originDate = historicalData.at(-1)?.date ?? "";
    if (forecastOrigin) {
      // Find the closest trading day on or before the origin in our data
      const match = historicalData
        .filter((d) => d.date <= forecastOrigin)
        .pop();
      if (match) originDate = match.date;
    }
    const lastDate = originDate;
    const lastClose = (
      historicalData.find((d) => d.date === originDate) ||
      historicalData[historicalData.length - 1]
    )?.close;

    const maskColor =
      getComputedStyle(containerRef.current).getPropertyValue("--bg-card").trim() || "#16181c";
    const visibleForecasts = forecasts.filter((f) =>
      selectedModels.includes(f.model)
    );

    for (const forecast of visibleForecasts) {
      const color = MODEL_COLORS[forecast.model] || "#8b949e";
      const responseDates = forecast.predictions.map((prediction) =>
        intraday ? prediction.timestamp : (prediction.timestamp || prediction.date || "").slice(0, 10),
      );
      const dates =
        responseDates.length === forecast.prices.length && responseDates.every(Boolean)
          ? responseDates
          : intraday ? [] : futureDates(lastDate, forecast.prices.length);
      const anchor = Number.isFinite(forecast.current_price) && forecast.current_price > 0
        ? forecast.current_price : lastClose;
      const points = (values: number[]) => intraday
        ? forecastPoints(dates, values, true)
        : pointsFromOrigin(lastDate, anchor ?? NaN, dates, values);

      // 80% range (q10-q90) as a shaded cone, NOT two more lines: drawn as
      // lines in the model color they read as extra forecasts pointing in
      // opposite directions. Fill = q90 area, then a q10 area painted in the
      // card background masks everything below q10 (future zone only, so it
      // hides no candles).
      if (forecast === visibleForecasts[0] && hasQuantileBands(forecast.predictions)) {
        const q90Data = points(forecast.predictions.map((prediction) => prediction.q90));
        const q10Data = points(forecast.predictions.map((prediction) => prediction.q10));
        const bandColor = `${color}2e`;
        const upper = chart.addAreaSeries({
          lineColor: `${color}66`,
          lineWidth: 1,
          lineStyle: LineStyle.Dotted,
          topColor: bandColor,
          bottomColor: bandColor,
          priceLineVisible: false,
          lastValueVisible: false,
          crosshairMarkerVisible: false,
        });
        const mask = chart.addAreaSeries({
          lineColor: `${color}66`,
          lineWidth: 1,
          lineStyle: LineStyle.Dotted,
          topColor: maskColor,
          bottomColor: maskColor,
          priceLineVisible: false,
          lastValueVisible: false,
          crosshairMarkerVisible: false,
        });
        upper.setData(q90Data);
        mask.setData(q10Data);
        seriesRefs.current.push(upper, mask);
      }

      // Forecast line (dotted)
      const forecastLine = chart.addLineSeries({
        color,
        lineWidth: 2,
        lineStyle: LineStyle.Dashed,
        priceLineVisible: false,
        lastValueVisible: true,
        crosshairMarkerVisible: true,
        title: MODEL_LABELS[forecast.model] || forecast.model,
      });

      const lineData = points(forecast.prices);
      forecastLine.setData(lineData);
      seriesRefs.current.push(forecastLine);
    }

    // --- Actual price line (white diamonds) ---
    if (actualPrices && actualPrices.length > 0) {
      const actualLine = chart.addLineSeries({
        color: "#ffffff",
        lineWidth: 2,
        lineStyle: LineStyle.Solid,
        priceLineVisible: false,
        lastValueVisible: true,
        crosshairMarkerVisible: true,
        title: "Actual",
      });
      const actualData = actualPrices.map((p) => ({
        time: toTime(p.date),
        value: p.price,
      }));
      actualLine.setData(actualData);

      // Add markers (diamond-like circles)
      actualLine.setMarkers(
        actualPrices.map((p) => ({
          time: toTime(p.date),
          position: "inBar" as const,
          color: "#ffffff",
          shape: "circle" as const,
          size: 1,
        }))
      );
      seriesRefs.current.push(actualLine);
    }

    // Daily: open on the last ~3 months plus the forecast so the 10-day
    // projection isn't a few pixels at the edge of a year of candles.
    // Scroll/zoom still reaches the full history.
    const horizon = Math.max(0, ...visibleForecasts.map((f) => f.prices.length));
    if (!intraday && historicalData.length > 70) {
      const last = historicalData.length - 1;
      chart.timeScale().setVisibleLogicalRange({ from: last - 65, to: last + horizon + 4 });
    } else {
      chart.timeScale().fitContent();
    }
  }, [chartHistory, intraday, forecasts, selectedModels, actualPrices, forecastOrigin, showMA, showBB, showRSI]);

  // Build chart whenever data changes
  useEffect(() => {
    buildChart();
  }, [buildChart]);

  // Responsive resize
  useEffect(() => {
    if (!containerRef.current || !chartRef.current) return;

    const observer = new ResizeObserver((entries) => {
      for (const entry of entries) {
        const { width, height } = entry.contentRect;
        if (chartRef.current && width > 0 && height > 0) {
          chartRef.current.applyOptions({ width, height });
        }
      }
    });

    observer.observe(containerRef.current);
    return () => observer.disconnect();
  }, [buildChart]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (chartRef.current) {
        chartRef.current.remove();
        chartRef.current = null;
      }
    };
  }, []);

  // Loading / empty state. NOTE: callers pass `[]` (not undefined) while a new
  // ticker's history is in flight, so check length too — otherwise a ticker
  // switch leaves the PREVIOUS ticker's chart frozen on screen until the fetch
  // lands. Showing the spinner makes the switch feel immediate.
  if (intraday ? forecasts.length === 0 : chartHistory.length === 0) {
    return (
      <div
        className={`flex items-center justify-center rounded-lg ${className}`}
        style={{ minHeight: `${height + 50}px`, background: "var(--track)" }}
      >
        {isLoading ? (
          <div className="flex flex-col items-center gap-3 text-text-muted">
            <div className="w-8 h-8 border-2 border-accent/30 border-t-accent rounded-full animate-spin" />
            <span className="text-sm">Loading chart data...</span>
          </div>
        ) : (
          <div className="text-center text-text-muted">
            <BarChart3 size={48} className="mx-auto mb-3 opacity-30" />
            <p className="text-sm">No chart data available</p>
          </div>
        )}
      </div>
    );
  }

  return (
    <div className={`flex min-w-0 flex-col gap-2.5 ${className}`}>
      {/* Chart legend */}
      <div className="flex flex-wrap items-center gap-x-4 gap-y-1">
        {!intraday && showMA.includes("MA20") && <span className="text-xs text-text-muted flex items-center gap-1.5">
          <span className="w-4 h-0.5 inline-block" style={{ backgroundColor: "#ffa500" }} />
          MA20
        </span>}
        {!intraday && showMA.includes("MA50") && <span className="text-xs text-text-muted flex items-center gap-1.5">
          <span className="w-4 h-0.5 inline-block" style={{ backgroundColor: "#bc8cff" }} />
          MA50
        </span>}
        {intraday && <span className="text-xs text-text-muted">Intraday forecast · historical bars unavailable</span>}
        {forecasts.some((f) => hasQuantileBands(f.predictions)) && <span className="text-xs text-text-muted">shaded = 80% likely range ({MODEL_LABELS[forecasts.find((f) => selectedModels.includes(f.model))?.model ?? ""] ?? "first model"})</span>}
        {forecasts
          .filter((f) => selectedModels.includes(f.model))
          .map((f) => (
            <span
              key={f.model}
              className="text-xs text-text-muted flex items-center gap-1.5"
            >
              <span
                className="w-4 h-0.5 inline-block"
                style={{
                  backgroundColor: MODEL_COLORS[f.model] || "#8b949e",
                  borderTop: "1px dashed",
                }}
              />
              {MODEL_LABELS[f.model] || f.model}
            </span>
          ))}
      </div>

      {/* Chart container */}
      <div
        ref={containerRef}
        className="w-full"
        style={{ height: `${height}px` }}
      />
    </div>
  );
}
