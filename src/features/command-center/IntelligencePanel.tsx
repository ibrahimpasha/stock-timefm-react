import { Brain, BookOpen, AlertTriangle, Clock } from "lucide-react";

interface IntelligencePanelProps {
  thesis: string | null;
  isLoading?: boolean;
}

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

/**
 * Parse thesis text into sections.
 * Looks for markdown-style headers (## or **Title:**) and splits accordingly.
 */
function parseThesisSections(text: string): { title: string; content: string }[] {
  const lines = text.split("\n");
  const sections: { title: string; content: string }[] = [];
  let currentTitle = "Analysis";
  let currentLines: string[] = [];

  for (const line of lines) {
    // Check for markdown header
    const headerMatch = line.match(/^#{1,3}\s+(.+)/);
    const boldMatch = line.match(/^\*\*(.+?)\*\*:?\s*(.*)/);

    if (headerMatch) {
      if (currentLines.length > 0) {
        sections.push({ title: currentTitle, content: currentLines.join("\n").trim() });
      }
      currentTitle = headerMatch[1];
      currentLines = [];
    } else if (boldMatch && currentLines.length === 0) {
      // Bold header at start of a section
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

export function IntelligencePanel({ thesis, isLoading }: IntelligencePanelProps) {
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

  return (
    <div className="card">
      <h3 className="text-xs font-semibold text-text-secondary uppercase tracking-wider flex items-center gap-1.5 mb-4">
        <Brain size={13} />
        Intelligence
      </h3>

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
