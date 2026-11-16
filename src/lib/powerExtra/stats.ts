/**
 * Shared, pure period-comparison rules for the derived indicators. No network, no node imports.
 * The period split, missing-data limits and the "clear change" rule are the SAME constants as src/lib/shift/compute.ts
 * (imported, not copied). `periodStats` and `sampleVariance` there are not exported, so they are mirrored below.
 */
import {
  CLEAR_CHANGE_RULE,
  CLEAR_CHANGE_SE_MULTIPLE,
  EARLY_PERIOD,
  LATE_PERIOD,
  MAX_MISSING_DAYS_PER_YEAR,
  MIN_YEARS_PER_PERIOD,
  roundInt,
} from "../shift/compute";
import type { PeriodStats, ShiftVerdict, YearValue } from "../shift/types";
import type { PowerExtraDay } from "./types";

export { CLEAR_CHANGE_RULE, EARLY_PERIOD, LATE_PERIOD, MAX_MISSING_DAYS_PER_YEAR, MIN_YEARS_PER_PERIOD };
export type { PeriodStats, ShiftVerdict, YearValue };

export const isLeapYear = (y: number): boolean => (y % 4 === 0 && y % 100 !== 0) || y % 400 === 0;
export const daysInYear = (y: number): number => (isLeapYear(y) ? 366 : 365);

/** 2005 (between the two periods) belongs to neither. */
export function periodOf(year: number): YearValue["period"] {
  if (year >= EARLY_PERIOD[0] && year <= EARLY_PERIOD[1]) return "early";
  if (year >= LATE_PERIOD[0] && year <= LATE_PERIOD[1]) return "late";
  return "none";
}

export const yearOf = (iso: string): number => Number(iso.slice(0, 4));
export const monthOf = (iso: string): number => Number(iso.slice(5, 7));

/** Days grouped by calendar year, ascending. */
export function groupByYear(days: PowerExtraDay[]): [number, PowerExtraDay[]][] {
  const m = new Map<number, PowerExtraDay[]>();
  for (const d of days) {
    const y = yearOf(d.date);
    const a = m.get(y);
    if (a) a.push(d);
    else m.set(y, [d]);
  }
  return [...m.entries()].sort((a, b) => a[0] - b[0]);
}

/**
 * Missing-data rule, same as the shift card: a year is flagged when it is not a complete calendar year in the data,
 * or more than 10 of its days lack the needed input. Absent days count as missing.
 */
export function yearQuality(year: number, yearDays: PowerExtraDay[], needed: (d: PowerExtraDay) => number | null): { missingDays: number; flagged: boolean } {
  const total = daysInYear(year);
  const missingPresent = yearDays.filter((d) => needed(d) === null).length;
  const absent = Math.max(0, total - yearDays.length);
  return { missingDays: missingPresent + absent, flagged: yearDays.length < total || missingPresent > MAX_MISSING_DAYS_PER_YEAR };
}

export function mean(v: number[]): number {
  return v.reduce((s, x) => s + x, 0) / v.length;
}
export function sampleVariance(v: number[]): number {
  const m = mean(v);
  return v.reduce((s, x) => s + (x - m) ** 2, 0) / (v.length - 1);
}
export function median(v: number[]): number | null {
  if (!v.length) return null;
  const s = [...v].sort((a, b) => a - b);
  const mid = Math.floor(s.length / 2);
  return s.length % 2 ? s[mid] : (s[mid - 1] + s[mid]) / 2;
}
/** Linear-interpolation percentile (p in 0..100) of a sorted-or-not list. null for an empty list. */
export function percentile(v: number[], p: number): number | null {
  if (!v.length) return null;
  const s = [...v].sort((a, b) => a - b);
  const idx = ((s.length - 1) * p) / 100;
  const lo = Math.floor(idx);
  const hi = Math.ceil(idx);
  return s[lo] + (s[hi] - s[lo]) * (idx - lo);
}

function periodStats(years: YearValue[], range: [number, number], p: "early" | "late"): PeriodStats & { values: number[] } {
  const inPeriod = years.filter((y) => y.period === p);
  const values = inPeriod.filter((y) => !y.flagged && y.value !== null).map((y) => y.value as number);
  return {
    startYear: range[0],
    endYear: range[1],
    mean: values.length >= MIN_YEARS_PER_PERIOD ? mean(values) : null,
    yearsUsed: values.length,
    flaggedYears: inPeriod.filter((y) => y.flagged).map((y) => y.year),
    values,
  };
}

export type MetricCompare = {
  /** Per-year series (year, value, flagged, ...) so charts can draw it. */
  years: YearValue[];
  early: PeriodStats;
  late: PeriodStats;
  /** late mean - early mean, in the metric's unit. null when a mean is missing. */
  diff: number | null;
  pctChange: number | null;
  standardError: number | null;
  verdict: ShiftVerdict;
  /** Decimal places the numbers are shown with. */
  digits: number;
  /** The numbers the sentence prints: each mean rounded to `digits` places. null when a mean is missing. */
  shownEarly: number | null;
  shownLate: number | null;
  /** round(late) - round(early), so the printed sentence adds up. 0 when a mean is missing. A "clear" verdict always has shownDiff !== 0. */
  shownDiff: number;
};

function roundTo(x: number, digits: number): number {
  const scale = 10 ** digits;
  return roundInt(x * scale) / scale;
}

/** Compare the two periods with the shift card's rules. Never displays a "clear" change that rounds to zero. */
export function compareSeries(years: YearValue[], digits: number): MetricCompare {
  const early = periodStats(years, EARLY_PERIOD, "early");
  const late = periodStats(years, LATE_PERIOD, "late");
  const { values: _e, ...earlyStats } = early;
  const { values: _l, ...lateStats } = late;
  void _e;
  void _l;
  const base = { years, early: earlyStats, late: lateStats, digits };
  if (early.mean === null || late.mean === null) {
    return { ...base, diff: null, pctChange: null, standardError: null, verdict: "insufficient-data", shownEarly: null, shownLate: null, shownDiff: 0 };
  }
  const diff = late.mean - early.mean;
  const pctChange = early.mean !== 0 ? (diff / early.mean) * 100 : null;
  const se = Math.sqrt(sampleVariance(early.values) / early.values.length + sampleVariance(late.values) / late.values.length);
  const clear = se === 0 ? diff !== 0 : Math.abs(diff) > CLEAR_CHANGE_SE_MULTIPLE * se;
  const shownEarly = roundTo(early.mean, digits);
  const shownLate = roundTo(late.mean, digits);
  const shownDiff = roundTo(shownLate - shownEarly, digits);
  const verdict: ShiftVerdict = clear && shownDiff !== 0 ? (diff > 0 ? "increase" : "decrease") : "no-clear-change";
  return { ...base, diff, pctChange, standardError: se, verdict, shownEarly, shownLate, shownDiff };
}

export { roundInt };
