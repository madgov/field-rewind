import { beforeAll, describe, expect, it } from "vitest";
import { CROP_CATALOG, usableCrops } from "../crops/catalog";
import { loadSavedDemoPin } from "../power";
import type { PowerResult } from "../types";
import { replayFromSeasonTable, type SeasonTable } from "./assemble";
import { EXAMPLE_ROTATIONS, EXAMPLE_SUPPLY_MM } from "./examples";
import { buildSeasonTable, replay } from "./replay";

let power: PowerResult;
let table: SeasonTable;
beforeAll(async () => {
  power = await loadSavedDemoPin("brentwood");
  const t = buildSeasonTable(power, CROP_CATALOG.crops);
  if (t.status !== "ok") throw new Error(t.reason);
  // Same trip the real data takes to the browser: plain JSON.
  table = JSON.parse(JSON.stringify(t.table));
});

const rotations = EXAMPLE_ROTATIONS.map(({ name, sequence }) => ({ name, sequence }));

describe("replayFromSeasonTable equals replay() on the saved Brentwood record", () => {
  for (const supplyMm of [0, EXAMPLE_SUPPLY_MM * 0.8, EXAMPLE_SUPPLY_MM, EXAMPLE_SUPPLY_MM * 1.2, 5000]) {
    it(`at ${supplyMm} mm`, () => {
      const server = replay(power, CROP_CATALOG.crops, { rotations, supplyMm });
      const client = replayFromSeasonTable(table, usableCrops(), { rotations, supplyMm });
      expect(server.status).toBe("ok");
      expect(client).toEqual(server);
    });
  }

  it("also matches for a one-crop rotation and a custom order", () => {
    const input = {
      supplyMm: 650,
      rotations: [
        { name: "Cotton only", sequence: ["cotton"] },
        { name: "Rice then rice then wheat", sequence: ["rice", "rice", "winter-wheat"] },
      ],
    };
    expect(replayFromSeasonTable(table, usableCrops(), input)).toEqual(replay(power, CROP_CATALOG.crops, input));
  });

  it("gives the same invalid-input answer as replay()", () => {
    const input = { supplyMm: -5, rotations: [{ name: "x", sequence: ["nope"] }] };
    expect(replayFromSeasonTable(table, usableCrops(), input)).toEqual(replay(power, CROP_CATALOG.crops, input));
  });

  it("the table holds only usable crops, 40 seasons each, and nothing from the 15k-day record", () => {
    expect(Object.keys(table.needs).sort()).toEqual(usableCrops().map((c) => c.id).sort());
    for (const list of Object.values(table.needs)) expect(list).toHaveLength(40);
    // Size scales with the number of usable crops (40 seasons each); the daily record itself must not ride along.
    const size = JSON.stringify(table).length;
    expect(size).toBeLessThan(40_000 * usableCrops().length);
    expect(size).toBeLessThan(JSON.stringify(power.days).length / 2);
  });

  it("reports a missing table entry instead of guessing", () => {
    const broken: SeasonTable = { ...table, needs: { ...table.needs, cotton: table.needs.cotton.slice(0, 10) } };
    const r = replayFromSeasonTable(broken, usableCrops(), { supplyMm: 700, rotations: [{ name: "A", sequence: ["cotton"] }, { name: "B", sequence: ["rice"] }] });
    expect(r.status).toBe("unavailable");
  });
});
