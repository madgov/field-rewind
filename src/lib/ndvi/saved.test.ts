import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { DEMO_PINS } from "../demoPins";
import { computeNdviIndicators } from "./indicators";
import { loadSavedNdvi, loadSavedNdviGrid } from "./saved";
import { loadSavedNdviModis } from "./modisSaved";
import { ndviOriginLine } from "./sources";
import { ndviWording } from "./wording";

/** Tests on the REAL saved files in data/ndvi (fetched from Landsat by scripts/fetch-ndvi.ts). */
describe.each(DEMO_PINS.map((p) => p.id))("saved NDVI for %s", (pinId) => {
  it("has plausible observations: counts, range, order, satellites, years", async () => {
    const r = await loadSavedNdvi(pinId);
    expect(["ok", "partial"]).toContain(r.status);
    expect(r.origin).toBe("saved");
    expect(r.observations.length).toBeGreaterThan(300);
    expect(r.counts.clear).toBe(r.observations.length);
    expect(r.counts.scenesRead).toBeGreaterThanOrEqual(r.counts.clear + r.counts.masked); // the rest are same-date duplicate frames
    let prev = "";
    const keys = new Set<string>();
    for (const o of r.observations) {
      expect(Number.isFinite(o.ndvi)).toBe(true);
      expect(o.ndvi).toBeGreaterThanOrEqual(-1);
      expect(o.ndvi).toBeLessThanOrEqual(1);
      expect(o.date).toMatch(/^\d{4}-\d{2}-\d{2}$/);
      expect(o.date >= prev).toBe(true);
      prev = o.date;
      expect(["Landsat 5", "Landsat 7", "Landsat 8", "Landsat 9"]).toContain(o.satellite);
      const k = `${o.date}|${o.satellite}`;
      expect(keys.has(k)).toBe(false);
      keys.add(k);
    }
    expect(r.observations[0].date >= "1985-01-01").toBe(true);
    expect(r.observations[r.observations.length - 1].date <= "2025-12-31").toBe(true);
    expect(r.satellites).toContain("Landsat 8");
    expect(r.units).toBe("NDVI (unitless, -1..1)");
  });
  it("says saved response, with a real date", async () => {
    const r = await loadSavedNdvi(pinId);
    expect(ndviOriginLine(r)).toMatch(/^Saved response from \d{1,2} \w{3} \d{4}\.$/);
  });
  it("indicators and wording contain no NaN or undefined", async () => {
    const r = await loadSavedNdvi(pinId);
    const ind = computeNdviIndicators(r);
    expect(ind.typicalPeak).not.toBeNull();
    expect(JSON.stringify(ind.peaks)).not.toMatch(/NaN/);
    const w = ndviWording(ind);
    const all = [w.headline, w.peakLine, w.bareLine, w.stressLine, w.caveat, ...w.greenUpLines, ...w.stressItems].join("\n");
    expect(all).not.toMatch(/NaN|undefined|null|Infinity/);
    expect(w.greenUpLines).toHaveLength(5);
    for (const f of ind.stressFlags) expect(f.drop).toBeGreaterThanOrEqual(0.15);
  });
  it("windows: 21 x 21, values in range, bounds around the pin, at least 6 dates in 2025", async () => {
    const pin = DEMO_PINS.find((p) => p.id === pinId)!;
    const file = JSON.parse(fs.readFileSync(path.join(process.cwd(), "data", "ndvi", `${pinId}-grids.json`), "utf8"));
    expect(file.grids.length).toBeGreaterThanOrEqual(6);
    const in2025 = file.grids.filter((g: { date: string }) => g.date.startsWith("2025"));
    expect(in2025.length).toBeGreaterThanOrEqual(6);
    for (const g of file.grids) {
      expect(g.ndvi).toHaveLength(21);
      for (const row of g.ndvi) {
        expect(row).toHaveLength(21);
        for (const v of row) if (v !== null) { expect(v).toBeGreaterThanOrEqual(-1); expect(v).toBeLessThanOrEqual(1); }
      }
      expect(g.bounds.west).toBeLessThan(pin.lon);
      expect(g.bounds.east).toBeGreaterThan(pin.lon);
      expect(g.bounds.south).toBeLessThan(pin.lat);
      expect(g.bounds.north).toBeGreaterThan(pin.lat);
      expect(g.pixelSizeM).toBe(30);
      expect(g.validFraction).toBeGreaterThanOrEqual(0.6);
    }
    const latest = await loadSavedNdviGrid(pinId);
    expect(latest.status).toBe("ok");
    expect(latest.grid?.date).toBe(latest.availableDates[latest.availableDates.length - 1]);
    const near = await loadSavedNdviGrid(pinId, "2025-06-15");
    expect(near.status).toBe("ok");
    expect(near.daysOff).toBeLessThan(60);
    expect((await loadSavedNdviGrid(pinId, "not-a-date")).status).toBe("error");
  });
});

describe("saved MODIS (Brentwood only)", () => {
  it("is valid when present, and absent for other pins", async () => {
    expect(await loadSavedNdviModis("fresno")).toBeNull();
    const m = await loadSavedNdviModis("brentwood");
    if (!m) return; // the optional precompute may have been skipped; docs/ndvi.md says which
    expect(m.observations.length).toBeGreaterThan(200);
    for (const o of m.observations) {
      expect(o.ndvi).toBeGreaterThanOrEqual(-0.2);
      expect(o.ndvi).toBeLessThanOrEqual(1);
    }
    expect(m.counts.kept).toBe(m.observations.length);
  });
});
