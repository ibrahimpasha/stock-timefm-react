/**
 * Compact horizontal strip of trader-overlap chips for one flow entry.
 *
 * Each chip = one trader who has talked about this ticker within +/-14
 * days of the institutional flow print. Color encodes the (tier x
 * aligned x direction_known) cross-product computed server-side in
 * `src/flow_trader_overlap.py`:
 *
 *   contract & aligned                   -> solid green     (full conviction)
 *   contract & !aligned & dir_known      -> solid red       (active fade)
 *   ticker   & aligned                   -> green outline   (ticker-level corroboration)
 *   ticker   & !aligned & dir_known      -> muted gray      (weak conflict on different contract)
 *   any tier & !direction_known          -> muted gray      (neutral / no direction)
 *
 * The chip body is the trader's initials (3 chars max). Tooltip carries
 * the full author / event / strike / expiry / offset detail.
 *
 * The strip caps at 6 chips and collapses the remainder into a "+N"
 * muted chip whose tooltip lists the overflowed authors.
 */

import type { TraderMatch } from "./types";

const MAX_VISIBLE = 6;

/** Strip leading punctuation / emoji-ish chars, return uppercase letters only. */
function lettersOnly(s: string): string {
  return s.replace(/[^A-Za-z]/g, "").toUpperCase();
}

/**
 * Trader handle -> up to 3 uppercase letters.
 *   "AbTrades"          -> "AB"
 *   "Baba Neal"         -> "BN"
 *   "Flowseidon (Kian)" -> "FK"
 *
 * Rule: take all alpha chars from the first whitespace-delimited word
 * (capped at 2), append the first alpha char of the last word when
 * there's more than one word. Always uppercase. Falls back to "?"
 * for unparseable input.
 */
function initialsFor(author: string): string {
  const trimmed = (author || "").trim();
  if (!trimmed) return "?";
  // Treat punctuation between words as a word break so "Flowseidon (Kian)"
  // splits correctly.
  const words = trimmed
    .split(/[\s()_\-/]+/)
    .map((w) => lettersOnly(w))
    .filter((w) => w.length > 0);
  if (words.length === 0) return "?";
  if (words.length === 1) {
    return words[0].slice(0, 3);
  }
  const head = words[0].slice(0, 2);
  const tail = words[words.length - 1].slice(0, 1);
  return (head + tail).slice(0, 3);
}

interface ChipStyle {
  color: string;
  background: string;
  border: string;
}

function styleFor(m: TraderMatch): ChipStyle {
  // No direction inference possible -> muted gray, regardless of tier.
  if (!m.direction_known) {
    return {
      color: "var(--text-muted)",
      background: "transparent",
      border: "var(--border)",
    };
  }
  if (m.tier === "contract") {
    if (m.aligned) {
      return {
        color: "white",
        background: "var(--accent-green)",
        border: "var(--accent-green)",
      };
    }
    // contract + direction conflict -> solid red (active fade)
    return {
      color: "white",
      background: "var(--accent-red)",
      border: "var(--accent-red)",
    };
  }
  // tier === "ticker"
  if (m.aligned) {
    return {
      color: "var(--accent-green)",
      background: "transparent",
      border: "var(--accent-green)",
    };
  }
  // ticker + direction conflict on a different contract -> muted gray
  // (the signal is weaker than a contract-level fade).
  return {
    color: "var(--text-muted)",
    background: "transparent",
    border: "var(--border)",
  };
}

function fmtOffset(days: number): string {
  return `${days >= 0 ? "+" : ""}${days}d`;
}

function tooltipFor(m: TraderMatch): string {
  const ev = (m.event_type || "").toUpperCase() || "?";
  const offset = fmtOffset(m.days_offset);
  if (m.tier === "contract") {
    const strike = m.call_strike !== null ? `$${m.call_strike}` : "$?";
    const opt = m.call_opt_type || "";
    const exp = m.call_expiry || "";
    const align = m.aligned ? "ALIGNED" : "OPPOSITE";
    return `${m.author} ${ev} ${strike}${opt} ${exp} (${offset}, ${align})`;
  }
  // ticker tier
  const contract =
    m.call_strike !== null
      ? `$${m.call_strike}${m.call_opt_type || ""}${m.call_expiry ? " " + m.call_expiry : ""}`
      : "SHARES";
  return `${m.author} ${ev} ${contract} (${offset}, same ticker only)`;
}

/**
 * Sort priority — must match the server's `_sort_matches` ordering so
 * the visible 6 chips are stable across reloads:
 *   1) contract tier before ticker tier
 *   2) within each tier, aligned=true before aligned=false
 *   3) within each, smaller |days_offset| first
 */
function sortMatches(matches: TraderMatch[]): TraderMatch[] {
  return [...matches].sort((a, b) => {
    const ta = a.tier === "contract" ? 0 : 1;
    const tb = b.tier === "contract" ? 0 : 1;
    if (ta !== tb) return ta - tb;
    const aa = a.aligned ? 0 : 1;
    const ab = b.aligned ? 0 : 1;
    if (aa !== ab) return aa - ab;
    return Math.abs(a.days_offset) - Math.abs(b.days_offset);
  });
}

export function TraderMatchChips({ matches }: { matches: TraderMatch[] }) {
  if (!matches || matches.length === 0) return null;
  const sorted = sortMatches(matches);
  const visible = sorted.slice(0, MAX_VISIBLE);
  const overflow = sorted.slice(MAX_VISIBLE);

  return (
    <div className="flex items-center gap-1 shrink-0">
      {visible.map((m, i) => {
        const s = styleFor(m);
        return (
          <span
            key={`${m.author}-${m.ts}-${i}`}
            className="text-[10px] font-mono font-bold px-1.5 py-0.5 rounded"
            style={{
              color: s.color,
              background: s.background,
              border: `1px solid ${s.border}`,
              lineHeight: 1,
            }}
            title={tooltipFor(m)}
          >
            {initialsFor(m.author)}
          </span>
        );
      })}
      {overflow.length > 0 && (
        <span
          className="text-[10px] font-mono font-bold px-1.5 py-0.5 rounded"
          style={{
            color: "var(--text-muted)",
            background: "transparent",
            border: "1px solid var(--border)",
            lineHeight: 1,
          }}
          title={overflow.map((m) => m.author).join(", ")}
        >
          +{overflow.length}
        </span>
      )}
    </div>
  );
}
