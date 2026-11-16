/**
 * Soil wetness indicators from POWER GWETROOT (root-zone soil wetness, fraction 0 = dry .. 1 = saturated).
 * GWET* is MODELLED wetness from the MERRA-2 reanalysis, not measured soil moisture. Pure functions, no network.
 *
 * Definitions (also in docs/power-extra.md):
 * - Growing season: April to September (Northern Hemisphere, lat >= 0). Southern Hemisphere is reported as unavailable
 *   because its season spans two calendar years and this version does not define it.
 * - Growing-season mean: mean of the non-missing daily GWETROOT values from 1 Apr to 30 Sep.
 * - Anomaly: that year's growing-season mean minus the mean of all usable years 1985-2025 for the same months
 *   (fraction units); z-like value = anomaly / sample standard deviation of the same yearly means.
 * - Driest month: the lowest monthly mean among Apr-Sep, where a month needs at least 20 valid days.
 * - Dry days: growing-season days with wetness AT OR BELOW this spot's own 10th percentile (linear interpolation) of all valid
 *   Apr-Sep daily values 1985-2025. POWER reports wetness in steps of 0.01, so many days can tie at the threshold and the
 *   count can cover more than 10% of days. A RELATIVE, pin-specific threshold, not an agronomic wilting point.
 * - A year is flagged (excluded from period means) when it is incomplete or more than 10 days lack GWETROOT.
 */
import { compareSeries, groupByYear, MIN_YEARS_PER_PERIOD, mean, monthOf, percentile, periodOf, sampleVariance, yearQuality, type MetricCompare } from "./stats";
import type { PowerExtraDay, PowerExtraResult } from "./types";

export const GROWING_SEASON = { startMonth: 4, endMonth: 9, label: "April to September" } as const;
export const DRY_DAY_PERCENTILE = 10;
export const MIN_DAYS_PER_MONTH = 20;

export type SoilYear = {
  year: number;
  /** Mean root-zone wetness Apr-Sep, fraction 0-1; null when flagged. */
  growingSeasonMean: number | null;
  /** growingSeasonMean minus the 1985-2025 baseline mean, fraction units. */
  anomaly: number | null;
  /** anomaly divided by the baseline standard deviation. null when the baseline is unavailable or has no spread. */
  zScore: number | null;
  /** Lowest monthly mean among Apr-Sep (month 4..9) and its value. */
  driestMonth: { month: number; value: number } | null;
  /** Growing-season days at or below the pin's own 10th-percentile wetness. */
  dryDays: number | null;
  missingDays: number;
  flagged: boolean;
  period: "early" | "late" | "none";
};

export type SoilWetnessResult =
  | {
      status: "ok";
      years: SoilYear[];
      baseline: { mean: number; standardDeviation: number | null; yearsUsed: number; startYear: number; endYear: number } | null;
      /** The pin's own relative threshold. Not a wilting point. */
      dryThreshold: { value: number; percentile: number; daysUsed: number } | null;
      growingSeasonMean: MetricCompare;
      driestMonth: MetricCompare;
      dryDays: MetricCompare;
      /** The three lowest growing-season means, driest first. */
      driestYears: { year: number; value: number }[];
      origin: PowerExtraResult["origin"];
      fetchedAt: string;
      definition: string;
    }
  | { status: "unavailable"; reason: string };

export const SOIL_DEFINITION =
  "Root-zone wetness is NASA POWER's modelled 0-1 scale (0 completely dry, 1 saturated) for roughly the top 1 m of soil. " +
  "Growing season is April to September. The dry-day count uses a threshold relative to this spot's own record (its 10th-percentile level for growing-season days), not a crop wilting point.";

const inSeason = (d: PowerExtraDay): boolean => {
  const m = monthOf(d.date);
  return m >= GROWING_SEASON.startMonth && m <= GROWING_SEASON.endMonth;
};

export function computeSoilWetness(result: PowerExtraResult): SoilWetnessResult {
  if (result.status === "error" || result.status === "no-coverage") {
    return { status: "unavailable", reason: result.message ?? `NASA POWER returned status "${result.status}" for this location.` };
  }
  if (!result.days.length) return { status: "unavailable", reason: "The NASA POWER record for this location contains no days." };
  if (result.lat < 0) {
    return { status: "unavailable", reason: "The April to September growing season is defined for the Northern Hemisphere only; this location is in the Southern Hemisphere." };
  }

  const byYear = groupByYear(result.days);
  const seasonValues = result.days.filter(inSeason).map((d) => d.soilRootWetness).filter((v): v is number => v !== null);
  const threshold = percentile(seasonValues, DRY_DAY_PERCENTILE);
  const dryThreshold = threshold === null ? null : { value: threshold, percentile: DRY_DAY_PERCENTILE, daysUsed: seasonValues.length };

  type Raw = { year: number; days: PowerExtraDay[]; q: { missingDays: number; flagged: boolean }; mean: number | null };
  const raws: Raw[] = byYear.map(([year, days]) => {
    const q = yearQuality(year, days, (d) => d.soilRootWetness);
    const vals = days.filter(inSeason).map((d) => d.soilRootWetness).filter((v): v is number => v !== null);
    return { year, days, q, mean: !q.flagged && vals.length ? mean(vals) : null };
  });

  const usable = raws.filter((r) => r.mean !== null).map((r) => r.mean as number);
  let baseline: Extract<SoilWetnessResult, { status: "ok" }>["baseline"] = null;
  if (usable.length >= MIN_YEARS_PER_PERIOD) {
    const sd = Math.sqrt(sampleVariance(usable));
    const yrs = raws.filter((r) => r.mean !== null).map((r) => r.year);
    baseline = { mean: mean(usable), standardDeviation: sd > 0 ? sd : null, yearsUsed: usable.length, startYear: yrs[0], endYear: yrs[yrs.length - 1] };
  }

  const years: SoilYear[] = raws.map((r) => {
    const base = { year: r.year, missingDays: r.q.missingDays, flagged: r.q.flagged, period: periodOf(r.year) };
    if (r.mean === null) return { ...base, growingSeasonMean: null, anomaly: null, zScore: null, driestMonth: null, dryDays: null };
    const anomaly = baseline ? r.mean - baseline.mean : null;
    const zScore = anomaly !== null && baseline?.standardDeviation ? anomaly / baseline.standardDeviation : null;
    // monthly means
    let driest: SoilYear["driestMonth"] = null;
    let allMonths = true;
    for (let m = GROWING_SEASON.startMonth; m <= GROWING_SEASON.endMonth; m++) {
      const v = r.days.filter((d) => monthOf(d.date) === m).map((d) => d.soilRootWetness).filter((x): x is number => x !== null);
      if (v.length < MIN_DAYS_PER_MONTH) {
        allMonths = false;
        break;
      }
      const mv = mean(v);
      if (driest === null || mv < driest.value) driest = { month: m, value: mv };
    }
    const dryDays = threshold === null ? null : r.days.filter(inSeason).filter((d) => d.soilRootWetness !== null && d.soilRootWetness <= threshold).length;
    return { ...base, growingSeasonMean: r.mean, anomaly, zScore, driestMonth: allMonths ? driest : null, dryDays };
  });

  const series = (pick: (y: SoilYear) => number | null) =>
    years.map((y) => ({ year: y.year, value: pick(y), missingDays: y.missingDays, flagged: y.flagged, period: y.period }));
  const driestYears = years
    .filter((y): y is SoilYear & { growingSeasonMean: number } => y.growingSeasonMean !== null)
    .sort((a, b) => a.growingSeasonMean - b.growingSeasonMean)
    .slice(0, 3)
    .map((y) => ({ year: y.year, value: y.growingSeasonMean }));

  return {
    status: "ok",
    years,
    baseline,
    dryThreshold,
    growingSeasonMean: compareSeries(series((y) => y.growingSeasonMean), 2),
    driestMonth: compareSeries(series((y) => y.driestMonth?.value ?? null), 2),
    dryDays: compareSeries(series((y) => y.dryDays), 0),
    driestYears,
    origin: result.origin,
    fetchedAt: result.fetchedAt,
    definition: SOIL_DEFINITION,
  };
}
