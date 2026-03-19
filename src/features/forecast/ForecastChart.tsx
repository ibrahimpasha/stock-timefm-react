import { useEffect, useRef, useCallback } from "react";
import {
  createChart,
  type IChartApi,
  type ISeriesApi,
  ColorType,
  LineStyle,
  CrosshairMode,
} from "lightweight-charts";
import { BarChart3 } from "lucide-react";
import type { OHLCV, ModelForecast } from "../../lib/types";
import { MODEL_COLORS, MODEL_LABELS } from "../../lib/constants";

interface ForecastChartProps {
  historicalData: OHLCV[] | undefined;
  forecasts: ModelForecast[];
  selectedModels: string[];
  isLoading: boolean;
  actualPrices?: { date: string; price: number }[];
  /** Date the forecast was generated (YYYY-MM-DD). Forecasts anchor from this date, not today. */
  forecastOrigin?: string;
  className?: string;
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
  const d = new Date(startDate);
  while (dates.length < count) {
    d.setDate(d.getDate() + 1);
    const day = d.getDay();
    if (day !== 0 && day !== 6) {
      dates.push(d.toISOString().split("T")[0]);
    }
  }
  return dates;
}

export function ForecastChart({
  historicalData,
  forecasts,
  selectedModels,
  isLoading,
  actualPrices,
  forecastOrigin,
  className = "",
}: ForecastChartProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<IChartApi | null>(null);
  const seriesRefs = useRef<ISeriesApi<"Candlestick" | "Line" | "Histogram" | "Area">[]>([]);

  const buildChart = useCallback(() => {
    if (!containerRef.current || !historicalData || historicalData.length === 0) return;

    // Clean up previous chart
    if (chartRef.current) {
      chartRef.current.remove();
      chartRef.current = null;
      seriesRefs.current = [];
    }

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
        timeVisible: false,
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

    // --- MA20 line ---
    const ma20Data = computeMA(historicalData, 20);
    if (ma20Data.length > 0) {
      const ma20Series = chart.addLineSeries({
        color: "#ffa500",
        lineWidth: 1,
        lineStyle: LineStyle.Solid,
        priceLineVisible: false,
        lastValueVisible: false,
        crosshairMarkerVisible: false,
      });
      ma20Series.setData(ma20Data);
      seriesRefs.current.push(ma20Series);
    }

    // --- MA50 line ---
    const ma50Data = computeMA(historicalData, 50);
    if (ma50Data.length > 0) {
      const ma50Series = chart.addLineSeries({
        color: "#bc8cff",
        lineWidth: 1,
        lineStyle: LineStyle.Solid,
        priceLineVisible: false,
        lastValueVisible: false,
        crosshairMarkerVisible: false,
      });
      ma50Series.setData(ma50Data);
      seriesRefs.current.push(ma50Series);
    }

    // --- Forecast lines per model ---
    // Anchor to forecastOrigin if provided (saved forecast), else last candle date
    let originDate = historicalData[historicalData.length - 1].date;
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
    ).close;

    const visibleForecasts = forecasts.filter((f) =>
      selectedModels.includes(f.model)
    );

    for (const forecast of visibleForecasts) {
      const color = MODEL_COLORS[forecast.model] || "#8b949e";
      const dates = futureDates(lastDate, forecast.prices.length);

      // Quantile bands (q10-q90 shading) if predictions have quantiles
      if (forecast.predictions && forecast.predictions.length > 0) {
        // Outer band (q10-q90)
        const q90Series = chart.addLineSeries({
          color: "transparent",
          lineWidth: 0,
          priceLineVisible: false,
          lastValueVisible: false,
          crosshairMarkerVisible: false,
        });
        const q10Series = chart.addLineSeries({
          color: "transparent",
          lineWidth: 0,
          priceLineVisible: false,
          lastValueVisible: false,
          crosshairMarkerVisible: false,
        });

        const q90Data = forecast.predictions.map((p, i) => ({
          time: toTime(dates[i] || lastDate),
          value: p.q90,
        }));
        const q10Data = forecast.predictions.map((p, i) => ({
          time: toTime(dates[i] || lastDate),
          value: p.q10,
        }));

        // Prepend the last historical close for continuity
        q90Data.unshift({ time: toTime(lastDate), value: lastClose });
        q10Data.unshift({ time: toTime(lastDate), value: lastClose });

        q90Series.setData(q90Data);
        q10Series.setData(q10Data);
        seriesRefs.current.push(q90Series, q10Series);

        // Inner band (q25-q75) as area
        const areaSeries = chart.addAreaSeries({
          topColor: `${color}18`,
          bottomColor: `${color}05`,
          lineColor: "transparent",
          lineWidth: 0,
          priceLineVisible: false,
          lastValueVisible: false,
          crosshairMarkerVisible: false,
        });

        const areaData = forecast.predictions.map((p, i) => ({
          time: toTime(dates[i] || lastDate),
          value: (p.q25 + p.q75) / 2,
        }));
        areaData.unshift({ time: toTime(lastDate), value: lastClose });
        areaSeries.setData(areaData);
        seriesRefs.current.push(areaSeries);
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

      const lineData = forecast.prices.map((price, i) => ({
        time: toTime(dates[i] || lastDate),
        value: price,
      }));
      // Start from last close for continuity
      lineData.unshift({ time: toTime(lastDate), value: lastClose });
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

    // Fit content
    chart.timeScale().fitContent();
  }, [historicalData, forecasts, selectedModels, actualPrices, forecastOrigin]);

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
  }, [historicalData]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (chartRef.current) {
        chartRef.current.remove();
        chartRef.current = null;
      }
    };
  }, []);

  // Loading state
  if (!historicalData) {
    return (
      <div className={`card min-h-[450px] flex items-center justify-center ${className}`}>
        {isLoading ? (
          <div className="flex flex-col items-center gap-3 text-text-muted">
            <div className="w-8 h-8 border-2 border-accent-blue/30 border-t-accent-blue rounded-full animate-spin" />
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
    <div className={`card ${className}`}>
      {/* Chart legend */}
      <div className="flex items-center gap-4 mb-2 flex-wrap">
        <span className="text-xs text-text-muted flex items-center gap-1.5">
          <span className="w-4 h-0.5 inline-block" style={{ backgroundColor: "#ffa500" }} />
          MA20
        </span>
        <span className="text-xs text-text-muted flex items-center gap-1.5">
          <span className="w-4 h-0.5 inline-block" style={{ backgroundColor: "#bc8cff" }} />
          MA50
        </span>
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
        style={{ height: "420px" }}
      />
    </div>
  );
}
