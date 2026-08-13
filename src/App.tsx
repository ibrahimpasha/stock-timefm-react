import { lazy, Suspense } from "react";
import { BrowserRouter, Routes, Route, NavLink } from "react-router-dom";
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

function Navbar() {
  return (
    <>
      <header className="mobile-app-bar lg:hidden">
        <div className="flex min-w-0 items-center gap-2">
          <BarChart3 size={19} className="shrink-0 text-accent-blue" aria-hidden="true" />
          <span className="truncate text-sm font-bold gradient-text">
            Stock-TimeFM
          </span>
        </div>

        <div className="flex items-center">
          <DataHealthStrip />
          <ThemeToggle />
        </div>
      </header>

      {/* Desktop keeps the full route rail and persistent system controls. */}
      <div className="sticky top-0 z-40 hidden px-4 pt-3 lg:block">
        <nav className="glass-strong flex items-center gap-1 px-4 py-2">
          <div className="mr-5 flex shrink-0 items-center gap-2">
            <BarChart3 size={20} className="text-accent-blue" aria-hidden="true" />
            <span className="text-sm font-bold gradient-text">
              Stock-TimeFM
            </span>
          </div>

          <div className="flex items-center gap-0.5">
            {NAV_ITEMS.map((item) => (
              <NavLink
                key={item.path}
                to={item.path}
                end={item.path === "/"}
                className={({ isActive }) =>
                  `shrink-0 rounded-full px-3 py-1.5 text-sm font-medium transition-colors ${
                    isActive
                      ? "bg-accent-blue/15 text-accent-blue"
                      : "text-text-secondary hover:bg-bg-card-hover hover:text-text-primary"
                  }`
                }
              >
                {item.label}
              </NavLink>
            ))}
          </div>

          <DataHealthStrip />
          <ThemeToggle />
        </nav>
      </div>
    </>
  );
}

function MobileNavigation() {
  return (
    <nav className="mobile-bottom-nav lg:hidden" aria-label="Primary navigation">
      {MOBILE_NAV.map((item) => {
        const Icon = item.icon;
        return (
          <NavLink
            key={item.path}
            to={item.path}
            end={item.path === "/"}
            className={({ isActive }) =>
              `mobile-bottom-nav__item ${isActive ? "mobile-bottom-nav__item--active" : ""}`
            }
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
    <div className="min-h-screen min-w-0 flex flex-col bg-bg-primary">
      <a href="#main-content" className="skip-link">
        Skip to main content
      </a>
      <Navbar />
      <main
        id="main-content"
        tabIndex={-1}
        className="mobile-content flex-1 min-w-0 px-4 py-4 max-md:px-2 max-md:py-3"
      >
        <Suspense
          fallback={
            <div className="p-8 text-sm text-text-muted animate-pulse">loading…</div>
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
