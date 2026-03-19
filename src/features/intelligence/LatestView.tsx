import {
  Zap,
  BarChart3,
  Users,
  TrendingUp,
  Globe,
  DollarSign,
  Shield,
  Landmark,
} from "lucide-react";
import type { IntelSection } from "../../lib/types";

interface LatestViewProps {
  sections: IntelSection[];
  isLoading: boolean;
}

const SECTION_ICONS: Record<string, React.ReactNode> = {
  catalysts: <Zap size={16} className="text-accent-orange" />,
  sentiment: <BarChart3 size={16} className="text-accent-green" />,
  competitive: <Users size={16} className="text-accent-blue" />,
  sector: <TrendingUp size={16} className="text-accent-purple" />,
  macro: <Globe size={16} className="text-accent-cyan" />,
  rates: <DollarSign size={16} className="text-accent-orange" />,
  geopolitical: <Shield size={16} className="text-accent-red" />,
  regime: <Landmark size={16} className="text-accent-blue" />,
};

function getSectionIcon(type: string): React.ReactNode {
  // Match by substring for flexibility
  const key = Object.keys(SECTION_ICONS).find((k) =>
    type.toLowerCase().includes(k)
  );
  return key ? SECTION_ICONS[key] : <Zap size={16} className="text-text-muted" />;
}

export function LatestView({ sections, isLoading }: LatestViewProps) {
  if (isLoading) {
    return (
      <div className="grid grid-cols-2 gap-4">
        {Array.from({ length: 8 }).map((_, i) => (
          <div key={i} className="card h-40 animate-pulse bg-bg-card-hover" />
        ))}
      </div>
    );
  }

  if (sections.length === 0) {
    return (
      <div className="card">
        <p className="text-xs text-text-muted text-center py-8">
          No intelligence data available. Refresh to fetch latest intel.
        </p>
      </div>
    );
  }

  return (
    <div className="grid grid-cols-2 gap-4">
      {sections.map((section, i) => (
        <div key={i} className="card flex flex-col">
          <div className="flex items-center gap-2 mb-3">
            {getSectionIcon(section.type)}
            <h3 className="text-sm font-semibold text-text-primary">{section.title}</h3>
          </div>
          <div className="flex-1 overflow-y-auto max-h-48 pr-1">
            <p className="text-xs text-text-secondary leading-relaxed whitespace-pre-wrap">
              {section.content}
            </p>
          </div>
          <div className="text-xs text-text-muted mt-2 pt-2 border-t border-border">
            {new Date(section.timestamp).toLocaleString()}
          </div>
        </div>
      ))}
    </div>
  );
}
