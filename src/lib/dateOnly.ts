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

/** Whole calendar days from today (local) to a date-only string. 0 = today,
 *  positive = future, negative = past. */
export function daysFromToday(iso: string): number {
  const now = new Date();
  const todayMid = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  return Math.round(
    (parseLocalDate(iso).getTime() - todayMid.getTime()) / 86_400_000,
  );
}
