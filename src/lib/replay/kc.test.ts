import { describe, expect, it } from "vitest";
import { kcCurve, kcForDay } from "./kc";
import { fixtureCrop } from "./testFixtures";

// ini 10 days at 0.3, dev 20 days to 1.1, mid 30 days at 1.1, late 20 days to 0.5. Total 80 days.
const crop = fixtureCrop({ id: "k", kc: [0.3, 1.1, 0.5], days: [10, 20, 30, 20] });

describe("FAO-56 Kc curve (Eq. 66)", () => {
  it("has one value per season day", () => {
    expect(kcCurve(crop)).toHaveLength(80);
  });
  it("is Kc ini through the initial stage, inclusive of its last day", () => {
    expect(kcForDay(crop, 0)).toBeCloseTo(0.3, 12);
    expect(kcForDay(crop, 9)).toBeCloseTo(0.3, 12);
  });
  it("rises linearly across development: first day is one step up, last day reaches Kc mid", () => {
    expect(kcForDay(crop, 10)).toBeCloseTo(0.3 + (1 / 20) * 0.8, 12); // day 11
    expect(kcForDay(crop, 19)).toBeCloseTo(0.3 + (10 / 20) * 0.8, 12); // day 20: halfway
    expect(kcForDay(crop, 29)).toBeCloseTo(1.1, 12); // day 30
  });
  it("is Kc mid through mid-season", () => {
    expect(kcForDay(crop, 30)).toBeCloseTo(1.1, 12);
    expect(kcForDay(crop, 59)).toBeCloseTo(1.1, 12);
  });
  it("falls linearly across the late season: first day one step down, last day reaches Kc end", () => {
    expect(kcForDay(crop, 60)).toBeCloseTo(1.1 - (1 / 20) * 0.6, 12); // day 61
    expect(kcForDay(crop, 69)).toBeCloseTo(1.1 - (10 / 20) * 0.6, 12); // day 70: halfway
    expect(kcForDay(crop, 79)).toBeCloseTo(0.5, 12); // day 80
  });
  it("reproduces FAO-56 Example 28 arithmetic: Kc = 0.15 + (40-25)/25 x (1.19-0.15) = 0.77", () => {
    // Stage of 25 days starting after 25 days: day 40 is 15 days into it.
    const c = fixtureCrop({ id: "ex28", kc: [0.15, 1.19, 0.5], days: [25, 25, 10, 10] });
    expect(kcForDay(c, 39)).toBeCloseTo(0.15 + (15 / 25) * (1.19 - 0.15), 12);
    expect(kcForDay(c, 39)).toBeCloseTo(0.774, 3);
  });
  it("rejects a day outside the season and a crop with unknown values", () => {
    expect(() => kcForDay(crop, -1)).toThrow(RangeError);
    expect(() => kcForDay(crop, 80)).toThrow(RangeError);
    expect(() => kcForDay(fixtureCrop({ id: "n", kc: [null, 1, 1] }), 0)).toThrow();
  });
});
