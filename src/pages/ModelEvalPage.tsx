import { useAppStore } from "../store/useAppStore";
import { Award } from "lucide-react";

export function ModelEvalPage() {
  const ticker = useAppStore((s) => s.activeTicker);

  return (
    <div className="space-y-6">
      {/* Page header */}
      <div className="flex items-center gap-3">
        <Award size={24} className="text-accent-orange" />
        <h1 className="text-xl font-semibold text-text-primary">
          Model Evaluation — {ticker}
        </h1>
      </div>

      <div className="grid grid-cols-12 gap-4">
        {/* Podium */}
        <div className="col-span-4 card min-h-[200px]">
          <h2 className="text-sm font-semibold text-text-secondary mb-3">
            Podium
          </h2>
          <p className="text-xs text-text-muted">
            Top 3 models with medal icons and trust scores.
          </p>
        </div>

        {/* Accuracy Chart */}
        <div className="col-span-8 card min-h-[200px]">
          <h2 className="text-sm font-semibold text-text-secondary mb-3">
            Accuracy Over Time
          </h2>
          <p className="text-xs text-text-muted">
            Line chart showing model accuracy trends.
          </p>
        </div>

        {/* Leaderboard */}
        <div className="col-span-12 card min-h-[300px]">
          <h2 className="text-sm font-semibold text-text-secondary mb-3">
            Leaderboard
          </h2>
          <p className="text-xs text-text-muted">
            Sortable table with MAPE, RMSE, MAE, direction accuracy, samples,
            and trust score.
          </p>
        </div>

        {/* Radar + Heatmap */}
        <div className="col-span-6 card min-h-[250px]">
          <h2 className="text-sm font-semibold text-text-secondary mb-3">
            Radar Chart
          </h2>
          <p className="text-xs text-text-muted">
            Multi-metric spider chart for model comparison.
          </p>
        </div>
        <div className="col-span-6 card min-h-[250px]">
          <h2 className="text-sm font-semibold text-text-secondary mb-3">
            Win Rate Heatmap
          </h2>
          <p className="text-xs text-text-muted">
            Model vs model head-to-head win rate matrix.
          </p>
        </div>
      </div>
    </div>
  );
}
