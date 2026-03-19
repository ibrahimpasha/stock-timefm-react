import { useEffect, useRef, useMemo } from "react";
import { Network } from "lucide-react";

interface IntelMapProps {
  ticker: string;
  relatedTickers: string[];
  isLoading: boolean;
}

interface Node {
  id: string;
  x: number;
  y: number;
  isPrimary: boolean;
}

interface Edge {
  from: string;
  to: string;
}

export function IntelMap({ ticker, relatedTickers, isLoading }: IntelMapProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  const { nodes, edges } = useMemo(() => {
    const centerX = 250;
    const centerY = 180;
    const radius = 120;

    const allNodes: Node[] = [
      { id: ticker, x: centerX, y: centerY, isPrimary: true },
    ];

    const related = relatedTickers.length > 0 ? relatedTickers : [];
    related.forEach((t, i) => {
      const angle = (2 * Math.PI * i) / Math.max(related.length, 1);
      allNodes.push({
        id: t,
        x: centerX + radius * Math.cos(angle),
        y: centerY + radius * Math.sin(angle),
        isPrimary: false,
      });
    });

    const allEdges: Edge[] = related.map((t) => ({
      from: ticker,
      to: t,
    }));

    return { nodes: allNodes, edges: allEdges };
  }, [ticker, relatedTickers]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const dpr = window.devicePixelRatio || 1;
    canvas.width = 500 * dpr;
    canvas.height = 360 * dpr;
    ctx.scale(dpr, dpr);
    ctx.clearRect(0, 0, 500, 360);

    // Draw edges
    ctx.strokeStyle = "rgba(88, 166, 255, 0.2)";
    ctx.lineWidth = 1;
    edges.forEach((edge) => {
      const from = nodes.find((n) => n.id === edge.from);
      const to = nodes.find((n) => n.id === edge.to);
      if (!from || !to) return;
      ctx.beginPath();
      ctx.moveTo(from.x, from.y);
      ctx.lineTo(to.x, to.y);
      ctx.stroke();
    });

    // Draw nodes
    nodes.forEach((node) => {
      const r = node.isPrimary ? 24 : 18;
      // Glow
      ctx.shadowBlur = node.isPrimary ? 15 : 8;
      ctx.shadowColor = node.isPrimary
        ? "rgba(63, 185, 80, 0.5)"
        : "rgba(88, 166, 255, 0.3)";
      // Circle
      ctx.fillStyle = node.isPrimary
        ? "rgba(63, 185, 80, 0.15)"
        : "rgba(88, 166, 255, 0.1)";
      ctx.strokeStyle = node.isPrimary
        ? "rgba(63, 185, 80, 0.6)"
        : "rgba(88, 166, 255, 0.4)";
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.arc(node.x, node.y, r, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
      // Reset shadow
      ctx.shadowBlur = 0;
      // Label
      ctx.fillStyle = node.isPrimary ? "#3fb950" : "#58a6ff";
      ctx.font = `${node.isPrimary ? "bold 12px" : "11px"} 'JetBrains Mono', monospace`;
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText(node.id, node.x, node.y);
    });
  }, [nodes, edges]);

  if (isLoading) {
    return (
      <div className="card">
        <div className="h-64 bg-bg-card-hover rounded-lg animate-pulse" />
      </div>
    );
  }

  return (
    <div className="card">
      <div className="flex items-center gap-2 mb-3">
        <Network size={16} className="text-accent-purple" />
        <h2 className="text-sm font-semibold text-text-secondary">Intelligence Map</h2>
      </div>
      {relatedTickers.length === 0 ? (
        <p className="text-xs text-text-muted text-center py-8">
          No relationship data available for {ticker}.
        </p>
      ) : (
        <canvas
          ref={canvasRef}
          style={{ width: "100%", maxWidth: 500, height: 360 }}
          className="mx-auto"
        />
      )}
    </div>
  );
}
