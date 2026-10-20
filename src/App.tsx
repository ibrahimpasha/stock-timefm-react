import { lazy, Suspense, useState, type ElementType } from "react";
import { BrowserRouter, Routes, Route, NavLink, Navigate, useLocation } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  Activity,
  BarChart3,
  Blocks,
  Grid3X3,
  MapPinned,
  Menu,
  Moon,
  Newspaper,
  Orbit,
  Sun,
  Sunrise,
  Users,
  Wallet,
} from "lucide-react";
import { TickerSearch } from "./components/TickerSearch";
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

function Sidebar() {
  const { pathname } = useLocation();
  return (
    <aside className="app-sidebar" aria-label="Primary navigation">
      <NavLink to="/" className="app-brand" aria-label="Stock-TimeFM brief">
        <BarChart3 size={18} className="text-accent-blue" aria-hidden="true" />
        <span>Stock-TimeFM</span>
      </NavLink>
      <nav className="app-sidebar__nav">
        {NAV_GROUPS.map((group) => (
          <div key={group.label} className="app-sidebar__group">
            <span className="app-sidebar__label">{group.label}</span>
            {group.items.map(({ path, label, icon: Icon }) => (
              <NavLink
                key={path}
                to={path}
                className={`app-nav-item ${isActivePath(path, pathname) ? "app-nav-item--active" : ""}`}
              >
                <Icon size={16} aria-hidden="true" />
                <span>{label}</span>
              </NavLink>
            ))}
          </div>
        ))}
      </nav>
      <div className="app-sidebar__footer">
        <DataHealthStrip />
        <ThemeToggle />
      </div>
    </aside>
  );
}

function TopBar() {
  const { pathname } = useLocation();
  const current = ALL_NAV.find((item) => isActivePath(item.path, pathname))?.label ?? "Brief";
  return (
    <>
      <header className="app-topbar hidden lg:flex">
        <TickerSearch inputWidth="w-72" />
      </header>
      <header className="mobile-app-bar lg:hidden">
        <NavLink to="/" className="mobile-brand" aria-label="Stock-TimeFM brief">
          <BarChart3 size={18} className="shrink-0 text-accent-blue" aria-hidden="true" />
          <span className="truncate text-sm font-semibold text-text-primary">{current}</span>
        </NavLink>
        <div className="flex shrink-0 items-center">
          <DataHealthStrip />
          <ThemeToggle />
        </div>
      </header>
    </>
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
      <Sidebar />
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
