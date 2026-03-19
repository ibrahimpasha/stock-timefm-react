import { useState } from "react";
import {
  Play,
  Loader2,
  ChevronDown,
  ChevronUp,
  Calendar,
  Settings2,
} from "lucide-react";
import { MODEL_LABELS, MODEL_COLORS } from "../../lib/constants";

const AVAILABLE_MODELS = [
  "dlinear",
  "patchtst",
  "itransformer",
  "timemixer",
  "timexer",
  "timesnet",
];

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
}

export const DEFAULT_SETTINGS: ForecastSettings = {
  forecastType: "daily",
  forecastDays: 10,
  forecastMinutes: 480,
  interval: "4h",
  historyDays: 365,
  historyPeriod: "60d",
  selectedModels: ["dlinear", "itransformer", "timemixer", "timexer"],
  useCovariates: true,
  usePretrained: true,
  forecastOrigin: new Date().toISOString().split("T")[0],
  showMA: ["MA20", "MA50"],
  showBB: false,
  showVWAP: false,
  showRSI: true,
  showMACD: true,
  showATR: false,
};

export function ForecastConfig({
  settings,
  onChange,
  onRunForecast,
  isLoading,
}: ForecastConfigProps) {
  const [showAdvanced, setShowAdvanced] = useState(false);

  const update = (partial: Partial<ForecastSettings>) =>
    onChange({ ...settings, ...partial });

  const toggleModel = (model: string) => {
    const models = settings.selectedModels.includes(model)
      ? settings.selectedModels.filter((m) => m !== model)
      : [...settings.selectedModels, model];
    update({ selectedModels: models });
  };

  const selectAll = () => update({ selectedModels: [...AVAILABLE_MODELS] });
  const clearAll = () => update({ selectedModels: [] });

  return (
    <div className="card space-y-4">
      {/* Row 1: Type + Horizon + History */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {/* Forecast Type */}
        <div>
          <label className="text-[10px] uppercase tracking-wider text-text-muted mb-1 block">
            Type
          </label>
          <div className="flex gap-1">
            {(["daily", "intraday"] as const).map((t) => (
              <button
                key={t}
                onClick={() => update({ forecastType: t })}
                className={`flex-1 px-2 py-1.5 rounded text-xs font-mono capitalize transition-all ${
                  settings.forecastType === t
                    ? "bg-accent-blue/15 border border-accent-blue/40 text-accent-blue"
                    : "border border-border text-text-muted hover:text-text-secondary"
                }`}
              >
                {t}
              </button>
            ))}
          </div>
        </div>

        {/* Horizon */}
        <div>
          <label className="text-[10px] uppercase tracking-wider text-text-muted mb-1 block">
            {settings.forecastType === "daily" ? "Horizon (days)" : "Minutes"}
          </label>
          {settings.forecastType === "daily" ? (
            <div className="flex items-center gap-2">
              <input
                type="range"
                min={1}
                max={30}
                value={settings.forecastDays}
                onChange={(e) =>
                  update({ forecastDays: Number(e.target.value) })
                }
                className="flex-1 accent-[var(--accent-blue)]"
              />
              <span className="font-mono text-xs text-text-primary w-6 text-right">
                {settings.forecastDays}
              </span>
            </div>
          ) : (
            <div className="flex items-center gap-2">
              <input
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
              <span className="font-mono text-xs text-text-primary w-10 text-right">
                {settings.forecastMinutes}m
              </span>
            </div>
          )}
        </div>

        {/* History */}
        <div>
          <label className="text-[10px] uppercase tracking-wider text-text-muted mb-1 block">
            {settings.forecastType === "daily" ? "History (days)" : "Interval"}
          </label>
          {settings.forecastType === "daily" ? (
            <div className="flex items-center gap-2">
              <input
                type="range"
                min={60}
                max={730}
                value={settings.historyDays}
                onChange={(e) =>
                  update({ historyDays: Number(e.target.value) })
                }
                className="flex-1 accent-[var(--accent-blue)]"
              />
              <span className="font-mono text-xs text-text-primary w-8 text-right">
                {settings.historyDays}
              </span>
            </div>
          ) : (
            <select
              value={settings.interval}
              onChange={(e) => update({ interval: e.target.value })}
              className="w-full bg-bg-primary border border-border rounded px-2 py-1.5 text-xs font-mono text-text-primary"
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
          <label className="text-[10px] uppercase tracking-wider text-text-muted mb-1 flex items-center gap-1">
            <Calendar size={10} /> Origin Date
          </label>
          <input
            type="date"
            value={settings.forecastOrigin}
            onChange={(e) => update({ forecastOrigin: e.target.value })}
            className="w-full bg-bg-primary border border-border rounded px-2 py-1.5 text-xs font-mono text-text-primary"
          />
        </div>
      </div>

      {/* Row 2: Models */}
      <div>
        <div className="flex items-center justify-between mb-2">
          <label className="text-[10px] uppercase tracking-wider text-text-muted">
            Models ({settings.selectedModels.length}/{AVAILABLE_MODELS.length})
          </label>
          <div className="flex gap-2">
            <button
              onClick={selectAll}
              className="text-[10px] text-accent-blue hover:underline"
            >
              All
            </button>
            <button
              onClick={clearAll}
              className="text-[10px] text-text-muted hover:underline"
            >
              Clear
            </button>
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          {AVAILABLE_MODELS.map((m) => {
            const selected = settings.selectedModels.includes(m);
            const color = MODEL_COLORS[m] || "#8b949e";
            return (
              <button
                key={m}
                onClick={() => toggleModel(m)}
                className={`flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-mono transition-all ${
                  selected
                    ? "border-2"
                    : "border border-border text-text-muted opacity-50 hover:opacity-80"
                }`}
                style={
                  selected
                    ? {
                        borderColor: `${color}60`,
                        background: `${color}12`,
                        color,
                      }
                    : undefined
                }
              >
                <span
                  className="w-2 h-2 rounded-full"
                  style={{ background: color }}
                />
                {MODEL_LABELS[m] || m}
              </button>
            );
          })}
        </div>
      </div>

      {/* Row 3: Advanced + Run */}
      <div className="flex items-center justify-between">
        <button
          onClick={() => setShowAdvanced(!showAdvanced)}
          className="flex items-center gap-1 text-xs text-text-muted hover:text-text-secondary transition-colors"
        >
          <Settings2 size={12} />
          Advanced
          {showAdvanced ? <ChevronUp size={12} /> : <ChevronDown size={12} />}
        </button>

        <button
          onClick={onRunForecast}
          disabled={isLoading || settings.selectedModels.length === 0}
          className="flex items-center gap-2 px-5 py-2 rounded-lg bg-accent-blue text-bg-primary font-semibold text-sm transition-all hover:brightness-110 disabled:opacity-40 disabled:cursor-not-allowed"
        >
          {isLoading ? (
            <>
              <Loader2 size={16} className="animate-spin" />
              Running {settings.selectedModels.length} models...
            </>
          ) : (
            <>
              <Play size={16} />
              Run Forecast ({settings.selectedModels.length})
            </>
          )}
        </button>
      </div>

      {/* Advanced settings panel */}
      {showAdvanced && (
        <div className="border-t border-border pt-3 grid grid-cols-2 md:grid-cols-4 gap-4">
          {/* Toggles */}
          <div className="flex items-center justify-between">
            <span className="text-xs text-text-secondary">Covariates</span>
            <button
              onClick={() =>
                update({ useCovariates: !settings.useCovariates })
              }
              className={`w-9 h-5 rounded-full transition-all ${
                settings.useCovariates ? "bg-accent-green" : "bg-border"
              }`}
            >
              <div
                className={`w-4 h-4 rounded-full bg-white transition-transform ${
                  settings.useCovariates ? "translate-x-4" : "translate-x-0.5"
                }`}
              />
            </button>
          </div>
          <div className="flex items-center justify-between">
            <span className="text-xs text-text-secondary">Pretrained</span>
            <button
              onClick={() =>
                update({ usePretrained: !settings.usePretrained })
              }
              className={`w-9 h-5 rounded-full transition-all ${
                settings.usePretrained ? "bg-accent-green" : "bg-border"
              }`}
            >
              <div
                className={`w-4 h-4 rounded-full bg-white transition-transform ${
                  settings.usePretrained ? "translate-x-4" : "translate-x-0.5"
                }`}
              />
            </button>
          </div>

          {/* Chart Overlays */}
          <div>
            <span className="text-[10px] uppercase tracking-wider text-text-muted block mb-1">
              Overlays
            </span>
            <div className="flex flex-wrap gap-1">
              {["MA20", "MA50", "MA100", "MA200"].map((ma) => (
                <button
                  key={ma}
                  onClick={() => {
                    const showMA = settings.showMA.includes(ma)
                      ? settings.showMA.filter((m) => m !== ma)
                      : [...settings.showMA, ma];
                    update({ showMA });
                  }}
                  className={`px-1.5 py-0.5 rounded text-[10px] font-mono ${
                    settings.showMA.includes(ma)
                      ? "bg-accent-orange/20 text-accent-orange border border-accent-orange/30"
                      : "border border-border text-text-muted"
                  }`}
                >
                  {ma}
                </button>
              ))}
              <button
                onClick={() => update({ showBB: !settings.showBB })}
                className={`px-1.5 py-0.5 rounded text-[10px] font-mono ${
                  settings.showBB
                    ? "bg-accent-purple/20 text-accent-purple border border-accent-purple/30"
                    : "border border-border text-text-muted"
                }`}
              >
                BB
              </button>
              <button
                onClick={() => update({ showVWAP: !settings.showVWAP })}
                className={`px-1.5 py-0.5 rounded text-[10px] font-mono ${
                  settings.showVWAP
                    ? "bg-accent-cyan/20 text-accent-cyan border border-accent-cyan/30"
                    : "border border-border text-text-muted"
                }`}
              >
                VWAP
              </button>
            </div>
          </div>

          {/* Indicators */}
          <div>
            <span className="text-[10px] uppercase tracking-wider text-text-muted block mb-1">
              Indicators
            </span>
            <div className="flex flex-wrap gap-1">
              {[
                { key: "showRSI" as const, label: "RSI" },
                { key: "showMACD" as const, label: "MACD" },
                { key: "showATR" as const, label: "ATR" },
              ].map(({ key, label }) => (
                <button
                  key={key}
                  onClick={() => update({ [key]: !settings[key] })}
                  className={`px-1.5 py-0.5 rounded text-[10px] font-mono ${
                    settings[key]
                      ? "bg-accent-blue/20 text-accent-blue border border-accent-blue/30"
                      : "border border-border text-text-muted"
                  }`}
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
