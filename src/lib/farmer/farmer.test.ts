import { describe, expect, it } from "vitest";
import type { RotationResult } from "../replay/types";
import { analyzeRotation } from "../soilhealth";
import { HECTARES_PER_ACRE, budgetToSupplyMm, waterCostForNeed, yieldPerAcre } from "./budget";
import { viewPriorities } from "./priorities";

describe("budgetToSupplyMm", () => {
  it("US units: 10,000 at 200 per acre-foot over 100 acres is 0.5 ft = 152.4 mm", () => {
    const r = budgetToSupplyMm({ units: "us", budget: 10000, waterPrice: 200, area: 100, currencyLabel: "$" });
    if (r.status !== "ok") throw new Error(r.problems.join());
    expect(r.supplyMm).toBeCloseTo(152.4, 9);
    expect(r.steps).toHaveLength(3);
    expect(r.steps[0]).toContain("50 acre-feet");
  });

  it("metric: 20,000 at 0.5 per m3 over 10 ha is 0.4 m = 400 mm", () => {
    const r = budgetToSupplyMm({ units: "metric", budget: 20000, waterPrice: 0.5, area: 10 });
    if (r.status !== "ok") throw new Error(r.problems.join());
    expect(r.supplyMm).toBeCloseTo(400, 9);
  });

  it("rejects missing, zero, negative and non-finite inputs and invents no default", () => {
    for (const bad of [
      { units: "us", budget: 0, waterPrice: 200, area: 10 },
      { units: "us", budget: 100, waterPrice: -1, area: 10 },
      { units: "us", budget: 100, waterPrice: 200, area: Number.NaN },
      { units: "metric", budget: Number.POSITIVE_INFINITY, waterPrice: 1, area: 1 },
      { units: "other", budget: 1, waterPrice: 1, area: 1 },
    ] as never[]) {
      const r = budgetToSupplyMm(bad);
      expect(r.status).toBe("invalid");
    }
  });

  it("reports every problem at once", () => {
    const r = budgetToSupplyMm({ units: "us", budget: 0, waterPrice: 0, area: 0 });
    expect(r.status === "invalid" && r.problems.length).toBe(3);
  });
});

describe("waterCostForNeed", () => {
  it("304.8 mm at 200 per acre-foot is 200 per acre", () => {
    expect(waterCostForNeed(304.8, { units: "us", waterPrice: 200 })).toBeCloseTo(200, 9);
  });
  it("100 mm at 0.5 per m3 is 500 per hectare", () => {
    expect(waterCostForNeed(100, { units: "metric", waterPrice: 0.5 })).toBeCloseTo(500, 9);
  });
  it("returns null for bad input", () => {
    expect(waterCostForNeed(-1, { units: "us", waterPrice: 200 })).toBeNull();
    expect(waterCostForNeed(10, { units: "us", waterPrice: 0 })).toBeNull();
  });
});

function rot(name: string, short: number, evaluable: number, median: number | null): RotationResult {
  return { name, totals: { short, ok: evaluable - short, insufficient: 0, evaluable, needMinMm: null, needMedianMm: median, needMaxMm: null } } as unknown as RotationResult;
}

describe("viewPriorities", () => {
  const rotations = [rot("A", 10, 40, 500), rot("B", 4, 40, 300)];
  const y = { "winter-wheat": 60, "maize-grain": 150, cotton: 2 };
  const nutrients = [
    analyzeRotation({ name: "A", sequence: ["winter-wheat", "maize-grain"] }, y),
    analyzeRotation({ name: "B", sequence: ["cotton"] }, y),
  ];

  it("keeps the farmer's order and names the best rotation per priority", () => {
    const v = viewPriorities({ order: ["use-less-water", "dependable-water"], rotations, nutrients });
    expect(v.map((x) => [x.rank, x.priority])).toEqual([[1, "use-less-water"], [2, "dependable-water"]]);
    expect(v[0].best).toEqual(["B"]);
    expect(v[1].best).toEqual(["B"]);
    expect(v[1].rows[0]).toMatchObject({ rotation: "A", value: 10, note: "of 40 seasons judged" });
  });

  it("ignores duplicate and unknown priorities", () => {
    const v = viewPriorities({ order: ["use-less-water", "use-less-water", "nope" as never], rotations, nutrients });
    expect(v).toHaveLength(1);
  });

  it("nitrogen priority uses per-season removal and picks the lower", () => {
    const v = viewPriorities({ order: ["protect-soil-nutrients"], rotations, nutrients })[0];
    expect(v.rows.map((r) => r.value)).toEqual([86.25, 64]);
    expect(v.best).toEqual(["B"]);
  });

  it("is not comparable, and names no best, when a yield is missing", () => {
    const n2 = [analyzeRotation({ name: "A", sequence: ["winter-wheat", "maize-grain"] }, { "winter-wheat": 60 }), nutrients[1]];
    const v = viewPriorities({ order: ["protect-soil-nutrients"], rotations, nutrients: n2 })[0];
    expect(v.comparable).toBe(false);
    expect(v.best).toEqual([]);
    expect(v.rows[0].value).toBeNull();
  });

  it("water-cost priority needs a price and never assumes one", () => {
    const none = viewPriorities({ order: ["low-water-cost"], rotations, nutrients })[0];
    expect(none.comparable).toBe(false);
    expect(none.rows[0].note).toBe("No water price entered.");
    const some = viewPriorities({ order: ["low-water-cost"], rotations, nutrients, price: { units: "us", waterPrice: 304.8 } })[0];
    expect(some.rows.map((r) => r.value)).toEqual([500, 300]);
    expect(some.best).toEqual(["B"]);
  });

  it("reports ties instead of picking one", () => {
    const tied = [rot("A", 4, 40, 300), rot("B", 4, 40, 300)];
    const v = viewPriorities({ order: ["dependable-water"], rotations: tied, nutrients })[0];
    expect(v.best).toEqual(["A", "B"]);
  });

  it("crop variety counts distinct crops and notes back-to-back repeats", () => {
    const n3 = [analyzeRotation({ name: "A", sequence: ["winter-wheat", "winter-wheat", "maize-grain"] }, y), nutrients[1]];
    const v = viewPriorities({ order: ["grow-more-crops"], rotations, nutrients: n3 })[0];
    expect(v.rows[0]).toMatchObject({ value: 2, note: "Same crop in two neighbouring seasons." });
    expect(v.best).toEqual(["A"]);
  });
});

describe("yieldPerAcre", () => {
  it("leaves US yields alone and converts per-hectare yields to per-acre", () => {
    expect(yieldPerAcre(150, "us")).toBe(150);
    expect(yieldPerAcre(100, "metric")).toBeCloseTo(100 * HECTARES_PER_ACRE, 9);
    expect(yieldPerAcre(100, "metric")).toBeCloseTo(40.468564224, 9);
  });
  it("rejects negative and non-finite values", () => {
    expect(yieldPerAcre(-1, "us")).toBeNull();
    expect(yieldPerAcre(Number.NaN, "metric")).toBeNull();
  });
});
