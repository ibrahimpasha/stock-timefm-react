/**
 * Squarified treemap layout (Bruls, Huizing & van Wijk, 2000).
 *
 * Pure function — takes weighted nodes + a pixel box, returns each node placed
 * at {x, y, w, h} with aspect ratios kept as close to 1 as possible (the
 * finviz heat-map look, not thin slivers). No dependency on React or a chart
 * lib, so it stays trivially testable and fully under our control.
 */

export interface WeightedNode<T> {
  item: T;
  value: number;
}

export interface PlacedNode<T> {
  item: T;
  value: number;
  x: number;
  y: number;
  w: number;
  h: number;
}

interface Areic<T> extends WeightedNode<T> {
  area: number;
}

export function squarify<T>(
  nodes: WeightedNode<T>[],
  width: number,
  height: number
): PlacedNode<T>[] {
  const data = nodes.filter((n) => n.value > 0).sort((a, b) => b.value - a.value);
  const total = data.reduce((s, n) => s + n.value, 0);
  if (total <= 0 || width <= 0 || height <= 0) return [];

  const scale = (width * height) / total;
  const items: Areic<T>[] = data.map((n) => ({ ...n, area: n.value * scale }));
  const result: PlacedNode<T>[] = [];

  // Remaining free rectangle.
  let x = 0;
  let y = 0;
  let w = width;
  let h = height;

  // Worst (largest) aspect ratio in a row, given the side `len` it's laid along.
  const worst = (row: Areic<T>[], len: number): number => {
    if (row.length === 0) return Infinity;
    let sum = 0;
    let max = -Infinity;
    let min = Infinity;
    for (const n of row) {
      sum += n.area;
      if (n.area > max) max = n.area;
      if (n.area < min) min = n.area;
    }
    const len2 = len * len;
    const sum2 = sum * sum;
    return Math.max((len2 * max) / sum2, sum2 / (len2 * min));
  };

  // Place a finalized row along the shorter side of the free rectangle.
  const layoutRow = (row: Areic<T>[]) => {
    const sum = row.reduce((s, n) => s + n.area, 0);
    if (w >= h) {
      const colW = sum / h; // column of width colW spanning height h
      let cy = y;
      for (const n of row) {
        const nh = n.area / colW;
        result.push({ item: n.item, value: n.value, x, y: cy, w: colW, h: nh });
        cy += nh;
      }
      x += colW;
      w -= colW;
    } else {
      const rowH = sum / w; // row of height rowH spanning width w
      let cx = x;
      for (const n of row) {
        const nw = n.area / rowH;
        result.push({ item: n.item, value: n.value, x: cx, y, w: nw, h: rowH });
        cx += nw;
      }
      y += rowH;
      h -= rowH;
    }
  };

  let row: Areic<T>[] = [];
  let i = 0;
  while (i < items.length) {
    const next = items[i];
    const len = Math.min(w, h);
    if (row.length === 0 || worst([...row, next], len) <= worst(row, len)) {
      row.push(next);
      i++;
    } else {
      layoutRow(row);
      row = [];
    }
  }
  if (row.length) layoutRow(row);

  return result;
}
