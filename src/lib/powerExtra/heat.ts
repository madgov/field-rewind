/**
 * Surface heat: annual mean of POWER TS (earth skin temperature, "the average temperature at the earth's surface").
 * No threshold count is offered: no cited threshold exists for skin temperature, so none is invented.
 * A year is flagged when incomplete or more than 10 days lack TS. Pure, no network.
 */
import { compareSeries, groupByYear, mean, periodOf, yearQuality, type MetricCompare } from "./stats";
import type { PowerExtraResult } from "./types";

export type SkinTempYear = { year: number; meanC: number | null; missingDays: number; flagged: boolean; period: "early" | "late" | "none" };

export type SkinTemperatureResult =
  | { status: "ok"; years: SkinTempYear[]; annualMean: MetricCompare; origin: PowerExtraResult["origin"]; fetchedAt: string }
  | { status: "unavailable"; reason: string };

export function computeSkinTemperature(result: PowerExtraResult): SkinTemperatureResult {
  if (result.status === "error" || result.status === "no-coverage") {
    return { status: "unavailable", reason: result.message ?? `NASA POWER returned status "${result.status}" for this location.` };
  }
  if (!result.days.length) return { status: "unavailable", reason: "The NASA POWER record for this location contains no days." };
  const years: SkinTempYear[] = groupByYear(result.days).map(([year, days]) => {
    const q = yearQuality(year, days, (d) => d.skinTempC);
    const vals = days.map((d) => d.skinTempC).filter((v): v is number => v !== null);
    return { year, meanC: !q.flagged && vals.length ? mean(vals) : null, missingDays: q.missingDays, flagged: q.flagged, period: periodOf(year) };
  });
  return {
    status: "ok",
    years,
    annualMean: compareSeries(years.map((y) => ({ year: y.year, value: y.meanC, missingDays: y.missingDays, flagged: y.flagged, period: y.period })), 1),
    origin: result.origin,
    fetchedAt: result.fetchedAt,
  };
}
