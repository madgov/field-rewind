/** Plain-English sentences generated only from computed indicator numbers. No hard-coded findings. */
import type { NdviIndicators } from "./indicators";
import { formatUtcDate } from "./sources";

export type NdviWordingOptions = {
  /** How many of the most recent years to describe for green-up. Default 5. */
  recentYears?: number;
  /** Stress flags to list. Default 5 (most recent first). */
  maxFlags?: number;
};

export type NdviWording = {
  headline: string;
  peakLine: string;
  greenUpLines: string[];
  bareLine: string;
  stressLine: string;
  stressItems: string[];
  caveat: string;
};

const d = (iso: string) => formatUtcDate(`${iso}T00:00:00Z`);
const n2 = (v: number) => v.toFixed(2);
const plural = (n: number, w: string) => `${n} ${w}${n === 1 ? "" : "s"}`;

export const NDVI_CAVEAT =
  "This is a single 30 m Landsat pixel, not a field boundary. It only sees clear days, so cloudy spells are not covered. Mixed or built-up pixels do not behave like a crop.";

export function ndviWording(ind: NdviIndicators, opts: NdviWordingOptions = {}): NdviWording {
  const recent = opts.recentYears ?? 5;
  const maxFlags = opts.maxFlags ?? 5;
  if (ind.status === "no-observations") {
    const none = "No clear satellite observations are available for this point.";
    return { headline: none, peakLine: none, greenUpLines: [], bareLine: none, stressLine: "No clear stress signal: there are no clear observations to judge.", stressItems: [], caveat: NDVI_CAVEAT };
  }
  const years = ind.peaks.filter((p) => p.nObs > 0);
  const first = years[0]?.year;
  const last = years[years.length - 1]?.year;
  const headline = `${plural(ind.nObservations, "clear satellite observation")} of this pixel between ${first} and ${last}.`;

  const peakLine = ind.typicalPeak
    ? `In a typical year the greenest clear observation reaches an NDVI of ${n2(ind.typicalPeak.median)} (median of ${plural(ind.typicalPeak.years, "year")} with at least ${ind.definitions.minObsPerYear} clear observations).`
    : `No year has at least ${ind.definitions.minObsPerYear} clear observations, so a typical peak is not stated.`;

  const guRecent = ind.greenUps.filter((g) => last !== undefined && g.year > last - recent && g.year <= last);
  const greenUpLines = guRecent.map((g) =>
    g.date && g.uncertaintyDays !== null
      ? `${g.year}: green-up around ${d(g.date)}, give or take up to ${plural(g.uncertaintyDays, "day")} because the satellite passes only every few days and some are cloudy.`
      : `${g.year}: no green-up date. ${g.reason ?? ""}`.trim(),
  );

  const bare = ind.barePeriods;
  const bareLine = bare.length
    ? `${plural(bare.length, "spell")} of bare or nearly bare ground (NDVI below ${ind.bareThreshold}) seen. The longest observed run, ${d(bare.reduce((a, b) => (Date.parse(b.end) - Date.parse(b.start) > Date.parse(a.end) - Date.parse(a.start) ? b : a)).start)} to ${d(bare.reduce((a, b) => (Date.parse(b.end) - Date.parse(b.start) > Date.parse(a.end) - Date.parse(a.start) ? b : a)).end)}, is only what clear days show; the real spell may be longer.`
    : `No clear observation was below an NDVI of ${ind.bareThreshold}, so no bare-ground spell is seen.`;

  const flags = [...ind.stressFlags].sort((a, b) => b.date.localeCompare(a.date));
  const stressItems = flags.slice(0, maxFlags).map((f) => `${d(f.date)}: NDVI ${n2(f.ndvi)}, ${n2(f.drop)} below the usual ${n2(f.typical)} for that time of year (${plural(f.comparisonYears, "other year")} compared).`);
  const stressLine = flags.length
    ? `${plural(flags.length, "clear observation")} looked unusually low for this pixel. That can mean crop stress, but also a different crop, harvest timing or haze.`
    : "No clear stress signal.";
  return { headline, peakLine, greenUpLines, bareLine, stressLine, stressItems, caveat: NDVI_CAVEAT };
}
