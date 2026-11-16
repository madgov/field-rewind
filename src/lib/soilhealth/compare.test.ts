import { describe, expect, it } from "vitest";
import { analyzeRotation, compareRotations } from "./compare";

describe("analyzeRotation", () => {
  it("sums removal over one cycle and averages per season", () => {
    const r = analyzeRotation({ name: "wheat-maize", sequence: ["winter-wheat", "maize-grain"] }, { "winter-wheat": 60, "maize-grain": 150 });
    expect(r.cycle.n.totalLbPerAcre).toBeCloseTo(72 + 100.5, 6);
    expect(r.cycle.n.perSeasonLbPerAcre).toBeCloseTo((72 + 100.5) / 2, 6);
    expect(r.cycle.k2o.totalLbPerAcre).not.toBeNull();
    expect(r.flags).toMatchObject({ sameCropBackToBack: false, singleCrop: false, distinctCrops: 2, seasonsInCycle: 2 });
    expect(r.problems).toEqual([]);
  });

  it("a crop repeated in a cycle counts each season", () => {
    const r = analyzeRotation({ name: "w-w-m", sequence: ["winter-wheat", "winter-wheat", "maize-grain"] }, { "winter-wheat": 60, "maize-grain": 150 });
    expect(r.cycle.n.totalLbPerAcre).toBeCloseTo(72 + 72 + 100.5, 6);
    expect(r.flags.sameCropBackToBack).toBe(true);
  });

  it("flags the wrap from the last season to the first", () => {
    const r = analyzeRotation({ name: "m-w-m", sequence: ["maize-grain", "winter-wheat", "maize-grain"] }, { "winter-wheat": 60, "maize-grain": 150 });
    expect(r.flags.sameCropBackToBack).toBe(true);
  });

  it("monoculture is flagged as a single crop", () => {
    const r = analyzeRotation({ name: "cotton", sequence: ["cotton"] }, { cotton: 2 });
    expect(r.flags.singleCrop).toBe(true);
    expect(r.flags.sameCropBackToBack).toBe(false);
  });

  it("leaves a nutrient unknown when no yield was entered, and says why", () => {
    const r = analyzeRotation({ name: "a", sequence: ["winter-wheat", "maize-grain"] }, { "winter-wheat": 60 });
    expect(r.cycle.n.totalLbPerAcre).toBeNull();
    expect(r.cycle.n.unknownFor).toEqual(["maize-grain"]);
    expect(r.perCrop.find((c) => c.cropId === "maize-grain")?.missing.n).toBe("no yield entered");
  });

  it("leaves a nutrient unknown when the source prints no figure", () => {
    const r = analyzeRotation({ name: "b", sequence: ["sugar-beet"] }, { "sugar-beet": 30 });
    expect(r.cycle.n.totalLbPerAcre).toBeCloseTo(105, 6);
    expect(r.cycle.k2o.totalLbPerAcre).toBeNull();
    expect(r.perCrop[0].missing.k2o).toBe("no sourced removal figure");
  });

  it("reports replenishment as unknown, never zero, and lists no credit when none is stored", () => {
    const r = analyzeRotation({ name: "c", sequence: ["dry-bean", "sugar-beet"] }, { "dry-bean": 40, "sugar-beet": 30 });
    expect(r.replenishment.fixation.status).toBe("none-known");
    expect(r.replenishment.fixation.unknownFor.sort()).toEqual(["dry-bean", "sugar-beet"]);
    expect(r.replenishment.credits).toEqual([]);
  });

  it("reports unknown crops as a problem and does not invent numbers", () => {
    const r = analyzeRotation({ name: "d", sequence: ["alfalfa"] }, { alfalfa: 5 });
    expect(r.problems.join(" ")).toContain("alfalfa");
    expect(r.cycle.n.totalLbPerAcre).toBeNull();
  });

  it("carries the replay water figure through unchanged", () => {
    const w = { short: 12, evaluable: 40, supplyMm: 700 };
    expect(analyzeRotation({ name: "e", sequence: ["cotton"] }, { cotton: 2 }, w).water).toEqual(w);
  });
});

describe("compareRotations", () => {
  it("orders rotations by per-season removal when all are known", () => {
    const y = { "winter-wheat": 60, "maize-grain": 150, cotton: 2 };
    const c = compareRotations(
      [
        { name: "cotton", sequence: ["cotton"] },
        { name: "wheat-maize", sequence: ["winter-wheat", "maize-grain"] },
      ],
      y,
    );
    expect(c.orderedByRemoval.n.comparable).toBe(true);
    // cotton 64 per season, wheat-maize 86.25 per season
    expect(c.orderedByRemoval.n.names).toEqual(["cotton", "wheat-maize"]);
  });

  it("refuses to order when any rotation has an unknown figure", () => {
    const c = compareRotations(
      [
        { name: "beet", sequence: ["sugar-beet"] },
        { name: "wheat", sequence: ["winter-wheat"] },
      ],
      { "sugar-beet": 30, "winter-wheat": 60 },
    );
    expect(c.orderedByRemoval.k2o).toEqual({ comparable: false, names: [] });
    expect(c.orderedByRemoval.n.comparable).toBe(true);
  });

  it("states what is not counted", () => {
    const c = compareRotations([{ name: "x", sequence: ["cotton"] }], { cotton: 1 });
    expect(c.notes.join(" ")).toMatch(/not counted/);
    expect(c.label).toMatch(/not a soil test/);
  });
});
