import { useEffect, useMemo, useRef, useState } from "react";
import {
  MapContainer, TileLayer, CircleMarker, Polygon, Tooltip, Popup, useMap,
} from "react-leaflet";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import "leaflet.heat";
import { useTickerMap, type BayAreaCompany } from "../api/map";
import { useTickerTaxonomy } from "../api/tickerTaxonomy";
import { useAppStore } from "../store/useAppStore";

type HeatPoint = [number, number, number];

function scoreColor(s: number | null): string {
  if (s == null) return "#6b7280";
  const t = Math.max(-100, Math.min(100, s)) / 100;
  const lerp = (a: number, b: number, u: number) => Math.round(a + (b - a) * u);
  if (t >= 0) return `rgb(${lerp(107, 34, t)},${lerp(114, 197, t)},${lerp(128, 94, t)})`;
  const u = -t;
  return `rgb(${lerp(107, 239, u)},${lerp(114, 68, u)},${lerp(128, 68, u)})`;
}
function radiusFor(mcap: number | null): number {
  if (!mcap || mcap <= 0) return 4;
  return Math.max(4, Math.min(28, 3 + 5.5 * Math.log10(mcap / 1e9 + 1)));
}
// Distinct categorical palette (Sasha Trubetskoy's 20 + extras) so different
// sectors never collide on the same color. Assigned by group frequency.
const GROUP_PALETTE = [
  "#4363d8", "#3cb44b", "#e6194B", "#f58231", "#911eb4", "#42d4f4", "#f032e6", "#ffe119",
  "#469990", "#9A6324", "#fabed4", "#808000", "#bfef45", "#e6beff", "#ff6f61", "#00a86b",
  "#6b5b95", "#dcbeff", "#aaffc3", "#ffd8b1", "#a9a9a9", "#fffac8", "#000075", "#800000",
];
type ColorBy = "signal" | "sector" | "theme";
function capWeight(mcap: number | null): number {
  if (!mcap || mcap <= 0) return 0.1;
  return Math.max(0.1, Math.min(1, Math.log10(mcap / 1e8) / 4));
}
function fmtCap(m: number | null): string {
  if (!m) return "—";
  if (m >= 1e12) return `$${(m / 1e12).toFixed(2)}T`;
  if (m >= 1e9) return `$${(m / 1e9).toFixed(1)}B`;
  if (m >= 1e6) return `$${(m / 1e6).toFixed(0)}M`;
  return `$${m.toFixed(0)}`;
}

const GREEN_GRAD = { 0.0: "rgba(0,0,0,0)", 0.3: "#0a8a3f", 0.6: "#1dd860", 1.0: "#9bffc2" };
const RED_GRAD = { 0.0: "rgba(0,0,0,0)", 0.3: "#8a1230", 0.6: "#e8344f", 1.0: "#ff9d9d" };
const SIZE_GRAD = { 0.15: "#1e3a8a", 0.4: "#0891b2", 0.6: "#22c55e", 0.8: "#eab308", 1.0: "#ef4444" };

const CAP_FILTERS = [
  { label: "All", min: 0 },
  { label: ">$1B", min: 1e9 },
  { label: ">$10B", min: 10e9 },
  { label: ">$100B", min: 100e9 },
];
type Mode = "bullbear" | "size" | "bubbles" | "footprints";
const MODES: { id: Mode; label: string }[] = [
  { id: "bullbear", label: "Bull/Bear heat" },
  { id: "size", label: "Size heat" },
  { id: "bubbles", label: "Bubbles" },
  { id: "footprints", label: "Footprints" },
];
type Region = "all" | "bay";
type Signal = "all" | "bull" | "bear";

const MAP_CSS = `
.leaflet-container { background:var(--bg-card); font-family:inherit; }
.leaflet-popup-content-wrapper,.leaflet-popup-tip { background:var(--bg-card-hover); color:var(--text-primary); border:1px solid var(--border); }
`;

function HeatLayer({ points, gradient }: { points: HeatPoint[]; gradient: Record<number, string> }) {
  const map = useMap();
  useEffect(() => {
    if (!points.length) return;
    const layer = (L as unknown as { heatLayer: (p: HeatPoint[], o: object) => L.Layer }).heatLayer(
      points,
      { radius: 25, blur: 20, maxZoom: 12, max: 1.0, minOpacity: 0.2, gradient },
    );
    layer.addTo(map);
    return () => {
      map.removeLayer(layer);
    };
  }, [map, points, gradient]);
  return null;
}

// Fly the map to fit a set of companies when `focusKey` changes (search/region).
function FlyTo({ companies, focusKey }: { companies: BayAreaCompany[]; focusKey: string }) {
  const map = useMap();
  const prev = useRef("");
  useEffect(() => {
    if (focusKey === prev.current) return;
    prev.current = focusKey;
    if (!companies.length) return;
    const b = L.latLngBounds(companies.map((c) => [c.lat, c.lng] as [number, number]));
    map.fitBounds(b.pad(0.2), { maxZoom: companies.length === 1 ? 13 : 11, animate: true });
  }, [map, companies, focusKey]);
  return null;
}


// Reusable map view — rendered standalone on the /map route and embedded in the
// Heat Map tab under its Treemap/Map toggle. heightOffset adjusts for the host's
// chrome (more chrome on the embedded Heat Map tab).
export function CompanyMapView({ heightOffset = 220 }: { heightOffset?: number }) {
  const [minCap, setMinCap] = useState(0);
  const [mode, setMode] = useState<Mode>("bullbear");
  const [region, setRegion] = useState<Region>("all");
  const [signal, setSignal] = useState<Signal>("all");
  const [query, setQuery] = useState("");
  const [colorBy, setColorBy] = useState<ColorBy>("signal");
  const { data, isLoading } = useTickerMap(minCap);
  const { data: taxonomy } = useTickerTaxonomy();
  const setActiveTicker = useAppStore((s) => s.setActiveTicker);
  const all = useMemo(() => data?.companies ?? [], [data?.companies]);

  const groupOf = (c: BayAreaCompany): string =>
    (taxonomy?.[c.ticker] as Record<string, string> | undefined)?.[colorBy] || "Unclassified";

  // Stable group→distinct-color map (by frequency), so each sector/theme is its
  // own color. Same taxonomy axis the treemap groups by.
  const groupColorMap = useMemo(() => {
    const m = new Map<string, string>();
    if (colorBy === "signal") return m;
    const counts = new Map<string, number>();
    for (const c of all) {
      const g = (taxonomy?.[c.ticker] as Record<string, string> | undefined)?.[colorBy] || "Unclassified";
      counts.set(g, (counts.get(g) || 0) + 1);
    }
    [...counts.entries()]
      .sort((a, b) => b[1] - a[1])
      .forEach(([g], i) =>
        m.set(g, g === "Unclassified" ? "#6b7280" : GROUP_PALETTE[i % GROUP_PALETTE.length]),
      );
    return m;
  }, [all, colorBy, taxonomy]);

  const colorOf = (c: BayAreaCompany): string =>
    colorBy === "signal" ? scoreColor(c.score) : groupColorMap.get(groupOf(c)) || "#6b7280";

  const q = query.trim().toUpperCase();
  const filtered = useMemo(
    () =>
      all.filter((c) => {
        if (region === "bay" && !c.is_bay_area && !c.is_campus) return false;
        if (signal === "bull" && !((c.score ?? -999) > 8)) return false;
        if (signal === "bear" && !((c.score ?? 999) < -8)) return false;
        if (q && !(c.ticker.includes(q) || (c.name || "").toUpperCase().includes(q))) return false;
        return true;
      }),
    [all, region, signal, q],
  );

  const stats = useMemo(() => {
    const scored = filtered.filter((c) => c.score != null);
    return {
      shown: filtered.length,
      total: all.length,
      bull: scored.filter((c) => (c.score ?? 0) > 8).length,
      bear: scored.filter((c) => (c.score ?? 0) < -8).length,
    };
  }, [filtered, all]);

  const groupLegend = useMemo(() => {
    if (colorBy === "signal") return [] as [string, number][];
    const counts = new Map<string, number>();
    for (const c of filtered) {
      const g = (taxonomy?.[c.ticker] as Record<string, string> | undefined)?.[colorBy] || "Unclassified";
      counts.set(g, (counts.get(g) || 0) + 1);
    }
    return [...counts.entries()].sort((a, b) => b[1] - a[1]).slice(0, 12);
  }, [filtered, colorBy, taxonomy]);

  const { bullPts, bearPts, sizePts } = useMemo(() => {
    const bull: HeatPoint[] = [], bear: HeatPoint[] = [], size: HeatPoint[] = [];
    for (const c of filtered) {
      const w = capWeight(c.market_cap);
      size.push([c.lat, c.lng, w]);
      if (c.score == null) continue;
      const mag = (Math.abs(c.score) / 100) * (0.45 + 0.55 * w);
      if (c.score > 5) bull.push([c.lat, c.lng, mag]);
      else if (c.score < -5) bear.push([c.lat, c.lng, mag]);
    }
    return { bullPts: bull, bearPts: bear, sizePts: size };
  }, [filtered]);

  // Only the two heat modes shrink markers to dots. Footprints mode keeps full
  // bubbles (so it's not "just a dot" when zoomed out) and overlays real
  // building polygons once you zoom to street level.
  const heatMode = mode === "bullbear" || mode === "size";
  const showMarkers = true;
  const focusKey = `${region}|${q}`;

  return (
    <div className="flex flex-col gap-3">
      <style>{MAP_CSS}</style>

      <div className="flex items-center justify-between flex-wrap gap-2">
        <div>
          <h1 className="text-base font-bold text-text-primary">Company Map</h1>
          <p className="text-xs text-text-muted">
            Every tracked ticker at its building. <span className="text-text-secondary">size = market cap</span>,{" "}
            <span className="text-text-secondary">color = bull/bear</span> (technical + momentum + flow). Search or
            filter to zero in.
          </p>
        </div>
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search ticker or name…"
          className="px-3 py-1.5 rounded text-xs bg-bg-card border border-border text-text-primary w-56 focus:outline-none focus:border-accent-blue"
        />
      </div>

      {/* Controls */}
      <div className="flex items-center gap-2 flex-wrap text-xs">
        <div className="flex items-center gap-1 bg-bg-card rounded p-0.5">
          {MODES.map((m) => (
            <button key={m.id} onClick={() => setMode(m.id)}
              className={`px-2.5 py-1 rounded font-medium ${mode === m.id ? "bg-accent-blue/20 text-accent-blue" : "text-text-secondary hover:bg-bg-card-hover"}`}>
              {m.label}
            </button>
          ))}
        </div>
        <div className="flex items-center gap-1 bg-bg-card rounded p-0.5">
          {(["all", "bay"] as Region[]).map((r) => (
            <button key={r} onClick={() => setRegion(r)}
              className={`px-2.5 py-1 rounded font-medium ${region === r ? "bg-accent-blue/20 text-accent-blue" : "text-text-secondary hover:bg-bg-card-hover"}`}>
              {r === "all" ? "All US" : "Bay Area"}
            </button>
          ))}
        </div>
        <div className="flex items-center gap-1 bg-bg-card rounded p-0.5">
          {(["all", "bull", "bear"] as Signal[]).map((s) => (
            <button key={s} onClick={() => setSignal(s)}
              className={`px-2.5 py-1 rounded font-medium capitalize ${signal === s ? "bg-accent-blue/20 text-accent-blue" : "text-text-secondary hover:bg-bg-card-hover"}`}>
              {s === "all" ? "Any signal" : s}
            </button>
          ))}
        </div>
        <div className="flex items-center gap-1 bg-bg-card rounded p-0.5">
          {(["signal", "sector", "theme"] as ColorBy[]).map((cb) => (
            <button key={cb} onClick={() => setColorBy(cb)}
              className={`px-2.5 py-1 rounded font-medium capitalize ${colorBy === cb ? "bg-accent-blue/20 text-accent-blue" : "text-text-secondary hover:bg-bg-card-hover"}`}>
              {cb === "signal" ? "Color: signal" : cb}
            </button>
          ))}
        </div>
        <div className="flex items-center gap-1">
          {CAP_FILTERS.map((f) => (
            <button key={f.label} onClick={() => setMinCap(f.min)}
              className={`px-2 py-1 rounded font-medium ${minCap === f.min ? "bg-accent-blue/20 text-accent-blue" : "text-text-secondary hover:bg-bg-card-hover"}`}>
              {f.label}
            </button>
          ))}
        </div>
        <span className="text-text-muted ml-1">
          <span className="text-text-secondary font-mono">{stats.shown}</span>
          {stats.shown !== stats.total && <span>/{stats.total}</span>} shown ·{" "}
          <span className="text-accent-green">{stats.bull}▲</span>{" "}
          <span className="text-accent-red">{stats.bear}▼</span>
        </span>
        {mode === "footprints" && (
          <span className="text-accent-orange">⌖ real building footprints — zoom in to see the shapes</span>
        )}
      </div>

      {colorBy !== "signal" && groupLegend.length > 0 && (
        <div className="flex items-center gap-x-3 gap-y-1 text-xs text-text-muted flex-wrap">
          {groupLegend.map(([g, n]) => (
            <span key={g} className="flex items-center gap-1">
              <span className="inline-block w-2.5 h-2.5 rounded-sm" style={{ background: groupColorMap.get(g) || "#6b7280" }} />
              {g.replace(/_/g, " ").toLowerCase()} <span className="opacity-50">{n}</span>
            </span>
          ))}
        </div>
      )}

      <div className="rounded-lg overflow-hidden border border-border relative" style={{ height: `calc(100vh - ${heightOffset}px)`, minHeight: 460 }}>
        {isLoading && (
          <div className="absolute inset-0 z-[500] flex items-center justify-center bg-bg-primary/60 text-text-muted text-sm">Loading map…</div>
        )}
        {data && (data.ready === false || data.count === 0) && (
          <div className="absolute inset-0 z-[500] flex items-center justify-center bg-bg-primary/70 text-text-muted text-sm text-center px-6">
            Geocoding all tracked tickers to their buildings… this runs in the background (~10-15 min) and grows live.
          </div>
        )}
        <MapContainer center={[37.8, -98]} zoom={4} style={{ height: "100%", width: "100%" }} scrollWheelZoom preferCanvas>
          <TileLayer url="https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png" attribution="&copy; OpenStreetMap &copy; CARTO" subdomains="abcd" />
          <FlyTo companies={filtered} focusKey={focusKey} />
          {mode === "bullbear" && <HeatLayer points={bullPts} gradient={GREEN_GRAD} />}
          {mode === "bullbear" && <HeatLayer points={bearPts} gradient={RED_GRAD} />}
          {mode === "size" && <HeatLayer points={sizePts} gradient={SIZE_GRAD} />}
          {mode === "footprints" &&
            filtered.map((c) =>
              c.building && c.building.length >= 3 ? (
                <Polygon
                  key={`fp-${c.ticker}`}
                  positions={c.building}
                  pathOptions={{ color: colorOf(c), weight: 1.5, fillColor: colorOf(c), fillOpacity: 0.55 }}
                  eventHandlers={{ click: () => setActiveTicker(c.ticker) }}
                >
                  <Tooltip sticky>
                    <span style={{ fontWeight: 600 }}>{c.ticker}</span> · {fmtCap(c.market_cap)}
                  </Tooltip>
                  <Popup>
                    <CompanyPopup c={c} />
                  </Popup>
                </Polygon>
              ) : null,
            )}

          {showMarkers &&
            filtered.map((c) => (
              <CircleMarker
                key={c.ticker}
                center={[c.lat, c.lng]}
                radius={heatMode ? 3 : radiusFor(c.market_cap)}
                pathOptions={{
                  color: c.is_campus ? "#ffffff" : colorOf(c),
                  fillColor: colorOf(c),
                  fillOpacity: heatMode ? 0.6 : 0.72,
                  weight: c.is_campus ? 1.6 : heatMode ? 0.4 : 1,
                  dashArray: c.is_campus ? "3 3" : undefined,
                }}
                eventHandlers={{ click: () => setActiveTicker(c.ticker) }}
              >
                <Tooltip direction="top" offset={[0, -4]} opacity={1}>
                  <span style={{ fontWeight: 600 }}>{c.ticker}</span> · {fmtCap(c.market_cap)}
                  {c.score != null && (
                    <> · <span style={{ color: scoreColor(c.score) }}>{c.score > 0 ? "+" : ""}{c.score}</span></>
                  )}
                </Tooltip>
                <Popup>
                  <CompanyPopup c={c} />
                </Popup>
              </CircleMarker>
            ))}
        </MapContainer>
      </div>
    </div>
  );
}

// Standalone /map route.
export function BayAreaMapPage() {
  return <CompanyMapView />;
}

function CompanyPopup({ c }: { c: BayAreaCompany }) {
  const row = (label: string, val: string | number | null, color?: string) =>
    val == null ? null : (
      <div style={{ display: "flex", justifyContent: "space-between", gap: 12 }}>
        <span style={{ color: "var(--text-secondary)" }}>{label}</span>
        <span style={{ fontFamily: "monospace", color: color ?? "var(--text-primary)" }}>{val}</span>
      </div>
    );
  return (
    <div style={{ minWidth: 180, fontSize: 12 }}>
      <div style={{ fontWeight: 700, fontSize: 13 }}>
        {c.ticker} <span style={{ color: "var(--text-secondary)", fontWeight: 400 }}>· {c.city}{c.state ? `, ${c.state}` : ""}</span>
      </div>
      <div style={{ color: "var(--text-secondary)", marginBottom: 6 }}>{c.name}</div>
      {c.is_campus && <div style={{ color: "var(--accent-orange)", marginBottom: 6, fontSize: 11 }}>◌ Bay Area campus · {c.hq_note}</div>}
      {row("Market cap", fmtCap(c.market_cap))}
      {row("Composite", c.score != null ? `${c.score > 0 ? "+" : ""}${c.score}` : "no signal", c.score != null ? scoreColor(c.score) : undefined)}
      {row("30d return", c.momentum_30d != null ? `${c.momentum_30d > 0 ? "+" : ""}${c.momentum_30d}%` : null)}
      {row("Technical", c.tech_score != null ? `${c.tech_score > 0 ? "+" : ""}${c.tech_score}` : null)}
      {row("Flow bull%", c.flow_bull_share != null ? `${Math.round(c.flow_bull_share * 100)}%` : null)}
      {c.components.length > 0 && <div style={{ color: "var(--text-muted)", marginTop: 6, fontSize: 11 }}>signals: {c.components.join(" + ")}</div>}
    </div>
  );
}
