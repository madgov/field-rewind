import { describe, expect, it } from "vitest";
import { CROP_CATALOG, excludedCrops, getCrop, heatThresholdKnown, isCropUsable, usableCrops } from "./catalog";
import type { Crop, Sourced } from "./types";

function sourcedFields(c: Crop): [string, Sourced<unknown>][] {
  return [
    ["kc.ini", c.kc.ini], ["kc.mid", c.kc.mid], ["kc.end", c.kc.end],
    ["stageDays.ini", c.stageDays.ini], ["stageDays.dev", c.stageDays.dev],
    ["stageDays.mid", c.stageDays.mid], ["stageDays.late", c.stageDays.late],
    ["planting.windowStart", c.planting.windowStart], ["planting.windowEnd", c.planting.windowEnd],
    ["planting.defaultDate", c.planting.defaultDate], ["heatThresholdC", c.heatThresholdC],
  ];
}

const MD = /^(\d{2})-(\d{2})$/;
const DAYS_IN_MONTH = [31, 29, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31]; // 29 for Feb, leap-safe

function validMD(s: string): boolean {
  const m = MD.exec(s);
  if (!m) return false;
  const mo = Number(m[1]);
  const d = Number(m[2]);
  return mo >= 1 && mo <= 12 && d >= 1 && d <= DAYS_IN_MONTH[mo - 1];
}
/** Day of year in a non-leap year (Feb 29 treated as Feb 28 + 1 is irrelevant for ordering here). */
function doy(s: string): number {
  const [mo, d] = s.split("-").map(Number);
  const cum = [0, 31, 59, 90, 120, 151, 181, 212, 243, 273, 304, 334];
  return cum[mo - 1] + d;
}
function inWindow(date: string, start: string, end: string): boolean {
  const x = doy(date), a = doy(start), b = doy(end);
  return a <= b ? x >= a && x <= b : x >= a || x <= b;
}

describe("crop catalog schema", () => {
  it("has crops with unique ids", () => {
    const ids = CROP_CATALOG.crops.map((c) => c.id);
    expect(ids.length).toBeGreaterThan(0);
    expect(new Set(ids).size).toBe(ids.length);
    expect(getCrop(ids[0])?.id).toBe(ids[0]);
    expect(getCrop("no-such-crop")).toBeUndefined();
  });

  it("every Sourced has a non-empty source and page", () => {
    for (const c of CROP_CATALOG.crops)
      for (const [path, f] of sourcedFields(c)) {
        expect(f.source.trim().length, `${c.id}.${path}.source`).toBeGreaterThan(0);
        expect(f.page.trim().length, `${c.id}.${path}.page`).toBeGreaterThan(0);
        if (f.value === null) expect(f.note?.trim().length ?? 0, `${c.id}.${path} null needs a note`).toBeGreaterThan(0);
      }
  });

  it("Kc values are within 0-1.5 and stage lengths are positive integers", () => {
    for (const c of CROP_CATALOG.crops) {
      for (const f of [c.kc.ini, c.kc.mid, c.kc.end])
        if (f.value !== null) {
          expect(f.value).toBeGreaterThanOrEqual(0);
          expect(f.value).toBeLessThanOrEqual(1.5);
        }
      for (const f of Object.values(c.stageDays))
        if (f.value !== null) {
          expect(Number.isInteger(f.value)).toBe(true);
          expect(f.value).toBeGreaterThan(0);
        }
      if (c.heatThresholdC.value !== null) {
        expect(c.heatThresholdC.value).toBeGreaterThan(20);
        expect(c.heatThresholdC.value).toBeLessThan(50);
      }
    }
  });

  it("planting dates are valid MM-DD and the default is inside the window", () => {
    for (const c of CROP_CATALOG.crops) {
      const { windowStart, windowEnd, defaultDate } = c.planting;
      for (const f of [windowStart, windowEnd, defaultDate]) if (f.value !== null) expect(validMD(f.value), `${c.id} ${f.value}`).toBe(true);
      if (windowStart.value && windowEnd.value && defaultDate.value)
        expect(inWindow(defaultDate.value, windowStart.value, windowEnd.value), `${c.id} default in window`).toBe(true);
    }
  });

  it("spansNewYear matches default planting date + total stage days", () => {
    for (const c of CROP_CATALOG.crops) {
      const d = c.planting.defaultDate.value;
      const days = Object.values(c.stageDays).map((f) => f.value);
      if (d === null || days.some((v) => v === null)) continue;
      const total = (days as number[]).reduce((a, b) => a + b, 0);
      expect(doy(d) + total > 365, `${c.id}`).toBe(c.spansNewYear);
    }
  });

  it("at least one usable crop spans the new year", () => {
    expect(usableCrops().some((c) => c.spansNewYear)).toBe(true);
  });

  it("usable + excluded partition the catalog", () => {
    expect(usableCrops().length + excludedCrops().length).toBe(CROP_CATALOG.crops.length);
    for (const { missing } of excludedCrops()) expect(missing.length).toBeGreaterThan(0);
    for (const c of usableCrops()) expect(isCropUsable(c)).toEqual({ usable: true });
  });
});

describe("isCropUsable", () => {
  it("lists missing field paths for a fixture with nulls", () => {
    const base = getCrop("winter-wheat")!;
    const fixture: Crop = structuredClone(base);
    fixture.kc.mid.value = null;
    fixture.stageDays.late.value = null;
    fixture.planting.windowEnd.value = null;
    fixture.heatThresholdC.value = null;
    expect(isCropUsable(fixture)).toEqual({
      usable: false,
      missing: ["kc.mid", "stageDays.late", "planting.windowEnd"],
    });
  });

  it("an unknown heat threshold alone does not exclude a crop", () => {
    const fixture: Crop = structuredClone(getCrop("winter-wheat")!);
    fixture.heatThresholdC.value = null;
    expect(isCropUsable(fixture)).toEqual({ usable: true });
    expect(heatThresholdKnown(fixture)).toBe(false);
    expect(heatThresholdKnown(getCrop("winter-wheat")!)).toBe(true);
  });

  it("sunflower and sugar beet are usable (all water parameters sourced)", () => {
    const ids = usableCrops().map((c) => c.id);
    expect(ids).toContain("sunflower");
    expect(ids).toContain("sugar-beet");
    for (const { missing } of excludedCrops()) expect(missing).not.toContain("heatThresholdC");
  });
});
