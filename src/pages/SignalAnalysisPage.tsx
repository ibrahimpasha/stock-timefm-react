import { useState } from "react";
import { useAppStore } from "../store/useAppStore";
import { useSignal, useGenerateSignal } from "../api/signals";
import { Target, Zap, History, ChevronDown, ChevronUp, Loader2 } from "lucide-react";
import {
  SignalHero,
  OptionPicks,
  LiveExecution,
  TargetProgress,
  ActionPlan,
  ProfitPlan,
  SignalThesis,
  PredictionVsActual,
  ModelBreakdownBars,
} from "../features/signal-analysis";

export function SignalAnalysisPage() {
  const ticker = useAppStore((s) => s.activeTicker);
  const { data: signalResult, isLoading } = useSignal(ticker);
  const generateSignal = useGenerateSignal();
  const [breakdownOpen, setBreakdownOpen] = useState(false);

  const signal = signalResult?.signal;
  const models = signalResult?.models ?? [];
  const thesis = signalResult?.thesis;
  const currentPrice = models.length > 0 ? models[0].current_price : 0;

  return (
    <div className="space-y-6">
      {/* Page header with actions */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Target size={24} className="text-accent-green" />
          <h1 className="text-xl font-semibold text-text-primary">
            Signal Analysis — {ticker}
          </h1>
        </div>
        <div className="flex items-center gap-3">
          <button
            className="flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-semibold transition-colors"
            style={{
              background: "var(--accent-green)",
              color: "#000",
            }}
            disabled={generateSignal.isPending}
            onClick={() => generateSignal.mutate(ticker)}
          >
            {generateSignal.isPending ? (
              <Loader2 size={14} className="animate-spin" />
            ) : (
              <Zap size={14} />
            )}
            Generate Signal
          </button>
          <button
            className="flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-semibold border transition-colors hover:bg-bg-card-hover"
            style={{
              borderColor: "var(--border)",
              color: "var(--text-secondary)",
            }}
            disabled={isLoading}
            onClick={() => {
              /* Load last signal is the default query behavior */
            }}
          >
            <History size={14} />
            Load Last Signal
          </button>
        </div>
      </div>

      {/* SignalHero */}
      <div className="grid grid-cols-12 gap-4">
        <div className="col-span-4">
          <SignalHero signal={signal} currentPrice={currentPrice} isLoading={isLoading} />
        </div>
        <div className="col-span-8">
          <OptionPicks signal={signal} isLoading={isLoading} />
        </div>
      </div>

      {/* Live Execution + Target Progress */}
      <div className="grid grid-cols-12 gap-4">
        <div className="col-span-6">
          <LiveExecution signal={signal} currentPrice={currentPrice} isLoading={isLoading} />
        </div>
        <div className="col-span-6">
          <TargetProgress signal={signal} currentPrice={currentPrice} isLoading={isLoading} />
        </div>
      </div>

      {/* Action Plan + Profit Plan | Signal Thesis */}
      <div className="grid grid-cols-12 gap-4">
        <div className="col-span-5 space-y-4">
          <ActionPlan signal={signal} isLoading={isLoading} />
          <ProfitPlan signal={signal} isLoading={isLoading} />
        </div>
        <div className="col-span-7">
          <SignalThesis thesis={thesis} isLoading={isLoading} />
        </div>
      </div>

      {/* Prediction vs Actual */}
      <PredictionVsActual
        signal={signal}
        currentPrice={currentPrice}
        forecastTimestamp={signalResult?.timestamp}
        isLoading={isLoading}
      />

      {/* Model Breakdown - collapsible */}
      <div>
        <button
          className="flex items-center gap-2 w-full px-4 py-3 rounded-lg text-sm font-semibold text-text-secondary hover:bg-bg-card-hover transition-colors"
          style={{ border: "1px solid var(--border)" }}
          onClick={() => setBreakdownOpen(!breakdownOpen)}
        >
          {breakdownOpen ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
          Model Forecast Breakdown
        </button>
        {breakdownOpen && (
          <div className="mt-2">
            <ModelBreakdownBars models={models} isLoading={isLoading} />
          </div>
        )}
      </div>
    </div>
  );
}
