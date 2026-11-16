/**
 * Frost indicators from the POWER FROST_DAYS flag. Pure functions, no network.
 *
 * Definitions (also in docs/power-extra.md):
 * - Frost day: the POWER FROST_DAYS flag is 1 ("the 2 m temperature cools to the dew/frost point and both are below 0 C").
 *   A day with a missing flag is NOT counted, so the count can only be understated, by at most 10 days in a kept year.
 * - Northern Hemisphere split at 1 July: last spring frost = the latest frost day from 1 January to 30 June;
 *   first autumn frost = the earliest frost day from 1 July to 31 December. A frost on 1 January is a spring frost;
 *   one on 31 December is an autumn frost.
 * - Ludhiana (30.9 N) is Northern Hemisphere, so the same split applies. There, "last spring frost" is really the end of
 *   the winter frost season (January or February); the name is kept so every pin uses one definition.
 * - Frost-free season: the run of days after the last spring frost (or from 1 January if the year had no spring frost)
 *   up to the day before the first autumn frost (or to 31 December if none). A year with no frost at all has 365/366 days.
 * - Southern Hemisphere (lat < 0): frost-day counts are provided per calendar year, but spring/autumn dates and the
 *   frost-free season are not defined by this split and are reported as unavailable.
 * - Date-of-year values used for averaging and display use a 365-day reference calendar in which 29 Feb is counted as 28 Feb.
 */
import type { PowerResult } from "../types";
import { compareSeries, groupByYear, median, periodOf, yearQuality, daysInYear, type MetricCompare } from "./stats";
import type { PowerExtraDay, PowerExtraResult } from "./types";

export type FrostDate = {
  /** ISO date, e.g. "2011-03-02" */
  date: string;
  /** Day number inside its own year (1 Jan = 1; leap years have 366). */
  dayOfYear: number;
  /** Day number on the 365-day reference calendar (29 Feb counts as 28 Feb). Used to average and compare. */
  refDayOfYear: number;
};

export type FrostYear = {
  year: number;
  /** Frost days in the calendar year; null when the year is flagged. */
  frostDays: number | null;
  lastSpringFrost: FrostDate | null;
  firstAutumnFrost: FrostDate | null;
  /** Days in the frost-free season (definition above); null when flagged or not defined (Southern Hemisphere). */
  frostFreeDays: number | null;
  /** True when the year had no frost day from 1 Jan to 30 Jun (only meaningful when not flagged). */
  noSpringFrost: boolean;
  noAutumnFrost: boolean;
  missingDays: number;
  /** More than 10 missing days, or an incomplete calendar year: excluded from period comparisons. */
  flagged: boolean;
  period: "early" | "late" | "none";
};

export type FrostCrossCheck = {
  /** Days where both POWER FROST_DAYS and T2M_MIN were present. */
  daysCompared: number;
  /** Days where (FROST_DAYS == 1) differs from (T2M_MIN <= 0). */
  disagreements: number;
  /** First few disagreeing days, for inspection. */
  examples: { date: string; frostFlag: number; tMinC: number }[];
};

export type DateMetric = MetricCompare & {
  /** Median date-of-year (reference calendar) over usable years with such a frost, per period. null when no year had one. */
  medianRefDayEarly: number | null;
  medianRefDayLate: number | null;
  /** Years without a frost of this kind (not flagged), per period. */
  yearsWithoutEarly: number;
  yearsWithoutLate: number;
};

export type FrostResult =
  | {
      status: "ok";
      hemisphere: "north" | "south";
      years: FrostYear[];
      frostDays: MetricCompare;
      frostFreeDays: MetricCompare;
      lastSpringFrost: DateMetric;
      firstAutumnFrost: DateMetric;
      /** null unless the matching T2M_MIN data was passed in. */
      crossCheck: FrostCrossCheck | null;
      origin: PowerExtraResult["origin"];
      fetchedAt: string;
      /** Plain statement of the definitions, for the "How we know" panel. */
      definition: string;
    }
  | { status: "unavailable"; reason: string };

export const FROST_DEFINITION =
  "A frost day is a day NASA POWER flags as frost (air at 2 m cooled to the dew/frost point, both below 0 °C). " +
  "Last spring frost is the latest frost day from 1 Jan to 30 Jun; first autumn frost is the earliest from 1 Jul to 31 Dec; " +
  "the frost-free season is the run of days between them.";

const CUM_NONLEAP = [0, 31, 59, 90, 120, 151, 181, 212, 243, 273, 304, 334];

/** Day-of-year numbers for an ISO date. */
export function frostDateOf(iso: string): FrostDate {
  const y = Number(iso.slice(0, 4));
  const m = Number(iso.slice(5, 7));
  const d = Number(iso.slice(8, 10));
  const leap = daysInYear(y) === 366;
  const isLeapDay = leap && m === 2 && d === 29;
  const refDayOfYear = isLeapDay ? 59 : CUM_NONLEAP[m - 1] + d;
  // In a leap year every date from 29 Feb on is one day later than on the reference calendar.
  const dayOfYear = refDayOfYear + (leap && (m >= 3 || isLeapDay) ? 1 : 0);
  return { date: iso, dayOfYear, refDayOfYear };
}

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
/** "12 Mar" for a reference-calendar day number (rounded to a whole day, clamped to 1..365). */
export function refDayText(refDay: number): string {
  const r = Math.min(365, Math.max(1, Math.round(refDay)));
  let m = 11;
  while (m > 0 && CUM_NONLEAP[m] >= r) m--;
  return `${r - CUM_NONLEAP[m]} ${MONTHS[m]}`;
}

/** Frost indicators for one calendar year of daily records (the caller supplies the days of that year). */
export function frostYear(year: number, yearDays: PowerExtraDay[], northern: boolean): FrostYear {
  const q = yearQuality(year, yearDays, (d) => d.frostFlag);
  const base = { year, missingDays: q.missingDays, flagged: q.flagged, period: periodOf(year) };
  if (q.flagged) {
    return { ...base, frostDays: null, lastSpringFrost: null, firstAutumnFrost: null, frostFreeDays: null, noSpringFrost: false, noAutumnFrost: false };
  }
  const frost = yearDays.filter((d) => d.frostFlag === 1).map((d) => d.date);
  const frostDays = frost.length;
  if (!northern) {
    return { ...base, frostDays, lastSpringFrost: null, firstAutumnFrost: null, frostFreeDays: null, noSpringFrost: false, noAutumnFrost: false };
  }
  const split = `${year}-07-01`;
  const spring = frost.filter((d) => d < split);
  const autumn = frost.filter((d) => d >= split);
  const lastSpring = spring.length ? frostDateOf(spring[spring.length - 1]) : null;
  const firstAutumn = autumn.length ? frostDateOf(autumn[0]) : null;
  const total = daysInYear(year);
  const startDay = (lastSpring?.dayOfYear ?? 0) + 1;
  const endDay = (firstAutumn?.dayOfYear ?? total + 1) - 1;
  return {
    ...base,
    frostDays,
    lastSpringFrost: lastSpring,
    firstAutumnFrost: firstAutumn,
    frostFreeDays: Math.max(0, endDay - startDay + 1),
    noSpringFrost: lastSpring === null,
    noAutumnFrost: firstAutumn === null,
  };
}

/** Compare POWER's FROST_DAYS flag with T2M_MIN <= 0 from the main POWER data, day by day. */
export function crossCheckFrostFlag(extra: Pick<PowerExtraResult, "days">, power: Pick<PowerResult, "days">): FrostCrossCheck {
  const tmin = new Map<string, number | null>();
  for (const d of power.days) tmin.set(d.date, d.tMinC);
  let compared = 0;
  let disagreements = 0;
  const examples: FrostCrossCheck["examples"] = [];
  for (const d of extra.days) {
    const t = tmin.get(d.date);
    if (d.frostFlag === null || t === null || t === undefined) continue;
    compared++;
    if ((d.frostFlag === 1) !== t <= 0) {
      disagreements++;
      if (examples.length < 10) examples.push({ date: d.date, frostFlag: d.frostFlag, tMinC: t });
    }
  }
  return { daysCompared: compared, disagreements, examples };
}

function dateMetric(years: FrostYear[], pick: (y: FrostYear) => FrostDate | null, absent: (y: FrostYear) => boolean): DateMetric {
  const series = years.map((y) => {
    const dt = pick(y);
    const usable = !y.flagged && dt !== null;
    return { year: y.year, value: usable ? dt.refDayOfYear : null, missingDays: y.missingDays, flagged: y.flagged, period: y.period };
  });
  // A year with no such frost is not flagged for missing data; it just has no date (value null), so it stays out of the mean.
  const cmp = compareSeries(series, 0);
  const vals = (p: "early" | "late") => years.filter((y) => y.period === p && !y.flagged && pick(y) !== null).map((y) => (pick(y) as FrostDate).refDayOfYear);
  return {
    ...cmp,
    medianRefDayEarly: median(vals("early")),
    medianRefDayLate: median(vals("late")),
    yearsWithoutEarly: years.filter((y) => y.period === "early" && !y.flagged && absent(y)).length,
    yearsWithoutLate: years.filter((y) => y.period === "late" && !y.flagged && absent(y)).length,
  };
}

function metric(years: FrostYear[], pick: (y: FrostYear) => number | null, digits: number): MetricCompare {
  return compareSeries(
    years.map((y) => ({ year: y.year, value: y.flagged ? null : pick(y), missingDays: y.missingDays, flagged: y.flagged, period: y.period })),
    digits,
  );
}

/** All frost indicators for a normalized extra-data result. `power` (optional) adds the T2M_MIN cross-check. */
export function computeFrost(result: PowerExtraResult, power?: Pick<PowerResult, "days">): FrostResult {
  if (result.status === "error" || result.status === "no-coverage") {
    return { status: "unavailable", reason: result.message ?? `NASA POWER returned status "${result.status}" for this location.` };
  }
  if (!result.days.length) return { status: "unavailable", reason: "The NASA POWER record for this location contains no days." };
  const northern = result.lat >= 0;
  const years = groupByYear(result.days).map(([y, d]) => frostYear(y, d, northern));
  return {
    status: "ok",
    hemisphere: northern ? "north" : "south",
    years,
    frostDays: metric(years, (y) => y.frostDays, 0),
    frostFreeDays: metric(years, (y) => y.frostFreeDays, 0),
    lastSpringFrost: dateMetric(years, (y) => y.lastSpringFrost, (y) => y.noSpringFrost),
    firstAutumnFrost: dateMetric(years, (y) => y.firstAutumnFrost, (y) => y.noAutumnFrost),
    crossCheck: power ? crossCheckFrostFlag(result, power) : null,
    origin: result.origin,
    fetchedAt: result.fetchedAt,
    definition: FROST_DEFINITION,
  };
}
