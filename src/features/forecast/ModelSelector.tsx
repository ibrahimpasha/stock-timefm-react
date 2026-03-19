import { Cpu } from "lucide-react";
import { MODEL_COLORS, MODEL_LABELS } from "../../lib/constants";

/** The 6 models available on Jetson (CPU-only) */
const AVAILABLE_MODELS = [
  "dlinear",
  "patchtst",
  "itransformer",
  "timemixer",
  "timexer",
  "timesnet",
] as const;

interface ModelSelectorProps {
  selectedModels: string[];
  onToggle: (model: string) => void;
  className?: string;
}

export function ModelSelector({
  selectedModels,
  onToggle,
  className = "",
}: ModelSelectorProps) {
  const allSelected = AVAILABLE_MODELS.every((m) => selectedModels.includes(m));

  const toggleAll = () => {
    if (allSelected) {
      // Deselect all — but keep at least one
      AVAILABLE_MODELS.forEach((m) => {
        if (selectedModels.includes(m)) onToggle(m);
      });
    } else {
      AVAILABLE_MODELS.forEach((m) => {
        if (!selectedModels.includes(m)) onToggle(m);
      });
    }
  };

  return (
    <div className={`card ${className}`}>
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <Cpu size={14} className="text-accent-purple" />
          <h2 className="text-sm font-semibold text-text-secondary">Models</h2>
        </div>
        <button
          onClick={toggleAll}
          className="text-xs text-accent-blue hover:underline"
        >
          {allSelected ? "Deselect All" : "Select All"}
        </button>
      </div>

      <div className="grid grid-cols-2 gap-1.5">
        {AVAILABLE_MODELS.map((model) => {
          const isSelected = selectedModels.includes(model);
          const color = MODEL_COLORS[model] || "#8b949e";
          const label = MODEL_LABELS[model] || model;

          return (
            <label
              key={model}
              className={`flex items-center gap-2 px-2.5 py-1.5 rounded-lg cursor-pointer transition-all text-xs ${
                isSelected
                  ? "bg-bg-card-hover border border-border"
                  : "border border-transparent hover:border-border opacity-50"
              }`}
            >
              <input
                type="checkbox"
                checked={isSelected}
                onChange={() => onToggle(model)}
                className="sr-only"
              />
              {/* Color dot */}
              <span
                className="w-2.5 h-2.5 rounded-full shrink-0 transition-opacity"
                style={{
                  backgroundColor: color,
                  opacity: isSelected ? 1 : 0.3,
                }}
              />
              <span
                className={`font-mono ${
                  isSelected ? "text-text-primary" : "text-text-muted"
                }`}
              >
                {label}
              </span>
            </label>
          );
        })}
      </div>

      <div className="mt-2 text-xs text-text-muted text-center">
        {selectedModels.length} of {AVAILABLE_MODELS.length} selected
      </div>
    </div>
  );
}
