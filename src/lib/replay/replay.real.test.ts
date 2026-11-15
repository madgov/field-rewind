import { beforeAll, describe, expect, it } from "vitest";
import { CROP_CATALOG, isCropUsable } from "../crops/catalog";
import { loadSavedDemoPin } from "../power";
import type { PowerResult } from "../types";
import { EXAMPLE_LABEL, EXAMPLE_ROTATIONS, EXAMPLE_SUPPLY_MM } from "./examples";
import { replay } from "./replay";
import type { ReplayOk } from "./types";

let power: PowerResult;
beforeAll(async () => {
  power = await loadSavedDemoPin("brentwood");
});

const input = (supplyMm: number) => ({ supplyMm, rotations: EXAMPLE_ROTATIONS.map(({ name, sequence }) => ({ name, sequence })) });

describe("examples", () => {
  it("are built from usable crops in the real catalog and carry the constructed-example label", () => {
    expect(EXAMPLE_ROTATIONS.length).toBeGreaterThanOrEqual(2);
    expect(EXAMPLE_ROTATIONS.length).toBeLessThanOrEqual(3);
    for (const r of EXAMPLE_ROTATIONS) {
      expect(r.label).toBe(EXAMPLE_LABEL);
      for (const id of r.sequence) {
        const c = CROP_CATALOG.crops.find((x) => x.id === id);
        expect(c, id).toBeDefined();
        expect(isCropUsable(c!).usable).toBe(true);
      }
    }
  });
});

describe("real Brentwood replay", () => {
  it("gives 40 evaluable seasons per rotation with physically loose numbers and no NaN", () => {
    const r = replay(power, CROP_CATALOG.crops, input(EXAMPLE_SUPPLY_MM));
    expect(r.status).toBe("ok");
    const ok = r as ReplayOk;
    for (const rot of ok.rotations) {
      expect(rot.seasons).toHaveLength(40);
      for (const s of rot.seasons) {
        expect(s.status).toBe("evaluated");
        for (const v of [s.etcMm, s.effectiveRainMm, s.needMm, s.heatDays, s.marginMm]) {
          expect(Number.isFinite(v as number)).toBe(true);
        }
        expect(s.needMm!).toBeGreaterThanOrEqual(0);
        expect(s.etcMm!).toBeGreaterThan(100);
        expect(s.etcMm!).toBeLessThan(1500);
        expect(s.effectiveRainMm!).toBeGreaterThanOrEqual(0);
        expect(s.heatDays!).toBeLessThanOrEqual(s.lengthDays);
      }
      expect(rot.totals.evaluable).toBe(40);
      expect(rot.headline).not.toMatch(/NaN|undefined/);
    }
  });

  it("example supply gives a mix of red and green overall, and the supply moves the result", () => {
    const at = (s: number) => (replay(power, CROP_CATALOG.crops, input(s)) as ReplayOk).rotations.flatMap((r) => r.seasons);
    const mid = at(EXAMPLE_SUPPLY_MM);
    expect(mid.some((s) => s.outcome === "short")).toBe(true);
    expect(mid.some((s) => s.outcome === "ok")).toBe(true);
    const shortCount = (s: number) => at(s).filter((x) => x.outcome === "short").length;
    expect(shortCount(EXAMPLE_SUPPLY_MM * 0.8)).toBeGreaterThan(shortCount(EXAMPLE_SUPPLY_MM));
    expect(shortCount(EXAMPLE_SUPPLY_MM * 1.2)).toBeLessThan(shortCount(EXAMPLE_SUPPLY_MM));
  });

  it("starts the winter wheat 1986 season in 1985", () => {
    const r = replay(power, CROP_CATALOG.crops, input(EXAMPLE_SUPPLY_MM)) as ReplayOk;
    expect(r.rotations[0].seasons[0].cropId).toBe("winter-wheat");
    expect(r.rotations[0].seasons[0].plantingDate.startsWith("1985")).toBe(true);
  });
});
