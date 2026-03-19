import { Brain } from "lucide-react";

interface SignalThesisProps {
  thesis: string | undefined;
  isLoading: boolean;
}

export function SignalThesis({ thesis, isLoading }: SignalThesisProps) {
  if (isLoading) {
    return (
      <div className="card">
        <div className="h-48 bg-bg-card-hover rounded-lg animate-pulse" />
      </div>
    );
  }

  return (
    <div className="card flex flex-col h-full">
      <div className="flex items-center gap-2 mb-3">
        <Brain size={16} className="text-accent-cyan" />
        <h2 className="text-sm font-semibold text-text-secondary">Signal Thesis</h2>
      </div>

      {thesis ? (
        <div className="flex-1 overflow-y-auto max-h-64 pr-2 custom-scrollbar">
          <p className="text-sm text-text-secondary leading-relaxed whitespace-pre-wrap">
            {thesis}
          </p>
        </div>
      ) : (
        <p className="text-xs text-text-muted text-center py-8">
          No thesis available. Generate a signal to see Claude-reasoned analysis.
        </p>
      )}
    </div>
  );
}
