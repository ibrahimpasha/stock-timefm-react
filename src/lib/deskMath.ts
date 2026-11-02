/** Diverging heat steps. Size says how much; these say which way. Unknown-side premium
 *  dilutes the lean, because a print we can't read isn't evidence for either side. */
export function leanTone(bull: number, bear: number, other = 0) {
  const gross = bull + bear + other;
  if (!gross) return "0";
  const lean = (bull - bear) / gross;
  const strength = Math.abs(lean);
  const step = strength < 0.12 ? 0 : strength < 0.35 ? 1 : strength < 0.7 ? 2 : 3;
  return step === 0 ? "0" : `${lean > 0 ? "up" : "down"}-${step}`;
}

export function changeTone(pct: number) {
  const size = Math.abs(pct);
  if (size < 0.05) return "0";
  const step = size < 0.75 ? 1 : size < 2 ? 2 : 3;
  return `${pct > 0 ? "up" : "down"}-${step}`;
}

/** Minutes until the next 9:30 ET on a weekday.
 *  ponytail: ignores exchange holidays, same as the market clock in the top bar. */
export function minutesToOpen(now: Date) {
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat("en-US", { timeZone: "America/New_York", weekday: "short", hour: "2-digit", minute: "2-digit", hourCycle: "h23" })
      .formatToParts(now)
      .map((p) => [p.type, p.value]),
  );
  const day = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].indexOf(parts.weekday);
  const minute = Number(parts.hour) * 60 + Number(parts.minute);
  const open = 9 * 60 + 30;
  for (let ahead = 0; ahead <= 7; ahead += 1) {
    const weekday = (day + ahead) % 7;
    if (weekday === 0 || weekday === 6 || (ahead === 0 && minute >= open)) continue;
    return ahead * 1440 + open - minute;
  }
  return 0;
}
