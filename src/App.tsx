import { lazy, Suspense } from "react";
import { BrowserRouter, Routes, Route, NavLink } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BarChart3, Sun, Moon } from "lucide-react";
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

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      refetchOnWindowFocus: false,
      retry: 2,
    },
  },
});

function Navbar() {
  return (
    /* Floating glass bar — sticky with margin so the ambient field shows
     * around it; content scrolls underneath the blur. */
    <div className="sticky top-0 z-40 px-4 pt-3 max-md:px-2 max-md:pt-2">
      <nav className="glass-strong flex items-center gap-1 px-4 py-2 max-md:px-2 max-md:py-1.5 max-md:overflow-x-auto max-md:whitespace-nowrap">
        {/* Logo — hide the wordmark on mobile to save horizontal space */}
        <div className="flex items-center gap-2 mr-5 max-md:mr-2 shrink-0">
          <BarChart3 size={20} className="text-accent-blue max-md:size-[18px]" />
          <span className="font-bold text-sm tracking-wide gradient-text max-md:hidden">
            Stock-TimeFM
          </span>
        </div>

        {/* Nav links — horizontally scrollable strip on mobile */}
        <div className="flex items-center gap-0.5">
          {NAV_ITEMS.map((item) => (
            <NavLink
              key={item.path}
              to={item.path}
              className={({ isActive }) =>
                `px-3 py-1.5 rounded-full text-sm font-medium transition-colors max-md:px-2 max-md:py-1 max-md:text-xs shrink-0 ${
                  isActive
                    ? "bg-accent-blue/15 text-accent-blue"
                    : "text-text-secondary hover:text-text-primary hover:bg-bg-card-hover"
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
      className="ml-auto shrink-0 p-2 rounded-md text-text-secondary hover:text-text-primary hover:bg-bg-card-hover transition-colors max-md:p-1.5"
    >
      {isDark ? <Sun size={18} /> : <Moon size={18} />}
    </button>
  );
}

function AppLayout() {
  return (
    <div className="min-h-screen flex flex-col bg-bg-primary">
      <Navbar />
      <main className="flex-1 px-4 py-4 max-md:px-2 max-md:py-2">
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
            <Route path="/traders" element={<TraderLeaderboardPage />} />
            <Route path="/map" element={<BayAreaMapPage />} />
          </Routes>
        </Suspense>
      </main>
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
