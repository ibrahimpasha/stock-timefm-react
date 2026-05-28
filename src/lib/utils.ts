/**
 * Format a number as USD currency.
 * formatCurrency(45.03)  => "$45.03"
 * formatCurrency(1234.5) => "$1,234.50"
 */
export function formatCurrency(value: number, decimals = 2): string {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  }).format(value);
}

/**
 * Format a number as a percentage string.
 * formatPercent(0.0523)  => "+5.23%"
 * formatPercent(-0.12)   => "-12.00%"
 */
export function formatPercent(value: number, decimals = 2): string {
  const pct = value * 100;
  const sign = pct >= 0 ? "+" : "";
  return `${sign}${pct.toFixed(decimals)}%`;
}

/**
 * Format a percentage that's already multiplied by 100.
 * formatPercentRaw(5.23)  => "+5.23%"
 */
export function formatPercentRaw(value: number, decimals = 2): string {
  const sign = value >= 0 ? "+" : "";
  return `${sign}${value.toFixed(decimals)}%`;
}

/**
 * Format a date string or Date to a short display format.
 * formatDate("2024-03-18") => "Mar 18, 2024"
 */
export function formatDate(
  date: string | Date,
  options?: Intl.DateTimeFormatOptions
): string {
  let d: Date;
  if (typeof date === "string" && /^\d{4}-\d{2}-\d{2}$/.test(date)) {
    // "YYYY-MM-DD" → parse as local date, not UTC (avoids off-by-one in US timezones)
    const [y, m, day] = date.split("-").map(Number);
    d = new Date(y, m - 1, day);
  } else {
    d = typeof date === "string" ? new Date(date) : date;
  }
  return d.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    ...options,
  });
}

/**
 * Format a date as a short string without year.
 * formatDateShort("2024-03-18") => "Mar 18"
 */
export function formatDateShort(date: string | Date): string {
  return formatDate(date, { year: undefined });
}

/**
 * Conditional class name joiner (like clsx/classnames).
 * classNames("base", condition && "active", undefined, "always")
 * => "base active always"
 */
export function classNames(
  ...classes: (string | false | null | undefined)[]
): string {
  return classes.filter(Boolean).join(" ");
}

/**
 * Return the CSS color for positive/negative values.
 */
export function changeColor(value: number): string {
  if (value > 0) return "var(--accent-green)";
  if (value < 0) return "var(--accent-red)";
  return "var(--text-secondary)";
}

/**
 * Parse a flexible ISO/SQLite timestamp into a UTC epoch ms. SQLite stores
 * timestamps without a trailing Z; we treat those as UTC for delta math.
 * Returns NaN when input is unparseable.
 */
function parseTimestampMs(iso: string | undefined | null): number {
  if (!iso) return NaN;
  const ts = iso.includes("T") ? iso : iso.replace(" ", "T");
  return new Date(ts.endsWith("Z") ? ts : ts + "Z").getTime();
}

/**
 * Relative age label: "5s ago" / "23m ago" / "3h ago" / "5d ago" / "Mar 5".
 * Returns "" for invalid input so it composes safely inside JSX.
 *
 * Shared by both Intelligence panels under their "updated XXX ago" tag.
 */
export function relativeAge(iso: string | undefined | null): string {
  const t = parseTimestampMs(iso);
  if (!Number.isFinite(t)) return "";
  const sec = Math.max(0, (Date.now() - t) / 1000);
  if (sec < 60) return `${Math.round(sec)}s ago`;
  if (sec < 3600) return `${Math.round(sec / 60)}m ago`;
  if (sec < 86400) return `${Math.round(sec / 3600)}h ago`;
  if (sec < 86400 * 30) return `${Math.round(sec / 86400)}d ago`;
  return new Date(t).toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

/**
 * Locale-formatted absolute timestamp string for tooltip hover. Returns
 * undefined for invalid input so it's safe to pass directly to `title={...}`.
 */
export function absoluteAge(iso: string | undefined | null): string | undefined {
  const t = parseTimestampMs(iso);
  if (!Number.isFinite(t)) return undefined;
  return new Date(t).toLocaleString();
}

/**
 * Format a dollar amount with K/M suffix. Used for premium displays.
 * formatPremium(1_500_000) => "$1.5M"
 * formatPremium(250_000)   => "$250K"
 * formatPremium(425)       => "$425"
 */
export function formatPremium(n: number): string {
  if (n >= 1e6) return `$${(n / 1e6).toFixed(1)}M`;
  if (n >= 1e3) return `$${(n / 1e3).toFixed(0)}K`;
  return `$${n.toFixed(0)}`;
}
