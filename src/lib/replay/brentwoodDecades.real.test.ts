import { describe, expect, it } from "vitest";
import { CROP_CATALOG } from "../crops/catalog";
import { loadSavedDemoPin } from "../power";
import { EXAMPLE_ROTATIONS, EXAMPLE_SUPPLY_MM } from "./examples";
import { replay } from "./replay";
import type { ReplayOk } from "./types";

/** Regression guard: years short per decade for the saved Brentwood record at the 700 mm example supply. */
describe("saved Brentwood example at 700 mm", () => {
  it("years short per decade are unchanged after the grey-season rule for missing rain", async () => {
    const power = await loadSavedDemoPin("brentwood");
    const r = replay(power, CROP_CATALOG.crops, { supplyMm: EXAMPLE_SUPPLY_MM, rotations: EXAMPLE_ROTATIONS.map(({ name, sequence }) => ({ name, sequence })) }) as ReplayOk;
    expect(r.status).toBe("ok");
    const byName = Object.fromEntries(r.rotations.map((x) => [x.name, x.decades.map((d) => d.short)]));
    expect(byName).toEqual({
      "Wheat, then maize": [2, 2, 2, 1],
      "Maize, then cotton": [9, 8, 8, 8],
      "Rice, wheat, maize": [6, 4, 4, 6],
    });
    for (const rot of r.rotations) expect(rot.totals.insufficient).toBe(0);
  });
});
