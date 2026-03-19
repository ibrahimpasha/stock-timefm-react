import { formatCurrency, formatPercentRaw, changeColor } from "../lib/utils";
import { TrendingUp, TrendingDown, Minus } from "lucide-react";

interface PriceDisplayProps {
  /** Current price */
  price: number;
  /** Change percentage (already multiplied by 100, e.g. 2.5 = +2.5%) */
  changePct: number;
  /** Ticker symbol */
  ticker?: string;
  /** Size variant */
  size?: "sm" | "md" | "lg";
}

export function PriceDisplay({
  price,
  changePct,
  ticker,
  size = "md",
}: PriceDisplayProps) {
  const color = changeColor(changePct);
  const Icon = changePct > 0 ? TrendingUp : changePct < 0 ? TrendingDown : Minus;

  const sizeClasses = {
    sm: { price: "text-sm", change: "text-xs", icon: 12 },
    md: { price: "text-lg", change: "text-sm", icon: 16 },
    lg: { price: "text-2xl", change: "text-base", icon: 20 },
  }[size];

  return (
    <div className="flex items-center gap-2">
      {ticker && (
        <span className="font-mono font-bold text-text-primary" style={{ fontSize: size === "lg" ? "1.25rem" : undefined }}>
          {ticker}
        </span>
      )}
      <span className={`font-mono font-semibold text-text-primary ${sizeClasses.price}`}>
        {formatCurrency(price)}
      </span>
      <span
        className={`flex items-center gap-1 font-mono ${sizeClasses.change}`}
        style={{ color }}
      >
        <Icon size={sizeClasses.icon} />
        {formatPercentRaw(changePct)}
      </span>
    </div>
  );
}
