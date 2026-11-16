import { describe, expect, it } from "vitest";
import { compareSeries, percentile, periodOf, median, yearQuality } from "./stats";
import { yearDays } from "./testFixtures";
import type { YearValue } from "../shift/types";

const series = (f: (year: number) => number | null, flagged: (year: number) => boolean = () => false): YearValue[] =>
  Array.from({ length: 41 }, (_, i) => 1985 + i).map((year) => ({ year, value: flagged(year) ? null : f(year), missingDays: 0, flagged: flagged(year), period: periodOf(year) }));

describe("period split", () => {
  it("is 1985-2004 vs 2006-2025 and 2005 belongs to neither", () => {
    expect(periodOf(1985)).toBe("early");
    expect(periodOf(2004)).toBe("early");
    expect(periodOf(2005)).toBe("none");
    expect(periodOf(2006)).toBe("late");
    expect(periodOf(2025)).toBe("late");
    expect(periodOf(1984)).toBe("none");
  });

  it("2005 is excluded from both period means", () => {
    const c = compareSeries(series((y) => (y === 2005 ? 1000 : y <= 2004 ? 10 : 20)), 0);
    expect(c.early.mean).toBe(10);
    expect(c.late.mean).toBe(20);
    expect(c.early.yearsUsed).toBe(20);
    expect(c.late.yearsUsed).toBe(20);
  });
});

describe("compareSeries rules", () => {
  it("needs at least 15 usable years in each period", () => {
    const c = compareSeries(series((y) => (y <= 2004 ? 10 : 20), (y) => y >= 1985 && y <= 1990), 0);
    expect(c.early.yearsUsed).toBe(14);
    expect(c.early.mean).toBeNull();
    expect(c.verdict).toBe("insufficient-data");
    expect(c.shownDiff).toBe(0);
    expect(c.early.flaggedYears).toEqual([1985, 1986, 1987, 1988, 1989, 1990]);
  });

  it("accepts exactly 15 usable years", () => {
    const c = compareSeries(series((y) => (y <= 2004 ? 10 : 20), (y) => y >= 1985 && y <= 1989), 0);
    expect(c.early.yearsUsed).toBe(15);
    expect(c.verdict).toBe("increase");
  });

  it("a gap within twice the standard error is not clear", () => {
    const noisy = series((y) => (y <= 2004 ? 10 : 10.5) + (y % 2 === 0 ? 5 : -5));
    expect(compareSeries(noisy, 1).verdict).toBe("no-clear-change");
  });

  it("never calls a change clear when the printed numbers do not differ (display rounding)", () => {
    // no spread, real gap of 0.4 that rounds to the same whole number on both sides
    const c = compareSeries(series((y) => (y <= 2004 ? 10 : 10.4)), 0);
    expect(c.diff).toBeCloseTo(0.4);
    expect(c.shownEarly).toBe(10);
    expect(c.shownLate).toBe(10);
    expect(c.shownDiff).toBe(0);
    expect(c.verdict).toBe("no-clear-change");
  });

  it("shown difference is round(late) - round(early), not round(late - early)", () => {
    // 10.4 -> 10 and 11.4 -> 11 : diff of means is 1.0, shown 1.  10.6 -> 11 and 11.4 -> 11: diff 0.8, shown 0
    const a = compareSeries(series((y) => (y <= 2004 ? 10.6 : 11.4)), 0);
    expect(a.shownDiff).toBe(0);
    expect(a.verdict).toBe("no-clear-change");
    const b = compareSeries(series((y) => (y <= 2004 ? 10.4 : 11.6)), 0);
    expect(b.shownDiff).toBe(2);
    expect(b.verdict).toBe("increase");
  });

  it("decimal display: 0.484 vs 0.501 shows 0.48 and 0.50, diff 0.02", () => {
    const c = compareSeries(series((y) => (y <= 2004 ? 0.484 : 0.501)), 2);
    expect(c.shownEarly).toBe(0.48);
    expect(c.shownLate).toBe(0.5);
    expect(c.shownDiff).toBe(0.02);
    expect(c.shownDiff).toBeGreaterThan(0);
  });

  it("a decrease keeps a negative shown difference", () => {
    const c = compareSeries(series((y) => (y <= 2004 ? 11 : 6)), 0);
    expect(c.verdict).toBe("decrease");
    expect(c.shownDiff).toBe(-5);
  });
});

describe("small helpers", () => {
  it("percentile interpolates linearly", () => {
    expect(percentile([1, 2, 3, 4, 5], 10)).toBeCloseTo(1.4);
    expect(percentile([], 10)).toBeNull();
    expect(median([3, 1, 2])).toBe(2);
    expect(median([1, 2, 3, 4])).toBe(2.5);
  });

  it("yearQuality flags more than 10 missing days and incomplete years", () => {
    const full = yearDays(2010);
    expect(yearQuality(2010, full, (d) => d.frostFlag).flagged).toBe(false);
    const ten = full.map((d, i) => (i < 10 ? { ...d, frostFlag: null } : d));
    expect(yearQuality(2010, ten, (d) => d.frostFlag)).toEqual({ missingDays: 10, flagged: false });
    const eleven = full.map((d, i) => (i < 11 ? { ...d, frostFlag: null } : d));
    expect(yearQuality(2010, eleven, (d) => d.frostFlag)).toEqual({ missingDays: 11, flagged: true });
    const partial = full.slice(0, 300);
    expect(yearQuality(2010, partial, (d) => d.frostFlag)).toEqual({ missingDays: 65, flagged: true });
  });
});
