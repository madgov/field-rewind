import { describe, expect, it } from "vitest";
import type { DecadeCount, SeasonResult } from "@/lib/replay/types";
import { MIN_VISIBLE_OVER_PCT, SUPPLY_LINE_PCT, cellKind, cellLabel, cropAbbreviations, decadeCountText, formatIsoDate, gaugeShape, plantedYearBefore } from "./cells";

const dec = (o: Partial<DecadeCount>): DecadeCount => ({ label: "1986–1995", startYear: 1986, endYear: 1995, seasons: 10, short: 2, ok: 8, insufficient: 0, evaluable: 10, ...o });

describe("cell mapping", () => {
  it("maps the engine outcome and nothing else", () => {
    expect(cellKind({ outcome: "short" })).toBe("short");
    expect(cellKind({ outcome: "ok" })).toBe("ok");
    expect(cellKind({ outcome: null })).toBe("grey");
  });
  it("abbreviates crops by first letter, two letters on a clash", () => {
    expect(cropAbbreviations([{ id: "a", name: "Winter wheat" }, { id: "b", name: "Maize (grain corn)" }, { id: "c", name: "Cotton" }, { id: "d", name: "Rice (paddy)" }])).toEqual({ a: "W", b: "M", c: "C", d: "R" });
    expect(cropAbbreviations([{ id: "s", name: "Sunflower" }, { id: "t", name: "Sugar beet" }])).toEqual({ s: "Su", t: "Su" });
  });
  it("writes decade counts from the counts", () => {
    expect(decadeCountText(dec({}))).toBe("2 of 10 short");
    expect(decadeCountText(dec({ short: 1, ok: 8, insufficient: 1, evaluable: 9 }))).toBe("1 of 9 short, 1 not judged");
  });
  it("labels a cell with year, crop and outcome", () => {
    const s = { year: 2012, cropName: "Cotton", outcome: "short" } as SeasonResult;
    expect(cellLabel(s)).toBe("2012, Cotton: short of water");
    expect(cellLabel({ ...s, outcome: null })).toMatch(/not enough data/);
  });
  it("formats dates and finds a season planted the year before", () => {
    expect(formatIsoDate("1985-10-15")).toBe("15 Oct 1985");
    expect(plantedYearBefore({ plantingDate: "1985-10-15", year: 1986 })).toBe(true);
    expect(plantedYearBefore({ plantingDate: "1986-04-20", year: 1986 })).toBe(false);
  });
});

describe("gauge geometry", () => {
  const base = { needMm: 500, supplyMm: 1000, needFractionOfSupply: 0.5, outcome: "ok" as const };
  it("fills in proportion to need / supply below the line", () => {
    const g = gaugeShape(base);
    expect(g.fillPct).toBeCloseTo(SUPPLY_LINE_PCT * 0.5);
    expect(g.overPct).toBe(0);
  });
  it("rises above the supply line when short", () => {
    const g = gaugeShape({ needMm: 1200, supplyMm: 1000, needFractionOfSupply: 1.2, outcome: "short" });
    expect(g.basePct).toBe(SUPPLY_LINE_PCT);
    expect(g.overPct).toBeGreaterThan(0);
    expect(g.fillPct).toBeLessThanOrEqual(100);
  });
  it("shows a near miss as visibly over the line", () => {
    const g = gaugeShape({ needMm: 703, supplyMm: 700, needFractionOfSupply: 703 / 700, outcome: "short" });
    expect(g.overPct).toBeGreaterThanOrEqual(MIN_VISIBLE_OVER_PCT);
    expect(gaugeShape({ needMm: 699, supplyMm: 700, needFractionOfSupply: 699 / 700, outcome: "ok" }).overPct).toBe(0);
  });
  it("is clipped, not broken, for a huge need", () => {
    const g = gaugeShape({ needMm: 1e6, supplyMm: 10, needFractionOfSupply: 1e5, outcome: "short" });
    expect(g.clipped).toBe(true);
    expect(g.fillPct).toBeLessThanOrEqual(100);
  });
  it("handles a supply of 0 (no fraction)", () => {
    expect(gaugeShape({ needMm: 300, supplyMm: 0, needFractionOfSupply: null, outcome: "short" }).overPct).toBeGreaterThan(0);
    expect(gaugeShape({ needMm: 0, supplyMm: 0, needFractionOfSupply: null, outcome: "ok" }).fillPct).toBe(0);
  });
  it("is empty for a grey season", () => {
    expect(gaugeShape({ needMm: null, supplyMm: 700, needFractionOfSupply: null, outcome: null }).fillPct).toBe(0);
  });
});
