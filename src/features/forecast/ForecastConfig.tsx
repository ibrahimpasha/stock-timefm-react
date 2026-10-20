import { useState } from "react";
import {
  Play,
  Loader2,
  ChevronDown,
  ChevronUp,
} from "lucide-react";
import { MODEL_LABELS, MODEL_COLORS } from "../../lib/constants";
import { todayLocalDate } from "../../lib/dateOnly";
import { CockpitButton } from "../../components/Cockpit";
import { Segmented } from "../../components/Glass";

// Default = six learned models side by side (user wants to see them all, not
// just one). The random-walk baseline is NOT offered in the UI (user: "don't
// want to see Random Walk Baseline"); it stays a backend benchmark. Only the
// first model draws a range cone (see ForecastChart) so the chart stays
// readable. timexer stays out while its checkpoint fails to load.
const PRIMARY_MODELS = ["chronos2", "timesfm", "timemixer", "patchtst", "itransformer", "dlinear"];
const RESEARCH_MODELS = ["timesnet", "tide", "claude", "ensemble"];
const AVAILABLE_MODELS = [...PRIMARY_MODELS, ...RESEARCH_MODELS];

/** Default view: the six primary models. */
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
  `min-h-8 px-2.5 py-1 rounded-md text-xs font-medium transition-colors ${
    on
      ? "border border-accent bg-accent text-[var(--accent-ink)]"
      : "border border-border text-text-muted hover:border-[var(--control-boundary)] hover:text-text-primary"
  }`;
const fieldLabel = "text-xs font-medium text-text-muted mb-1.5 block";

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
    <div className="flex flex-col gap-4">
      <p className="text-xs leading-relaxed text-text-muted">
        Six models by default; the shaded range belongs to the first one.
      </p>
      {/* Row 1: Type + Horizon + History + Origin */}
      <div className="grid grid-cols-2 gap-x-4 gap-y-3">
        {/* Forecast Type */}
        <div>
          <span className={fieldLabel}>Type</span>
          <Segmented<"daily" | "intraday">
            ariaLabel="Forecast type"
            className="w-full"
            options={[
              { value: "daily", label: "Daily" },
              { value: "intraday", label: "Intraday" },
            ]}
            value={settings.forecastType}
            onChange={(t) => update({
              forecastType: t,
              selectedModels:
                t === "intraday" && settings.selectedModels.includes("ensemble")
                  ? settings.selectedModels.filter((model) => model !== "ensemble").concat(
                      settings.selectedModels.some((model) => model !== "ensemble") ? [] : PRIMARY_MODELS,
                    )
                  : settings.selectedModels,
            })}
          />
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
                className="flex-1 accent-[var(--accent)]"
              />
              <span className="num text-sm font-semibold text-text-primary w-6 text-right">
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
                className="flex-1 accent-[var(--accent)]"
              />
              <span className="num text-sm font-semibold text-text-primary w-12 text-right">
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
                className="flex-1 accent-[var(--accent)]"
              />
              <span className="num text-sm font-semibold text-text-primary w-9 text-right">
                {settings.historyDays}
              </span>
            </div>
          ) : (
            <select
              id="forecast-history"
              value={settings.interval}
              onChange={(e) => update({ interval: e.target.value })}
              className="control-surface w-full min-h-8 border rounded-md px-2 py-1 text-xs num text-text-primary"
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
            className="control-surface w-full min-h-8 border rounded-md px-2 py-1 text-xs num text-text-primary"
          />
        </div>
      </div>

      {/* Row 2: Models */}
      <div>
        <div className="flex items-center justify-between mb-2">
          <span className="text-xs font-semibold text-text-secondary">
            Models <span className="num font-normal text-text-muted">{settings.selectedModels.length}/{availableModels.length}</span>
          </span>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={selectAll}
              className="text-xs font-medium text-accent hover:underline"
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
          More models
          {showResearch ? <ChevronUp size={12} /> : <ChevronDown size={12} />}
        </button>
        {showResearch && (
          <>
            <p className="max-w-[72ch] text-xs leading-relaxed text-text-muted mt-1 mb-2">
              Backtests show no model reliably calls direction; treat overlays as context, not signals.
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

        <CockpitButton
          primary
          onClick={onRunForecast}
          disabled={runDisabled}
          title={disabledReason || "Run forecast across selected models"}
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
        </CockpitButton>
      </div>
      {disabledReason && !isLoading && (
        <div className="text-xs text-text-muted text-right -mt-3">
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
                settings.useCovariates ? "bg-accent" : "bg-border"
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
                settings.usePretrained ? "bg-accent" : "bg-border"
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
