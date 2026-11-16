import { describe, expect, it } from "vitest";
import { CROP_CATALOG } from "../crops/catalog";
import { DEMO_PINS } from "../demoPins";
import { EXPERTISE, expertiseFor } from "./index";

describe("expertise notes", () => {
  it("every note has a quote, a source, an https URL, a read date and stated limits", () => {
    for (const n of EXPERTISE.notes) {
      expect(n.quote.length, n.id).toBeGreaterThan(20);
      expect(n.source.length, n.id).toBeGreaterThan(0);
      expect(n.by.length, n.id).toBeGreaterThan(0);
      expect(n.url, n.id).toMatch(/^https:\/\//);
      expect(n.readOn, n.id).toMatch(/^\d{4}-\d{2}-\d{2}$/);
      expect(n.limits.length, n.id).toBeGreaterThan(0);
    }
  });

  it("note ids are unique and refer to real pins and crops", () => {
    const ids = EXPERTISE.notes.map((n) => n.id);
    expect(new Set(ids).size).toBe(ids.length);
    const pins = new Set(DEMO_PINS.map((p) => p.id));
    const crops = new Set(CROP_CATALOG.crops.map((c) => c.id));
    for (const n of EXPERTISE.notes) {
      for (const p of n.pins) expect(pins.has(p), `${n.id} pin ${p}`).toBe(true);
      for (const c of n.cropIds) expect(crops.has(c), `${n.id} crop ${c}`).toBe(true);
    }
  });

  it("every demo pin shows at least one note or a stated gap, never silence", () => {
    for (const p of DEMO_PINS) {
      const r = expertiseFor(p.id);
      expect(r.notes.length + r.gaps.length, p.id).toBeGreaterThan(0);
    }
    expect(expertiseFor("brentwood").gaps[0].text).toMatch(/403|access denied/i);
    expect(expertiseFor("ludhiana").gaps[0].text).toMatch(/Haryana/);
  });

  it("filters crop-specific notes by the crops in play", () => {
    expect(expertiseFor("fresno", ["cotton"]).notes.map((n) => n.id)).toContain("munk-cotton-salinity");
    expect(expertiseFor("fresno", ["rice"]).notes.map((n) => n.id)).not.toContain("munk-cotton-salinity");
    expect(expertiseFor("fresno").notes.map((n) => n.id)).toContain("munk-cotton-salinity");
  });

  it("a location that is not a demo pin gets a gap, not invented notes", () => {
    const r = expertiseFor(null);
    expect(r.notes).toEqual([]);
    expect(r.gaps).toHaveLength(1);
  });
});
