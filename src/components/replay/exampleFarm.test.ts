import { describe, expect, it } from "vitest";
import { usableCrops } from "@/lib/crops/catalog";
import { EXAMPLE_SUPPLY_MM } from "@/lib/replay/examples";
import { exampleFarmHref } from "./exampleFarm";
import { parseState, rotationsAreExample } from "./urlState";

describe("exampleFarmHref", () => {
  it("points at the Brentwood replay with the example flag and the constructed example inputs", () => {
    const href = exampleFarmHref();
    expect(href.startsWith("/replay?lat=37.9300&lon=-121.6600&example=1&")).toBe(true);
    const sp = new URLSearchParams(href.split("?")[1]);
    const parsed = parseState(sp, { validCropIds: new Set(usableCrops().map((c) => c.id)), supplyMaxMm: 3000 });
    expect(parsed.notes).toEqual([]);
    expect(parsed.state.supplyMm).toBe(EXAMPLE_SUPPLY_MM);
    expect(rotationsAreExample(parsed.state.rotations)).toBe(true);
  });
});
