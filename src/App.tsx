import { BrowserRouter, Routes, Route, NavLink } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BarChart3 } from "lucide-react";
import { TickerInput } from "./components/TickerInput";
import { ServerStatus } from "./components/ServerStatus";
import { PriceDisplay } from "./components/PriceDisplay";
import { useAppStore } from "./store/useAppStore";
import { useMarketPrice } from "./api/forecast";
import { NAV_ITEMS } from "./lib/constants";

import { ForecastPage } from "./pages/ForecastPage";
import { CommandCenterPage } from "./pages/CommandCenterPage";
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

function TickerBar() {
  const ticker = useAppStore((s) => s.activeTicker);
  const { data: price } = useMarketPrice(ticker);

  return (
    <div className="flex items-center justify-between px-6 py-2 border-b border-border bg-bg-card/50">
      <div className="flex items-center gap-4">
        <TickerInput />
        {price && (
          <PriceDisplay
            price={price.price}
            changePct={price.change_pct}
            size="md"
          />
        )}
      </div>
      <ServerStatus />
    </div>
  );
}

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
      <TickerBar />
      <main className="flex-1 p-6">
        <Routes>
          <Route path="/" element={<ForecastPage />} />
          <Route path="/command-center" element={<CommandCenterPage />} />
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
