import { useState, useCallback, useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { useAppStore } from "../store/useAppStore";
import { useMarketPrice } from "../api/forecast";
import { useSignal, useGenerateSignal } from "../api/signals";
import apiClient from "../api/client";

import { FlowTape } from "../features/command-center/FlowTape";
import { TickerHero } from "../features/command-center/TickerHero";
import { ScanGrid } from "../features/command-center/ScanGrid";
import { IntelligencePanelV2 } from "../features/command-center/IntelligencePanelV2";

import { Search, Loader2, Zap, Command } from "lucide-react";

/* ── Ticker input + Analyze ─────────────────────────────── */

function AnalyzeBar({ onAnalyze, isAnalyzing }: { onAnalyze: () => void; isAnalyzing: boolean }) {
  const { activeTicker, setActiveTicker } = useAppStore();
  const [tickerInput, setTickerInput] = useState(activeTicker);

  useEffect(() => {
    setTickerInput(activeTicker);
  }, [activeTicker]);

  const handleSubmit = useCallback(() => {
    const cleaned = tickerInput.toUpperCase().trim();
    if (cleaned) {
      setActiveTicker(cleaned);
      setTickerInput(cleaned);
    }
  }, [tickerInput, setActiveTicker]);

  return (
    <div className="flex items-center gap-3">
      <div className="flex items-center gap-2 rounded-lg border border-border bg-bg-card px-3 py-2 focus-within:border-accent-blue transition-colors">
        <Search size={16} className="text-text-muted shrink-0" />
        <input
          type="text"
          value={tickerInput}
          onChange={(e) => setTickerInput(e.target.value.toUpperCase())}
          onBlur={handleSubmit}
          onKeyDown={(e) => { if (e.key === "Enter") handleSubmit(); }}
          placeholder="TICKER"
          className="bg-transparent border-none outline-none text-text-primary font-mono text-base w-24 placeholder:text-text-muted"
          spellCheck={false}
          autoComplete="off"
        />
      </div>
      <button
        onClick={onAnalyze}
        disabled={isAnalyzing}
        className="flex items-center gap-2 px-5 py-2 rounded-lg text-sm font-semibold bg-accent-purple/15 text-accent-purple hover:bg-accent-purple/25 border border-accent-purple/30 transition-all disabled:opacity-50"
      >
        {isAnalyzing ? <><Loader2 size={16} className="animate-spin" /> Analyzing...</> : <><Zap size={16} /> Analyze</>}
      </button>
    </div>
  );
}

/* ── Main Page ──────────────────────────────────────────── */

export function CommandCenterPageV2() {
  const ticker = useAppStore((s) => s.activeTicker);
  const setActiveTicker = useAppStore((s) => s.setActiveTicker);

  const { data: marketPrice } = useMarketPrice(ticker);
  const { data: signalResult, isLoading: signalLoading } = useSignal(ticker);
  const { data: snapshot } = useQuery({
    queryKey: ["cc-snapshot", ticker],
    queryFn: () => apiClient.get(`/command-center/snapshot?ticker=${ticker}`).then((r) => r.data),
    staleTime: 60_000,
    retry: 1,
  });

  const generateSignal = useGenerateSignal();
  const handleAnalyze = () => generateSignal.mutate(ticker);

  const signal = signalResult?.signal ?? null;
  const thesis = signalResult?.thesis ?? null;

  const isAnalyzing = generateSignal.isPending;
  const isSignalLoading = signalLoading || isAnalyzing;

  // Optional snapshot extras — TickerHero gracefully skips when undefined.
  const ohlc = snapshot?.live?.ohlc;
  const range52: [number, number] | undefined = snapshot?.context?.range_52w
    ? [snapshot.context.range_52w[0], snapshot.context.range_52w[1]]
    : undefined;
  const marketCap = snapshot?.context?.market_cap;
  const sector = snapshot?.context?.sector;
  const name = snapshot?.context?.name;

  return (
    <div className="space-y-4">
      {/* page header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Command size={22} className="text-accent-purple" />
          <h1 className="text-lg font-semibold text-text-primary">Command Center · v2</h1>
          <span className="font-mono text-base text-accent-blue">{ticker}</span>
        </div>
        <AnalyzeBar onAnalyze={handleAnalyze} isAnalyzing={isAnalyzing} />
      </div>

      {/* full-width unusual flow tape */}
      <FlowTape />

      {/* ticker hero band */}
      <TickerHero
        ticker={ticker}
        name={name}
        sector={sector}
        signal={signal}
        marketPrice={marketPrice ?? null}
        range52={range52}
        ohlc={ohlc}
        marketCap={marketCap}
        isLoading={isSignalLoading}
      />

      {/* main grid */}
      <div className="grid grid-cols-12 gap-4">
        {/* left: scan grid only.
            ActionPanel / ModelBreakdown / TrustScores removed 2026-05-24 per
            user — trade setup, options pick, targets, and the 100%-pegged
            confidence widget were noise. Intelligence panel covers the read. */}
        <div className="col-span-12 lg:col-span-8 space-y-4">
          <ScanGrid active={ticker} onPick={setActiveTicker} />
        </div>

        {/* right: intelligence v2 */}
        <div className="col-span-12 lg:col-span-4">
          <IntelligencePanelV2
            ticker={ticker}
            thesis={thesis}
            signal={signal}
            isLoading={isSignalLoading}
          />
        </div>
      </div>
    </div>
  );
}
