import { Brain, BookOpen, AlertTriangle, Clock, TrendingUp, TrendingDown, Target, RefreshCw } from "lucide-react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import apiClient from "../../api/client";
import { relativeAge, absoluteAge } from "../../lib/utils";

interface IntelligencePanelProps {
  thesis: string | null;
  isLoading?: boolean;
  currentPrice?: number;
  ticker?: string;   // optional — when present, panel falls back to cached web-search intel
}

interface IntelCategoryResponse {
  type: string;
  title: string;
  content: string;
  timestamp: string;
}

function useIntelLatestForPanel(ticker: string | undefined) {
  return useQuery<IntelCategoryResponse[]>({
    queryKey: ["intel-latest", ticker || ""],
    queryFn: () =>
      apiClient.get(`/intel/latest?ticker=${ticker}&max_age=72`).then((r) => r.data),
    staleTime: 5 * 60_000,
    enabled: !!ticker,
  });
}

function useIntelRefresh(ticker: string | undefined) {
  const qc = useQueryClient();
  return useMutation<{ status: string; ticker: string; categories: number }>({
    mutationFn: async () => {
      if (!ticker) throw new Error("no ticker");
      const { data } = await apiClient.post(`/intel/refresh?ticker=${ticker}`);
      return data;
    },
    onSuccess: () => {
      // Invalidate cache so the panel re-renders with the fresh DB row.
      qc.invalidateQueries({ queryKey: ["intel-latest", ticker || ""] });
    },
  });
}

/** Directional-bias header chip. Color: green=BULLISH, red=BEARISH,
 *  amber=NEUTRAL. Hover tooltip shows the one-line reason. */
function BiasChip({
  bias,
  reason,
}: {
  bias: "BULLISH" | "BEARISH" | "NEUTRAL" | "UNKNOWN";
  reason: string;
}) {
  const palette: Record<string, { bg: string; fg: string; border: string }> = {
    BULLISH: {
      bg: "rgba(63,185,80,0.12)",
      fg: "var(--accent-green)",
      border: "rgba(63,185,80,0.35)",
    },
    BEARISH: {
      bg: "rgba(248,81,73,0.12)",
      fg: "var(--accent-red)",
      border: "rgba(248,81,73,0.35)",
    },
    NEUTRAL: {
      bg: "rgba(227,127,46,0.10)",
      fg: "var(--accent-orange)",
      border: "rgba(227,127,46,0.30)",
    },
    UNKNOWN: {
      bg: "transparent",
      fg: "var(--text-muted)",
      border: "var(--border)",
    },
  };
  const c = palette[bias] || palette.UNKNOWN;
  return (
    <span
      className="ml-2 px-1.5 py-0.5 rounded text-[10px] font-mono font-semibold normal-case tracking-normal"
      style={{ background: c.bg, color: c.fg, border: `1px solid ${c.border}` }}
      title={reason || `Perplexity bias call: ${bias}`}
    >
      {bias}
    </span>
  );
}

/** Pull the `_bias` synthetic section out of the IntelSection[] response.
 *  Backend returns `{type: "_bias", content: '{"bias":"BULLISH","reason":"..."}'}`
 *  as a leading section; the dashboard renders it as a header chip.
 *  Returns null when the response predates the bias rollout. */
function extractBias(cats: IntelCategoryResponse[] | undefined): {
  bias: "BULLISH" | "BEARISH" | "NEUTRAL" | "UNKNOWN";
  reason: string;
} | null {
  if (!cats) return null;
  const row = cats.find((c) => c.type === "_bias");
  if (!row || !row.content) return null;
  try {
    const parsed = JSON.parse(row.content);
    if (parsed && typeof parsed.bias === "string") {
      return {
        bias: parsed.bias,
        reason: typeof parsed.reason === "string" ? parsed.reason : "",
      };
    }
  } catch {
    /* malformed bias payload — ignore */
  }
  return null;
}

function buildFallbackThesis(cats: IntelCategoryResponse[] | undefined): string | null {
  if (!cats || cats.length === 0) return null;
  // 2026-05-24: the backend now saves the entire Perplexity blob to a single
  // `catalysts` row. That blob already contains its own `## ...` markdown
  // headers (Latest earnings / Sentiment / Competitors / Risks / 2-week
  // trading outlook / Numbers and dates), so we return it AS-IS — no outer
  // `## Catalysts` wrapper that would create a duplicate header. Legacy
  // entries with multiple per-category rows fall through to the old format.
  const byType: Record<string, string> = {};
  for (const c of cats) {
    if (c.content && !byType[c.type]) byType[c.type] = c.content.trim();
  }
  const cat = byType.catalysts || "";
  const hasOwnHeaders = /^##\s+/m.test(cat);
  const otherCats = Object.keys(byType).filter(
    (k) => k !== "catalysts" && !k.startsWith("_"),
  );
  if (cat && hasOwnHeaders && otherCats.length === 0) {
    return cat;
  }
  // Legacy multi-category path (pre-2026-05-24 entries).
  const sections: string[] = [];
  if (byType.catalysts)            sections.push(`## Catalysts\n${byType.catalysts}`);
  if (byType.deep_sentiment)       sections.push(`## Sentiment\n${byType.deep_sentiment}`);
  if (byType.competitive_landscape) sections.push(`## Competitive\n${byType.competitive_landscape}`);
  if (byType.regime_drivers)       sections.push(`## Regime Drivers\n${byType.regime_drivers}`);
  if (byType.macro_calendar)       sections.push(`## Macro Calendar\n${byType.macro_calendar}`);
  if (sections.length === 0 && Object.keys(byType).length > 0) {
    const [firstKey, firstVal] = Object.entries(byType)[0];
    sections.push(`## ${firstKey.replace(/_/g, " ")}\n${firstVal}`);
  }
  return sections.length > 0 ? sections.join("\n\n") : null;
}

/* ── Prediction extraction from thesis text ─────────────────────── */

interface PricePrediction {
  direction: "bullish" | "bearish" | "mixed";
  confidence: "high" | "medium" | "low";
  bullTarget: number | null;
  bearTarget: number | null;
  keyAction: string;       // e.g. "Buy on Taiwan escalation dips"
  catalysts: string[];     // top 2-3 catalysts
  risks: string[];         // top 1-2 risks
  moveEstimate: string;    // e.g. "+15-25%" or "-10-20%"
}

function extractPrediction(text: string, currentPrice?: number): PricePrediction | null {
  if (!text || text.length < 100) return null;

  const lower = text.toLowerCase();

  // ── Direction: defer to explicit BIAS: line if present ──
  // The Perplexity prompt now demands `BIAS: BULLISH|BEARISH|NEUTRAL` on
  // line 1. When that's there, ignore keyword counting — it gets fooled by
  // technical-analysis words like "support", "upside" (in "fading upside"),
  // and "bullish" (in "bullish target revisions from a subset of analysts")
  // even when the overall read is bearish. See 2026-05-24 BLDP regression.
  const biasMatch = text.match(/^\s*[`*]*\s*BIAS\s*[:\-]\s*\**\s*(BULLISH|BEARISH|NEUTRAL)\b/im);
  let direction: PricePrediction["direction"];
  if (biasMatch) {
    const b = biasMatch[1].toUpperCase();
    direction = b === "BULLISH" ? "bullish" : b === "BEARISH" ? "bearish" : "mixed";
  }

  // ── Fallback direction scoring (only when no BIAS line) ──
  const bullWords = [
    "buy", "bullish", "upside", "rally", "long", "outperform",
    "upgrade", "breakout", "accumulate", "support", "conviction: buy",
  ];
  const bearWords = [
    "sell", "bearish", "downside", "short", "underperform",
    "downgrade", "breakdown", "avoid", "reduce", "conviction: sell",
  ];

  let bullScore = 0;
  let bearScore = 0;
  for (const w of bullWords) {
    const matches = lower.split(w).length - 1;
    bullScore += matches;
  }
  for (const w of bearWords) {
    const matches = lower.split(w).length - 1;
    bearScore += matches;
  }

  if (/conviction:\s*buy/i.test(text)) bullScore += 5;
  if (/conviction:\s*sell/i.test(text)) bearScore += 5;
  if (/bull\s*case.*\$(\d+)/i.test(text)) bullScore += 2;
  if (/bear\s*case.*\$(\d+)/i.test(text)) bearScore += 1;

  const total = bullScore + bearScore;
  if (!biasMatch && total === 0) return null;

  if (!biasMatch) {
    direction =
      bullScore > bearScore * 1.3 ? "bullish" :
      bearScore > bullScore * 1.3 ? "bearish" : "mixed";
  }

  // ── Confidence ──
  const ratio = Math.max(bullScore, bearScore) / Math.max(total, 1);
  const confidence: PricePrediction["confidence"] =
    ratio >= 0.7 ? "high" : ratio >= 0.5 ? "medium" : "low";

  // ── Price targets ──
  // Tight match: "bull thesis at $60", "bull case to $60", "bear case to $35"
  // Limit gap to 30 chars to avoid grabbing unrelated $ amounts
  const bullTargetMatch = text.match(/bull(?:ish)?\s*(?:case|thesis|target|price)[^$]{0,30}\$(\d+(?:\.\d+)?)/i)
    || text.match(/(?:upside|bull)\s*(?:to|at|of|target:?)\s*\$(\d+(?:\.\d+)?)/i)
    || text.match(/price\s*target[^$]{0,20}\$(\d+(?:\.\d+)?)/i);
  const bearTargetMatch = text.match(/bear(?:ish)?\s*(?:case|thesis|target|price)[^$]{0,30}\$(\d+(?:\.\d+)?)/i)
    || text.match(/(?:downside|bear)\s*(?:to|at|of|target:?)\s*\$(\d+(?:\.\d+)?)/i);
  const bullTarget = bullTargetMatch ? parseFloat(bullTargetMatch[1]) : null;
  const bearTarget = bearTargetMatch ? parseFloat(bearTargetMatch[1]) : null;

  // ── Move estimate ──
  let moveEstimate = "";
  if (currentPrice && bullTarget && bearTarget) {
    const upPct = ((bullTarget - currentPrice) / currentPrice * 100).toFixed(0);
    const downPct = ((bearTarget - currentPrice) / currentPrice * 100).toFixed(0);
    moveEstimate = direction === "bearish"
      ? `${downPct}% to ${upPct}%`
      : `${upPct > "0" ? "+" : ""}${upPct}% / ${downPct}%`;
  } else {
    // Try extracting percentage mentions
    const pctMatches = text.match(/(\d+)[\s-]*(?:to\s*)?(\d+)?\s*percent\s*(upside|downside|gain|loss)/gi);
    if (pctMatches && pctMatches.length > 0) {
      moveEstimate = pctMatches[0];
    }
  }

  // ── Key action (first sentence with buy/sell/conviction) ──
  const sentences = text.split(/[.!]\s+/);
  let keyAction = "";
  for (const s of sentences) {
    if (/conviction|buy\s|sell\s|action/i.test(s) && s.length < 200) {
      keyAction = s.replace(/^\s*/, "").split(".")[0];
      break;
    }
  }
  if (!keyAction) {
    // Fallback: last sentence often has the recommendation
    const last = sentences[sentences.length - 1]?.trim() || "";
    if (last.length < 200) keyAction = last;
  }

  // ── Catalysts (sentences mentioning catalyst, event, launch, earnings) ──
  const catalysts: string[] = [];
  for (const s of sentences) {
    if (/catalyst|launch|earnings|report|event|partnership|contract|ramp/i.test(s) && s.length > 20 && s.length < 150) {
      catalysts.push(s.trim());
      if (catalysts.length >= 3) break;
    }
  }

  // ── Risks ──
  const risks: string[] = [];
  for (const s of sentences) {
    if (/risk|threat|headwind|downside|fear|concern|compression/i.test(s) && s.length > 20 && s.length < 150) {
      risks.push(s.trim());
      if (risks.length >= 2) break;
    }
  }

  return {
    direction,
    confidence,
    bullTarget,
    bearTarget,
    keyAction,
    catalysts,
    risks,
    moveEstimate,
  };
}

/* ── Prediction card ─────────────────────────────────────────── */

function PredictionCard({ prediction, currentPrice }: { prediction: PricePrediction; currentPrice?: number }) {
  const isBull = prediction.direction === "bullish";
  const isBear = prediction.direction === "bearish";

  const dirColor = isBull
    ? "var(--accent-green)"
    : isBear ? "var(--accent-red)" : "var(--accent-orange)";

  const dirLabel = isBull ? "BULLISH" : isBear ? "BEARISH" : "MIXED";
  const dirIcon = isBull
    ? <TrendingUp size={14} />
    : isBear ? <TrendingDown size={14} /> : <Target size={14} />;

  const confDots = prediction.confidence === "high" ? 3 : prediction.confidence === "medium" ? 2 : 1;

  return (
    <div
      className="rounded-lg p-3 mb-3"
      style={{
        background: `color-mix(in srgb, ${dirColor} 6%, transparent)`,
        border: `1px solid color-mix(in srgb, ${dirColor} 25%, transparent)`,
      }}
    >
      {/* Header row */}
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-2" style={{ color: dirColor }}>
          {dirIcon}
          <span className="text-xs font-bold font-mono">{dirLabel}</span>
          <span className="flex gap-0.5 ml-1">
            {[1, 2, 3].map((i) => (
              <span
                key={i}
                className="w-1.5 h-1.5 rounded-full"
                style={{
                  background: i <= confDots ? dirColor : "var(--text-muted)",
                  opacity: i <= confDots ? 1 : 0.25,
                }}
              />
            ))}
          </span>
        </div>
        {prediction.moveEstimate && (
          <span className="text-xs font-mono font-semibold" style={{ color: dirColor }}>
            {prediction.moveEstimate}
          </span>
        )}
      </div>

      {/* Price targets */}
      {(prediction.bullTarget || prediction.bearTarget) && (
        <div className="flex gap-3 mb-2">
          {prediction.bullTarget != null && (
            <div className="flex items-center gap-1 text-xs">
              <span className="text-text-muted">Bull:</span>
              <span className="font-mono font-semibold text-accent-green">
                ${prediction.bullTarget}
                {currentPrice != null && (
                  <span className="text-text-muted ml-1">
                    ({((prediction.bullTarget - currentPrice) / currentPrice * 100).toFixed(0)}%)
                  </span>
                )}
              </span>
            </div>
          )}
          {prediction.bearTarget != null && (
            <div className="flex items-center gap-1 text-xs">
              <span className="text-text-muted">Bear:</span>
              <span className="font-mono font-semibold text-accent-red">
                ${prediction.bearTarget}
                {currentPrice != null && (
                  <span className="text-text-muted ml-1">
                    ({((prediction.bearTarget - currentPrice) / currentPrice * 100).toFixed(0)}%)
                  </span>
                )}
              </span>
            </div>
          )}
        </div>
      )}

      {/* Key action */}
      {prediction.keyAction && (
        <p className="text-xs leading-relaxed mb-2" style={{ color: dirColor }}>
          {prediction.keyAction}
        </p>
      )}

      {/* Catalysts & Risks */}
      {prediction.catalysts.length > 0 && (
        <div className="mb-1.5">
          {prediction.catalysts.map((c, i) => (
            <div key={i} className="flex items-start gap-1.5 text-xs text-text-secondary leading-relaxed">
              <span className="text-accent-green mt-0.5 shrink-0">▲</span>
              <span>{c}</span>
            </div>
          ))}
        </div>
      )}
      {prediction.risks.length > 0 && (
        <div>
          {prediction.risks.map((r, i) => (
            <div key={i} className="flex items-start gap-1.5 text-xs text-text-secondary leading-relaxed">
              <span className="text-accent-red mt-0.5 shrink-0">▼</span>
              <span>{r}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

/* ── Skeleton ────────────────────────────────────────────────── */

function SkeletonIntel() {
  return (
    <div className="card animate-pulse">
      <div className="h-4 w-32 rounded bg-text-muted/20 mb-4" />
      <div className="space-y-2">
        <div className="h-3 w-full rounded bg-text-muted/20" />
        <div className="h-3 w-5/6 rounded bg-text-muted/20" />
        <div className="h-3 w-4/6 rounded bg-text-muted/20" />
        <div className="h-3 w-full rounded bg-text-muted/20" />
        <div className="h-3 w-3/4 rounded bg-text-muted/20" />
      </div>
    </div>
  );
}

/* ── Thesis section parser ───────────────────────────────────── */

function parseThesisSections(text: string): { title: string; content: string }[] {
  const lines = text.split("\n");
  const sections: { title: string; content: string }[] = [];
  let currentTitle = "Analysis";
  let currentLines: string[] = [];

  for (const line of lines) {
    const headerMatch = line.match(/^#{1,3}\s+(.+)/);
    const boldMatch = line.match(/^\*\*(.+?)\*\*:?\s*(.*)/);

    if (headerMatch) {
      if (currentLines.length > 0) {
        sections.push({ title: currentTitle, content: currentLines.join("\n").trim() });
      }
      currentTitle = headerMatch[1];
      currentLines = [];
    } else if (boldMatch && currentLines.length === 0) {
      if (sections.length > 0 || currentLines.length > 0) {
        sections.push({ title: currentTitle, content: currentLines.join("\n").trim() });
      }
      currentTitle = boldMatch[1];
      currentLines = boldMatch[2] ? [boldMatch[2]] : [];
    } else {
      currentLines.push(line);
    }
  }

  if (currentLines.length > 0 || sections.length === 0) {
    sections.push({ title: currentTitle, content: currentLines.join("\n").trim() });
  }

  return sections.filter((s) => s.content.length > 0);
}

function SectionIcon({ title }: { title: string }) {
  const lower = title.toLowerCase();
  if (lower.includes("risk") || lower.includes("caution") || lower.includes("warning")) {
    return <AlertTriangle size={13} className="text-accent-orange shrink-0" />;
  }
  if (lower.includes("catalyst") || lower.includes("event") || lower.includes("timeline")) {
    return <Clock size={13} className="text-accent-cyan shrink-0" />;
  }
  if (lower.includes("thesis") || lower.includes("rationale") || lower.includes("analysis")) {
    return <Brain size={13} className="text-accent-purple shrink-0" />;
  }
  return <BookOpen size={13} className="text-text-secondary shrink-0" />;
}

/* ── Main component ──────────────────────────────────────────── */

export function IntelligencePanel({ thesis, isLoading, currentPrice, ticker }: IntelligencePanelProps) {
  // Always pull cached web-search intel so we can fall back when no formal
  // thesis exists. Backfill script pre-populates this for all flow tickers,
  // so the "no intelligence" state should essentially never appear.
  const { data: cats, isLoading: catsLoading } = useIntelLatestForPanel(ticker);
  const refresh = useIntelRefresh(ticker);
  const [refreshError, setRefreshError] = useState<string | null>(null);
  const bias = extractBias(cats);
  const fallbackThesis = !thesis ? buildFallbackThesis(cats) : null;
  const effectiveThesis = thesis || fallbackThesis;
  const fromCache = !thesis && !!fallbackThesis;
  // Timestamp comes back on every category — they all share the latest row's
  // created_at because that's what the server backfills onto each section.
  const lastRefreshIso = cats?.[0]?.timestamp || null;
  const lastRefreshLabel = relativeAge(lastRefreshIso);

  if (isLoading) return <SkeletonIntel />;

  if (!effectiveThesis) {
    // Only show the empty state when BOTH thesis and intel cache are empty.
    // While the intel fetch is in flight, show a skeleton instead of the
    // "run analysis" prompt so the user doesn't blame themselves.
    if (catsLoading && ticker) return <SkeletonIntel />;
    return (
      <div className="card">
        <h3 className="text-xs font-semibold text-text-secondary uppercase tracking-wider flex items-center gap-1.5 mb-3">
          <Brain size={13} />
          Intelligence
        </h3>
        <p className="text-xs text-text-muted text-center py-4">
          No cached intelligence for {ticker || "this ticker"} — backfill pending
        </p>
      </div>
    );
  }

  const sections = parseThesisSections(effectiveThesis);
  const prediction = extractPrediction(effectiveThesis, currentPrice);

  return (
    <div className="card">
      <h3 className="text-xs font-semibold text-text-secondary uppercase tracking-wider flex items-center gap-1.5 mb-4">
        <Brain size={13} />
        Intelligence
        {bias && bias.bias !== "UNKNOWN" && (
          <BiasChip bias={bias.bias} reason={bias.reason} />
        )}
        <div className="ml-auto flex items-center gap-2 normal-case font-normal">
          {fromCache && (
            <span
              className="text-[10px] font-mono text-text-muted"
              title="Showing cached web-search intel because no ML thesis exists yet. Click Analyze for a full ensemble-backed thesis."
            >
              web-search cache
            </span>
          )}
          {lastRefreshLabel && (
            <span
              className="text-[10px] font-mono text-text-muted"
              title={lastRefreshIso ? `Last refreshed ${absoluteAge(lastRefreshIso)}` : undefined}
            >
              updated {lastRefreshLabel}
            </span>
          )}
          {ticker && (
            <button
              onClick={() => {
                setRefreshError(null);
                refresh.mutate(undefined, {
                  onError: (e) => setRefreshError((e as Error)?.message || "refresh failed"),
                });
              }}
              disabled={refresh.isPending}
              title="Re-fetch this ticker's intel via Perplexity / Claude web-search. Takes ~30-60s."
              className="flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-mono text-accent-blue hover:bg-accent-blue/10 border border-accent-blue/30 transition-colors disabled:opacity-50"
            >
              <RefreshCw size={10} className={refresh.isPending ? "animate-spin" : ""} />
              {refresh.isPending ? "fetching…" : "refresh"}
            </button>
          )}
        </div>
      </h3>
      {refreshError && (
        <div className="mb-2 text-[10px] font-mono text-accent-red">
          {refreshError}
        </div>
      )}

      {bias && bias.bias !== "UNKNOWN" && bias.reason && (() => {
        const c =
          bias.bias === "BULLISH"
            ? { fg: "var(--accent-green)", bg: "rgba(63,185,80,0.08)", border: "rgba(63,185,80,0.45)" }
            : bias.bias === "BEARISH"
              ? { fg: "var(--accent-red)", bg: "rgba(248,81,73,0.08)", border: "rgba(248,81,73,0.45)" }
              : { fg: "var(--accent-orange)", bg: "rgba(227,127,46,0.08)", border: "rgba(227,127,46,0.40)" };
        return (
          <div
            className="mb-3 text-xs leading-snug text-text-secondary rounded-md px-2.5 py-2"
            style={{
              background: c.bg,
              border: `1px solid ${c.border}`,
            }}
          >
            <span
              className="font-mono font-semibold uppercase text-[10px] mr-1.5"
              style={{ color: c.fg }}
            >
              why {bias.bias.toLowerCase()}
            </span>
            {bias.reason}
          </div>
        );
      })()}

      {/* Prediction card — only when we don't already have an explicit BIAS
          chip + reasoning. The bias chip carries the directional signal; the
          prediction card's keyAction/direction fallback is keyword-based and
          conflicts with the explicit bias (see 2026-05-24 BLDP regression
          where it said BULLISH while bias said BEARISH). */}
      {!bias && prediction && (
        <PredictionCard prediction={prediction} currentPrice={currentPrice} />
      )}

      <div className="space-y-3">
        {sections.map((section, idx) => (
          <div
            key={idx}
            className="rounded-lg p-3"
            style={{ background: "rgba(13,17,23,0.5)" }}
          >
            <div className="flex items-center gap-1.5 mb-1.5">
              <SectionIcon title={section.title} />
              <span className="text-xs font-semibold text-text-primary">
                {section.title}
              </span>
            </div>
            <p className="text-sm text-text-secondary leading-relaxed whitespace-pre-wrap">
              {section.content}
            </p>
          </div>
        ))}
      </div>
    </div>
  );
}
