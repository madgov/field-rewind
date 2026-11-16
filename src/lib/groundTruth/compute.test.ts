import { describe, expect, it } from "vitest";
import { alignDaily, annualPrecip, compareDaymetPower, daymetDate, parseDaymetCsv, type PairedDay } from "./daymet";
import { pairStats, pearson } from "./stats";
import type { DailyRecord } from "../types";

const pw = (date: string, precipMm: number | null, tMaxC: number | null = 20, tMinC: number | null = 10): DailyRecord => ({ date, tMaxC, tMinC, rhPct: null, wind2mMs: null, solarMJm2: null, precipMm });

describe("r-squared and bias on hand-computed fixtures", () => {
  it("perfect linear: ref 1..4, other = 2 x ref", () => {
    const s = pairStats([1, 2, 3, 4], [2, 4, 6, 8]);
    expect(s.n).toBe(4);
    expect(s.bias).toBeCloseTo(2.5, 12); // mean 5 - mean 2.5
    expect(s.rmse).toBeCloseTo(Math.sqrt(7.5), 12); // (1+4+9+16)/4
    expect(s.r).toBeCloseTo(1, 12);
    expect(s.r2).toBeCloseTo(1, 12);
  });
  it("r = 0.5 case", () => {
    // ref 1,2,3 other 1,3,2: sxy=1, sxx=2, syy=2
    const s = pairStats([1, 2, 3], [1, 3, 2]);
    expect(s.r).toBeCloseTo(0.5, 12);
    expect(s.r2).toBeCloseTo(0.25, 12);
    expect(s.bias).toBeCloseTo(0, 12);
    expect(s.rmse).toBeCloseTo(Math.sqrt(2 / 3), 12);
  });
  it("zero variance gives null, never NaN", () => {
    expect(pearson([1, 1, 1], [1, 2, 3])).toBeNull();
    expect(pairStats([1, 1, 1], [1, 2, 3]).r2).toBeNull();
  });
});

describe("Daymet calendar", () => {
  it("maps year/yday to dates; leap years run to Dec 30", () => {
    expect(daymetDate(1985, 1)).toBe("1985-01-01");
    expect(daymetDate(2020, 60)).toBe("2020-02-29");
    expect(daymetDate(2020, 365)).toBe("2020-12-30");
    expect(daymetDate(2021, 365)).toBe("2021-12-31");
  });
  it("parses the CSV and validates units", () => {
    const csv = [
      "Latitude: 37.93  Longitude: -121.66",
      "Elevation: 13 meters",
      "How to cite: Thornton et al.",
      "year,yday,prcp (mm/day),tmax (deg c),tmin (deg c)",
      "2020,365,1.5,20.0,5.0",
      "2021,1,0.00,18.0,4.0",
    ].join("\n");
    const p = parseDaymetCsv(csv);
    expect(p.lat).toBe(37.93);
    expect(p.elevationM).toBe(13);
    expect(p.days).toEqual([
      { date: "2020-12-30", prcpMm: 1.5, tMaxC: 20, tMinC: 5 },
      { date: "2021-01-01", prcpMm: 0, tMaxC: 18, tMinC: 4 },
    ]);
    expect(() => parseDaymetCsv(csv.replace("prcp (mm/day)", "prcp (inches)"))).toThrow(/prcp/);
  });
});

describe("date alignment with Daymet's missing 31 Dec in leap years", () => {
  it("pairs by date, counts the dropped leap Dec 31, and never shifts", () => {
    const daymet = [
      { date: "2020-12-29", prcpMm: 1, tMaxC: 1, tMinC: 0 },
      { date: "2020-12-30", prcpMm: 2, tMaxC: 2, tMinC: 0 },
      { date: "2021-01-01", prcpMm: 3, tMaxC: 3, tMinC: 0 },
    ];
    const power = [pw("2020-12-29", 10), pw("2020-12-30", 20), pw("2020-12-31", 30), pw("2021-01-01", 40), pw("2021-01-02", 50), pw("1984-12-31", 9)];
    const a = alignDaily(daymet, power, "1985-01-01", "2024-12-31");
    expect(a.pairs.map((p) => [p.date, p.daymet.prcp, p.power.prcp])).toEqual([
      ["2020-12-29", 1, 10],
      ["2020-12-30", 2, 20],
      ["2021-01-01", 3, 40],
    ]);
    expect(a.droppedLeapDec31).toBe(1); // 2020-12-31
    expect(a.otherUnmatched).toBe(1); // 2021-01-02 (1984 is outside the range)
  });
  it("31 Dec of a non-leap year missing in Daymet is NOT counted as the leap case", () => {
    const a = alignDaily([], [pw("2021-12-31", 1)], "1985-01-01", "2024-12-31");
    expect(a.droppedLeapDec31).toBe(0);
    expect(a.otherUnmatched).toBe(1);
  });
});

describe("annual totals and comparison", () => {
  const mk = (date: string, d: number, p: number): PairedDay => ({ date, daymet: { prcp: d, tMax: 1, tMin: 0 }, power: { prcp: p, tMax: 1, tMin: 0 } });
  it("hand-computed annual rows, ratio and bias; short years are excluded", () => {
    const pairs = [mk("2000-01-01", 1, 2), mk("2000-01-02", 2, 2), mk("2001-01-01", 4, 3), mk("2001-01-02", 0, 1), mk("2002-01-01", 9, 9)];
    const a = annualPrecip(pairs, 2);
    expect(a.rows.map((r) => [r.year, r.daymetMm, r.powerMm, r.diffMm])).toEqual([
      [2000, 3, 4, 1],
      [2001, 4, 4, 0],
    ]);
    expect(a.rows[0]?.ratio).toBeCloseTo(4 / 3, 12);
    expect(a.excludedYears).toEqual([{ year: 2002, pairedDays: 1 }]);
    expect(a.biasMmPerYear).toBeCloseTo(0.5, 12); // (8 - 7) / 2
    expect(a.ratioOfTotals).toBeCloseTo(8 / 7, 12);
    expect(a.meanDaymetMm).toBeCloseTo(3.5, 12);
    expect(a.meanPowerMm).toBeCloseTo(4, 12);
  });
  it("only days where both products have a value are paired for each variable", () => {
    const power = [pw("2000-01-01", 1, 10, 0), pw("2000-01-02", null, 11, 1), pw("2000-01-03", 3, 12, 2)];
    const daymet = [
      { date: "2000-01-01", prcpMm: 2, tMaxC: 11, tMinC: 1 },
      { date: "2000-01-02", prcpMm: 5, tMaxC: 12, tMinC: 2 },
      { date: "2000-01-03", prcpMm: 4, tMaxC: 13, tMinC: 3 },
    ];
    const c = compareDaymetPower(alignDaily(daymet, power, "1985-01-01", "2024-12-31"), {
      daymetCell: { lat: 1, lon: 2, elevationM: null },
      power: { origin: "saved", fetchedAt: "2026-01-01T00:00:00Z" },
    });
    expect(c?.precipDaily.n).toBe(2); // the null POWER day is skipped, not zero
    expect(c?.tMax.n).toBe(3);
    expect(c?.tMax.bias).toBeCloseTo(-1, 12);
    expect(c?.precipDaily.bias).toBeCloseTo(-1, 12); // (1+3)/2 - (2+4)/2
  });
});
