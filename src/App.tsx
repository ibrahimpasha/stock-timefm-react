import { lazy, Suspense, useEffect, useState, type ElementType } from "react";
import { BrowserRouter, Routes, Route, NavLink, Navigate, useLocation } from "react-router-dom";
import { QueryClient, QueryClientProvider, useIsFetching, useQuery } from "@tanstack/react-query";
import {
  Activity,
  Blocks,
  Grid3X3,
  MapPinned,
  Menu,
  Moon,
  Newspaper,
  Orbit,
  Search,
  Sun,
  Sunrise,
  Users,
  Wallet,
} from "lucide-react";
import { CommandPalette, PALETTE_SHORTCUT } from "./components/CommandPalette";
import { Tick } from "./components/Cockpit";
import { useCommandPalette } from "./store/useCommandPalette";
import { useSlidingPill } from "./lib/useSlidingPill";
import apiClient from "./api/client";
import { useAppStore } from "./store/useAppStore";
import { useTheme } from "./store/useTheme";
import { DataHealthStrip } from "./components/DataHealthStrip";
import { DataConnectionBanner } from "./components/DataConnectionBanner";

// Route-level code splitting — each page (and its heavy deps: leaflet on the
// map, the flow-analyzer suite on command center) loads on first visit
// instead of shipping one monolithic bundle to every visitor.
const DeskPage = lazy(() =>
  import("./pages/CommandCenterPage").then((m) => ({ default: m.DeskPage })),
);
const TraderLeaderboardPage = lazy(() =>
  import("./pages/TraderLeaderboardPage").then((m) => ({ default: m.TraderLeaderboardPage })),
);
const BayAreaMapPage = lazy(() =>
  import("./pages/BayAreaMapPage").then((m) => ({ default: m.BayAreaMapPage })),
);
const PillarsPage = lazy(() =>
  import("./pages/PillarsPage").then((m) => ({ default: m.PillarsPage })),
);
const RotationPage = lazy(() =>
  import("./pages/RotationPage").then((m) => ({ default: m.RotationPage })),
);
const GexMatrixPage = lazy(() =>
  import("./pages/GexMatrixPage").then((m) => ({ default: m.GexMatrixPage })),
);

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      refetchOnWindowFocus: false,
      retry: 2,
    },
  },
});


type NavItem = { path: string; label: string; icon: ElementType };

const NAV_GROUPS: { label: string; items: NavItem[] }[] = [
  {
    label: "Desk",
    items: [
      { path: "/", label: "Brief", icon: Sunrise },
      { path: "/flow", label: "Flow", icon: Activity },
      { path: "/books", label: "Books", icon: Wallet },
      { path: "/intel", label: "Intel", icon: Newspaper },
      { path: "/traders", label: "Traders", icon: Users },
    ],
  },
  {
    label: "Markets",
    items: [
      { path: "/pillars", label: "Pillars", icon: Blocks },
      { path: "/rotation", label: "Rotation", icon: Orbit },
      { path: "/gex", label: "GEX", icon: Grid3X3 },
      { path: "/map", label: "Map", icon: MapPinned },
    ],
  },
];

const ALL_NAV = NAV_GROUPS.flatMap((g) => g.items);
// Phone bottom bar: the four daily destinations plus a sheet for the rest.
const MOBILE_PRIMARY = ALL_NAV.slice(0, 4);
const MOBILE_MORE = ALL_NAV.slice(4);

function isActivePath(path: string, pathname: string) {
  return path === "/" ? pathname === "/" : pathname === path || pathname.startsWith(`${path}/`);
}

function SearchTrigger() {
  const setOpen = useCommandPalette((s) => s.setOpen);
  const ticker = useAppStore((s) => s.activeTicker);
  return (
    <button type="button" className="cmdk-trigger" onClick={() => setOpen(true)} aria-keyshortcuts="Control+K Meta+K /">
      <Search size={14} aria-hidden="true" className="shrink-0" />
      <span className="cmdk-trigger__text">{ticker || "Search"}</span>
      <kbd>{PALETTE_SHORTCUT}</kbd>
    </button>
  );
}

/** SPY and VIX on every page, so context never needs a trip to the Brief. */
function MarketPulse() {
  const { data } = useQuery<{ spy_price?: number; spy_change_pct?: number; vix?: number }>({
    queryKey: ["market-pulse"],
    queryFn: () => apiClient.get("/market/macro").then((r) => r.data),
    staleTime: 30_000,
    refetchInterval: 60_000,
  });
  if (data?.spy_price == null) return null;
  const change = data.spy_change_pct ?? 0;
  return (
    <div className="market-pulse">
      <span>SPY</span>
      <Tick value={data.spy_price.toFixed(2)}><span className="num text-text-primary">{data.spy_price.toFixed(2)}</span></Tick>
      <span className="num" style={{ color: change >= 0 ? "var(--accent-green)" : "var(--accent-red)" }}>
        {change >= 0 ? "+" : "−"}{Math.abs(change).toFixed(2)}%
      </span>
      {data.vix != null && (
        <span className="market-pulse__vix">
          <span className="ml-2">VIX</span>
          <Tick value={data.vix.toFixed(2)}><span className="num text-text-primary">{data.vix.toFixed(2)}</span></Tick>
        </span>
      )}
    </div>
  );
}

/** Thin bar while a page's data is loading for the first time. Background refreshes
 *  stay silent, and the CSS delay keeps fast loads from flickering it. */
function TopLoadBar() {
  const loading = useIsFetching({ predicate: (q) => q.state.data === undefined }) > 0;
  return <div className="top-load" data-on={loading || undefined} aria-hidden="true" />;
}

function TopBar() {
  const { pathname } = useLocation();
  const current = ALL_NAV.find((item) => isActivePath(item.path, pathname))?.label ?? "Brief";
  const setPaletteOpen = useCommandPalette((s) => s.setOpen);
  const { container, pill } = useSlidingPill<HTMLElement>(pathname);
  return (
    <>
      <header className="app-topnav hidden lg:flex">
        <NavLink to="/" className="app-brand" aria-label="Stock-TimeFM brief">
          <span className="app-brand__mark" aria-hidden="true">TF</span>
          <span className="app-brand__name">Stock-TimeFM</span>
        </NavLink>
        <nav ref={container} className="app-topnav__nav" aria-label="Primary navigation">
          <span ref={pill} className="sliding-pill nav-pill" aria-hidden="true" />
          {NAV_GROUPS.map((group, gi) => (
            <div key={group.label} className="app-topnav__group" aria-label={group.label}>
              {gi > 0 && <span className="app-topnav__divider" aria-hidden="true" />}
              {group.items.map(({ path, label }) => (
                <NavLink
                  key={path}
                  to={path}
                  data-pill={isActivePath(path, pathname) ? "on" : undefined}
                  className={`app-nav-item ${isActivePath(path, pathname) ? "app-nav-item--active" : ""}`}
                >
                  {label}
                </NavLink>
              ))}
            </div>
          ))}
        </nav>
        <div className="app-topnav__tools">
          <MarketPulse />
          <MarketClock />
          <SearchTrigger />
          <DataHealthStrip />
          <ThemeToggle />
        </div>
      </header>
      <header className="mobile-app-bar lg:hidden">
        <NavLink to="/" className="mobile-brand" aria-label="Stock-TimeFM brief">
          <span className="app-brand__mark" aria-hidden="true">TF</span>
          <span className="truncate text-sm font-semibold text-text-primary">{current}</span>
        </NavLink>
        <div className="flex shrink-0 items-center">
          <button
            type="button"
            onClick={() => setPaletteOpen(true)}
            aria-label="Search tickers, pages and books"
            className="flex min-h-11 min-w-11 items-center justify-center rounded-md text-text-secondary hover:bg-bg-card-hover hover:text-text-primary"
          >
            <Search size={17} aria-hidden="true" />
          </button>
          <DataHealthStrip />
          <ThemeToggle />
        </div>
      </header>
    </>
  );
}

const SESSIONS = [
  { from: 4 * 60, to: 9 * 60 + 30, label: "Pre-market", tone: "pre" },
  { from: 9 * 60 + 30, to: 16 * 60, label: "Market open", tone: "open" },
  { from: 16 * 60, to: 20 * 60, label: "After hours", tone: "post" },
] as const;

/** US equity session from the wall clock in New York.
 *  ponytail: ignores exchange holidays/half-days; wire a calendar if it matters. */
function marketSession(now: Date) {
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat("en-US", {
      timeZone: "America/New_York",
      weekday: "short",
      hour: "2-digit",
      minute: "2-digit",
      hourCycle: "h23",
    })
      .formatToParts(now)
      .map((p) => [p.type, p.value]),
  );
  const minutes = Number(parts.hour) * 60 + Number(parts.minute);
  const weekend = parts.weekday === "Sat" || parts.weekday === "Sun";
  const session = weekend ? undefined : SESSIONS.find((s) => minutes >= s.from && minutes < s.to);
  const left = session ? session.to - minutes : 0;
  return {
    label: session?.label ?? "Closed",
    tone: session?.tone ?? "closed",
    left: session ? `${Math.floor(left / 60)}h ${String(left % 60).padStart(2, "0")}m left` : "",
    clock: now.toLocaleTimeString("en-US", { timeZone: "America/New_York", hour: "numeric", minute: "2-digit" }),
  };
}

function MarketClock() {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const id = window.setInterval(() => setNow(new Date()), 30_000);
    return () => window.clearInterval(id);
  }, []);
  const s = marketSession(now);
  return (
    <div className="market-clock" data-tone={s.tone}>
      <span className="market-clock__dot" aria-hidden="true" />
      <span className="market-clock__label">{s.label}</span>
      <span className="num text-text-muted">{s.clock} ET</span>
      {s.left && <span className="text-text-muted">· {s.left}</span>}
    </div>
  );
}

function MobileNavigation() {
  const { pathname } = useLocation();
  // Keyed to the path it was opened on, so navigating closes it for free.
  const [moreOpenOn, setMoreOpenOn] = useState<string | null>(null);
  const moreOpen = moreOpenOn === pathname;
  const moreActive = MOBILE_MORE.some((item) => isActivePath(item.path, pathname));
  return (
    <>
      {moreOpen && (
        <div className="mobile-more-sheet lg:hidden" role="dialog" aria-label="More destinations">
          {MOBILE_MORE.map(({ path, label, icon: Icon }) => (
            <NavLink
              key={path}
              to={path}
              className={`mobile-more-sheet__item ${isActivePath(path, pathname) ? "mobile-more-sheet__item--active" : ""}`}
            >
              <Icon size={18} aria-hidden="true" />
              <span>{label}</span>
            </NavLink>
          ))}
        </div>
      )}
      <nav className="mobile-bottom-nav lg:hidden" aria-label="Primary navigation">
        {MOBILE_PRIMARY.map(({ path, label, icon: Icon }) => (
          <NavLink
            key={path}
            to={path}
            className={`mobile-bottom-nav__item ${isActivePath(path, pathname) ? "mobile-bottom-nav__item--active" : ""}`}
          >
            <Icon size={18} aria-hidden="true" />
            <span>{label}</span>
          </NavLink>
        ))}
        <button
          type="button"
          onClick={() => setMoreOpenOn(moreOpen ? null : pathname)}
          aria-expanded={moreOpen}
          className={`mobile-bottom-nav__item ${moreActive || moreOpen ? "mobile-bottom-nav__item--active" : ""}`}
        >
          <Menu size={18} aria-hidden="true" />
          <span>More</span>
        </button>
      </nav>
    </>
  );
}

/** Light / dark switch — flips the data-theme attribute on <html>, which swaps
 *  every CSS-var-driven surface at once. */
function ThemeToggle() {
  const theme = useTheme((s) => s.theme);
  const toggle = useTheme((s) => s.toggle);
  const isDark = theme === "dark";
  return (
    <button
      type="button"
      onClick={toggle}
      title={isDark ? "Switch to light mode" : "Switch to dark mode"}
      aria-label={isDark ? "Switch to light mode" : "Switch to dark mode"}
      aria-pressed={!isDark}
      className="flex min-h-11 min-w-11 shrink-0 items-center justify-center rounded-md text-text-secondary transition-colors hover:bg-bg-card-hover hover:text-text-primary lg:min-h-8 lg:min-w-8"
    >
      {isDark ? <Sun size={16} aria-hidden="true" /> : <Moon size={16} aria-hidden="true" />}
    </button>
  );
}

function AppLayout() {
  return (
    <div className="app-shell">
      <a href="#main-content" className="skip-link">
        Skip to main content
      </a>
      <TopLoadBar />
      <CommandPalette />
      <div className="app-column">
        <TopBar />
        <main id="main-content" tabIndex={-1} className="app-main mobile-content">
          <DataConnectionBanner />
          <Suspense
            fallback={
              <div className="page-loading" role="status" aria-live="polite">
                <span className="page-loading__bar" />
                <span className="page-loading__bar page-loading__bar--short" />
                <span className="sr-only">Loading workspace</span>
              </div>
            }
          >
            <Routes>
              <Route path="/" element={<DeskPage section="brief" />} />
              <Route path="/flow/:view?" element={<DeskPage section="flow" />} />
              <Route path="/books/:view?" element={<DeskPage section="books" />} />
              <Route path="/intel/:view?" element={<DeskPage section="intel" />} />
              {/* old bookmarks */}
              <Route path="/command-center" element={<Navigate to="/" replace />} />
              <Route path="/pillars" element={<PillarsPage />} />
              <Route path="/rotation" element={<RotationPage />} />
              <Route path="/gex" element={<GexMatrixPage />} />
              <Route path="/traders" element={<TraderLeaderboardPage />} />
              <Route path="/map" element={<BayAreaMapPage />} />
              <Route path="*" element={<Navigate to="/" replace />} />
            </Routes>
          </Suspense>
        </main>
      </div>
      <MobileNavigation />
    </div>
  );
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <BrowserRouter>
        <AppLayout />
      </BrowserRouter>
    </QueryClientProvider>
  );
}

export default App;
