import { MIN_PAIRED_DAYS_PER_YEAR } from "./constants";

/** A daily series point. value null = missing. */
export type SeriesPoint = { date: string; value: number | null };

export type AnnualRow =
  | { year: number; comparable: true; pairedDays: number; stationTotalMm: number; powerTotalMm: number; ratio: number | null }
  | { year: number; comparable: false; pairedDays: number; reason: string };

export type BinCell = { x: number; y: number; count: number };

export type Comparison = {
  n: number;
  dateRange: { start: string; end: string } | null;
  /** Dates in either series that were not paired, with reasons. dropped.total = stationMissing + powerMissing + bothMissing. */
  dropped: { total: number; stationMissing: number; powerMissing: number; bothMissing: number };
  /** Regression of POWER (y) on station (x). null when n < 2 or the station series is constant. */
  regression: { slope: number; intercept: number } | null;
  /** Square of Pearson r (coefficient of determination of the linear fit). null when undefined. */
  r2: number | null;
  /** Mean of (POWER minus station), mm/day. Positive = POWER reads higher. */
  biasMmPerDay: number | null;
  rmseMmPerDay: number | null;
  meanStationMm: number | null;
  meanPowerMm: number | null;
  /** Sum of POWER over paired days divided by sum of station over paired days. */
  overallRatio: number | null;
  annual: AnnualRow[];
  /** Paired points [station, power] rounded to 0.01 mm. Full resolution; fine for canvas. */
  points: [number, number][];
  /** Same points counted in square cells of `binSizeMm`; use this for SVG (a few hundred cells instead of thousands of circles). */
  binned: { binSizeMm: number; cells: BinCell[]; axisMaxMm: number };
  summary: string;
};

const BIN_MM = 0.25;

export function compareSeries(station: SeriesPoint[], power: SeriesPoint[], opts: { minDaysPerYear?: number } = {}): Comparison {
  const minYear = opts.minDaysPerYear ?? MIN_PAIRED_DAYS_PER_YEAR;
  const s = new Map<string, number | null>();
  const p = new Map<string, number | null>();
  for (const d of station) s.set(d.date, d.value !== null && Number.isFinite(d.value) ? d.value : null);
  for (const d of power) p.set(d.date, d.value !== null && Number.isFinite(d.value) ? d.value : null);
  const dates = [...new Set([...s.keys(), ...p.keys()])].sort();

  const dropped = { total: 0, stationMissing: 0, powerMissing: 0, bothMissing: 0 };
  const pairs: { date: string; x: number; y: number }[] = [];
  for (const date of dates) {
    const x = s.get(date) ?? null;
    const y = p.get(date) ?? null;
    if (x !== null && y !== null) pairs.push({ date, x, y });
    else {
      dropped.total++;
      if (x === null && y === null) dropped.bothMissing++;
      else if (x === null) dropped.stationMissing++;
      else dropped.powerMissing++;
    }
  }

  const n = pairs.length;
  const sumX = pairs.reduce((a, q) => a + q.x, 0);
  const sumY = pairs.reduce((a, q) => a + q.y, 0);
  const meanX = n ? sumX / n : null;
  const meanY = n ? sumY / n : null;
  let regression: Comparison["regression"] = null;
  let r2: number | null = null;
  let bias: number | null = null;
  let rmse: number | null = null;
  if (n > 0 && meanX !== null && meanY !== null) {
    bias = meanY - meanX;
    rmse = Math.sqrt(pairs.reduce((a, q) => a + (q.y - q.x) ** 2, 0) / n);
    let sxx = 0;
    let syy = 0;
    let sxy = 0;
    for (const q of pairs) {
      sxx += (q.x - meanX) ** 2;
      syy += (q.y - meanY) ** 2;
      sxy += (q.x - meanX) * (q.y - meanY);
    }
    if (n >= 2 && sxx > 1e-12) {
      const slope = sxy / sxx;
      regression = { slope, intercept: meanY - slope * meanX };
      if (syy > 1e-12) r2 = Math.min(1, (sxy * sxy) / (sxx * syy));
    }
  }

  const byYear = new Map<number, { n: number; sx: number; sy: number }>();
  for (const q of pairs) {
    const y = Number(q.date.slice(0, 4));
    const a = byYear.get(y) ?? { n: 0, sx: 0, sy: 0 };
    a.n++;
    a.sx += q.x;
    a.sy += q.y;
    byYear.set(y, a);
  }
  const annual: AnnualRow[] = [...byYear.entries()]
    .sort((a, b) => a[0] - b[0])
    .map(([year, a]): AnnualRow =>
      a.n >= minYear
        ? { year, comparable: true, pairedDays: a.n, stationTotalMm: a.sx, powerTotalMm: a.sy, ratio: a.sx > 0 ? a.sy / a.sx : null }
        : { year, comparable: false, pairedDays: a.n, reason: `only ${a.n} paired days (need at least ${minYear})` },
    );

  const points = pairs.map((q): [number, number] => [Math.round(q.x * 100) / 100, Math.round(q.y * 100) / 100]);
  const cellMap = new Map<string, BinCell>();
  let maxV = 0;
  for (const q of pairs) {
    maxV = Math.max(maxV, q.x, q.y);
    const bx = Math.floor(q.x / BIN_MM);
    const by = Math.floor(q.y / BIN_MM);
    const k = `${bx}:${by}`;
    const c = cellMap.get(k);
    if (c) c.count++;
    else cellMap.set(k, { x: bx * BIN_MM, y: by * BIN_MM, count: 1 });
  }

  const overallRatio = n && sumX > 0 ? sumY / sumX : null;
  const dateRange = n ? { start: pairs[0].date, end: pairs[n - 1].date } : null;
  const out: Comparison = {
    n,
    dateRange,
    dropped,
    regression,
    r2,
    biasMmPerDay: bias,
    rmseMmPerDay: rmse,
    meanStationMm: meanX,
    meanPowerMm: meanY,
    overallRatio,
    annual,
    points,
    binned: { binSizeMm: BIN_MM, cells: [...cellMap.values()], axisMaxMm: Math.ceil(maxV) },
    summary: "",
  };
  out.summary = summarize(out);
  return out;
}

/** Plain-English sentence built only from the computed numbers. */
export function summarize(c: Pick<Comparison, "n" | "dateRange" | "biasMmPerDay" | "overallRatio" | "r2">): string {
  if (c.n === 0 || c.biasMmPerDay === null || c.dateRange === null) {
    return "There are no days where both the Brentwood station and NASA POWER have a value, so they cannot be compared.";
  }
  const days = c.n.toLocaleString("en-US");
  const rounded = Math.round(Math.abs(c.biasMmPerDay) * 10) / 10;
  const span = `${c.dateRange.start} to ${c.dateRange.end}`;
  const ratio = c.overallRatio !== null ? ` (NASA POWER total is ${c.overallRatio.toFixed(2)} times the station total)` : "";
  const r2 = c.r2 !== null ? ` R² is ${c.r2.toFixed(2)}.` : "";
  if (rounded === 0) {
    return `On ${days} shared days (${span}), NASA POWER (regional climate, about 50 km grid) and the Brentwood station agree on average, differing by 0.0 mm/day${ratio}.${r2}`;
  }
  const dir = c.biasMmPerDay > 0 ? "higher" : "lower";
  return `On ${days} shared days (${span}), NASA POWER (regional climate, about 50 km grid) reads ${rounded.toFixed(1)} mm/day ${dir} than the Brentwood station on average${ratio}.${r2}`;
}
