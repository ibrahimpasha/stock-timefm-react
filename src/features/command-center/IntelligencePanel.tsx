import { Brain, BookOpen, AlertTriangle, Clock, RefreshCw } from "lucide-react";
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
    // 30s staleTime + refetchOnMount/Focus 'always' so a server-side
    // backfill (e.g. via /api/intel/refresh from this panel OR from a
    // separate cron) is reflected within seconds of the panel mounting.
    // The previous 5-min staleTime + default refetch-once-per-mount
    // semantics let users sit on multi-day-old cached responses if the
    // tab had been open since before a refresh.
    staleTime: 30_000,
    refetchOnMount: "always",
    refetchOnWindowFocus: "always",
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

export function IntelligencePanel({ thesis, isLoading, ticker }: IntelligencePanelProps) {
  // Always pull cached web-search intel so we can fall back when no formal
  // thesis exists. Backfill script pre-populates this for all flow tickers,
  // so the "no intelligence" state should essentially never appear.
  const { data: cats, isLoading: catsLoading } = useIntelLatestForPanel(ticker);
  const refresh = useIntelRefresh(ticker);
  const [refreshError, setRefreshError] = useState<string | null>(null);
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
          {ticker && (
            <button
              onClick={() => {
                setRefreshError(null);
                refresh.mutate(undefined, {
                  onError: (e) =>
                    setRefreshError(
                      (e as Error)?.message || "refresh failed",
                    ),
                });
              }}
              disabled={refresh.isPending}
              title="Fetch this ticker's intel via Perplexity / Claude web-search. Takes ~30-60s."
              className="ml-auto flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-mono text-accent-blue hover:bg-accent-blue/10 border border-accent-blue/30 transition-colors disabled:opacity-50"
            >
              <RefreshCw
                size={10}
                className={refresh.isPending ? "animate-spin" : ""}
              />
              {refresh.isPending ? "fetching…" : "fetch now"}
            </button>
          )}
        </h3>
        {refreshError && (
          <div className="mb-2 text-[10px] font-mono text-accent-red">
            {refreshError}
          </div>
        )}
        <p className="text-xs text-text-muted text-center py-4">
          {refresh.isPending
            ? `Fetching intel for ${ticker} — this takes 30-60s...`
            : `No cached intelligence for ${ticker || "this ticker"} — click "fetch now" to backfill.`}
        </p>
      </div>
    );
  }

  const sections = parseThesisSections(effectiveThesis);

  return (
    <div className="card">
      <h3 className="text-xs font-semibold text-text-secondary uppercase tracking-wider flex items-center gap-1.5 mb-4">
        <Brain size={13} />
        Intelligence
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

      {/* Directional BIAS chip + reasoning callout + keyword-derived
          PredictionCard removed 2026-06-02 — the Perplexity bullish/bearish
          read was unreliable (flipped on ~44% of refreshes, ~0 P/L edge). The
          intel sections below carry the factual narrative without a synthesized
          directional call. */}

      <div className="space-y-3">
        {sections.map((section, idx) => (
          <div
            key={idx}
            className="rounded-lg p-3"
            style={{ background: "color-mix(in srgb, var(--bg-card) 50%, transparent)" }}
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
