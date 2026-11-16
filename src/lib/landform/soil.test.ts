import { describe, expect, it } from "vitest";
import { componentAwcMm, deriveSoil, hydrologicGroupMeaning, kfClassRank, profileAwc, textureClass } from "./soil";
import type { SoilComponent, SoilHorizon } from "./types";

describe("USDA texture triangle", () => {
  const cases: Array<[number, number, number, string]> = [
    // [sand, silt, clay, expected]
    [90, 5, 5, "sand"],
    [85, 10, 5, "loamy sand"], // silt + 1.5 clay = 17.5 >= 15
    [80, 15, 5, "loamy sand"], // silt + 2 clay = 25 < 30
    [75, 20, 5, "sandy loam"], // silt + 2 clay = 30 exactly: sandy loam
    [65, 28, 7, "sandy loam"], // clay 7, sand > 52
    [52, 41, 7, "loam"], // sand exactly 52 is loam
    [40, 40, 20, "loam"],
    [55, 25, 20, "sandy clay loam"], // silt < 28 and sand > 45
    [45, 30, 25, "loam"], // sand exactly 45 is not sandy clay loam
    [20, 60, 20, "silt loam"],
    [10, 85, 5, "silt"],
    [10, 80, 10, "silt"], // silt exactly 80 with clay < 12
    [8, 80, 12, "silt loam"], // clay 12 with silt 80 is silt loam
    [10, 55, 35, "silty clay loam"], // sand < 20
    [30, 40, 30, "clay loam"],
    [20, 40, 40, "silty clay"], // silt exactly 40
    [45, 15, 40, "clay"], // sand exactly 45
    [46, 14, 40, "sandy clay"], // sand just over 45
    [65, 0, 35, "sandy clay"],
    [15, 35, 50, "clay"], // the real Brentwood Ap horizon
    [68, 19.5, 12.5, "sandy loam"], // the real Fresno surface horizon
    [100, 0, 0, "sand"],
    [0, 100, 0, "silt"],
    [0, 0, 100, "clay"],
  ];
  it.each(cases)("sand %d silt %d clay %d is %s", (sand, silt, clay, expected) => {
    expect(textureClass(sand, silt, clay)).toBe(expected);
  });
  it("leaves no gaps: every whole-percent sand and clay combination gets exactly one class", () => {
    for (let sand = 0; sand <= 100; sand++) {
      for (let clay = 0; sand + clay <= 100; clay++) {
        const silt = 100 - sand - clay;
        expect(textureClass(sand, silt, clay), `sand ${sand} silt ${silt} clay ${clay}`).not.toBeNull();
      }
    }
  });
  it("returns null when the three do not add up to about 100 or are invalid", () => {
    expect(textureClass(50, 50, 50)).toBeNull();
    expect(textureClass(10, 10, 10)).toBeNull();
    expect(textureClass(-1, 60, 41)).toBeNull();
    expect(textureClass(NaN, 50, 50)).toBeNull();
  });
});

const hz = (topCm: number, bottomCm: number, awc: number | null): SoilHorizon => ({
  name: null, topCm, bottomCm, sandPct: null, siltPct: null, clayPct: null, omPct: null, awc, kf: null, ksatUmPerS: null, ph: null,
});
const comp = (name: string, pct: number, horizons: SoilHorizon[]): SoilComponent => ({
  cokey: name, name, pct, slopePct: null, drainageClass: null, hydgrp: null, taxClass: null, horizons,
});

describe("profile available water capacity (top 100 cm)", () => {
  it("sums awc x thickness x 10 and clips at 100 cm", () => {
    const c = comp("A", 60, [hz(0, 20, 0.1), hz(20, 60, 0.15), hz(60, 150, 0.2)]);
    // 0.10*20*10 = 20; 0.15*40*10 = 60; 0.20*40*10 = 80  => 160 mm
    const r = componentAwcMm(c);
    expect(r.mm).toBeCloseTo(160, 9);
    expect(r.coveredCm).toBe(100);
    expect(r.depthCm).toBe(150);
  });
  it("weights components by percentage", () => {
    const a = comp("A", 60, [hz(0, 20, 0.1), hz(20, 60, 0.15), hz(60, 150, 0.2)]); // 160 mm
    const b = comp("B", 40, [hz(0, 100, 0.1)]); // 100 mm
    const p = profileAwc([a, b]);
    expect(p?.mm).toBeCloseTo((60 * 160 + 40 * 100) / 100, 9); // 136
    expect(p?.coveragePct).toBe(100);
    expect(p?.shallowOrIncomplete).toBe(false);
  });
  it("leaves out components with no awc data and says how much was covered", () => {
    const a = comp("A", 70, [hz(0, 100, 0.1)]); // 100 mm
    const rock = comp("Rock outcrop", 30, [hz(0, 30, null)]);
    const p = profileAwc([a, rock]);
    expect(p?.mm).toBeCloseTo(100, 9);
    expect(p?.coveragePct).toBeCloseTo(70, 9);
  });
  it("flags shallow soil (horizons only to 50 cm) instead of pretending to 100 cm", () => {
    const p = profileAwc([comp("S", 100, [hz(0, 50, 0.12)])]);
    expect(p?.mm).toBeCloseTo(60, 9);
    expect(p?.shallowOrIncomplete).toBe(true);
    expect(p?.perComponent[0].coveredCm).toBe(50);
  });
  it("a horizon with no awc value inside 0-100 cm is not counted as covered", () => {
    const r = componentAwcMm(comp("G", 100, [hz(0, 30, 0.1), hz(30, 60, null), hz(60, 100, 0.2)]));
    expect(r.mm).toBeCloseTo(30 + 80, 9);
    expect(r.coveredCm).toBe(70);
  });
  it("returns null when nothing has awc", () => {
    expect(profileAwc([comp("R", 100, [hz(0, 20, null)])])).toBeNull();
    expect(profileAwc([])).toBeNull();
  });
});

describe("hydrologic soil group meaning (NEH 630 chapter 7)", () => {
  it("quotes the NRCS wording for A to D", () => {
    expect(hydrologicGroupMeaning("A")?.meaning).toMatch(/low runoff potential when thoroughly wet/);
    expect(hydrologicGroupMeaning("b")?.meaning).toMatch(/moderately low runoff potential/);
    expect(hydrologicGroupMeaning("C")?.meaning).toMatch(/moderately high runoff potential/);
    expect(hydrologicGroupMeaning("D")?.meaning).toMatch(/high runoff potential/);
  });
  it("explains dual groups (first letter drained, second undrained)", () => {
    const m = hydrologicGroupMeaning("B/D");
    expect(m?.dual).toBe(true);
    expect(m?.meaning).toMatch(/drained.*group B.*undrained.*group D/);
  });
  it("returns null for missing or unknown values", () => {
    expect(hydrologicGroupMeaning(null)).toBeNull();
    expect(hydrologicGroupMeaning("X")).toBeNull();
  });
});

describe("Kf class rank", () => {
  it("ranks among the 14 NRCS classes", () => {
    expect(kfClassRank(0.02)).toBe(1);
    expect(kfClassRank(0.24)).toBe(7);
    expect(kfClassRank(0.2)).toBe(6);
    expect(kfClassRank(0.64)).toBe(14);
    expect(kfClassRank(0.69)).toBe(14);
    expect(kfClassRank(null)).toBeNull();
    expect(kfClassRank(0)).toBeNull();
  });
});

describe("deriveSoil", () => {
  it("uses the largest component and its shallowest horizon", () => {
    const a = comp("Big", 70, [hz(20, 50, 0.1), { ...hz(0, 20, 0.12), sandPct: 40, siltPct: 40, clayPct: 20, omPct: 2, kf: 0.3 }]);
    const b = comp("Small", 30, [hz(0, 100, 0.2)]);
    const d = deriveSoil([b, a]);
    expect(d?.dominantName).toBe("Big");
    expect(d?.textureClass).toBe("loam");
    expect(d?.omTopPct).toBe(2);
    expect(d?.kfTop).toBe(0.3);
    expect(d?.topHorizon).toEqual({ name: null, topCm: 0, bottomCm: 20 });
    expect(deriveSoil([])).toBeNull();
  });
});
