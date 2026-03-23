import { Brain, BookOpen, AlertTriangle, Clock, TrendingUp, TrendingDown, Target } from "lucide-react";

interface IntelligencePanelProps {
  thesis: string | null;
  isLoading?: boolean;
  currentPrice?: number;
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

  // ── Direction scoring ──
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

  // Check for explicit conviction statements (weighted heavily)
  if (/conviction:\s*buy/i.test(text)) bullScore += 5;
  if (/conviction:\s*sell/i.test(text)) bearScore += 5;
  if (/bull\s*case.*\$(\d+)/i.test(text)) bullScore += 2;
  if (/bear\s*case.*\$(\d+)/i.test(text)) bearScore += 1;

  const total = bullScore + bearScore;
  if (total === 0) return null;

  const direction: PricePrediction["direction"] =
    bullScore > bearScore * 1.3 ? "bullish" :
    bearScore > bullScore * 1.3 ? "bearish" : "mixed";

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
            <div key={i} className="flex items-start gap-1.5 text-[10px] text-text-secondary leading-relaxed">
              <span className="text-accent-green mt-0.5 shrink-0">▲</span>
              <span>{c}</span>
            </div>
          ))}
        </div>
      )}
      {prediction.risks.length > 0 && (
        <div>
          {prediction.risks.map((r, i) => (
            <div key={i} className="flex items-start gap-1.5 text-[10px] text-text-secondary leading-relaxed">
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

export function IntelligencePanel({ thesis, isLoading, currentPrice }: IntelligencePanelProps) {
  if (isLoading) return <SkeletonIntel />;

  if (!thesis) {
    return (
      <div className="card">
        <h3 className="text-xs font-semibold text-text-secondary uppercase tracking-wider flex items-center gap-1.5 mb-3">
          <Brain size={13} />
          Intelligence
        </h3>
        <p className="text-xs text-text-muted text-center py-4">
          No thesis available -- run analysis to generate intelligence
        </p>
      </div>
    );
  }

  const sections = parseThesisSections(thesis);
  const prediction = extractPrediction(thesis, currentPrice);

  return (
    <div className="card">
      <h3 className="text-xs font-semibold text-text-secondary uppercase tracking-wider flex items-center gap-1.5 mb-4">
        <Brain size={13} />
        Intelligence
      </h3>

      {/* Prediction card at top */}
      {prediction && <PredictionCard prediction={prediction} currentPrice={currentPrice} />}

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
            <p className="text-xs text-text-secondary leading-relaxed whitespace-pre-wrap">
              {section.content}
            </p>
          </div>
        ))}
      </div>
    </div>
  );
}
