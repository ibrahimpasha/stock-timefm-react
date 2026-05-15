import { BrowserRouter, Routes, Route, NavLink } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BarChart3 } from "lucide-react";
import { NAV_ITEMS } from "./lib/constants";

import { ForecastPage } from "./pages/ForecastPage";
import { CommandCenterPage } from "./pages/CommandCenterPage";
import { CommandCenterPageV2 } from "./pages/CommandCenterPageV2";
import { ModelEvalPage } from "./pages/ModelEvalPage";
import { IntelligencePage } from "./pages/IntelligencePage";
import { SignalAnalysisPage } from "./pages/SignalAnalysisPage";

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
    <nav className="flex items-center gap-1 px-6 py-3 border-b border-border bg-bg-primary">
      {/* Logo */}
      <div className="flex items-center gap-2 mr-6">
        <BarChart3 size={22} className="text-accent-blue" />
        <span className="font-bold text-text-primary text-sm tracking-wide">
          Stock-TimeFM
        </span>
      </div>

      {/* Nav links */}
      <div className="flex items-center gap-1">
        {NAV_ITEMS.map((item) => (
          <NavLink
            key={item.path}
            to={item.path}
            className={({ isActive }) =>
              `px-3 py-1.5 rounded-md text-sm font-medium transition-colors ${
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
    </nav>
  );
}

function AppLayout() {
  return (
    <div className="min-h-screen flex flex-col bg-bg-primary">
      <Navbar />
      <main className="flex-1 p-6">
        <Routes>
          <Route path="/" element={<ForecastPage />} />
          <Route path="/command-center" element={<CommandCenterPage />} />
          <Route path="/command-center-v2" element={<CommandCenterPageV2 />} />
          <Route path="/eval" element={<ModelEvalPage />} />
          <Route path="/intel" element={<IntelligencePage />} />
          <Route path="/signals" element={<SignalAnalysisPage />} />
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
