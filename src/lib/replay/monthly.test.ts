import { describe, expect, it } from "vitest";
import { buildMonthlyTable, rotationMonthlyUse, seasonMonthlyPieces } from "./monthly";
import { resolveCrop } from "./crop";
import { evaluateSeason } from "./evaluate";
import { dayNum } from "./dates";
import { fixtureCrop, makeClimate } from "./testFixtures";

// 1 June to 10 July in a year: 30 + 10 = 40 days, Kc 1 throughout. June is fully covered, July only partly.
const june = fixtureCrop({ id: "june", kc: [1, 1, 1], days: [10, 10, 10, 10], plant: "06-01" });
// Exactly 61 days: 1 Jun to 31 Jul -> June and July both whole.
const twoMonths = fixtureCrop({ id: "two", kc: [1, 1, 1], days: [15, 15, 15, 16], plant: "06-01" });
// Planted 15 July: shares July with `twoMonths` when both are merged into one year.
const overlapping = fixtureCrop({ id: "ov", kc: [1, 1, 1], days: [15, 15, 15, 16], plant: "07-15" });

const res = (c: ReturnType<typeof fixtureCrop>) => {
  const r = resolveCrop(c);
  if (!r.ok) throw new Error(r.reason);
  return r.crop;
};

describe("seasonMonthlyPieces", () => {
  it("splits a season by calendar month and sums Kc x ET0 per month", () => {
    const c = makeClimate({ et0: () => 4 });
    const p = seasonMonthlyPieces(c, res(june), 2000);
    expect(p.map((x) => x.month)).toEqual(["2000-06", "2000-07"]);
    expect(p[0].etcMm).toBeCloseTo(30 * 4, 9);
    expect(p[1].etcMm).toBeCloseTo(10 * 4, 9);
    expect(p[0].missingEt0Days + p[1].missingEt0Days).toBe(0);
  });

  it("the monthly pieces add up to the engine's season ETc", () => {
    const c = makeClimate({ et0: (d) => 3 + (d % 7) / 10 });
    const curved = fixtureCrop({ id: "cv", kc: [0.4, 1.15, 0.5], days: [20, 30, 40, 25], plant: "04-10" });
    const sum = seasonMonthlyPieces(c, res(curved), 1999).reduce((s, x) => s + x.etcMm, 0);
    expect(sum).toBeCloseTo(evaluateSeason(c, curved, 1999, 1000).etcMm as number, 9);
  });

  it("counts missing ET0 days instead of filling them", () => {
    const c = makeClimate({ et0: (d) => (d === dayNum(2000, 6, 5) ? null : 4) });
    const p = seasonMonthlyPieces(c, res(june), 2000);
    expect(p[0].missingEt0Days).toBe(1);
    expect(p[0].etcMm).toBeCloseTo(29 * 4, 9);
  });
});

describe("rotationMonthlyUse", () => {
  const climate = makeClimate({ et0: () => 5 });
  const table = buildMonthlyTable(climate, [june, twoMonths, overlapping], 1986, 2025);

  it("gives a value for months fully inside a season, null (not zero) for partial months, and nothing outside seasons", () => {
    const out = rotationMonthlyUse(table, ["june"], 2000, 2001);
    const get = (m: string) => out.find((o) => o.month === m);
    expect(get("2000-06")).toEqual({ month: "2000-06", mm: 150, why: null });
    expect(get("2000-07")).toEqual({ month: "2000-07", mm: null, why: "partial-month" });
    expect(get("2000-05")).toBeUndefined(); // outside any season: not listed at all, so never read as 0
    expect(out.every((o) => o.mm === null || o.mm > 0)).toBe(true);
  });

  it("a month covered whole by one season is its full sum", () => {
    const out = rotationMonthlyUse(table, ["two"], 2000, 2000);
    expect(out).toEqual([
      { month: "2000-06", mm: 150, why: null },
      { month: "2000-07", mm: 155, why: null },
    ]);
  });

  it("follows the rotation order by season year (sequence[(Y - 1986) mod length])", () => {
    // 1986 -> "two" (index 0), 1987 -> "june" (index 1).
    const out = rotationMonthlyUse(table, ["two", "june"], 1986, 1987);
    expect(out.find((o) => o.month === "1986-07")?.mm).toBe(155);
    expect(out.find((o) => o.month === "1987-07")?.why).toBe("partial-month");
  });

  it("two seasons in the same month give null with the overlap reason", () => {
    // Hand-merge two seasons of the same year into one crop entry so both land in July 2000.
    const merged = { z: { 2000: [...table.two[2000], ...table.ov[2000]] } };
    const out = rotationMonthlyUse(merged, ["z"], 2000, 2000);
    expect(out.find((o) => o.month === "2000-07")).toEqual({ month: "2000-07", mm: null, why: "overlap" });
  });

  it("a month with a missing ET0 day is null with the missing-et0 reason", () => {
    const holes = makeClimate({ et0: (d) => (d === dayNum(2000, 6, 5) ? null : 5) });
    const t = buildMonthlyTable(holes, [twoMonths], 2000, 2000);
    expect(rotationMonthlyUse(t, ["two"], 2000, 2000)[0]).toEqual({ month: "2000-06", mm: null, why: "missing-et0" });
  });

  it("an empty sequence or unknown crop id yields nothing, not zeros", () => {
    expect(rotationMonthlyUse(table, [], 2000, 2001)).toEqual([]);
    expect(rotationMonthlyUse(table, ["nope"], 2000, 2001)).toEqual([]);
  });
});
