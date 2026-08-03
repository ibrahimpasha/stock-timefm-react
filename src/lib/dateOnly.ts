/** Date-only ("YYYY-MM-DD") string helpers.
 *
 *  `new Date("YYYY-MM-DD")` parses as UTC midnight, which renders as the
 *  PREVIOUS day in negative-UTC zones (PT is UTC-7/-8) — the ACN 6/18 →
 *  "Jun 17" bug. Always parse date-only strings as LOCAL calendar dates.
 */
export function parseLocalDate(iso: string): Date {
  const [y, m, d] = iso.slice(0, 10).split("-").map(Number);
  return new Date(y, (m || 1) - 1, d || 1);
}

/** Serialize a Date as a local calendar date. Unlike toISOString(), this does
 * not jump to the next day after 5pm Pacific time. */
export function toLocalDateOnly(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

export function todayLocalDate(): string {
  return toLocalDateOnly(new Date());
}

/** Whole calendar days from today (local) to a date-only string. 0 = today,
 *  positive = future, negative = past. */
export function daysFromToday(iso: string): number {
  const now = new Date();
  const todayMid = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  return Math.round(
    (parseLocalDate(iso).getTime() - todayMid.getTime()) / 86_400_000,
  );
}
