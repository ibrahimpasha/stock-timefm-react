export type OptionDirection = "Bull" | "Bear" | "Unknown";

export function optionType(value: unknown): "CALL" | "PUT" | null {
  const type = String(value ?? "").trim().toUpperCase();
  return type === "C" || type === "CALL" ? "CALL" : type === "P" || type === "PUT" ? "PUT" : null;
}

export function optionIntent(entry: Record<string, any>): { side: OptionDirection; action: string } {
  const type = optionType(entry.type || entry.option_type);
  if (!type) return { side: "Unknown", action: "Unknown option intent" };
  const receipt = entry.decision_receipt?.intent ?? entry.intent;
  const explicit = [receipt?.action, receipt?.trade_action, entry.trade_action, entry.action, entry.transaction_action, entry.transaction, entry.flow_action].find(value => value != null && String(value).trim());
  const raw = String(explicit ?? "").trim().toUpperCase().replace(/[\s_-]+/g, "_");
  const buy = ["BTO", "BTC", "BUY_TO_OPEN", "BUY_TO_CLOSE", "BUY", "BUYING", "BOUGHT", "CALL_BUYING", "PUT_BUYING"].includes(raw);
  const sell = ["STO", "STC", "SELL_TO_OPEN", "SELL_TO_CLOSE", "SELL", "SELLING", "SOLD", "CALL_SELLING", "PUT_SELLING"].includes(raw);
  let buying: boolean;
  if (buy || sell) buying = buy;
  else {
    if (raw) return { side: "Unknown", action: "Unknown option intent" };
    const direction = String(receipt?.direction ?? entry._corrected_side ?? entry.side ?? "").toUpperCase();
    const corrected = ["BULL", "BULLISH"].includes(direction) ? "Bull" : ["BEAR", "BEARISH"].includes(direction) ? "Bear" : null;
    if (corrected === "Bull" || corrected === "Bear") {
      buying = type === "CALL" ? corrected === "Bull" : corrected === "Bear";
    } else {
      const ask = Number(entry.ask_pct);
      if (entry.ask_pct == null || !Number.isFinite(ask) || ask < 0 || ask > 100 || (ask >= 40 && ask < 55)) return { side: "Unknown", action: "Unknown option intent" };
      buying = ask >= 55;
    }
  }
  const side = type === "CALL" ? buying ? "Bull" : "Bear" : buying ? "Bear" : "Bull";
  const closing = ["BTC", "STC", "BUY_TO_CLOSE", "SELL_TO_CLOSE"].includes(raw);
  return { side, action: `${type.toLowerCase()} ${buying ? "buying" : "selling"}${closing ? " to close" : ""}${!raw && !receipt?.direction && !entry._corrected_side ? " (inferred)" : ""}` };
}

export function canonicalExpiry(value: unknown, sourceDate?: string | null, dte?: number | null): string | null {
  const raw = String(value ?? "").trim();
  const iso = raw.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/);
  const md = raw.match(/^(\d{1,2})\/(\d{1,2})(?:\/(\d{2}|\d{4}))?$/);
  if (!iso && !md) return null;
  const month = Number(iso?.[2] ?? md?.[1]), day = Number(iso?.[3] ?? md?.[2]);
  let year = Number(iso?.[1] ?? md?.[3]);
  if (year && year < 100) year += 2000;
  if (!year && sourceDate && dte != null && Number.isFinite(dte)) {
    const source = Date.parse(`${sourceDate.slice(0, 10)}T00:00:00Z`);
    if (Number.isFinite(source)) {
      const expected = source + dte * 86400000;
      const y = new Date(expected).getUTCFullYear();
      year = [y - 1, y, y + 1].sort((a, b) => Math.abs(Date.UTC(a, month - 1, day) - expected) - Math.abs(Date.UTC(b, month - 1, day) - expected))[0];
    }
  }
  if (!year) return null;
  const date = new Date(Date.UTC(year, month - 1, day));
  return date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day
    ? date.toISOString().slice(0, 10) : null;
}

export function expiryDte(expiry: unknown, today: string): number | null {
  const iso = canonicalExpiry(expiry);
  if (!iso) return null;
  return Math.round((Date.parse(`${iso}T00:00:00Z`) - Date.parse(`${today}T00:00:00Z`)) / 86400000);
}
