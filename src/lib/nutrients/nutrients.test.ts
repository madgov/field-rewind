import { describe, expect, it } from "vitest";
import { CROP_CATALOG } from "../crops/catalog";
import type { Sourced } from "../crops/types";
import { NUTRIENT_CATALOG, creditsBetween, fixationKnown, getNutrients, removalAtYield } from "./index";

function allSourced(): [string, Sourced<number>][] {
  const out: [string, Sourced<number>][] = [];
  for (const c of NUTRIENT_CATALOG.crops) {
    for (const k of ["n", "p2o5", "k2o"] as const) out.push([`${c.cropId}.removal.${k}`, c.removalPerUnit[k]]);
    out.push([`${c.cropId}.fix.low`, c.nFixationLbPerAcre.low], [`${c.cropId}.fix.high`, c.nFixationLbPerAcre.high]);
  }
  for (const r of NUTRIENT_CATALOG.rotationCredits) out.push([`credit.${r.fromCropId}->${r.toCropId}`, r.lbNPerAcre]);
  return out;
}

describe("nutrient catalog", () => {
  it("has exactly one entry per catalog crop", () => {
    const ids = CROP_CATALOG.crops.map((c) => c.id).sort();
    expect(NUTRIENT_CATALOG.crops.map((c) => c.cropId).sort()).toEqual(ids);
  });

  it("every value has a source and page, and every unknown has a reason", () => {
    for (const [path, f] of allSourced()) {
      expect(f.source.trim().length, `${path}.source`).toBeGreaterThan(0);
      expect(f.page.trim().length, `${path}.page`).toBeGreaterThan(0);
      if (f.value === null) expect(f.note?.trim().length ?? 0, `${path} null needs a note`).toBeGreaterThan(0);
      else expect(f.value, path).toBeGreaterThanOrEqual(0);
    }
  });

  it("every sourced value names a URL", () => {
    for (const [path, f] of allSourced()) if (f.value !== null) expect(f.url, path).toMatch(/^https:\/\//);
  });

  it("rotation credits point at real catalog crops", () => {
    const ids = new Set(CROP_CATALOG.crops.map((c) => c.id));
    for (const r of NUTRIENT_CATALOG.rotationCredits) {
      expect(ids.has(r.fromCropId)).toBe(true);
      expect(ids.has(r.toCropId)).toBe(true);
    }
  });

  it("alternatives carry their own source", () => {
    for (const c of NUTRIENT_CATALOG.crops)
      for (const a of c.removalAlternatives) {
        expect(a.source.length).toBeGreaterThan(0);
        expect(a.page.length).toBeGreaterThan(0);
        expect(a.url).toMatch(/^https:\/\//);
      }
  });

  it("does not assume nitrogen fixation: none of the current crops has a single sourced figure", () => {
    for (const c of NUTRIENT_CATALOG.crops) expect(fixationKnown(c.cropId), c.cropId).toBe(false);
  });

  it("sugar beet potassium is unknown, not zero", () => {
    expect(getNutrients("sugar-beet")?.removalPerUnit.k2o.value).toBeNull();
  });
});

describe("removalAtYield reproduces the rows printed in the Arkansas table (FSA2176 Table 1, rounded to whole lb)", () => {
  const rnd = (v: number | null) => (v === null ? null : Math.round(v));
  const cases: [string, number, [number, number, number]][] = [
    ["maize-grain", 150, [101, 53, 38]],
    ["maize-grain", 250, [168, 88, 63]],
    ["cotton", 2, [64, 28, 38]],
    ["cotton", 3, [96, 42, 57]],
    ["rice", 200, [114, 60, 32]],
    ["rice", 250, [143, 75, 40]],
    ["winter-wheat", 60, [72, 29, 17]],
    ["winter-wheat", 90, [108, 43, 26]],
  ];
  for (const [id, y, [n, p, k]] of cases)
    it(`${id} at ${y}`, () => {
      const r = removalAtYield(id, y);
      if ("error" in r) throw new Error(r.error);
      expect([rnd(r.lbPerAcre.n), rnd(r.lbPerAcre.p2o5), rnd(r.lbPerAcre.k2o)]).toEqual([n, p, k]);
    });
});

describe("removalAtYield guards", () => {
  it("rejects unknown crops and bad yields", () => {
    expect(removalAtYield("nope", 10)).toHaveProperty("error");
    expect(removalAtYield("rice", -1)).toHaveProperty("error");
    expect(removalAtYield("rice", Number.NaN)).toHaveProperty("error");
  });
  it("reports an unknown nutrient instead of a number", () => {
    const r = removalAtYield("sugar-beet", 30);
    if ("error" in r) throw new Error(r.error);
    expect(r.lbPerAcre.k2o).toBeNull();
    expect(r.unknown).toEqual(["k2o"]);
    expect(r.lbPerAcre.n).toBeCloseTo(105, 6);
  });
  it("stores no rotation credit: the one candidate row was ambiguous and neither crop runs in the replay", () => {
    expect(NUTRIENT_CATALOG.rotationCredits).toEqual([]);
    expect(creditsBetween("sugar-beet", "dry-bean")).toEqual([]);
  });
  it("creditsBetween matches a pair in one direction only, and skips unknown values", () => {
    const src = { source: "t", page: "p", url: "https://example.org" };
    const list = [
      { fromCropId: "a", toCropId: "b", lbNPerAcre: { ...src, value: 40 } },
      { fromCropId: "a", toCropId: "c", lbNPerAcre: { ...src, value: null, note: "unknown" } },
    ];
    expect(creditsBetween("a", "b", list)).toHaveLength(1);
    expect(creditsBetween("b", "a", list)).toHaveLength(0);
    expect(creditsBetween("a", "c", list)).toHaveLength(0);
  });
});
