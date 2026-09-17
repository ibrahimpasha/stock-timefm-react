import { lazy, Suspense, type ElementType } from "react";
import { BrowserRouter, Routes, Route, NavLink, useLocation } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  BarChart3,
  Blocks,
  Gauge,
  Grid3X3,
  MapPinned,
  Moon,
  Orbit,
  Sun,
  Users,
} from "lucide-react";
import { NAV_ITEMS } from "./lib/constants";
import { useTheme } from "./store/useTheme";
import { DataHealthStrip } from "./components/DataHealthStrip";
import { DataConnectionBanner } from "./components/DataConnectionBanner";

// Route-level code splitting — each page (and its heavy deps: leaflet on the
// map, the flow-analyzer suite on command center) loads on first visit
// instead of shipping one monolithic bundle to every visitor.
const CommandCenterPage = lazy(() =>
  import("./pages/CommandCenterPage").then((m) => ({ default: m.CommandCenterPage })),
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

const MOBILE_NAV = [
  { path: "/", label: "Desk", icon: Gauge },
  { path: "/pillars", label: "Pillars", icon: Blocks },
  { path: "/rotation", label: "Rotate", icon: Orbit },
  { path: "/gex", label: "GEX", icon: Grid3X3 },
  { path: "/traders", label: "Traders", icon: Users },
  { path: "/map", label: "Map", icon: MapPinned },
] as const;

const NAV_ICONS: Record<string, ElementType> = {
  "/": Gauge,
  "/command-center": Gauge,
  "/pillars": Blocks,
  "/rotation": Orbit,
  "/gex": Grid3X3,
  "/traders": Users,
  "/map": MapPinned,
};

function Navbar() {
  const location = useLocation();
  const currentSection =
    MOBILE_NAV.find((item) =>
      item.path === "/"
        ? location.pathname === "/" || location.pathname === "/command-center"
        : location.pathname.startsWith(item.path),
    )?.label ?? "Desk";

  return (
    <>
      <header className="mobile-app-bar lg:hidden">
        <NavLink
          to="/"
          className="mobile-brand"
          aria-label="Stock-TimeFM command center"
        >
          <BarChart3 size={19} className="shrink-0 text-accent-blue" aria-hidden="true" />
          <span className="min-w-0">
            <span className="block truncate text-sm font-bold text-text-primary">
              Stock-TimeFM
            </span>
            <span className="block truncate text-xs text-text-muted">{currentSection}</span>
          </span>
        </NavLink>

        <div className="flex shrink-0 items-center">
          <DataHealthStrip />
          <ThemeToggle />
        </div>
      </header>

      <header className="desktop-app-header hidden lg:block">
        <nav className="desktop-app-nav" aria-label="Primary navigation">
          <NavLink to="/" className="desktop-brand" aria-label="Stock-TimeFM command center">
            <BarChart3 size={20} className="text-accent-blue" aria-hidden="true" />
            <span className="text-sm font-bold text-text-primary">
              Stock-TimeFM
            </span>
          </NavLink>

          <div className="desktop-route-list">
            {NAV_ITEMS.map((item) => (
              (() => {
                const Icon = NAV_ICONS[item.path] ?? Gauge;
                return (
                  <NavLink
                    key={item.path}
                    to={item.path}
                    end={item.path === "/"}
                    className={({ isActive }) =>
                      `desktop-nav-item ${isActive ? "desktop-nav-item--active" : ""}`
                    }
                  >
                    <Icon size={15} aria-hidden="true" />
                    <span>{item.label}</span>
                  </NavLink>
                );
              })()
            ))}
          </div>

          <div className="ml-auto flex shrink-0 items-center">
            <DataHealthStrip />
            <ThemeToggle />
          </div>
        </nav>
      </header>
    </>
  );
}

function MobileNavigation() {
  const location = useLocation();
  return (
    <nav className="mobile-bottom-nav lg:hidden" aria-label="Primary navigation">
      {MOBILE_NAV.map((item) => {
        const Icon = item.icon;
        return (
          <NavLink
            key={item.path}
            to={item.path}
            end={item.path === "/"}
            className={({ isActive }) => {
              const active = isActive || (
                item.path === "/" && location.pathname === "/command-center"
              );
              return `mobile-bottom-nav__item ${active ? "mobile-bottom-nav__item--active" : ""}`;
            }}
            title={item.label}
          >
            <Icon size={18} aria-hidden="true" />
            <span>{item.label}</span>
          </NavLink>
        );
      })}
    </nav>
  );
}

/** Light / dark switch — flips the data-theme attribute on <html>, which swaps
 *  every CSS-var-driven surface at once. Pinned to the right of the navbar. */
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
      className="ml-auto flex min-h-11 min-w-11 shrink-0 items-center justify-center rounded-md text-text-secondary transition-colors hover:bg-bg-card-hover hover:text-text-primary lg:min-h-0 lg:min-w-0 lg:p-2"
    >
      {isDark ? <Sun size={18} aria-hidden="true" /> : <Moon size={18} aria-hidden="true" />}
    </button>
  );
}

function AppLayout() {
  return (
    <div className="app-shell min-h-screen min-w-0 flex flex-col bg-bg-primary">
      <a href="#main-content" className="skip-link">
        Skip to main content
      </a>
      <Navbar />
      <main
        id="main-content"
        tabIndex={-1}
        className="app-main mobile-content flex-1 min-w-0"
      >
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
            <Route path="/" element={<CommandCenterPage />} />
            {/* alias kept so old /command-center bookmarks still resolve */}
            <Route path="/command-center" element={<CommandCenterPage />} />
            <Route path="/pillars" element={<PillarsPage />} />
            <Route path="/rotation" element={<RotationPage />} />
            <Route path="/gex" element={<GexMatrixPage />} />
            <Route path="/traders" element={<TraderLeaderboardPage />} />
            <Route path="/map" element={<BayAreaMapPage />} />
          </Routes>
        </Suspense>
      </main>
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
