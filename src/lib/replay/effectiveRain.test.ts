import { describe, expect, it } from "vitest";
import { effectiveRainMonthly, seasonEffectiveRain } from "./effectiveRain";

describe("USDA-SCS effective rainfall (monthly)", () => {
  it("is 0 for 0 mm", () => {
    expect(effectiveRainMonthly(0)).toBe(0);
  });
  it("mid value: 100 mm -> 100 x (125 - 20) / 125 = 84 mm", () => {
    expect(effectiveRainMonthly(100)).toBeCloseTo(84, 10);
  });
  it("small values are nearly all effective: 10 mm -> 9.84 mm", () => {
    expect(effectiveRainMonthly(10)).toBeCloseTo(9.84, 10);
  });
  it("exactly 250 mm -> 150 mm, and both branches agree there", () => {
    expect(effectiveRainMonthly(250)).toBeCloseTo(150, 10);
    expect(125 + 0.1 * 250).toBeCloseTo(150, 10);
  });
  it("above 250 mm uses 125 + 0.1 P: 300 mm -> 155 mm", () => {
    expect(effectiveRainMonthly(300)).toBeCloseTo(155, 10);
  });
  it("never exceeds the rain and never decreases as rain grows", () => {
    let prev = 0;
    for (let p = 0; p <= 600; p += 5) {
      const e = effectiveRainMonthly(p);
      expect(e).toBeLessThanOrEqual(p + 1e-9);
      expect(e).toBeGreaterThanOrEqual(prev - 1e-9);
      prev = e;
    }
  });
  it("rejects negative and non-finite rain", () => {
    expect(() => effectiveRainMonthly(-1)).toThrow(RangeError);
    expect(() => effectiveRainMonthly(NaN)).toThrow(RangeError);
    expect(() => effectiveRainMonthly(Infinity)).toThrow(RangeError);
  });
});

describe("pro-rating a month's effective rainfall to the season's days", () => {
  it("gives the season the share of Pe equal to the share of the month's rain on season days", () => {
    // Month total 100 mm -> Pe 84. 40 mm of it fell on season days -> 0.4 x 84 = 33.6
    expect(seasonEffectiveRain([{ monthTotalMm: 100, seasonRainMm: 40 }])).toBeCloseTo(33.6, 10);
  });
  it("all of the month's rain on season days gives the full Pe; none gives zero", () => {
    expect(seasonEffectiveRain([{ monthTotalMm: 100, seasonRainMm: 100 }])).toBeCloseTo(84, 10);
    expect(seasonEffectiveRain([{ monthTotalMm: 100, seasonRainMm: 0 }])).toBe(0);
  });
  it("a month with no rain contributes zero", () => {
    expect(seasonEffectiveRain([{ monthTotalMm: 0, seasonRainMm: 0 }])).toBe(0);
  });
  it("sums months", () => {
    const v = seasonEffectiveRain([
      { monthTotalMm: 100, seasonRainMm: 100 },
      { monthTotalMm: 300, seasonRainMm: 150 },
    ]);
    expect(v).toBeCloseTo(84 + 155 * 0.5, 10);
  });
});
