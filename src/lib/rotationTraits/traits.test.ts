import { describe, expect, it } from "vitest";
import { CROP_CATALOG } from "../crops/catalog";
import { allTraitCropIds, loadTraits, traitFor, unknownTraitKeys, validateTraits } from "./traits";
import { marketData } from "./market";
import { TRAIT_KEYS, type TraitsFile } from "./types";

describe("traits.json schema", () => {
  it("passes validation: every sourced field has a source with a url, every unknown field is null with a note", () => {
    expect(validateTraits()).toEqual([]);
  });

  it("has every catalog crop plus the candidates and cover crops, unique ids", () => {
    const ids = allTraitCropIds();
    expect(new Set(ids).size).toBe(ids.length);
    for (const c of CROP_CATALOG.crops) expect(ids, c.id).toContain(c.id);
    for (const id of ["alfalfa", "safflower", "sorghum", "cereal-rye", "common-vetch"]) expect(ids).toContain(id);
  });

  it("inCatalog flag agrees with the real catalog", () => {
    const catalogIds = new Set(CROP_CATALOG.crops.map((c) => c.id));
    for (const c of loadTraits().crops) expect(c.inCatalog, c.id).toBe(catalogIds.has(c.id));
  });

  it("flags a sourced field with no url, an unknown field with no note, and a sourced null", () => {
    const bad = structuredClone(loadTraits()) as TraitsFile;
    const w = bad.crops.find((c) => c.id === "winter-wheat")!;
    w.traits.family.source = { title: "x", url: "", page_or_table: "y" };
    w.traits.forage = { value: null, status: "unknown", source: null };
    w.traits.rootDepthM = { value: null, status: "sourced", source: w.traits.family.source };
    const problems = validateTraits(bad);
    expect(problems.some((p) => p.startsWith("winter-wheat.family") && /no url/.test(p))).toBe(true);
    expect(problems.some((p) => p.startsWith("winter-wheat.forage") && /without a note/.test(p))).toBe(true);
    expect(problems.some((p) => p.startsWith("winter-wheat.rootDepthM") && /value is null/.test(p))).toBe(true);
  });

  it("every crop carries every trait key", () => {
    for (const c of loadTraits().crops) for (const k of TRAIT_KEYS) expect(c.traits[k], `${c.id}.${k}`).toBeDefined();
  });

  it("values match the FAO-56 Table 22 rows read on 2026-11-15", () => {
    const expected: Record<string, [number, number, number]> = {
      "winter-wheat": [1.5, 1.8, 0.55],
      "maize-grain": [1.0, 1.7, 0.55],
      cotton: [1.0, 1.7, 0.65],
      rice: [0.5, 1.0, 0.2],
      sunflower: [0.8, 1.5, 0.45],
      "sugar-beet": [0.7, 1.2, 0.55],
      "dry-bean": [0.6, 0.9, 0.45],
      alfalfa: [1.0, 2.0, 0.55],
      safflower: [1.0, 2.0, 0.6],
      sorghum: [1.0, 2.0, 0.55],
    };
    for (const [id, [mn, mx, p]] of Object.entries(expected)) {
      const t = traitFor(id)!;
      expect(t.traits.rootDepthM.value, id).toEqual({ minM: mn, maxM: mx });
      expect(t.traits.depletionFractionP.value, id).toBe(p);
      expect(t.traits.rootDepthM.source!.url).toBe("https://www.fao.org/4/x0490e/x0490e0e.htm");
    }
  });

  it("families, nitrogen fixing and the alfalfa credit are as documented", () => {
    expect(traitFor("winter-wheat")!.traits.family.value).toBe("Poaceae");
    expect(traitFor("cotton")!.traits.family.value).toBe("Malvaceae");
    expect(traitFor("safflower")!.traits.family.value).toBe("Asteraceae");
    expect(traitFor("alfalfa")!.traits.family.value).toBe("Fabaceae");
    expect(traitFor("alfalfa")!.traits.nitrogenFixing.value).toBe(true);
    expect(traitFor("alfalfa")!.traits.nCredit.value).toMatchObject({ minLbPerAcre: 70, maxLbPerAcre: 130, unit: "lb N/acre" });
    expect(traitFor("dry-bean")!.traits.nitrogenFixing.value).toBe(true);
    expect(traitFor("winter-wheat")!.traits.nitrogenFixing.value).toBe(false);
  });

  it("unknown stays unknown: no imputed nitrogen-fixing value for rice, and cover crops have no root depth", () => {
    expect(traitFor("rice")!.traits.nitrogenFixing).toMatchObject({ status: "unknown", value: null });
    expect(traitFor("cereal-rye")!.traits.rootDepthM.status).toBe("unknown");
    expect(unknownTraitKeys(traitFor("rice")!)).toContain("nitrogenFixing");
  });

  it("rice p is flagged not comparable (defined against saturation)", () => {
    expect(traitFor("rice")!.traits.depletionFractionP.comparable).toBe(false);
  });

  it("states the rotation principle with quotes that have sources", () => {
    const p = loadTraits().rotationPrinciple;
    expect(p.quotes.length).toBeGreaterThan(0);
    for (const q of p.quotes) {
      expect(q.text.length).toBeGreaterThan(0);
      expect(q.source.url).toMatch(/^https:/);
    }
  });
});

describe("market data", () => {
  it("is typed as not connected, with a reason and a register url, and holds no prices", () => {
    expect(marketData.status).toBe("not-connected");
    expect(marketData.reason.length).toBeGreaterThan(10);
    expect(marketData.registerUrl).toMatch(/^https:\/\//);
    expect(Object.keys(marketData).sort()).toEqual(["reason", "registerUrl", "status"]);
  });
});
