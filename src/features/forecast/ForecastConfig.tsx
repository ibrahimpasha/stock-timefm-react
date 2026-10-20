import { useState } from "react";
import {
  Play,
  Loader2,
  ChevronDown,
  ChevronUp,
} from "lucide-react";
import { MODEL_LABELS, MODEL_COLORS } from "../../lib/constants";
import { todayLocalDate } from "../../lib/dateOnly";

// 2026-10-19 backtest verdict: no learned model beats the random walk on
// range accuracy (CRPS), and none calls direction better than "always up"
// (best edge -1pp, itransformer/timemixer -14/-17pp at 10d; consensus is
// worse). So the default view is the RW range only; learned models are
// research overlays. timexer is removed while its checkpoint fails to load
// (backend refuses it). Research order = CRPS rank vs RW.
const PRIMARY_MODELS = ["rw"];
const RESEARCH_MODELS = [
  "chronos2",
  "dlinear",
  "itransformer",
  "timemixer",
  "patchtst",
  "timesnet",
  "tide",
  "timesfm",
  "claude",
  "ensemble",
];
const AVAILABLE_MODELS = [...PRIMARY_MODELS, ...RESEARCH_MODELS];

/** Default view: the calibrated random-walk range — no directional call. */
export const DEFAULT_MODELS = [...PRIMARY_MODELS];

const INTERVALS = ["15m", "30m", "1h", "4h"] as const;

export interface ForecastSettings {
  forecastType: "daily" | "intraday";
  forecastDays: number;
  forecastMinutes: number;
  interval: string;
  historyDays: number;
  historyPeriod: string;
  selectedModels: string[];
  useCovariates: boolean;
  usePretrained: boolean;
  forecastOrigin: string; // YYYY-MM-DD
  showMA: string[];
  showBB: boolean;
  showVWAP: boolean;
  showRSI: boolean;
  showMACD: boolean;
  showATR: boolean;
}

interface ForecastConfigProps {
  settings: ForecastSettings;
  onChange: (settings: ForecastSettings) => void;
  onRunForecast: () => void;
  isLoading: boolean;
  /** Active ticker the forecast will run against. Passed in (instead of
   *  re-read from the store inside this component) so the button can show
   *  WHY it's disabled when nothing is selected. */
  ticker?: string;
}

export const DEFAULT_SETTINGS: ForecastSettings = {
  forecastType: "daily",
  forecastDays: 10,
  forecastMinutes: 480,
  interval: "4h",
  historyDays: 365,
  historyPeriod: "60d",
  selectedModels: DEFAULT_MODELS,
  useCovariates: true,
  usePretrained: true,
  forecastOrigin: todayLocalDate(),
  showMA: ["MA20", "MA50"],
  showBB: false,
  showVWAP: false,
  showRSI: true,
  showMACD: true,
  showATR: false,
};

/** Shared on/off pill for every toggle in this form — one accent, no rainbow. */
const pill = (on: boolean) =>
  `px-2 py-1 rounded-md text-xs font-medium transition-colors ${
    on
      ? "border border-accent-blue/40 bg-accent-blue/10 text-text-primary"
      : "border border-border text-text-muted hover:text-text-secondary"
  }`;
const fieldLabel = "text-xs text-text-muted mb-1 block";

export function ForecastConfig({
  settings,
  onChange,
  onRunForecast,
  isLoading,
  ticker = "",
}: ForecastConfigProps) {
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [showResearch, setShowResearch] = useState(
    () => settings.selectedModels.some((m) => !PRIMARY_MODELS.includes(m)),
  );
  const availableModels = AVAILABLE_MODELS.filter((model) => settings.forecastType === "daily" || model !== "ensemble");

  // The button looks enabled if you only check selectedModels, but the
  // handler also bails on empty ticker — making the click silently do
  // nothing. Compute the real reasons so we can surface them in the title.
  const noTicker = !ticker;
  const noModels = settings.selectedModels.length === 0;
  const runDisabled = isLoading || noTicker || noModels;
  const disabledReason = noTicker
    ? "Select a ticker first"
    : noModels
      ? "Select at least one model"
      : "";

  const update = (partial: Partial<ForecastSettings>) =>
    onChange({ ...settings, ...partial });

  const toggleModel = (model: string) => {
    const models = settings.selectedModels.includes(model)
      ? settings.selectedModels.filter((m) => m !== model)
      : [...settings.selectedModels, model];
    update({ selectedModels: models });
  };

  const selectAll = () => update({ selectedModels: [...availableModels] });
  const clearAll = () => update({ selectedModels: [] });

  const renderChip = (m: string) => {
    const selected = settings.selectedModels.includes(m);
    const color = MODEL_COLORS[m] || "var(--text-muted)";
    return (
      <button
        key={m}
        type="button"
        aria-pressed={selected}
        onClick={() => toggleModel(m)}
        className={`flex items-center gap-1.5 ${pill(selected)}`}
      >
        <span className="w-1.5 h-1.5 rounded-full" style={{ background: color, opacity: selected ? 1 : 0.5 }} />
        {MODEL_LABELS[m] || m}
      </button>
    );
  };

  return (
    <div className="card space-y-4">
      <h3 className="text-sm font-semibold text-text-primary">Forecast</h3>
      {/* Row 1: Type + Horizon + History + Origin */}
      <div className="grid grid-cols-2 gap-x-4 gap-y-3">
        {/* Forecast Type */}
        <div>
          <span className={fieldLabel}>Type</span>
          <div className="flex gap-1">
            {(["daily", "intraday"] as const).map((t) => (
              <button
                key={t}
                type="button"
                aria-pressed={settings.forecastType === t}
                onClick={() => update({
                  forecastType: t,
                  selectedModels:
                    t === "intraday" && settings.selectedModels.includes("ensemble")
                      ? settings.selectedModels.filter((model) => model !== "ensemble").concat(
                          settings.selectedModels.some((model) => model !== "ensemble") ? [] : ["rw"],
                        )
                      : settings.selectedModels,
                })}
                className={`flex-1 capitalize ${pill(settings.forecastType === t)}`}
              >
                {t}
              </button>
            ))}
          </div>
        </div>

        {/* Horizon */}
        <div>
          <label htmlFor="forecast-horizon" className={fieldLabel}>
            {settings.forecastType === "daily" ? "Horizon (days)" : "Minutes"}
          </label>
          {settings.forecastType === "daily" ? (
            <div className="flex items-center gap-2">
              <input
                id="forecast-horizon"
                type="range"
                min={1}
                max={30}
                value={settings.forecastDays}
                onChange={(e) =>
                  update({ forecastDays: Number(e.target.value) })
                }
                className="flex-1 accent-[var(--accent-blue)]"
              />
              <span className="num text-xs text-text-primary w-6 text-right">
                {settings.forecastDays}
              </span>
            </div>
          ) : (
            <div className="flex items-center gap-2">
              <input
                id="forecast-horizon"
                type="range"
                min={60}
                max={1920}
                step={60}
                value={settings.forecastMinutes}
                onChange={(e) =>
                  update({ forecastMinutes: Number(e.target.value) })
                }
                className="flex-1 accent-[var(--accent-blue)]"
              />
              <span className="num text-xs text-text-primary w-10 text-right">
                {settings.forecastMinutes}m
              </span>
            </div>
          )}
        </div>

        {/* History */}
        <div>
          <label htmlFor="forecast-history" className={fieldLabel}>
            {settings.forecastType === "daily" ? "History (days)" : "Interval"}
          </label>
          {settings.forecastType === "daily" ? (
            <div className="flex items-center gap-2">
              <input
                id="forecast-history"
                type="range"
                min={60}
                max={730}
                value={settings.historyDays}
                onChange={(e) =>
                  update({ historyDays: Number(e.target.value) })
                }
                className="flex-1 accent-[var(--accent-blue)]"
              />
              <span className="num text-xs text-text-primary w-8 text-right">
                {settings.historyDays}
              </span>
            </div>
          ) : (
            <select
              id="forecast-history"
              value={settings.interval}
              onChange={(e) => update({ interval: e.target.value })}
              className="w-full bg-bg-primary border border-border rounded-md px-2 py-1 text-xs num text-text-primary"
            >
              {INTERVALS.map((i) => (
                <option key={i} value={i}>
                  {i}
                </option>
              ))}
            </select>
          )}
        </div>

        {/* Forecast Origin */}
        <div>
          <label htmlFor="forecast-origin" className={fieldLabel}>
            Origin date
          </label>
          <input
            id="forecast-origin"
            type="date"
            value={settings.forecastOrigin}
            disabled={settings.forecastType === "intraday"}
            max={todayLocalDate()}
            onChange={(e) => update({ forecastOrigin: e.target.value })}
            className="w-full bg-bg-primary border border-border rounded-md px-2 py-1 text-xs num text-text-primary"
          />
        </div>
      </div>

      {/* Row 2: Models */}
      <div>
        <div className="flex items-center justify-between mb-2">
          <span className="text-xs text-text-muted">
            Models <span className="num">{settings.selectedModels.length}/{availableModels.length}</span>
          </span>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={selectAll}
              className="text-xs text-accent-blue hover:underline"
            >
              All
            </button>
            <button
              type="button"
              onClick={clearAll}
              className="text-xs text-text-muted hover:underline"
            >
              Clear
            </button>
          </div>
        </div>
        <div className="flex flex-wrap gap-1.5">
          {availableModels.filter((m) => PRIMARY_MODELS.includes(m)).map(renderChip)}
        </div>
        <button
          type="button"
          aria-expanded={showResearch}
          onClick={() => setShowResearch(!showResearch)}
          className="mt-2 flex items-center gap-1 text-xs text-text-muted hover:text-text-secondary transition-colors"
        >
          Research models
          {showResearch ? <ChevronUp size={12} /> : <ChevronDown size={12} />}
        </button>
        {showResearch && (
          <>
            <p className="max-w-[72ch] text-xs leading-relaxed text-text-muted mt-1 mb-2">
              No directional edge in backtest: none beat the random-walk range or an
              &ldquo;always up&rdquo; call. Overlays for research, not signals.
            </p>
            <div className="flex flex-wrap gap-1.5">
              {availableModels.filter((m) => !PRIMARY_MODELS.includes(m)).map(renderChip)}
            </div>
          </>
        )}
      </div>

      {/* Row 3: Advanced + Run */}
      <div className="flex items-center justify-between">
        <button
          type="button"
          aria-expanded={showAdvanced}
          onClick={() => setShowAdvanced(!showAdvanced)}
          className="flex items-center gap-1 text-xs text-text-muted hover:text-text-secondary transition-colors"
        >
          Advanced
          {showAdvanced ? <ChevronUp size={12} /> : <ChevronDown size={12} />}
        </button>

        <button
          type="button"
          onClick={onRunForecast}
          disabled={runDisabled}
          title={disabledReason || "Run forecast across selected models"}
          className="flex items-center gap-2 px-4 py-1.5 rounded-md bg-accent-blue text-bg-primary font-semibold text-sm transition-all hover:brightness-110 disabled:opacity-40 disabled:cursor-not-allowed"
        >
          {isLoading ? (
            <>
              <Loader2 size={14} className="animate-spin" />
              Running <span className="num">{settings.selectedModels.length}</span> models…
            </>
          ) : (
            <>
              <Play size={14} />
              Run forecast <span className="num">({settings.selectedModels.length})</span>
            </>
          )}
        </button>
      </div>
      {disabledReason && !isLoading && (
        <div className="text-xs text-text-muted text-right -mt-2">
          {disabledReason}
        </div>
      )}

      {/* Advanced settings panel */}
      {showAdvanced && (
        <div className="border-t border-border pt-3 grid grid-cols-2 gap-x-4 gap-y-3">
          {/* Toggles */}
          <div className="flex items-center justify-between">
            <span className="text-xs text-text-secondary">Covariates</span>
            <button
              type="button"
              role="switch"
              aria-label="Use covariates"
              aria-checked={settings.useCovariates}
              onClick={() =>
                update({ useCovariates: !settings.useCovariates })
              }
              className={`w-9 h-5 rounded-full transition-all ${
                settings.useCovariates ? "bg-accent-blue" : "bg-border"
              }`}
            >
              <div
                className={`w-4 h-4 rounded-full bg-text-primary transition-transform ${
                  settings.useCovariates ? "translate-x-4" : "translate-x-0.5"
                }`}
              />
            </button>
          </div>
          <div className="flex items-center justify-between">
            <span className="text-xs text-text-secondary">Pretrained</span>
            <button
              type="button"
              role="switch"
              aria-label="Use pretrained weights"
              aria-checked={settings.usePretrained}
              onClick={() =>
                update({ usePretrained: !settings.usePretrained })
              }
              className={`w-9 h-5 rounded-full transition-all ${
                settings.usePretrained ? "bg-accent-blue" : "bg-border"
              }`}
            >
              <div
                className={`w-4 h-4 rounded-full bg-text-primary transition-transform ${
                  settings.usePretrained ? "translate-x-4" : "translate-x-0.5"
                }`}
              />
            </button>
          </div>

          {/* Chart Overlays */}
          <div>
            <span className={fieldLabel}>Overlays</span>
            <div className="flex flex-wrap gap-1">
              {["MA20", "MA50", "MA100", "MA200"].map((ma) => (
                <button
                  key={ma}
                  type="button"
                  aria-pressed={settings.showMA.includes(ma)}
                  onClick={() => {
                    const showMA = settings.showMA.includes(ma)
                      ? settings.showMA.filter((m) => m !== ma)
                      : [...settings.showMA, ma];
                    update({ showMA });
                  }}
                  className={pill(settings.showMA.includes(ma))}
                >
                  {ma}
                </button>
              ))}
              <button
                type="button"
                aria-pressed={settings.showBB}
                onClick={() => update({ showBB: !settings.showBB })}
                className={pill(settings.showBB)}
              >
                BB
              </button>
              <button
                type="button"
                aria-pressed={settings.showVWAP}
                onClick={() => update({ showVWAP: !settings.showVWAP })}
                className={pill(settings.showVWAP)}
              >
                VWAP
              </button>
            </div>
          </div>

          {/* Indicators */}
          <div>
            <span className={fieldLabel}>Indicators</span>
            <div className="flex flex-wrap gap-1">
              {[
                { key: "showRSI" as const, label: "RSI" },
                { key: "showMACD" as const, label: "MACD" },
                { key: "showATR" as const, label: "ATR" },
              ].map(({ key, label }) => (
                <button
                  key={key}
                  type="button"
                  aria-pressed={settings[key]}
                  onClick={() => update({ [key]: !settings[key] })}
                  className={pill(settings[key])}
                >
                  {label}
                </button>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
