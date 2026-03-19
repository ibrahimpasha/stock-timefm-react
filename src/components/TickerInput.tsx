import { useState, useCallback, type KeyboardEvent } from "react";
import { Search } from "lucide-react";
import { useAppStore } from "../store/useAppStore";

interface TickerInputProps {
  className?: string;
}

export function TickerInput({ className = "" }: TickerInputProps) {
  const { activeTicker, setActiveTicker } = useAppStore();
  const [value, setValue] = useState(activeTicker);

  const submit = useCallback(() => {
    const cleaned = value.toUpperCase().trim();
    if (cleaned && cleaned !== activeTicker) {
      setActiveTicker(cleaned);
    }
    setValue(cleaned || activeTicker);
  }, [value, activeTicker, setActiveTicker]);

  const handleKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter") {
      submit();
    }
  };

  return (
    <div
      className={`flex items-center gap-2 rounded-lg border border-border bg-bg-card px-3 py-1.5 focus-within:border-accent-blue transition-colors ${className}`}
    >
      <Search size={16} className="text-text-muted shrink-0" />
      <input
        type="text"
        value={value}
        onChange={(e) => setValue(e.target.value.toUpperCase())}
        onBlur={submit}
        onKeyDown={handleKeyDown}
        placeholder="TICKER"
        className="bg-transparent border-none outline-none text-text-primary font-mono text-sm w-20 placeholder:text-text-muted"
        spellCheck={false}
        autoComplete="off"
      />
    </div>
  );
}
