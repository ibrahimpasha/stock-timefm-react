import { Play, Loader2, ToggleLeft, ToggleRight } from "lucide-react";

type ForecastType = "daily" | "intraday";

interface ForecastActionsProps {
  forecastType: ForecastType;
  onToggleType: (type: ForecastType) => void;
  onRunForecast: () => void;
  isLoading: boolean;
  selectedModelCount: number;
  className?: string;
}

export function ForecastActions({
  forecastType,
  onToggleType,
  onRunForecast,
  isLoading,
  selectedModelCount,
  className = "",
}: ForecastActionsProps) {
  return (
    <div
      className={`flex items-center justify-between gap-4 ${className}`}
    >
      {/* Forecast type toggle */}
      <div className="flex items-center gap-2">
        <button
          onClick={() => onToggleType("daily")}
          className={`px-3 py-1.5 rounded-lg text-xs font-mono transition-all ${
            forecastType === "daily"
              ? "bg-accent-blue/15 border border-accent-blue/40 text-accent-blue"
              : "border border-border text-text-muted hover:text-text-secondary"
          }`}
        >
          Daily
        </button>
        <button
          onClick={() => onToggleType("intraday")}
          className={`px-3 py-1.5 rounded-lg text-xs font-mono transition-all ${
            forecastType === "intraday"
              ? "bg-accent-blue/15 border border-accent-blue/40 text-accent-blue"
              : "border border-border text-text-muted hover:text-text-secondary"
          }`}
        >
          Intraday
        </button>
      </div>

      {/* Run button */}
      <button
        onClick={onRunForecast}
        disabled={isLoading || selectedModelCount === 0}
        className="flex items-center gap-2 px-4 py-2 rounded-lg bg-accent-blue text-bg-primary font-semibold text-sm transition-all hover:brightness-110 disabled:opacity-40 disabled:cursor-not-allowed"
      >
        {isLoading ? (
          <>
            <Loader2 size={16} className="animate-spin" />
            Running {selectedModelCount} model{selectedModelCount !== 1 ? "s" : ""}...
          </>
        ) : (
          <>
            <Play size={16} />
            Run Forecast ({selectedModelCount})
          </>
        )}
      </button>
    </div>
  );
}
