import { beforeAll, describe, expect, it } from "vitest";
import { usableCrops } from "../crops/catalog";
import { loadSavedDemoPin } from "../power";
import { buildSeasonTable } from "../replay/replay";
import { judgeSeason } from "../replay/evaluate";
import { scenarioPower } from "../scenario/transform";
import type { PowerResult } from "../types";
import { ALTERNATIVES_NOTE, PLANTING_NOTE, RAIN_COVERED_MM, SEASON_GROUPS, WARMER, plantingMonthIndex, rankAlternatives, seasonGroupOf, type AlternativesOk } from "./index";

const SUPPLY = 700;
let power: PowerResult;
let out: AlternativesOk;
beforeAll(async () => {
  power = await loadSavedDemoPin("brentwood");
  const crops = usableCrops();
  const r = rankAlternatives(power, SUPPLY, crops, [crops[0].id]);
  expect(r.status).toBe("ok");
  out = r as AlternativesOk;
  // Printed so the real ranking can be reported.
  for (const g of out.groups) {
    console.log(`${g.label}: ${g.headline}`);
    for (const row of g.rows.slice(0, 3))
      console.log(`  ${row.name} (${row.plantingMonth}, FAO row: ${row.faoRegion}): last decade short real ${row.shortLastDecade.short}, +2C ${row.warmerLastDecade?.short}, -20% rain ${row.drierLastDecade?.short}, median need ${row.medianNeedMm} mm`);
  }
}, 120_000);

describe("rankAlternatives on the saved Brentwood record", () => {
  it("has a row per usable crop, ordered by last-decade shortfalls then +2 C then median need", () => {
    expect(out.rows.length).toBe(usableCrops().length - out.skipped.length);
    for (const g of out.groups) {
    const ranked = g.rows.filter((r) => r.ranked);
    for (let i = 1; i < ranked.length; i++) {
      const a = ranked[i - 1];
      const b = ranked[i];
      const key = (r: typeof a) => [r.shortLastDecade.short, r.warmerLastDecade!.short, r.medianNeedMm ?? Infinity];
      const [a1, a2, a3] = key(a);
      const [b1, b2, b3] = key(b);
      expect(a1 < b1 || (a1 === b1 && (a2 < b2 || (a2 === b2 && a3 <= b3)))).toBe(true);
    }
    }
    expect(out.rows.filter((r) => r.current)).toHaveLength(1);
    expect(out.note).toBe(ALTERNATIVES_NOTE);
    expect(out.dataLabel).toMatch(/about 50 km grid/);
    expect(out.dataLabel).toMatch(/^Saved response from /);
  });

  it("gives integer counts within range", () => {
    for (const r of out.rows) {
      for (const c of [r.shortAll, r.shortFirstDecade, r.shortLastDecade, r.warmerLastDecade, r.drierLastDecade]) {
        if (!c) continue;
        expect(Number.isInteger(c.short) && Number.isInteger(c.evaluated)).toBe(true);
        expect(c.short).toBeGreaterThanOrEqual(0);
        expect(c.short).toBeLessThanOrEqual(c.evaluated);
      }
      expect(r.shortAll.evaluated).toBeLessThanOrEqual(40);
      expect(r.shortLastDecade.evaluated).toBeLessThanOrEqual(10);
      expect(r.shortFirstDecade.evaluated).toBeLessThanOrEqual(10);
      if (r.medianNeedMm !== null) expect(Number.isInteger(r.medianNeedMm)).toBe(true);
      if (!r.heatThresholdKnown) expect(r.medianHeatDays).toBeNull();
    }
  });

  it("takes the +2 C counts from the scenario engine", () => {
    const t = buildSeasonTable(scenarioPower(power, WARMER), usableCrops());
    expect(t.status).toBe("ok");
    if (t.status !== "ok") return;
    for (const r of out.rows.slice(0, 5)) {
      const short = t.table.needs[r.id].filter((n) => n.year >= 2016 && judgeSeason(n, SUPPLY).outcome === "short").length;
      expect(r.warmerLastDecade!.short).toBe(short);
    }
  });

  it("words each line and the headline from the numbers", () => {
    for (const r of out.rows.filter((x) => x.ranked)) {
      expect(r.line).toContain(`Short of water in ${r.shortLastDecade.short} of the last ${r.shortLastDecade.evaluated} seasons`);
      expect(r.line).toContain(`${r.warmerLastDecade!.short} of ${r.warmerLastDecade!.evaluated} if it were 2 °C warmer`);
      expect(r.line).toContain(`${r.drierLastDecade!.short} of ${r.drierLastDecade!.evaluated} with 20 percent less rain`);
    }
    const g = out.groups[0];
    const top = g.rows[0];
    const cur = Math.min(...g.rows.filter((r) => r.current && r.ranked).map((r) => r.shortLastDecade.short));
    if (cur <= top.shortLastDecade.short) expect(g.headline).toMatch(/none fits your water better/);
    else expect(g.headline).toContain(`${top.name} was short in ${top.shortLastDecade.short} of`);
    expect(out.headline).not.toMatch(/NaN|undefined|Infinity/);
    for (const r of out.rows) {
      expect(r.line).not.toMatch(/needs no water/i);
      if (r.ranked && r.medianNeedMm !== null && r.medianNeedMm < RAIN_COVERED_MM)
        expect(r.line).toContain(`In most seasons rain covered this crop's modelled water need when planted in ${r.plantingMonth}`);
    }
  });

  it("groups crops by growing season from the default planting month, current crops' group first", () => {
    expect(seasonGroupOf(8)).toBe("cool"); // September
    expect(seasonGroupOf(1)).toBe("cool"); // February
    expect(seasonGroupOf(2)).toBe("warm"); // March
    expect(seasonGroupOf(7)).toBe("warm"); // August
    expect(out.plantingNote).toBe(PLANTING_NOTE);
    expect(out.rows).toEqual(out.groups.flatMap((g) => g.rows));
    for (const g of out.groups) {
      expect(g.label).toBe(SEASON_GROUPS[g.id]);
      for (const r of g.rows) {
        const crop = usableCrops().find((c) => c.id === r.id)!;
        expect(r.group).toBe(seasonGroupOf(plantingMonthIndex(crop)!));
        expect(g.id).toBe(r.group);
      }
    }
    const currentGroup = out.rows.find((r) => r.current)!.group;
    expect(out.groups[0].id).toBe(currentGroup);
    // A warm-season current crop puts the warm group first.
    const warm = usableCrops().find((c) => seasonGroupOf(plantingMonthIndex(c)!) === "warm")!;
    const w = rankAlternatives(power, SUPPLY, usableCrops(), [warm.id]) as AlternativesOk;
    expect(w.groups[0].id).toBe("warm");
  });
});
