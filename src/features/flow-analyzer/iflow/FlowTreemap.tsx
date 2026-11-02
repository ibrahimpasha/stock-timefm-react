import { useMemo } from "react";
import { leanTone } from "../../../lib/deskMath";
import { useElementSize } from "../../../lib/useElementSize";
import { formatPremium } from "../../../lib/utils";
import { squarify } from "../heatmap/squarify";

export interface TreemapNode {
  id: string;
  label: string;
  value: number;
  bull: number;
  bear: number;
  /** Premium whose side is unknown. It dilutes the lean: a print we can't read isn't evidence. */
  other: number;
  detail: string;
  /** Biggest names inside, shown when the tile has room: the answer to "which ones?" */
  names?: { label: string; value: number }[];
}

const GAP = 6;

function figureClass(area: number) {
  if (area > 44_000) return "text-[1.75rem]";
  if (area > 24_000) return "text-2xl";
  if (area > 13_000) return "text-xl";
  if (area > 7_000) return "text-base";
  return "text-sm";
}

/** Tiles keep their identity across lenses, so switching a KPI slides them to their new
 *  place and you can watch where the money moves instead of re-reading a new chart. */
export function FlowTreemap({ nodes, onPick }: { nodes: TreemapNode[]; onPick: (id: string) => void }) {
  const [ref, { width, height }] = useElementSize();
  const placed = useMemo(
    () => squarify(nodes.map((node) => ({ item: node, value: node.value })), width + GAP, height + GAP),
    [nodes, width, height],
  );
  return (
    <div ref={ref} className="treemap">
      {placed.map(({ item, x, y, w, h }) => {
        const tileW = Math.max(0, w - GAP);
        const tileH = Math.max(0, h - GAP);
        const sides = item.bull + item.bear;
        const mostlyUnknown = item.other > sides;
        const chip = mostlyUnknown
          ? `${Math.round((item.other / (sides + item.other)) * 100)}% unknown`
          : sides
            ? `${Math.round((item.bull / sides) * 100)}% bull`
            : null;
        const showFigure = tileH >= 30 && tileW >= 68;
        const showLabel = tileW >= 50 && tileH >= (tileW < 112 ? 76 : 56); // narrow labels wrap to two lines
        const showChip = chip != null && tileW >= 180 && tileH >= 64;
        const nameRows = tileW >= 150 ? Math.floor((tileH - 84) / 22) : 0;
        const share = chip ? `, ${chip} by premium` : "";
        return (
          <button
            key={item.id}
            type="button"
            className="heat-tile"
            data-tone={leanTone(item.bull, item.bear, item.other)}
            data-compact={tileW < 112 ? "" : undefined}
            style={{ left: x, top: y, width: tileW, height: tileH }}
            title={`${item.label}: ${formatPremium(item.value)}${share}. ${item.detail}`}
            aria-label={`${item.label}, ${formatPremium(item.value)}${share}`}
            onClick={() => onPick(item.id)}
          >
            {showLabel && <span className="heat-tile__label">{item.label}</span>}
            {nameRows > 0 && item.names && (
              <span className="heat-tile__names num">
                {item.names.slice(0, nameRows).map((name) => (
                  <span key={name.label}>
                    <span>{name.label}</span>
                    <span>{formatPremium(name.value)}</span>
                  </span>
                ))}
              </span>
            )}
            {showFigure && (
              <span className="heat-tile__foot">
                <span className={`num font-medium leading-none tracking-tight ${figureClass(tileW * tileH)}`}>{formatPremium(item.value)}</span>
                {showChip && <span className="heat-tile__chip num">{chip}</span>}
              </span>
            )}
          </button>
        );
      })}
    </div>
  );
}
