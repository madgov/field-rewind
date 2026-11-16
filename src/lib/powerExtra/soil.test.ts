import { describe, expect, it } from "vitest";
import { normalizePowerExtra } from "./normalize";
import { computeSoilWetness } from "./soil";
import { makeExtraRaw } from "./testFixtures";

const build = (value: (date: string) => number | undefined, lat = 37.93) =>
  normalizePowerExtra({
    lat,
    lon: -121.66,
    responses: [makeExtraRaw({ start: "1985-01-01", end: "2025-12-31", value: (p, d) => (p === "GWETROOT" ? value(d) : undefined) })],
    fetchedAt: "2026-01-01T00:00:00.000Z",
    sourceUrls: [],
    origin: "saved",
  });
const inSeason = (d: string) => Number(d.slice(5, 7)) >= 4 && Number(d.slice(5, 7)) <= 9;

describe("computeSoilWetness anomaly math (hand-computed)", () => {
  // 39 years at 0.5, 1990 at 0.4, 2000 at 0.6 in Apr-Sep; outside the season everything is 0.9 and must be ignored.
  const r = computeSoilWetness(build((d) => (!inSeason(d) ? 0.9 : d.startsWith("1990") ? 0.4 : d.startsWith("2000") ? 0.6 : 0.5)));
  if (r.status !== "ok") throw new Error("expected ok");

  it("growing-season mean ignores months outside April-September", () => {
    expect(r.years.find((y) => y.year === 2010)?.growingSeasonMean).toBeCloseTo(0.5, 12);
  });

  it("baseline mean is 0.5 and sample SD is sqrt(0.02/40)", () => {
    expect(r.baseline?.mean).toBeCloseTo(0.5, 12);
    expect(r.baseline?.standardDeviation).toBeCloseTo(Math.sqrt(0.0005), 10);
    expect(r.baseline?.yearsUsed).toBe(41);
  });

  it("anomaly is -0.1 in 1990 with z = -0.1 / sqrt(0.0005)", () => {
    const y = r.years.find((x) => x.year === 1990)!;
    expect(y.anomaly).toBeCloseTo(-0.1, 12);
    expect(y.zScore).toBeCloseTo(-0.1 / Math.sqrt(0.0005), 8);
    expect(r.years.find((x) => x.year === 2000)?.zScore).toBeCloseTo(0.1 / Math.sqrt(0.0005), 8);
    expect(r.years.find((x) => x.year === 2010)?.anomaly).toBeCloseTo(0, 12);
  });

  it("lists the driest year first", () => {
    expect(r.driestYears[0].year).toBe(1990);
    expect(r.driestYears[0].value).toBeCloseTo(0.4, 12);
  });
});

describe("dry days, driest month, flags", () => {
  // Every year: growing-season day k (0 = 1 Apr) has wetness 0.300 + 0.002 k, so the pin's own 10th percentile is at k = 18.
  const k = (d: string) => Math.round((Date.parse(`${d}T00:00:00Z`) - Date.parse(`${d.slice(0, 4)}-04-01T00:00:00Z`)) / 86_400_000);
  const wet = (d: string) => Math.round((0.3 + 0.002 * k(d)) * 1000) / 1000;

  it("counts days at or below the pin's own 10th percentile (19 days) every year", () => {
    const r = computeSoilWetness(build((d) => (inSeason(d) ? wet(d) : 0.9)));
    if (r.status !== "ok") throw new Error("expected ok");
    expect(r.dryThreshold?.percentile).toBe(10);
    expect(r.dryThreshold?.value).toBeCloseTo(0.336, 10);
    expect(r.dryThreshold?.daysUsed).toBe(41 * 183);
    expect(r.years.every((y) => y.dryDays === 19)).toBe(true);
    expect(r.dryDays.early.mean).toBe(19);
    expect(r.dryDays.verdict).toBe("no-clear-change");
  });

  it("driest month is the lowest monthly mean among April-September", () => {
    const r = computeSoilWetness(build((d) => (!inSeason(d) ? 0.9 : d.startsWith("2012-07") ? 0.1 : 0.5)));
    if (r.status !== "ok") throw new Error("expected ok");
    expect(r.years.find((y) => y.year === 2012)?.driestMonth).toEqual({ month: 7, value: expect.closeTo(0.1, 12) });
    expect(r.years.find((y) => y.year === 2013)?.driestMonth?.value).toBeCloseTo(0.5, 12);
  });

  it("flags a year with more than 10 missing days and leaves it out", () => {
    const r = computeSoilWetness(build((d) => (d.startsWith("2010-05") && Number(d.slice(8)) <= 11 ? -999 : 0.5)));
    if (r.status !== "ok") throw new Error("expected ok");
    const y = r.years.find((x) => x.year === 2010)!;
    expect(y.flagged).toBe(true);
    expect(y.growingSeasonMean).toBeNull();
    expect(y.anomaly).toBeNull();
    expect(r.growingSeasonMean.late.flaggedYears).toEqual([2010]);
    expect(r.baseline?.yearsUsed).toBe(40);
  });

  it("reports a clear rise and keeps the displayed difference consistent", () => {
    const r = computeSoilWetness(build((d) => (!inSeason(d) ? 0.9 : Number(d.slice(0, 4)) <= 2004 ? 0.4 : 0.5)));
    if (r.status !== "ok") throw new Error("expected ok");
    expect(r.growingSeasonMean.verdict).toBe("increase");
    expect(r.growingSeasonMean.shownEarly).toBe(0.4);
    expect(r.growingSeasonMean.shownLate).toBe(0.5);
    expect(r.growingSeasonMean.shownDiff).toBe(0.1);
  });

  it("is unavailable in the Southern Hemisphere and for error results", () => {
    expect(computeSoilWetness(build(() => 0.5, -33.9)).status).toBe("unavailable");
    expect(computeSoilWetness(normalizePowerExtra({ lat: 1, lon: 1, responses: [], fetchedAt: "x", sourceUrls: [], origin: "live" })).status).toBe("unavailable");
  });
});
