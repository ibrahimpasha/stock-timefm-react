import { useEffect, useId, useMemo, useRef, useState, type KeyboardEvent, type ReactNode } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { Compass, CornerDownLeft, Moon, Search, TrendingUp, Wallet } from "lucide-react";
import { useTickerNames } from "../api/tickerNames";
import { rankTickers } from "../lib/tickerMatch";
import { useAppStore } from "../store/useAppStore";
import { useCommandPalette } from "../store/useCommandPalette";
import { useTheme } from "../store/useTheme";

const PAGES: [label: string, path: string][] = [
  ["Brief", "/"],
  ["Flow tape", "/flow"],
  ["Flow heat map", "/flow/heatmap"],
  ["Bounce board", "/flow/bounce"],
  ["Book scoreboard", "/books"],
  ["Book detail", "/books/traderjoe"],
  ["Flow Trader", "/books/flow-trader"],
  ["Flow intel", "/intel"],
  ["Voices", "/intel/voices"],
  ["News", "/intel/news"],
  ["Traders", "/traders"],
  ["Pillars", "/pillars"],
  ["Sector rotation", "/rotation"],
  ["GEX matrix", "/gex"],
  ["Bay Area map", "/map"],
];

const BOOKS: [label: string, key: string][] = [
  ["Steady", "steady"],
  ["Core", "core"],
  ["Flow Follow", "flowfollow"],
  ["Options Lab", "optionslab"],
  ["Gem Finder", "gemfinder"],
  ["Supercycle", "supercycle"],
  ["Conviction", "conviction"],
  ["Smart (retired)", "smart"],
  ["Aggressive (retired)", "aggressive"],
  ["Builder (retired)", "builder"],
  ["Ruby (retired)", "ruby"],
];

const RECENT_KEY = "cmdk-recent-tickers";
const MAX_RECENT = 5;

function readRecent(): string[] {
  try {
    const parsed = JSON.parse(localStorage.getItem(RECENT_KEY) ?? "[]");
    return Array.isArray(parsed) ? parsed.filter((t) => typeof t === "string").slice(0, MAX_RECENT) : [];
  } catch {
    return [];
  }
}

function pushRecent(ticker: string) {
  try {
    localStorage.setItem(RECENT_KEY, JSON.stringify([ticker, ...readRecent().filter((t) => t !== ticker)].slice(0, MAX_RECENT)));
  } catch {
    /* recents are a convenience; private windows may block storage */
  }
}

interface Item {
  id: string;
  group: string;
  label: ReactNode;
  hint?: string;
  icon: ReactNode;
  run: () => void;
}

const isMac = typeof navigator !== "undefined" && /mac|iphone|ipad/i.test(navigator.platform);
export const PALETTE_SHORTCUT = isMac ? "⌘K" : "Ctrl K";

function PaletteBody({ close }: { close: () => void }) {
  const [query, setQuery] = useState("");
  const [cursor, setCursor] = useState(0);
  const { data: names } = useTickerNames();
  const setActiveTicker = useAppStore((s) => s.setActiveTicker);
  const toggleTheme = useTheme((s) => s.toggle);
  const theme = useTheme((s) => s.theme);
  const navigate = useNavigate();
  const { pathname } = useLocation();
  const listId = useId();
  const listRef = useRef<HTMLDivElement>(null);

  const items = useMemo<Item[]>(() => {
    const openTicker = (ticker: string) => () => {
      pushRecent(ticker);
      setActiveTicker(ticker);
      // The analysis panel lives on the desk pages; phones open a ticker through the Flow list.
      const onDesk = pathname === "/" || /^\/(flow|books|intel)(\/|$)/.test(pathname);
      if (!onDesk || window.matchMedia("(max-width: 1023px)").matches) navigate("/flow");
      close();
    };
    const go = (path: string) => () => {
      navigate(path);
      close();
    };
    const ticker = (t: string, name?: string, group = "Tickers"): Item => ({
      id: `ticker-${t}`,
      group,
      label: <span className="ticker">{t}</span>,
      hint: name,
      icon: <TrendingUp size={15} aria-hidden="true" />,
      run: openTicker(t),
    });
    const q = query.trim().toLowerCase();
    const matches = (label: string) => !q || label.toLowerCase().includes(q);
    const tickers: Item[] = q
      ? rankTickers(names ?? {}, query, 6).map((m) => ticker(m.ticker, m.name))
      : readRecent().map((t) => ticker(t, names?.[t], "Recent"));
    // Last resort, after pages and books: a symbol we have no name for yet.
    const exact = query.trim().toUpperCase();
    const fallback: Item[] =
      q && /^[A-Z][A-Z0-9.-]{0,6}$/.test(exact) && !tickers.some((i) => i.id === `ticker-${exact}`)
        ? [ticker(exact, "Open this symbol")]
        : [];
    const pages: Item[] = PAGES.filter(([label]) => matches(label)).map(([label, path]) => ({
      id: `page-${path}`,
      group: "Pages",
      label,
      icon: <Compass size={15} aria-hidden="true" />,
      run: go(path),
    }));
    const books: Item[] = q
      ? BOOKS.filter(([label]) => matches(label)).map(([label, key]) => ({
          id: `book-${key}`,
          group: "Books",
          label,
          icon: <Wallet size={15} aria-hidden="true" />,
          run: go(`/books/traderjoe?book=${key}`),
        }))
      : [];
    const themeLabel = `Switch to ${theme === "dark" ? "light" : "dark"} theme`;
    const actions: Item[] = matches(themeLabel)
      ? [{
          id: "action-theme",
          group: "Actions",
          label: themeLabel,
          icon: <Moon size={15} aria-hidden="true" />,
          run: () => {
            toggleTheme();
            close();
          },
        }]
      : [];
    return [...tickers, ...pages, ...books, ...actions, ...fallback];
  }, [query, names, pathname, navigate, setActiveTicker, close, toggleTheme, theme]);

  const active = Math.min(cursor, Math.max(items.length - 1, 0));

  useEffect(() => {
    listRef.current?.querySelector('[aria-selected="true"]')?.scrollIntoView({ block: "nearest" });
  }, [active]);

  const onKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setCursor((active + 1) % Math.max(items.length, 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setCursor((active - 1 + items.length) % Math.max(items.length, 1));
    } else if (e.key === "Home" && !query) {
      e.preventDefault();
      setCursor(0);
    } else if (e.key === "End" && !query) {
      e.preventDefault();
      setCursor(Math.max(items.length - 1, 0));
    } else if (e.key === "Enter") {
      e.preventDefault();
      items[active]?.run();
    }
  };

  let lastGroup = "";
  return (
    <>
      <div className="cmdk__search">
        <Search size={16} aria-hidden="true" className="shrink-0 text-text-muted" />
        <input
          autoFocus
          role="combobox"
          aria-label="Search tickers, pages and books"
          aria-expanded="true"
          aria-controls={listId}
          aria-activedescendant={items[active] ? `${listId}-${items[active].id}` : undefined}
          aria-autocomplete="list"
          value={query}
          onChange={(e) => {
            setQuery(e.target.value);
            setCursor(0);
          }}
          onKeyDown={onKeyDown}
          placeholder="Ticker, company, page or book"
          spellCheck={false}
          autoComplete="off"
        />
        <kbd>Esc</kbd>
      </div>
      <div ref={listRef} id={listId} role="listbox" aria-label="Results" className="cmdk__list">
        {items.length === 0 && <p className="cmdk__empty">Nothing matches “{query.trim()}”. Try a ticker symbol or company name.</p>}
        {items.map((item, i) => {
          const header = item.group !== lastGroup ? item.group : null;
          lastGroup = item.group;
          return (
            <div key={item.id} role="presentation">
              {header && <div className="cmdk__group" role="presentation">{header}</div>}
              <div
                id={`${listId}-${item.id}`}
                role="option"
                aria-selected={i === active}
                className="cmdk__item"
                onMouseMove={() => i !== active && setCursor(i)}
                onClick={item.run}
              >
                <span className="cmdk__icon">{item.icon}</span>
                <span className="cmdk__label">{item.label}</span>
                {item.hint && <span className="cmdk__hint">{item.hint}</span>}
                {i === active && <CornerDownLeft size={13} aria-hidden="true" className="ml-auto shrink-0 text-text-muted max-lg:hidden" />}
              </div>
            </div>
          );
        })}
      </div>
    </>
  );
}

/** Global jump box: Ctrl/Cmd+K or "/" from anywhere. Uses the native dialog so focus
 *  trapping, Escape and top-layer stacking all come from the platform. */
export function CommandPalette() {
  const open = useCommandPalette((s) => s.open);
  const setOpen = useCommandPalette((s) => s.setOpen);
  const dialog = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    const el = dialog.current;
    if (!el) return;
    if (open && !el.open) el.showModal();
    if (!open && el.open) el.close();
  }, [open]);

  // Escape closes the dialog natively; keep the store in step so the next shortcut opens it.
  useEffect(() => {
    const el = dialog.current;
    if (!el) return;
    const onClose = () => setOpen(false);
    el.addEventListener("close", onClose);
    return () => el.removeEventListener("close", onClose);
  }, [setOpen]);

  useEffect(() => {
    const onKeyDown = (e: globalThis.KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      const typing = !!target && (/^(INPUT|TEXTAREA|SELECT)$/.test(target.tagName) || target.isContentEditable);
      if ((e.key.toLowerCase() === "k" && (e.metaKey || e.ctrlKey)) || (e.key === "/" && !typing && !e.metaKey && !e.ctrlKey && !e.altKey)) {
        e.preventDefault();
        setOpen(!dialog.current?.open);
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [setOpen]);

  return (
    <dialog
      ref={dialog}
      className="cmdk"
      aria-label="Search and jump"
      onClick={(e) => {
        if (e.target === dialog.current) setOpen(false);
      }}
    >
      {open && <div className="cmdk__panel"><PaletteBody close={() => setOpen(false)} /></div>}
    </dialog>
  );
}
