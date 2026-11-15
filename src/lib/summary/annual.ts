import { et0FromDailyRecord } from "../et0/fao56";
import type { DailyRecord, PowerResult } from "../types";

/** Why a calendar year was left out of a mean. */
export type ExclusionReason = "partial-year" | "missing-days";

export type YearSummary = {
  year: number;
  /** 365 or 366 */
  daysInYear: number;
  /** Days of this year present in the data (a partial first/last year has fewer than daysInYear). */
  daysPresent: number;
  /**
   * Sum over the days that have a value, in mm. NOT a full-year total unless the matching
   * *Complete flag is true. null when ET0 cannot be computed (no elevation).
   */
  et0TotalMm: number | null;
  precipTotalMm: number;
  /** Days present with ET0 missing (any of its five inputs missing). null when ET0 is unavailable. */
  et0MissingDays: number | null;
  precipMissingDays: number;
  et0Complete: boolean;
  precipComplete: boolean;
};

export type QuantityMean =
  | {
      available: true;
      /** Mean of the annual totals over complete years only; null when no year is complete. */
      meanAnnualMm: number | null;
      yearsUsed: number[];
      yearsUsedCount: number;
      firstYearUsed: number | null;
      lastYearUsed: number | null;
      yearsExcluded: { year: number; reason: ExclusionReason }[];
    }
  | { available: false; reason: string };

export type AnnualSummary = {
  years: YearSummary[];
  et0: QuantityMean;
  precip: QuantityMean;
  /** Whole-record missing-day counts. et0Days is null when ET0 cannot be computed. */
  missing: { et0Days: number | null; precipDays: number; anyFieldDays: number; totalDays: number };
};

export const ET0_NEEDS_ELEVATION =
  "Reference evapotranspiration (ET0) cannot be computed because NASA POWER gave no elevation for this grid cell, and the app never assumes one.";

export function isLeapYear(y: number): boolean {
  return (y % 4 === 0 && y % 100 !== 0) || y % 400 === 0;
}

const FIELDS = ["tMaxC", "tMinC", "rhPct", "wind2mMs", "solarMJm2", "precipMm"] as const;

function mean(
  years: YearSummary[],
  complete: (y: YearSummary) => boolean,
  total: (y: YearSummary) => number | null,
): QuantityMean {
  const used = years.filter(complete);
  const yearsExcluded = years
    .filter((y) => !complete(y))
    .map((y) => ({ year: y.year, reason: (y.daysPresent < y.daysInYear ? "partial-year" : "missing-days") as ExclusionReason }));
  const yearsUsed = used.map((y) => y.year);
  const sum = used.reduce((s, y) => s + (total(y) as number), 0);
  return {
    available: true,
    meanAnnualMm: used.length ? sum / used.length : null,
    yearsUsed,
    yearsUsedCount: used.length,
    firstYearUsed: yearsUsed.length ? yearsUsed[0] : null,
    lastYearUsed: yearsUsed.length ? yearsUsed[yearsUsed.length - 1] : null,
    yearsExcluded,
  };
}

/**
 * Pure annual summary of a POWER result. Never fills, scales or interpolates: a year with any
 * missing day (or not all calendar days present) is excluded from the mean of that quantity.
 */
export function summarizeAnnual(result: Pick<PowerResult, "days" | "lat" | "elevationM">): AnnualSummary {
  const et0Possible = result.elevationM !== null;
  const byYear = new Map<number, YearSummary>();
  let et0Missing = 0;
  let precipMissing = 0;
  let anyMissing = 0;

  for (const rec of result.days as DailyRecord[]) {
    const year = Number(rec.date.slice(0, 4));
    let y = byYear.get(year);
    if (!y) {
      y = {
        year,
        daysInYear: isLeapYear(year) ? 366 : 365,
        daysPresent: 0,
        et0TotalMm: et0Possible ? 0 : null,
        precipTotalMm: 0,
        et0MissingDays: et0Possible ? 0 : null,
        precipMissingDays: 0,
        et0Complete: false,
        precipComplete: false,
      };
      byYear.set(year, y);
    }
    y.daysPresent += 1;

    if (FIELDS.some((f) => rec[f] === null)) anyMissing += 1;

    if (rec.precipMm === null) {
      y.precipMissingDays += 1;
      precipMissing += 1;
    } else {
      y.precipTotalMm += rec.precipMm;
    }

    if (et0Possible) {
      const et0 = et0FromDailyRecord(rec, result.lat, result.elevationM as number);
      if (et0 === null) {
        (y.et0MissingDays as number) += 1;
        et0Missing += 1;
      } else {
        (y.et0TotalMm as number) += et0;
      }
    }
  }

  const years = [...byYear.values()].sort((a, b) => a.year - b.year);
  for (const y of years) {
    const full = y.daysPresent === y.daysInYear;
    y.precipComplete = full && y.precipMissingDays === 0;
    y.et0Complete = et0Possible && full && y.et0MissingDays === 0;
  }

  return {
    years,
    et0: et0Possible
      ? mean(years, (y) => y.et0Complete, (y) => y.et0TotalMm)
      : { available: false, reason: ET0_NEEDS_ELEVATION },
    precip: mean(years, (y) => y.precipComplete, (y) => y.precipTotalMm),
    missing: {
      et0Days: et0Possible ? et0Missing : null,
      precipDays: precipMissing,
      anyFieldDays: anyMissing,
      totalDays: result.days.length,
    },
  };
}
