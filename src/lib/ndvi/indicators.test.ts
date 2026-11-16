import { describe, expect, it } from "vitest";
import { barePeriods, computeNdviIndicators, dayOfYear, greenUpForYear, interpolateAt, mad, median, smoothedYearCurve, stressFlags, yearlyPeaks } from "./indicators";
import type { NdviObservation } from "./types";

const o = (date: string, ndvi: number, satellite = "Landsat 8"): NdviObservation => ({ date, ndvi, satellite, sceneId: `s-${date}` });

describe("helpers", () => {
  it("median and MAD, hand computed", () => {
    expect(median([1, 3, 2])).toBe(2);
    expect(median([1, 2, 3, 4])).toBe(2.5);
    expect(mad([1, 2, 3, 4, 100])).toBe(1); // median 3; deviations 2,1,0,1,97 -> median 1
    expect(dayOfYear("2024-03-01")).toBe(61); // leap year
  });
  it("linear interpolation, and no estimate across a gap above 60 days", () => {
    const obs = [o("2024-01-01", 0.2), o("2024-01-11", 0.4), o("2024-06-01", 0.8)];
    expect(interpolateAt(obs, Date.parse("2024-01-06T00:00:00Z") / 86400000)).toBeCloseTo(0.3, 10);
    expect(interpolateAt(obs, Date.parse("2024-03-01T00:00:00Z") / 86400000)).toBeNull();
    expect(interpolateAt(obs, Date.parse("2023-12-01T00:00:00Z") / 86400000)).toBeNull();
  });
});

describe("yearly peaks", () => {
  it("takes the highest clear value per year, flags sparse years and lists empty years", () => {
    const obs = [o("2020-03-01", 0.3), o("2020-06-01", 0.8), o("2020-09-01", 0.5), o("2022-06-01", 0.6)];
    const p = yearlyPeaks(obs);
    expect(p.map((x) => x.year)).toEqual([2020, 2021, 2022]);
    expect(p[0]).toMatchObject({ peak: 0.8, peakDate: "2020-06-01", nObs: 3, sparse: true });
    expect(p[1]).toMatchObject({ peak: null, peakDate: null, nObs: 0 });
    expect(p[2].peak).toBe(0.6);
  });
  it("no observations gives an empty list", () => {
    expect(yearlyPeaks([])).toEqual([]);
  });
});

describe("green-up", () => {
  const year = [o("2023-01-05", 0.2), o("2023-02-10", 0.2), o("2023-03-10", 0.3), o("2023-04-01", 0.5), o("2023-04-21", 0.7), o("2023-05-31", 0.8), o("2023-09-01", 0.4), o("2023-11-15", 0.2)];
  it("crosses 50% of the seasonal amplitude (min 0.2, peak 0.8 -> threshold 0.5) at the 2023-04-01 observation", () => {
    const g = greenUpForYear(year, 2023);
    expect(g.seasonalMin).toBeCloseTo(0.2, 10);
    expect(g.seasonalPeak).toBeCloseTo(0.8, 10);
    expect(g.threshold).toBeCloseTo(0.5, 10);
    expect(g.date).toBe("2023-04-01");
    expect(g.bracket).toEqual({ before: "2023-03-10", after: "2023-04-01" });
    expect(g.uncertaintyDays).toBe(22);
  });
  it("has no green-up when the seasonal rise is below 0.15", () => {
    const flat = [o("2023-01-05", 0.5), o("2023-04-01", 0.55), o("2023-06-01", 0.6), o("2023-09-01", 0.5)];
    const g = greenUpForYear(flat, 2023);
    expect(g.date).toBeNull();
    expect(g.reason).toMatch(/below 0.15/);
  });
  it("a year with fewer than 3 observations or none gives a reason, not a date", () => {
    expect(greenUpForYear(year, 2019).date).toBeNull();
    expect(greenUpForYear(year, 2019).reason).toMatch(/Only 0 clear observations/);
    expect(greenUpForYear([o("2023-05-01", 0.5)], 2023).reason).toMatch(/Only 1 clear observation in/);
  });
  it("a gap above 60 days between the observations around the peak gives no estimate there", () => {
    const sparse = [o("2023-01-05", 0.2), o("2023-05-31", 0.8), o("2023-12-01", 0.2)];
    expect(greenUpForYear(sparse, 2023).date).toBeNull();
  });
});

describe("display smoothing", () => {
  it("moving average of 3 steps on a 5-day grid, display only", () => {
    const obs = [o("2024-01-01", 0.2), o("2024-01-31", 0.5), o("2024-03-01", 0.2)];
    const c = smoothedYearCurve(obs, 2024);
    expect(c[0].date).toBe("2024-01-01");
    expect(c[1].date).toBe("2024-01-06");
    // raw: Jan1 0.2, Jan6 0.25, Jan11 0.30 -> smoothed at Jan6 = 0.25
    expect(c[1].ndvi).toBeCloseTo(0.25, 3);
    expect(c[0].ndvi).toBeCloseTo((0.2 + 0.25) / 2, 3); // edge: available neighbours only
    expect(c[c.length - 1].ndvi).toBeNull(); // after the last observation: no estimate
  });
});

describe("bare periods", () => {
  it("finds runs below 0.2 with the bounds they could extend to", () => {
    const obs = [o("2020-01-01", 0.5), o("2020-02-01", 0.15), o("2020-03-01", 0.1), o("2020-04-01", 0.6), o("2020-11-01", 0.05)];
    const p = barePeriods(obs);
    expect(p).toEqual([
      { start: "2020-02-01", end: "2020-03-01", nObs: 2, minNdvi: 0.1, earliestStart: "2020-01-02", latestEnd: "2020-03-31" },
      { start: "2020-11-01", end: "2020-11-01", nObs: 1, minNdvi: 0.05, earliestStart: "2020-04-02", latestEnd: null },
    ]);
  });
  it("exactly at the threshold is not bare; none when always green; empty input", () => {
    expect(barePeriods([o("2020-01-01", 0.2), o("2020-02-01", 0.5)])).toEqual([]);
    expect(barePeriods([])).toEqual([]);
  });
  it("splits a run across a gap over 60 days", () => {
    const p = barePeriods([o("2020-01-01", 0.1), o("2020-06-01", 0.1)]);
    expect(p).toHaveLength(2);
  });
});

describe("stress flags", () => {
  const years = [2016, 2017, 2018, 2019, 2020, 2021, 2022];
  const base = years.map((y, i) => o(`${y}-06-10`, 0.7 + (i % 2 ? 0.02 : -0.02)));
  it("flags one clear observation far below the usual for that time of year", () => {
    const f = stressFlags([...base, o("2023-06-12", 0.35)]);
    expect(f).toHaveLength(1);
    expect(f[0]).toMatchObject({ date: "2023-06-12", ndvi: 0.35, comparisonYears: 7 });
    expect(f[0].drop).toBeGreaterThan(0.3);
    expect(f[0].robustZ).toBeLessThanOrEqual(-3.5);
  });
  it("does not flag a normal value, a high value, or when fewer than 5 comparison years exist", () => {
    expect(stressFlags([...base, o("2023-06-12", 0.69)])).toEqual([]);
    expect(stressFlags([...base, o("2023-06-12", 0.95)])).toEqual([]);
    expect(stressFlags([o("2020-06-10", 0.7), o("2021-06-10", 0.7), o("2022-06-10", 0.7), o("2023-06-10", 0.7), o("2024-06-10", 0.3)])).toEqual([]);
  });
  it("needs a drop of at least 0.15 even when the spread is tiny", () => {
    const tight = years.map((y) => o(`${y}-06-10`, 0.7));
    expect(stressFlags([...tight, o("2023-06-10", 0.6)])).toEqual([]);
    expect(stressFlags([...tight, o("2023-06-10", 0.5)])).toHaveLength(1);
  });
  it("wraps across new year in the day-of-year window", () => {
    const winter = years.map((y) => o(`${y}-12-31`, 0.6));
    const f = stressFlags([...winter, o("2023-01-03", 0.2)]);
    expect(f).toHaveLength(1);
  });
});

describe("computeNdviIndicators", () => {
  it("empty observations", () => {
    const i = computeNdviIndicators({ observations: [] });
    expect(i.status).toBe("no-observations");
    expect(i.peaks).toEqual([]);
    expect(i.typicalPeak).toBeNull();
    expect(i.stressFlags).toEqual([]);
  });
  it("typical peak uses only non-sparse years; per-year series for charts", () => {
    const dense = ["02-01", "03-01", "04-01", "05-01", "06-01", "07-01"].map((md, k) => o(`2020-${md}`, 0.2 + k * 0.1));
    const i = computeNdviIndicators({ observations: [...dense, o("2021-06-01", 0.99)] });
    expect(i.typicalPeak).toEqual({ median: 0.7, years: 1 });
    expect(i.perYear[0].observations).toHaveLength(6);
    expect(i.perYear[1].observations[0]).toMatchObject({ date: "2021-06-01", ndvi: 0.99, satellite: "Landsat 8" });
  });
});
