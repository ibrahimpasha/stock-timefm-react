/**
 * IntelligencePanelV2 — restructured Intelligence panel for CC v2.
 *
 * Headline pull-quote + tagged bullets (CATALYST / VALUATION / RISK / FLOW)
 * + LLM panel showing model views.
 *
 * Real data path:
 *   - bias/confidence/headline ← derived from the existing freeform thesis
 *     (same one /signals/latest already returns)
 *   - bullets ← built from /intel/latest 8-category cache
 *     (catalysts, deep_sentiment, competitive_landscape, etc.)
 *   - llms ← single Claude tile until we wire multi-model thesis
 */
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { RefreshCw } from "lucide-react";
import { Panel, Tag } from "../../components/CCPrimitives";
import apiClient from "../../api/client";
import type { Signal } from "../../lib/types";
import { STALE_TIMES, INTEL_TAG_COLORS, INTEL_VIEW_COLORS } from "../../lib/constants";
import { relativeAge, absoluteAge } from "../../lib/utils";

interface IntelBullet {
  tag: "CATALYST" | "VALUATION" | "RISK" | "FLOW";
  text: string;
}

interface LLMView {
  name: string;
  view: "BULL" | "BEAR" | "NEUTRAL";
  note: string;
}

interface IntelCategoryResponse {
  type: string;
  title: string;
  content: string;
  timestamp: string;
}

interface IntelligencePanelV2Props {
  ticker: string;
  thesis: string | null;
  signal: Signal | null;
  isLoading?: boolean;
}

/** Map an intel category type → bullet tag. Unknown categories are skipped. */
const CATEGORY_TAG: Record<string, IntelBullet["tag"]> = {
  catalysts: "CATALYST",
  deep_sentiment: "VALUATION",
  competitive_landscape: "VALUATION",
  risk_factors: "RISK",
  options_flow: "FLOW",
  technical: "FLOW",
};

function trimSentences(text: string, maxChars: number): string {
  if (text.length <= maxChars) return text;
  const slice = text.slice(0, maxChars);
  const lastStop = Math.max(slice.lastIndexOf("."), slice.lastIndexOf("!"), slice.lastIndexOf("?"));
  if (lastStop > maxChars * 0.6) return slice.slice(0, lastStop + 1).trim();
  return slice.trim() + "…";
}

/** Pull the `_bias` synthetic section that the backend prepends to
 *  /intel/latest. Returns null when not present (pre-bias entries). */
function extractIntelBias(cats: IntelCategoryResponse[] | undefined): {
  bias: "BULLISH" | "BEARISH" | "NEUTRAL" | "UNKNOWN";
  reason: string;
} | null {
  if (!cats) return null;
  const row = cats.find((c) => c.type === "_bias");
  if (!row?.content) return null;
  try {
    const p = JSON.parse(row.content);
    if (typeof p?.bias === "string") {
      return {
        bias: p.bias,
        reason: typeof p.reason === "string" ? p.reason : "",
      };
    }
  } catch {
    /* malformed */
  }
  return null;
}

function useIntelCategories(ticker: string) {
  return useQuery<IntelCategoryResponse[]>({
    queryKey: ["intel-latest", ticker],
    queryFn: () => apiClient.get(`/intel/latest?ticker=${ticker}&max_age=24`).then((r) => r.data),
    staleTime: STALE_TIMES.flow * 5,
    enabled: !!ticker,
  });
}

function useIntelRefresh(ticker: string) {
  const qc = useQueryClient();
  return useMutation<{ status: string; ticker: string; categories: number }>({
    mutationFn: async () => {
      const { data } = await apiClient.post(`/intel/refresh?ticker=${ticker}`);
      return data;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["intel-latest", ticker] }),
  });
}

/** Pull a one-line headline from either the thesis (preferred) or the most
 *  recent intel category (fallback). Avoids the "run analysis" prompt as long
 *  as the intel cache has anything for this ticker. */
function deriveHeadline(
  thesis: string | null,
  intelFallback: string | null,
  ticker: string,
  dir?: string,
): string {
  const source = thesis || intelFallback;
  if (!source) return `${ticker}: no cached intelligence — refresh in a minute`;
  const firstStop = source.search(/[.!?](\s|$)/);
  const first = firstStop > 0 ? source.slice(0, firstStop) : source;
  const trimmed = first.trim().replace(/^[#*\-\s]+/, "");
  if (trimmed.length > 0 && trimmed.length < 220) return trimmed;
  return trimSentences(source, 180) || `${dir || "NEUTRAL"} signal — see analysis`;
}

export function IntelligencePanelV2({ ticker, thesis, signal, isLoading }: IntelligencePanelV2Props) {
  const { data: categories } = useIntelCategories(ticker);
  const refresh = useIntelRefresh(ticker);
  const [refreshError, setRefreshError] = useState<string | null>(null);
  const lastRefreshIso = categories?.[0]?.timestamp || null;
  const lastRefreshLabel = relativeAge(lastRefreshIso);
  // Bias call extracted from the Perplexity response (independent of the ML
  // signal). Surfaced as a secondary chip + reasoning subline below the
  // existing signal-based bias.
  const intelBias = extractIntelBias(categories);

  const direction = signal?.direction;
  const bias: "BULLISH" | "BEARISH" | "NEUTRAL" =
    direction === "BULL" ? "BULLISH" : direction === "BEAR" ? "BEARISH" : "NEUTRAL";
  const biasColor =
    bias === "BEARISH" ? "var(--accent-red)" : bias === "BULLISH" ? "var(--accent-green)" : "var(--text-secondary)";
  const confidence = signal?.confidence ?? 0;

  // Fallback intel narrative for the headline when no thesis exists. Prefer
  // catalysts (most actionable), then deep_sentiment, then any non-empty cat.
  const intelFallback = (() => {
    if (!categories || categories.length === 0) return null;
    const byType: Record<string, string> = {};
    for (const c of categories) {
      if (c.content && !byType[c.type]) byType[c.type] = c.content;
    }
    return byType.catalysts || byType.deep_sentiment ||
           byType.competitive_landscape || byType.regime_drivers ||
           Object.values(byType)[0] || null;
  })();

  const headline = deriveHeadline(thesis, intelFallback, ticker, direction);

  const bullets: IntelBullet[] = (categories ?? [])
    .map((c) => ({ tag: CATEGORY_TAG[c.type], text: trimSentences(c.content || "", 280) }))
    .filter((b): b is IntelBullet => !!b.tag && !!b.text);

  // Dedup by tag (keep first occurrence — categories already sorted by recency)
  const seen = new Set<string>();
  const uniqueBullets = bullets.filter((b) => {
    if (seen.has(b.tag)) return false;
    seen.add(b.tag);
    return true;
  });

  const llms: LLMView[] = thesis
    ? [{
        name: "Claude (Opus) · Thesis",
        view: bias === "BULLISH" ? "BULL" : bias === "BEARISH" ? "BEAR" : "NEUTRAL",
        note: trimSentences(thesis, 180),
      }]
    : intelFallback
    ? [{
        name: "Web-Search Intel",
        view: bias === "BULLISH" ? "BULL" : bias === "BEARISH" ? "BEAR" : "NEUTRAL",
        note: trimSentences(intelFallback, 180),
      }]
    : [];

  return (
    <Panel
      title="Intelligence · AI Synthesis"
      accent="var(--accent-purple)"
      padding={12}
      right={
        <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
          <Tag color={biasColor} border={biasColor} bg={`${biasColor}20`}>{bias}</Tag>
          {intelBias && intelBias.bias !== "UNKNOWN" && (() => {
            const c =
              intelBias.bias === "BULLISH"
                ? "var(--accent-green)"
                : intelBias.bias === "BEARISH"
                  ? "var(--accent-red)"
                  : "var(--accent-orange)";
            return (
              <Tag
                color={c}
                border={c}
                bg={`${c}20`}
                title={intelBias.reason || `Perplexity bias: ${intelBias.bias}`}
              >
                INTEL {intelBias.bias}
              </Tag>
            );
          })()}
          {confidence > 0 && (
            <span className="font-mono" style={{ fontSize: 10, color: "var(--text-muted)" }}>{confidence}% conf</span>
          )}
          {lastRefreshLabel && (
            <span
              className="font-mono"
              style={{ fontSize: 10, color: "var(--text-muted)" }}
              title={lastRefreshIso ? `Last refreshed ${absoluteAge(lastRefreshIso)}` : undefined}
            >
              updated {lastRefreshLabel}
            </span>
          )}
          {ticker && (
            <button
              onClick={() => {
                setRefreshError(null);
                refresh.mutate(undefined, { onError: (e) => setRefreshError((e as Error)?.message || "refresh failed") });
              }}
              disabled={refresh.isPending}
              title="Re-fetch this ticker's intel via Perplexity / Claude web-search. Takes ~30-60s."
              style={{
                display: "flex", alignItems: "center", gap: 4,
                padding: "2px 6px", fontSize: 10, fontFamily: "monospace",
                color: "var(--accent-blue)",
                background: "transparent",
                border: "1px solid var(--accent-blue)",
                borderRadius: 4,
                cursor: refresh.isPending ? "wait" : "pointer",
                opacity: refresh.isPending ? 0.5 : 1,
              }}
            >
              <RefreshCw size={10} className={refresh.isPending ? "animate-spin" : ""} />
              {refresh.isPending ? "fetching…" : "refresh"}
            </button>
          )}
        </div>
      }
    >
      {isLoading && (
        <div className="font-mono" style={{ fontSize: 10, color: "var(--text-muted)", marginBottom: 8 }}>
          generating thesis…
        </div>
      )}
      {refreshError && (
        <div className="font-mono" style={{ fontSize: 10, color: "var(--accent-red)", marginBottom: 8 }}>
          {refreshError}
        </div>
      )}

      {intelBias && intelBias.bias !== "UNKNOWN" && intelBias.reason && (() => {
        const c =
          intelBias.bias === "BULLISH"
            ? { fg: "var(--accent-green)", bg: "rgba(63,185,80,0.08)", border: "rgba(63,185,80,0.45)" }
            : intelBias.bias === "BEARISH"
              ? { fg: "var(--accent-red)", bg: "rgba(248,81,73,0.08)", border: "rgba(248,81,73,0.45)" }
              : { fg: "var(--accent-orange)", bg: "rgba(227,127,46,0.08)", border: "rgba(227,127,46,0.40)" };
        return (
          <div
            style={{
              fontSize: 12,
              lineHeight: 1.4,
              color: "var(--text-secondary)",
              background: c.bg,
              border: `1px solid ${c.border}`,
              borderRadius: 6,
              padding: "8px 10px",
              marginBottom: 10,
            }}
          >
            <span
              className="font-mono"
              style={{
                fontSize: 10,
                fontWeight: 600,
                textTransform: "uppercase",
                color: c.fg,
                marginRight: 6,
              }}
            >
              why {intelBias.bias.toLowerCase()}
            </span>
            {intelBias.reason}
          </div>
        );
      })()}

      <div
        style={{
          fontSize: 14,
          fontWeight: 600,
          color: "var(--text-primary)",
          lineHeight: 1.35,
          marginBottom: 12,
          letterSpacing: -0.1,
        }}
      >
        “{headline}”
      </div>

      {uniqueBullets.length > 0 ? (
        <div style={{ display: "flex", flexDirection: "column", gap: 8, marginBottom: 12 }}>
          {uniqueBullets.map((b, i) => (
            <div key={i} style={{ display: "grid", gridTemplateColumns: "82px 1fr", gap: 10, alignItems: "start" }}>
              <Tag color={INTEL_TAG_COLORS[b.tag]} border={INTEL_TAG_COLORS[b.tag]}>{b.tag}</Tag>
              <div style={{ color: "var(--text-secondary)", fontSize: 11.5, lineHeight: 1.5 }}>{b.text}</div>
            </div>
          ))}
        </div>
      ) : (
        <div className="font-mono" style={{ fontSize: 10, color: "var(--text-muted)", marginBottom: 12 }}>
          no cached intel for {ticker} — Analyze will populate this on first run
        </div>
      )}

      <div style={{ height: 1, background: "var(--border)", margin: "8px 0" }} />

      <div style={{ marginTop: 10 }}>
        <div
          className="font-mono"
          style={{
            fontSize: 9,
            letterSpacing: 0.8,
            textTransform: "uppercase",
            color: "var(--text-muted)",
            marginBottom: 6,
            fontWeight: 600,
          }}
        >
          LLM Panel
        </div>
        {llms.length === 0 ? (
          <div className="font-mono" style={{ fontSize: 10, color: "var(--text-muted)" }}>
            no thesis yet — click Analyze on this ticker
          </div>
        ) : (
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: 8 }}>
            {llms.map((m) => (
              <div
                key={m.name}
                style={{
                  border: "1px solid var(--border)",
                  padding: 8,
                  background: "rgba(22,27,34,0.6)",
                  borderRadius: 4,
                }}
              >
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 4 }}>
                  <span className="font-mono" style={{ fontSize: 10, color: "var(--text-secondary)", fontWeight: 600 }}>{m.name}</span>
                  <span className="font-mono" style={{ fontSize: 10, fontWeight: 700, color: INTEL_VIEW_COLORS[m.view] }}>{m.view}</span>
                </div>
                <div style={{ fontSize: 10.5, color: "var(--text-secondary)", lineHeight: 1.4 }}>{m.note}</div>
              </div>
            ))}
          </div>
        )}
      </div>
    </Panel>
  );
}
