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
  const d = typeof date === "string" ? new Date(date) : date;
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
