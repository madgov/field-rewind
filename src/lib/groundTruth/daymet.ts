import type { DailyRecord } from "../types";
import { pairStats, pearson } from "./stats";
import type { AnnualPrecipRow, DaymetComparison, DaymetDay } from "./types";

export const DAYMET_START = "1985-01-01";
export const DAYMET_END = "2024-12-31";
/** A year enters the annual-totals comparison only if at least this many days are paired. */
export const MIN_PAIRED_DAYS_PER_YEAR = 360;

export function isLeap(y: number): boolean {
  return (y % 4 === 0 && y % 100 !== 0) || y % 400 === 0;
}

/** Daymet (year, day-of-year 1..365) to ISO date. In leap years day 1..365 runs Jan 1 to Dec 30 (Dec 31 is dropped). */
export function daymetDate(year: number, yday: number): string {
  const d = new Date(Date.UTC(year, 0, 1) + (yday - 1) * 86_400_000);
  return d.toISOString().slice(0, 10);
}

export type DaymetParsed = { lat: number; lon: number; elevationM: number | null; citationLine: string | null; days: DaymetDay[] };

/** Parse the single-pixel CSV. Validates the header units; throws an Error with a plain message when they differ. */
export function parseDaymetCsv(text: string): DaymetParsed {
  const lines = text.split(/\r?\n/);
  const headerIdx = lines.findIndex((l) => l.startsWith("year,yday"));
  if (headerIdx < 0) throw new Error("Daymet response had no data table (no 'year,yday' header).");
  const meta = lines.slice(0, headerIdx);
  const ll = /Latitude:\s*(-?[\d.]+)\s+Longitude:\s*(-?[\d.]+)/.exec(meta[0] ?? "");
  const elev = meta.map((l) => /Elevation:\s*(-?[\d.]+)\s*meters/i.exec(l)).find(Boolean);
  const cite = meta.find((l) => l.startsWith("How to cite")) ?? null;
  const cols = (lines[headerIdx] as string).split(",").map((c) => c.trim().toLowerCase());
  const need = { prcp: "prcp (mm/day)", tmax: "tmax (deg c)", tmin: "tmin (deg c)" } as const;
  const idx: Record<string, number> = {};
  for (const [k, name] of Object.entries(need)) {
    const i = cols.indexOf(name);
    if (i < 0) throw new Error(`Daymet column '${name}' not found or in different units; header was: ${cols.join(" | ")}`);
    idx[k] = i;
  }
  const yi = cols.indexOf("year");
  const di = cols.indexOf("yday");
  const val = (parts: string[], k: string): number | null => {
    const v = Number(parts[idx[k] as number]);
    return Number.isFinite(v) && v > -9000 ? v : null;
  };
  const days: DaymetDay[] = [];
  for (const line of lines.slice(headerIdx + 1)) {
    if (!line.trim()) continue;
    const parts = line.split(",");
    const year = Number(parts[yi]);
    const yday = Number(parts[di]);
    if (!Number.isInteger(year) || !Number.isInteger(yday)) throw new Error(`Daymet row not understood: ${line.slice(0, 80)}`);
    days.push({ date: daymetDate(year, yday), prcpMm: val(parts, "prcp"), tMaxC: val(parts, "tmax"), tMinC: val(parts, "tmin") });
  }
  return { lat: Number(ll?.[1]), lon: Number(ll?.[2]), elevationM: elev ? Number(elev[1]) : null, citationLine: cite, days };
}

export type PairedDay = {
  date: string;
  daymet: { prcp: number | null; tMax: number | null; tMin: number | null };
  power: { prcp: number | null; tMax: number | null; tMin: number | null };
};

export type Alignment = { pairs: PairedDay[]; droppedLeapDec31: number; otherUnmatched: number };

/**
 * Align POWER days with Daymet days by ISO date, inside [start, end]. Dates are never shifted.
 * POWER has Dec 31 of leap years; Daymet drops it (365-day calendar). Those are counted as droppedLeapDec31, not paired.
 */
export function alignDaily(daymet: readonly DaymetDay[], power: readonly DailyRecord[], start = DAYMET_START, end = DAYMET_END): Alignment {
  const byDate = new Map(daymet.map((d) => [d.date, d]));
  const pairs: PairedDay[] = [];
  let dropped = 0;
  let other = 0;
  for (const p of power) {
    if (p.date < start || p.date > end) continue;
    const d = byDate.get(p.date);
    if (!d) {
      const y = Number(p.date.slice(0, 4));
      if (p.date.endsWith("-12-31") && isLeap(y)) dropped++;
      else other++;
      continue;
    }
    pairs.push({
      date: p.date,
      daymet: { prcp: d.prcpMm, tMax: d.tMaxC, tMin: d.tMinC },
      power: { prcp: p.precipMm, tMax: p.tMaxC, tMin: p.tMinC },
    });
  }
  return { pairs, droppedLeapDec31: dropped, otherUnmatched: other };
}

function both(pairs: readonly PairedDay[], key: "prcp" | "tMax" | "tMin"): { ref: number[]; other: number[]; dates: string[] } {
  const ref: number[] = [];
  const other: number[] = [];
  const dates: string[] = [];
  for (const p of pairs) {
    const a = p.daymet[key];
    const b = p.power[key];
    if (a === null || b === null) continue;
    ref.push(a);
    other.push(b);
    dates.push(p.date);
  }
  return { ref, other, dates };
}

/** Annual precipitation totals over days where both products have a value. Years with too few paired days are listed as excluded. */
export function annualPrecip(pairs: readonly PairedDay[], minDays = MIN_PAIRED_DAYS_PER_YEAR) {
  const { ref, other, dates } = both(pairs, "prcp");
  const acc = new Map<number, { days: number; d: number; p: number }>();
  dates.forEach((date, i) => {
    const y = Number(date.slice(0, 4));
    const a = acc.get(y) ?? { days: 0, d: 0, p: 0 };
    a.days++;
    a.d += ref[i] as number;
    a.p += other[i] as number;
    acc.set(y, a);
  });
  const rows: AnnualPrecipRow[] = [];
  const excludedYears: { year: number; pairedDays: number }[] = [];
  for (const [year, a] of [...acc.entries()].sort((x, y) => x[0] - y[0])) {
    if (a.days < minDays) {
      excludedYears.push({ year, pairedDays: a.days });
      continue;
    }
    rows.push({ year, days: a.days, daymetMm: a.d, powerMm: a.p, diffMm: a.p - a.d, ratio: a.d > 0 ? a.p / a.d : null });
  }
  const n = rows.length;
  const sumD = rows.reduce((s, r) => s + r.daymetMm, 0);
  const sumP = rows.reduce((s, r) => s + r.powerMm, 0);
  const r = n >= 2 ? pearson(rows.map((x) => x.daymetMm), rows.map((x) => x.powerMm)) : null;
  return {
    rows,
    excludedYears,
    meanDaymetMm: n ? sumD / n : 0,
    meanPowerMm: n ? sumP / n : 0,
    biasMmPerYear: n ? (sumP - sumD) / n : 0,
    ratioOfTotals: sumD > 0 ? sumP / sumD : null,
    r,
    r2: r === null ? null : r * r,
  };
}

/** Pure comparison of two gridded products. Returns null when there are no paired days. */
export function compareDaymetPower(
  alignment: Alignment,
  meta: { daymetCell: DaymetComparison["daymetCell"]; power: DaymetComparison["power"]; start?: string; end?: string },
): DaymetComparison | null {
  const pr = both(alignment.pairs, "prcp");
  const tx = both(alignment.pairs, "tMax");
  const tn = both(alignment.pairs, "tMin");
  if (!pr.ref.length || !tx.ref.length || !tn.ref.length) return null;
  return {
    period: { start: meta.start ?? DAYMET_START, end: meta.end ?? DAYMET_END },
    pairedDays: alignment.pairs.length,
    droppedLeapDec31: alignment.droppedLeapDec31,
    otherUnmatchedDays: alignment.otherUnmatched,
    precipDaily: pairStats(pr.ref, pr.other),
    precipAnnual: annualPrecip(alignment.pairs),
    tMax: pairStats(tx.ref, tx.other),
    tMin: pairStats(tn.ref, tn.other),
    daymetCell: meta.daymetCell,
    power: meta.power,
  };
}
