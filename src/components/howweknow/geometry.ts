/** Pure chart geometry for the "How we know" SVG charts. No React, no data fetching: tested in geometry.test.ts. */
import type { BinCell } from "@/lib/cimis/compare";

export type Tick = { value: number; pos: number };

/** "Nice" tick values from 0 to max (inclusive), about `target` of them. */
export function niceTicks(max: number, target = 5): number[] {
  if (!(max > 0)) return [0];
  const raw = max / target;
  const mag = 10 ** Math.floor(Math.log10(raw));
  const norm = raw / mag;
  const step = (norm <= 1 ? 1 : norm <= 2 ? 2 : norm <= 5 ? 5 : 10) * mag;
  const out: number[] = [];
  for (let v = 0; v <= max + step * 1e-9; v += step) out.push(Math.round(v / step) * step);
  return out;
}

export type ScatterGeometry = {
  size: number;
  plot: { x: number; y: number; w: number; h: number };
  axisMax: number;
  cells: { x: number; y: number; w: number; h: number; count: number; opacity: number }[];
  maxCount: number;
  ticks: { value: number; px: number; py: number }[];
  oneToOne: { x1: number; y1: number; x2: number; y2: number };
  regression: { x1: number; y1: number; x2: number; y2: number } | null;
};

/** Density cells in plot coordinates. y is flipped (SVG y grows downward). Shading is by log(count) so single days stay visible. */
export function scatterGeometry(
  binned: { binSizeMm: number; cells: BinCell[]; axisMaxMm: number },
  regression: { slope: number; intercept: number } | null,
  size = 460,
  margin = { left: 56, right: 14, top: 12, bottom: 50 },
): ScatterGeometry {
  const axisMax = Math.max(1, binned.axisMaxMm);
  const w = size - margin.left - margin.right;
  const h = size - margin.top - margin.bottom;
  const px = (v: number) => margin.left + (v / axisMax) * w;
  const py = (v: number) => margin.top + h - (v / axisMax) * h;
  const maxCount = binned.cells.reduce((m, c) => Math.max(m, c.count), 1);
  const cw = (binned.binSizeMm / axisMax) * w;
  const ch = (binned.binSizeMm / axisMax) * h;
  const cells = binned.cells.map((c) => ({
    x: px(c.x),
    y: py(c.y) - ch,
    w: cw,
    h: ch,
    count: c.count,
    opacity: maxCount === 1 ? 0.9 : 0.18 + 0.82 * (Math.log(c.count) / Math.log(maxCount)),
  }));
  const ticks = niceTicks(axisMax, 5).map((value) => ({ value, px: px(value), py: py(value) }));
  let reg: ScatterGeometry["regression"] = null;
  if (regression) {
    // Clip the line to the plot square [0, axisMax] on both axes.
    const { slope, intercept } = regression;
    let x1 = 0;
    let x2 = axisMax;
    if (slope !== 0) {
      const xa = (0 - intercept) / slope;
      const xb = (axisMax - intercept) / slope;
      x1 = Math.max(0, Math.min(xa, xb));
      x2 = Math.min(axisMax, Math.max(xa, xb));
    } else if (intercept < 0 || intercept > axisMax) {
      x1 = x2 = NaN;
    }
    if (Number.isFinite(x1) && x2 > x1) reg = { x1: px(x1), y1: py(slope * x1 + intercept), x2: px(x2), y2: py(slope * x2 + intercept) };
  }
  return { size, plot: { x: margin.left, y: margin.top, w, h }, axisMax, cells, maxCount, ticks, oneToOne: { x1: px(0), y1: py(0), x2: px(axisMax), y2: py(axisMax) }, regression: reg };
}

export type BarGroup = { label: string; a: number | null; b: number | null };

export type BarGeometry = {
  width: number;
  height: number;
  plot: { x: number; y: number; w: number; h: number };
  yMax: number;
  yTicks: { value: number; py: number }[];
  groups: { label: string; cx: number; a: { x: number; y: number; w: number; h: number } | null; b: { x: number; y: number; w: number; h: number } | null }[];
};

/** Two bars per group (a = observed, b = modelled), sized so every group has `groupWidth` px. A null value draws no bar (never a zero-height one). */
export function barGeometry(groups: BarGroup[], opts: { groupWidth: number; height?: number; left?: number; right?: number; top?: number; bottom?: number }): BarGeometry {
  const height = opts.height ?? 240;
  const left = opts.left ?? 48;
  const right = opts.right ?? 10;
  const top = opts.top ?? 10;
  const bottom = opts.bottom ?? 44;
  const w = groups.length * opts.groupWidth;
  const width = left + w + right;
  const h = height - top - bottom;
  const max = groups.reduce((m, g) => Math.max(m, g.a ?? 0, g.b ?? 0), 0);
  const ticks = niceTicks(max > 0 ? max : 1, 4);
  const yMax = ticks[ticks.length - 1] > 0 ? ticks[ticks.length - 1] : 1;
  const py = (v: number) => top + h - (v / yMax) * h;
  const barW = Math.max(1, (opts.groupWidth - Math.max(1, opts.groupWidth * 0.2)) / 2);
  const gap = (opts.groupWidth - 2 * barW) / 2;
  return {
    width,
    height,
    plot: { x: left, y: top, w, h },
    yMax,
    yTicks: ticks.map((value) => ({ value, py: py(value) })),
    groups: groups.map((g, i) => {
      const x0 = left + i * opts.groupWidth + gap;
      const bar = (v: number | null, x: number) => (v === null ? null : { x, y: py(v), w: barW, h: top + h - py(v) });
      return { label: g.label, cx: left + i * opts.groupWidth + opts.groupWidth / 2, a: bar(g.a, x0), b: bar(g.b, x0 + barW) };
    }),
  };
}
