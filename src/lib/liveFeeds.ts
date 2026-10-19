export function marketDate(now = new Date(), timeZone = "America/Los_Angeles"): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone, year: "numeric", month: "2-digit", day: "2-digit",
  }).format(now);
}

export function activeFlowInterval(date: string, now = new Date()): number | false {
  const age = (Date.parse(`${marketDate(now)}T00:00:00Z`) - Date.parse(`${date}T00:00:00Z`)) / 86400000;
  return Number.isFinite(age) && age >= -1 && age <= 3 ? 60_000 : false;
}
