import {
  Users,
  Calendar,
  Newspaper,
  TrendingUp,
  TrendingDown,
  Minus,
  AlertCircle,
} from "lucide-react";
import type { MarketContext } from "../../lib/types";
import { formatCurrency, formatDate } from "../../lib/utils";

interface MarketContextCardsProps {
  context: MarketContext | undefined;
  isLoading: boolean;
  className?: string;
}

function SkeletonCard() {
  return (
    <div className="card space-y-2">
      <div className="h-3 w-24 bg-bg-card-hover rounded animate-pulse" />
      <div className="h-5 w-32 bg-bg-card-hover rounded animate-pulse" />
      <div className="h-3 w-20 bg-bg-card-hover rounded animate-pulse" />
    </div>
  );
}

/** Map sentiment string to badge styling */
function sentimentBadge(sentiment: string) {
  const s = sentiment.toLowerCase();
  if (s.includes("bull") || s.includes("positive")) {
    return {
      color: "var(--accent-green)",
      bg: "rgba(63, 185, 80, 0.12)",
      label: "Bullish",
      Icon: TrendingUp,
    };
  }
  if (s.includes("bear") || s.includes("negative")) {
    return {
      color: "var(--accent-red)",
      bg: "rgba(248, 81, 73, 0.12)",
      label: "Bearish",
      Icon: TrendingDown,
    };
  }
  return {
    color: "var(--text-secondary)",
    bg: "rgba(139, 148, 158, 0.12)",
    label: "Neutral",
    Icon: Minus,
  };
}

/** Map analyst consensus to badge */
function consensusBadge(consensus: string) {
  const c = consensus.toLowerCase();
  if (c.includes("buy") || c.includes("strong buy")) {
    return { color: "var(--accent-green)", label: consensus };
  }
  if (c.includes("sell")) {
    return { color: "var(--accent-red)", label: consensus };
  }
  return { color: "var(--accent-orange)", label: consensus || "Hold" };
}

export function MarketContextCards({
  context,
  isLoading,
  className = "",
}: MarketContextCardsProps) {
  if (isLoading) {
    return (
      <div className={`space-y-3 ${className}`}>
        <h2 className="text-sm font-semibold text-text-secondary">
          Market Context
        </h2>
        <SkeletonCard />
        <SkeletonCard />
        <SkeletonCard />
      </div>
    );
  }

  if (!context) {
    return (
      <div className={`space-y-3 ${className}`}>
        <h2 className="text-sm font-semibold text-text-secondary">
          Market Context
        </h2>
        <div className="card text-center py-6">
          <AlertCircle size={24} className="mx-auto mb-2 text-text-muted opacity-40" />
          <p className="text-xs text-text-muted">Context data unavailable</p>
        </div>
      </div>
    );
  }

  const analyst = consensusBadge(context.analyst_consensus);
  const sentiment = sentimentBadge(context.news_sentiment);

  return (
    <div className={`space-y-3 ${className}`}>
      <h2 className="text-sm font-semibold text-text-secondary">
        Market Context
      </h2>

      {/* Analyst Consensus */}
      <div className="card">
        <div className="flex items-center gap-2 mb-2">
          <Users size={14} className="text-accent-blue" />
          <span className="text-xs font-semibold text-text-secondary">
            Analyst Consensus
          </span>
        </div>
        <div className="flex items-center justify-between">
          <span
            className="text-sm font-bold font-mono px-2 py-0.5 rounded"
            style={{
              color: analyst.color,
              backgroundColor: `${analyst.color}18`,
            }}
          >
            {analyst.label}
          </span>
          <div className="text-right">
            <div className="text-xs text-text-muted">Avg Target</div>
            <div className="text-sm font-mono text-text-primary">
              {formatCurrency(context.price_target)}
            </div>
          </div>
        </div>
      </div>

      {/* Next Earnings */}
      <div className="card">
        <div className="flex items-center gap-2 mb-2">
          <Calendar size={14} className="text-accent-orange" />
          <span className="text-xs font-semibold text-text-secondary">
            Next Earnings
          </span>
        </div>
        <div className="text-sm font-mono text-text-primary">
          {context.earnings_date
            ? formatDate(context.earnings_date)
            : "Not announced"}
        </div>
        {context.sector && (
          <div className="text-xs text-text-muted mt-1">
            Sector: {context.sector}
          </div>
        )}
      </div>

      {/* News Sentiment */}
      <div className="card">
        <div className="flex items-center gap-2 mb-2">
          <Newspaper size={14} className="text-accent-cyan" />
          <span className="text-xs font-semibold text-text-secondary">
            News Sentiment
          </span>
        </div>
        <div className="flex items-center gap-2">
          <sentiment.Icon size={16} style={{ color: sentiment.color }} />
          <span
            className="text-sm font-mono px-2 py-0.5 rounded"
            style={{
              color: sentiment.color,
              backgroundColor: sentiment.bg,
            }}
          >
            {sentiment.label}
          </span>
        </div>
      </div>
    </div>
  );
}
