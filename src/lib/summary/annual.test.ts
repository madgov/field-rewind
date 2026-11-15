import { describe, expect, it } from "vitest";
import { enumerateDays } from "../power/dates";
import { loadSavedDemoPin } from "../power";
import type { DailyRecord, PowerResult } from "../types";
import { summarizeAnnual } from "./annual";

/** A complete, valid day. Hand-built test data: values are arbitrary but physically valid. */
function day(date: string, over: Partial<DailyRecord> = {}): DailyRecord {
  return { date, tMaxC: 25, tMinC: 12, rhPct: 60, wind2mMs: 2, solarMJm2: 20, precipMm: 1, ...over };
}
function result(start: string, end: string, over: (d: string) => Partial<DailyRecord> = () => ({}), elevationM: number | null = 100) {
  return { lat: 40, elevationM, days: enumerateDays(start, end).map((d) => day(d, over(d))) } satisfies Pick<PowerResult, "lat" | "elevationM" | "days">;
}

describe("summarizeAnnual", () => {
  it("sums a complete leap year (366 days) and a normal year (365 days)", () => {
    const s = summarizeAnnual(result("2023-01-01", "2024-12-31"));
    const y23 = s.years.find((y) => y.year === 2023)!;
    const y24 = s.years.find((y) => y.year === 2024)!;
    expect(y23.daysInYear).toBe(365);
    expect(y24.daysInYear).toBe(366);
    expect(y23.daysPresent).toBe(365);
    expect(y24.daysPresent).toBe(366);
    expect(y23.precipTotalMm).toBeCloseTo(365, 9);
    expect(y24.precipTotalMm).toBeCloseTo(366, 9);
    expect(y23.et0Complete && y24.et0Complete).toBe(true);
    expect(s.precip).toMatchObject({ available: true, meanAnnualMm: 365.5, yearsUsed: [2023, 2024], firstYearUsed: 2023, lastYearUsed: 2024 });
    // ET0 total is the sum of 365/366 identical daily values (seasonal Ra varies, so just check positivity and consistency)
    expect(y23.et0TotalMm).toBeGreaterThan(300);
    expect(s.et0).toMatchObject({ available: true, yearsUsedCount: 2, yearsExcluded: [] });
    expect(s.missing).toEqual({ et0Days: 0, precipDays: 0, anyFieldDays: 0, totalDays: 731 });
  });

  it("excludes a year with a missing day from the mean and counts it", () => {
    const s = summarizeAnnual(result("2021-01-01", "2023-12-31", (d) => (d === "2022-06-15" ? { precipMm: null } : d === "2023-03-01" ? { rhPct: null } : {})));
    // precip: 2022 excluded; ET0: 2023 excluded (RH is an ET0 input, not a precip input)
    expect(s.precip).toMatchObject({ yearsUsed: [2021, 2023], yearsExcluded: [{ year: 2022, reason: "missing-days" }], meanAnnualMm: 365 });
    expect(s.et0).toMatchObject({ yearsUsed: [2021, 2022], yearsExcluded: [{ year: 2023, reason: "missing-days" }] });
    expect(s.years.find((y) => y.year === 2022)!.precipMissingDays).toBe(1);
    expect(s.years.find((y) => y.year === 2023)!.et0MissingDays).toBe(1);
    expect(s.missing).toEqual({ et0Days: 1, precipDays: 1, anyFieldDays: 2, totalDays: 1095 });
  });

  it("excludes a partial first and last year", () => {
    const s = summarizeAnnual(result("2020-07-01", "2023-03-31"));
    expect(s.precip).toMatchObject({
      yearsUsed: [2021, 2022],
      firstYearUsed: 2021,
      lastYearUsed: 2022,
      yearsExcluded: [
        { year: 2020, reason: "partial-year" },
        { year: 2023, reason: "partial-year" },
      ],
    });
    expect(s.et0).toMatchObject({ yearsUsedCount: 2 });
    expect(s.missing.anyFieldDays).toBe(0);
  });

  it("null elevation: ET0 unavailable with a reason, precipitation still works", () => {
    const s = summarizeAnnual(result("2022-01-01", "2023-12-31", () => ({}), null));
    expect(s.et0.available).toBe(false);
    if (!s.et0.available) expect(s.et0.reason).toMatch(/elevation/);
    expect(s.missing.et0Days).toBeNull();
    expect(s.years[0].et0TotalMm).toBeNull();
    expect(s.precip).toMatchObject({ available: true, meanAnnualMm: 365, yearsUsedCount: 2 });
  });

  it("all-missing input gives no complete years and no mean, never a number", () => {
    const allNull = { tMaxC: null, tMinC: null, rhPct: null, wind2mMs: null, solarMJm2: null, precipMm: null };
    const s = summarizeAnnual(result("2022-01-01", "2022-12-31", () => allNull));
    expect(s.precip).toMatchObject({ available: true, meanAnnualMm: null, yearsUsedCount: 0, firstYearUsed: null, lastYearUsed: null });
    expect(s.et0).toMatchObject({ available: true, meanAnnualMm: null, yearsUsedCount: 0 });
    expect(s.missing).toEqual({ et0Days: 365, precipDays: 365, anyFieldDays: 365, totalDays: 365 });
  });

  it("empty input gives empty results", () => {
    const s = summarizeAnnual({ lat: 0, elevationM: 0, days: [] });
    expect(s.years).toEqual([]);
    expect(s.precip).toMatchObject({ meanAnnualMm: null, yearsUsedCount: 0 });
  });

  it("counts any-field-missing separately from ET0- and precip-missing", () => {
    // Precip null only: not an ET0 gap, but still an any-field gap. Wind null only: ET0 gap, precip fine.
    const s = summarizeAnnual(result("2022-01-01", "2022-01-10", (d) => (d === "2022-01-02" ? { precipMm: null } : d === "2022-01-03" ? { wind2mMs: null } : d === "2022-01-04" ? { wind2mMs: null, precipMm: null } : {})));
    expect(s.missing).toEqual({ et0Days: 2, precipDays: 2, anyFieldDays: 3, totalDays: 10 });
  });
});

describe("real saved Brentwood response", () => {
  it("has 41 complete years, zero missing days, and physically plausible means", async () => {
    const r = await loadSavedDemoPin("brentwood");
    expect(["ok", "partial"]).toContain(r.status);
    const s = summarizeAnnual(r);
    expect(s.missing).toEqual({ et0Days: 0, precipDays: 0, anyFieldDays: 0, totalDays: 14975 });
    expect(s.et0.available).toBe(true);
    if (!s.et0.available) return;
    expect(s.et0.yearsUsedCount).toBe(41);
    expect(s.precip).toMatchObject({ yearsUsedCount: 41, firstYearUsed: 1985, lastYearUsed: 2025 });
    expect(s.et0).toMatchObject({ firstYearUsed: 1985, lastYearUsed: 2025 });
    const et0 = s.et0.meanAnnualMm!;
    const p = (s.precip as { meanAnnualMm: number }).meanAnnualMm;
    expect(Number.isFinite(et0)).toBe(true);
    expect(Number.isFinite(p)).toBe(true);
    // Broad physical bounds for a Mediterranean-climate site (not a calibration).
    expect(et0).toBeGreaterThan(800);
    expect(et0).toBeLessThan(2000);
    expect(p).toBeGreaterThan(100);
    expect(p).toBeLessThan(1000);
  });
});
