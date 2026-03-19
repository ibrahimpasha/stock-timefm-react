import { useState, useCallback, type KeyboardEvent } from "react";
import { Plus, X, Star } from "lucide-react";
import { useAppStore } from "../../store/useAppStore";
import { DEFAULT_TICKER } from "../../lib/constants";

const DEFAULT_WATCHLIST = [DEFAULT_TICKER, "AAPL", "NVDA", "TSLA", "AMD"];

interface WatchlistSidebarProps {
  className?: string;
}

export function WatchlistSidebar({ className = "" }: WatchlistSidebarProps) {
  const { activeTicker, setActiveTicker } = useAppStore();
  const [watchlist, setWatchlist] = useState<string[]>(DEFAULT_WATCHLIST);
  const [inputValue, setInputValue] = useState("");

  const addTicker = useCallback(() => {
    const cleaned = inputValue.toUpperCase().trim();
    if (cleaned && !watchlist.includes(cleaned)) {
      setWatchlist((prev) => [...prev, cleaned]);
      setActiveTicker(cleaned);
    }
    setInputValue("");
  }, [inputValue, watchlist, setActiveTicker]);

  const removeTicker = useCallback(
    (ticker: string) => {
      setWatchlist((prev) => prev.filter((t) => t !== ticker));
      if (activeTicker === ticker && watchlist.length > 1) {
        const remaining = watchlist.filter((t) => t !== ticker);
        setActiveTicker(remaining[0]);
      }
    },
    [activeTicker, watchlist, setActiveTicker]
  );

  const handleKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter") addTicker();
  };

  return (
    <div className={`card ${className}`}>
      <div className="flex items-center gap-2 mb-3">
        <Star size={14} className="text-accent-orange" />
        <h2 className="text-sm font-semibold text-text-secondary">Watchlist</h2>
      </div>

      {/* Ticker chips */}
      <div className="space-y-1 mb-3">
        {watchlist.map((ticker) => (
          <div
            key={ticker}
            className={`flex items-center justify-between px-3 py-1.5 rounded-lg cursor-pointer transition-all text-sm font-mono group ${
              ticker === activeTicker
                ? "bg-accent-blue/15 border border-accent-blue/40 text-accent-blue"
                : "bg-bg-card-hover border border-transparent text-text-primary hover:border-border"
            }`}
            onClick={() => setActiveTicker(ticker)}
          >
            <span>{ticker}</span>
            <button
              onClick={(e) => {
                e.stopPropagation();
                removeTicker(ticker);
              }}
              className="opacity-0 group-hover:opacity-100 transition-opacity text-text-muted hover:text-accent-red"
              title={`Remove ${ticker}`}
            >
              <X size={12} />
            </button>
          </div>
        ))}
      </div>

      {/* Add ticker input */}
      <div className="flex items-center gap-1.5">
        <input
          type="text"
          value={inputValue}
          onChange={(e) => setInputValue(e.target.value.toUpperCase())}
          onKeyDown={handleKeyDown}
          placeholder="Add ticker..."
          className="flex-1 bg-bg-card-hover border border-border rounded-lg px-2.5 py-1.5 text-xs font-mono text-text-primary placeholder:text-text-muted outline-none focus:border-accent-blue transition-colors"
          spellCheck={false}
          autoComplete="off"
        />
        <button
          onClick={addTicker}
          disabled={!inputValue.trim()}
          className="p-1.5 rounded-lg bg-accent-blue/10 border border-accent-blue/30 text-accent-blue hover:bg-accent-blue/20 disabled:opacity-30 disabled:cursor-not-allowed transition-all"
        >
          <Plus size={14} />
        </button>
      </div>
    </div>
  );
}
