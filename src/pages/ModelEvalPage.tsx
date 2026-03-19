import { useState, useMemo } from "react";
import { useAppStore } from "../store/useAppStore";
import { useLeaderboard, useDailyMetrics } from "../api/eval";
import { Award } from "lucide-react";
import {
  Podium,
  LeaderboardTable,
  AccuracyChart,
  RadarChart,
  ModelDeepDive,
} from "../features/model-eval";
import type { DailyMetric } from "../lib/types";

export function ModelEvalPage() {
  const ticker = useAppStore((s) => s.activeTicker);
  const { data: leaderboard = [], isLoading } = useLeaderboard(ticker);
  const [selectedModel, setSelectedModel] = useState<string | null>(null);

  // Get top models for accuracy chart
  const topModels = useMemo(
    () =>
      [...leaderboard]
        .sort((a, b) => b.trust_score - a.trust_score)
        .slice(0, 5)
        .map((e) => e.model),
    [leaderboard]
  );

  // Fetch daily metrics for each top model
  const m0 = useDailyMetrics(topModels[0] ?? "", 30);
  const m1 = useDailyMetrics(topModels[1] ?? "", 30);
  const m2 = useDailyMetrics(topModels[2] ?? "", 30);
  const m3 = useDailyMetrics(topModels[3] ?? "", 30);
  const m4 = useDailyMetrics(topModels[4] ?? "", 30);

  const metricsQueries = [m0, m1, m2, m3, m4];
  const metricsLoading = metricsQueries.some((q) => q.isLoading);

  const metricsMap = useMemo(() => {
    const map: Record<string, DailyMetric[]> = {};
    topModels.forEach((model, i) => {
      const data = metricsQueries[i].data;
      if (data && data.length > 0) {
        map[model] = data;
      }
    });
    return map;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [topModels, m0.data, m1.data, m2.data, m3.data, m4.data]);

  return (
    <div className="space-y-6">
      {/* Page header */}
      <div className="flex items-center gap-3">
        <Award size={24} className="text-accent-orange" />
        <h1 className="text-xl font-semibold text-text-primary">
          Model Evaluation — {ticker}
        </h1>
      </div>

      {/* Podium + Accuracy Chart */}
      <div className="grid grid-cols-12 gap-4">
        <div className="col-span-4">
          <Podium entries={leaderboard} isLoading={isLoading} />
        </div>
        <div className="col-span-8">
          <AccuracyChart metricsMap={metricsMap} isLoading={metricsLoading} />
        </div>
      </div>

      {/* Leaderboard */}
      <LeaderboardTable
        entries={leaderboard}
        isLoading={isLoading}
        onSelectModel={setSelectedModel}
      />

      {/* Radar Chart */}
      <RadarChart entries={leaderboard} isLoading={isLoading} />

      {/* Model Deep Dive */}
      <ModelDeepDive model={selectedModel} ticker={ticker} />
    </div>
  );
}
