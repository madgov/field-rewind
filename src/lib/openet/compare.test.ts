import { describe, expect, it } from "vitest";
import { compareMonthly } from "./compare";
import { COMPARISON_CAVEAT } from "./constants";

describe("compareMonthly", () => {
  const obs = [
    { month: "2022-01", etMm: 20 },
    { month: "2022-07", etMm: 100 },
    { month: "2023-01", etMm: 30 },
    { month: "2023-07", etMm: null },
    { month: "2023-08", etMm: 50 },
  ];
  const mod = [
    { month: "2022-01", mm: 10 },
    { month: "2022-07", mm: 140 },
    { month: "2023-01", mm: 20 },
    { month: "2023-07", mm: 150 },
  ];
  const c = compareMonthly(obs, mod);
  it("pairs only months where both exist", () => {
    expect(c.n).toBe(3);
    expect(c.pairs.map((p) => p.month)).toEqual(["2022-01", "2022-07", "2023-01"]);
    expect([c.firstMonth, c.lastMonth]).toEqual(["2022-01", "2023-01"]);
  });
  it("computes means, difference and ratio (hand-computed)", () => {
    expect(c.meanObservedMm).toBeCloseTo(50, 10);
    expect(c.meanModelledMm).toBeCloseTo(170 / 3, 10);
    expect(c.meanDiffMm).toBeCloseTo(50 - 170 / 3, 10);
    expect(c.ratioOfSums).toBeCloseTo(150 / 170, 10);
  });
  it("averages by calendar month", () => {
    expect(c.byCalendarMonth).toHaveLength(12);
    expect(c.byCalendarMonth[0]).toMatchObject({ observedMeanMm: 25, modelledMeanMm: 15, n: 2 });
    expect(c.byCalendarMonth[6]).toMatchObject({ observedMeanMm: 100, modelledMeanMm: 140, n: 1 });
    expect(c.byCalendarMonth[1]).toMatchObject({ observedMeanMm: null, modelledMeanMm: null, n: 0 });
  });
  it("sentence direction follows the sign and always includes the caveat field", () => {
    expect(c.sentence).toContain("lower than");
    expect(c.sentence).toContain("6.7 mm per month lower than");
    expect(c.caveat).toBe(COMPARISON_CAVEAT);
  });
  it("says higher when observed exceeds modelled, and same when equal", () => {
    expect(compareMonthly([{ month: "2022-01", etMm: 30 }], [{ month: "2022-01", mm: 20 }]).sentence).toContain("10.0 mm per month higher than");
    expect(compareMonthly([{ month: "2022-01", etMm: 20 }], [{ month: "2022-01", mm: 20.02 }]).sentence).toContain("about the same as");
  });
  it("handles no overlap and a zero modelled sum", () => {
    const e = compareMonthly([{ month: "2022-01", etMm: 1 }], [{ month: "2022-02", mm: 1 }]);
    expect(e.n).toBe(0);
    expect(e.meanDiffMm).toBeNull();
    expect(e.sentence).toContain("nothing can be compared");
    expect(e.caveat).toBe(COMPARISON_CAVEAT);
    expect(compareMonthly([{ month: "2022-01", etMm: 1 }], [{ month: "2022-01", mm: 0 }]).ratioOfSums).toBeNull();
  });
});
