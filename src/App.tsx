import { BrowserRouter, Routes, Route, NavLink } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BarChart3, Sun, Moon } from "lucide-react";
import { NAV_ITEMS } from "./lib/constants";
import { useTheme } from "./store/useTheme";

import { CommandCenterPage } from "./pages/CommandCenterPage";
import { TraderLeaderboardPage } from "./pages/TraderLeaderboardPage";
import { BayAreaMapPage } from "./pages/BayAreaMapPage";
import { PillarsPage } from "./pages/PillarsPage";

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
    <nav className="flex items-center gap-1 px-6 py-3 border-b border-border bg-bg-primary max-md:px-2 max-md:py-2 max-md:overflow-x-auto max-md:whitespace-nowrap">
      {/* Logo — hide the wordmark on mobile to save horizontal space */}
      <div className="flex items-center gap-2 mr-6 max-md:mr-2 shrink-0">
        <BarChart3 size={22} className="text-accent-blue max-md:size-[18px]" />
        <span className="font-bold text-text-primary text-sm tracking-wide max-md:hidden">
          Stock-TimeFM
        </span>
      </div>

      {/* Nav links — horizontally scrollable strip on mobile */}
      <div className="flex items-center gap-1 max-md:gap-0.5">
        {NAV_ITEMS.map((item) => (
          <NavLink
            key={item.path}
            to={item.path}
            className={({ isActive }) =>
              `px-3 py-1.5 rounded-md text-sm font-medium transition-colors max-md:px-2 max-md:py-1 max-md:text-xs shrink-0 ${
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

      <ThemeToggle />
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
      <main className="flex-1 p-6 max-md:p-2">
        <Routes>
          <Route path="/" element={<CommandCenterPage />} />
          {/* alias kept so old /command-center bookmarks still resolve */}
          <Route path="/command-center" element={<CommandCenterPage />} />
          <Route path="/pillars" element={<PillarsPage />} />
          <Route path="/traders" element={<TraderLeaderboardPage />} />
          <Route path="/map" element={<BayAreaMapPage />} />
        </Routes>
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
