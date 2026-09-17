import {
  useState,
  useMemo,
  useRef,
  useEffect,
  useCallback,
  useId,
  type KeyboardEvent,
} from "react";
import { Search } from "lucide-react";
import { useAppStore } from "../store/useAppStore";
import { useTickerNames } from "../api/tickerNames";

interface TickerSearchProps {
  className?: string;
  /** width of the text input (Tailwind width class) */
  inputWidth?: string;
}

interface Match {
  ticker: string;
  name: string;
  score: number;
}

const MAX_RESULTS = 8;

/**
 * Ticker box that resolves by symbol OR company name. Type "apple" or "appl"
 * and it surfaces AAPL. Backed by the `ticker_names` map (useTickerNames).
 * Selecting a row — click, Enter, or arrow + Enter — sets the global
 * activeTicker. Falls back to treating the raw input as a symbol when nothing
 * in the map matches, so it never blocks a ticker we haven't named yet.
 */
export function TickerSearch({
  className = "",
  inputWidth = "w-56",
}: TickerSearchProps) {
  const activeTicker = useAppStore((s) => s.activeTicker);
  const setActiveTicker = useAppStore((s) => s.setActiveTicker);
  const { data: names } = useTickerNames();

  const [query, setQuery] = useState(activeTicker);
  const [open, setOpen] = useState(false);
  const [highlight, setHighlight] = useState(0);
  const wrapRef = useRef<HTMLDivElement>(null);
  const inputId = useId();
  const listboxId = `${inputId}-listbox`;
  const statusId = `${inputId}-status`;

  // Keep the box in sync when the ticker changes elsewhere (watchlist click, etc.)
  useEffect(() => {
    setQuery(activeTicker);
  }, [activeTicker]);

  const entries = useMemo(
    () => Object.entries(names ?? {}).map(([ticker, name]) => ({ ticker, name })),
    [names]
  );

  const matches = useMemo<Match[]>(() => {
    const raw = query.trim();
    if (!raw) return [];
    const q = raw.toUpperCase();
    const qLower = raw.toLowerCase();
    const out: Match[] = [];
    for (const e of entries) {
      const t = e.ticker;
      const nameLower = (e.name || "").toLowerCase();
      let score = -1;
      if (t === q) score = 100;
      else if (t.startsWith(q)) score = 90 - (t.length - q.length); // prefer shorter symbols
      else if (nameLower.startsWith(qLower)) score = 70;
      else if (t.includes(q)) score = 50;
      else if (nameLower.includes(qLower)) score = 40;
      if (score >= 0) out.push({ ticker: t, name: e.name, score });
    }
    out.sort((a, b) => b.score - a.score || a.ticker.localeCompare(b.ticker));
    return out.slice(0, MAX_RESULTS);
  }, [query, entries]);

  const choose = useCallback(
    (ticker: string) => {
      const cleaned = ticker.toUpperCase().trim();
      if (cleaned) {
        setActiveTicker(cleaned);
        setQuery(cleaned);
      }
      setOpen(false);
    },
    [setActiveTicker]
  );

  const commit = useCallback(() => {
    // Enter with no active highlight: take the best match, else the raw symbol.
    if (matches[highlight]) choose(matches[highlight].ticker);
    else if (matches[0]) choose(matches[0].ticker);
    else choose(query);
  }, [matches, highlight, choose, query]);

  const onKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      const wasOpen = open;
      setOpen(true);
      setHighlight((h) => (wasOpen ? Math.min(h + 1, matches.length - 1) : 0));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      const wasOpen = open;
      setOpen(true);
      setHighlight((h) => (wasOpen ? Math.max(h - 1, 0) : Math.max(matches.length - 1, 0)));
    } else if (e.key === "Home" && open) {
      e.preventDefault();
      setHighlight(0);
    } else if (e.key === "End" && open) {
      e.preventDefault();
      setHighlight(Math.max(matches.length - 1, 0));
    } else if (e.key === "Enter") {
      e.preventDefault();
      commit();
    } else if (e.key === "Escape") {
      e.preventDefault();
      setOpen(false);
    } else if (e.key === "Tab") {
      setOpen(false);
    }
  };

  // Close on outside click
  useEffect(() => {
    const onDown = (e: MouseEvent) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, []);

  return (
    <div ref={wrapRef} className={`relative ${className}`}>
      <label htmlFor={inputId} className="sr-only">
        Ticker or company
      </label>
      <div
        className="control-surface flex min-h-8 items-center gap-2 rounded-full border px-3 py-1.5 transition-colors"
        style={{ boxShadow: "var(--shadow-1)" }}
      >
        <Search size={16} className="text-text-muted shrink-0" aria-hidden="true" />
        <input
          id={inputId}
          type="text"
          role="combobox"
          aria-autocomplete="list"
          aria-expanded={open && matches.length > 0}
          aria-controls={listboxId}
          aria-activedescendant={
            open && matches[highlight] ? `${listboxId}-option-${highlight}` : undefined
          }
          aria-describedby={statusId}
          value={query}
          onChange={(e) => {
            setQuery(e.target.value);
            setOpen(true);
            setHighlight(0);
          }}
          onFocus={() => query.trim() && setOpen(true)}
          onKeyDown={onKeyDown}
          placeholder="Ticker or company"
          className={`bg-transparent border-none outline-none text-text-primary text-sm ${inputWidth} placeholder:text-text-muted`}
          spellCheck={false}
          autoComplete="off"
        />
      </div>

      <span id={statusId} className="sr-only" aria-live="polite">
        {open && query.trim()
          ? matches.length > 0
            ? `${matches.length} ticker suggestions available.`
            : "No ticker suggestions. Press Enter to use the typed symbol."
          : ""}
      </span>

      {open && matches.length > 0 && (
        <div
          id={listboxId}
          role="listbox"
          aria-label="Ticker suggestions"
          className="glass-strong absolute right-0 z-50 mt-1.5 w-[min(18rem,calc(100vw-1rem))] max-h-[min(20rem,60dvh)] overflow-y-auto py-1"
          style={{ boxShadow: "var(--shadow-3)" }}
        >
          {matches.map((m, i) => (
            <div
              key={m.ticker}
              id={`${listboxId}-option-${i}`}
              role="option"
              aria-selected={i === highlight}
              onMouseEnter={() => setHighlight(i)}
              // onMouseDown (not onClick) so it fires before the input's blur
              onMouseDown={(e) => {
                e.preventDefault();
                choose(m.ticker);
              }}
              className={`flex min-h-7 w-full cursor-pointer items-center gap-3 px-3 py-1.5 text-left transition-colors ${
                i === highlight ? "bg-bg-card-hover" : ""
              }`}
            >
              <span className="num text-sm text-text-primary w-14 shrink-0">
                {m.ticker}
              </span>
              <span className="text-xs text-text-muted truncate">{m.name}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
