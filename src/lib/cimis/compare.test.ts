import { describe, expect, it } from "vitest";
import { compareSeries, summarize, type SeriesPoint } from "./compare";
import { powerEt0Series } from "./powerSeries";
import type { PowerResult } from "../types";

function series(year: number, vals: (number | null)[]): SeriesPoint[] {
  return vals.map((v, i) => ({ date: new Date(Date.UTC(year, 0, 1 + i)).toISOString().slice(0, 10), value: v }));
}

describe("compareSeries math", () => {
  const x = [1, 2, 3, 4, 5];
  it("perfect agreement", () => {
    const c = compareSeries(series(2020, x), series(2020, x));
    expect(c.n).toBe(5);
    expect(c.r2).toBeCloseTo(1, 12);
    expect(c.biasMmPerDay).toBeCloseTo(0, 12);
    expect(c.rmseMmPerDay).toBeCloseTo(0, 12);
    expect(c.overallRatio).toBeCloseTo(1, 12);
    expect(c.regression!.slope).toBeCloseTo(1, 12);
    expect(c.regression!.intercept).toBeCloseTo(0, 12);
    expect(c.summary).toMatch(/agree on average/);
  });
  it("constant offset +0.5: bias .5, rmse .5, r2 1, slope 1, intercept .5", () => {
    const c = compareSeries(series(2020, x), series(2020, x.map((v) => v + 0.5)));
    expect(c.biasMmPerDay).toBeCloseTo(0.5, 12);
    expect(c.rmseMmPerDay).toBeCloseTo(0.5, 12);
    expect(c.r2).toBeCloseTo(1, 12);
    expect(c.regression!.intercept).toBeCloseTo(0.5, 12);
    expect(c.meanStationMm).toBeCloseTo(3, 12);
    expect(c.meanPowerMm).toBeCloseTo(3.5, 12);
    expect(c.overallRatio).toBeCloseTo(17.5 / 15, 12);
  });
  it("scaled series x2: slope 2, intercept 0, bias = mean, ratio 2", () => {
    const c = compareSeries(series(2020, x), series(2020, x.map((v) => v * 2)));
    expect(c.regression!.slope).toBeCloseTo(2, 12);
    expect(c.regression!.intercept).toBeCloseTo(0, 12);
    expect(c.biasMmPerDay).toBeCloseTo(3, 12);
    expect(c.rmseMmPerDay).toBeCloseTo(Math.sqrt(11), 12); // mean of x^2 = 11
    expect(c.overallRatio).toBeCloseTo(2, 12);
  });
  it("hand-computed imperfect case", () => {
    // x = 1,2,3  y = 1,3,2 : sxx=2 syy=2 sxy=1 -> slope .5, r2 .25, bias 0, rmse sqrt(2/3)
    const c = compareSeries(series(2020, [1, 2, 3]), series(2020, [1, 3, 2]));
    expect(c.regression!.slope).toBeCloseTo(0.5, 12);
    expect(c.regression!.intercept).toBeCloseTo(1, 12);
    expect(c.r2).toBeCloseTo(0.25, 12);
    expect(c.biasMmPerDay).toBeCloseTo(0, 12);
    expect(c.rmseMmPerDay).toBeCloseTo(Math.sqrt(2 / 3), 12);
  });
  it("drops dates with a null on either side and says why", () => {
    const c = compareSeries(series(2020, [1, null, 3, null, 5, 6]), series(2020, [1, 2, null, null, 5]));
    expect(c.n).toBe(2);
    expect(c.dropped).toEqual({ total: 4, stationMissing: 1, powerMissing: 2, bothMissing: 1 });
    // dates only present in the station series (day 6) count as power-missing
    expect(c.dateRange).toEqual({ start: "2020-01-01", end: "2020-01-05" });
  });
  it("constant station series and empty input do not produce NaN", () => {
    const c = compareSeries(series(2020, [2, 2, 2]), series(2020, [1, 2, 3]));
    expect(c.regression).toBeNull();
    expect(c.r2).toBeNull();
    expect(c.biasMmPerDay).toBeCloseTo(0, 12);
    const e = compareSeries([], []);
    expect(e.n).toBe(0);
    expect(e.biasMmPerDay).toBeNull();
    expect(e.summary).toMatch(/cannot be compared/);
  });
  it("annual ratio only for years with >= 350 paired days", () => {
    const full = Array.from({ length: 366 }, () => 2); // 2020 leap
    const part = Array.from({ length: 349 }, () => 2); // 2021 short
    const st = [...series(2020, full), ...series(2021, part)];
    const pw = [...series(2020, full.map((v) => v * 1.5)), ...series(2021, part.map((v) => v * 1.5))];
    const c = compareSeries(st, pw);
    const a2020 = c.annual.find((a) => a.year === 2020)!;
    const a2021 = c.annual.find((a) => a.year === 2021)!;
    expect(a2020.comparable).toBe(true);
    if (a2020.comparable) {
      expect(a2020.ratio).toBeCloseTo(1.5, 12);
      expect(a2020.stationTotalMm).toBeCloseTo(732, 9);
    }
    expect(a2021.comparable).toBe(false);
    if (!a2021.comparable) expect(a2021.reason).toMatch(/349/);
  });
  it("binned scatter conserves the point count", () => {
    const c = compareSeries(series(2020, [0.1, 0.12, 3.9, 5]), series(2020, [0.2, 0.15, 4, 5.1]));
    expect(c.points).toHaveLength(4);
    expect(c.binned.cells.reduce((a, b) => a + b.count, 0)).toBe(4);
    expect(c.binned.cells.length).toBeLessThan(4);
    expect(c.binned.axisMaxMm).toBe(6);
  });
});

describe("summary wording follows the sign", () => {
  const base = { n: 5800, dateRange: { start: "2010-01-01", end: "2025-12-31" }, overallRatio: 1.1, r2: 0.9 };
  it("higher", () => expect(summarize({ ...base, biasMmPerDay: 0.43 })).toMatch(/reads 0\.4 mm\/day higher than the Brentwood station/));
  it("lower", () => expect(summarize({ ...base, biasMmPerDay: -0.43, overallRatio: 0.9 })).toMatch(/reads 0\.4 mm\/day lower than/));
  it("rounds to 0.0 -> agree", () => {
    const s = summarize({ ...base, biasMmPerDay: -0.04, overallRatio: 0.99 });
    expect(s).toMatch(/agree on average/);
    expect(s).not.toMatch(/higher|lower/);
  });
  it("includes the numbers", () => {
    const s = summarize({ ...base, biasMmPerDay: 0.43 });
    expect(s).toContain("5,800");
    expect(s).toContain("1.10 times");
    expect(s).toContain("R² is 0.90");
  });
});

describe("powerEt0Series", () => {
  const mk = (over: Partial<PowerResult>): PowerResult =>
    ({
      status: "ok", lat: 37.93, lon: -121.66, elevationM: 20, fetchedAt: "t", origin: "saved", message: undefined,
      days: [
        { date: "2019-12-31", tMaxC: 20, tMinC: 10, rhPct: 60, wind2mMs: 2, solarMJm2: 10, precipMm: 0 },
        { date: "2020-06-15", tMaxC: 30, tMinC: 15, rhPct: 50, wind2mMs: 2, solarMJm2: 25, precipMm: 0 },
        { date: "2020-06-16", tMaxC: null, tMinC: 15, rhPct: 50, wind2mMs: 2, solarMJm2: 25, precipMm: 0 },
      ],
      ...over,
    }) as PowerResult;
  it("computes FAO-56 ET0 inside the window, null for missing inputs, skips outside", () => {
    const r = powerEt0Series(mk({}), "2020-01-01", "2020-12-31");
    if (!r.ok) throw new Error(r.message);
    expect(r.series).toHaveLength(2);
    expect(r.series[0].value).toBeGreaterThan(3);
    expect(r.series[0].value).toBeLessThan(10);
    expect(r.series[1].value).toBeNull();
  });
  it("fails honestly without elevation or on error status", () => {
    expect(powerEt0Series(mk({ elevationM: null }), "2020-01-01", "2020-12-31").ok).toBe(false);
    expect(powerEt0Series(mk({ status: "error", message: "boom" }), "2020-01-01", "2020-12-31")).toEqual({ ok: false, message: "boom" });
  });
});
