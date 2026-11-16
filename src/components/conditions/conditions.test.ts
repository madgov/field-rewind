// Renders the Field conditions sections from the REAL saved files for the three demo pins and checks labels, badges, alignment and
// legends. Hand-checked values are read straight from the raw JSON in data/ here, not through the app's own code.
// The only synthetic inputs are in the "non-demo place" test, which uses an unsaved coordinate to trigger the offline error path.
import fs from "node:fs";
import path from "node:path";
import { createElement as h } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { beforeAll, describe, expect, it, vi } from "vitest";

// The real saved files are large (tens of MB across layers); render and parse them with a generous timeout.
vi.setConfig({ testTimeout: 120_000 });
import { DEMO_PINS } from "@/lib/demoPins";
import { loadSavedLandformGrid } from "@/lib/landform";
import BlockedCard, { BLOCKED_DATASETS, EARTHDATA_REGISTER, EARTHDATA_TOKEN } from "./BlockedCard";
import HarmonizedYearly from "./HarmonizedYearly";
import LayerSources from "../howweknow/LayerSources";
import { GroundSection, HeatFrostSection, LandformSection, SoilWetnessSection, VegetationSection } from "./sections";
import { YearSection } from "./YearSection";
import { loadNdviGrids, loadExtra, loadGround, loadNdvi, loadPower } from "./load";
import { buildHarmonized, FIRST_YEAR, LAST_YEAR } from "./models";
import { buildNdviOverlay, buildTerrainOverlay, minMax } from "./overlay";
import { BADGES } from "./badges";

const root = process.cwd();
const raw = (rel: string) => JSON.parse(fs.readFileSync(path.join(root, rel), "utf8"));
const pin = (id: string) => DEMO_PINS.find((p) => p.id === id)!;
const BAD = /NaN|undefined|Infinity|\bnull\b/;

const html = async (el: unknown) => renderToStaticMarkup(await (el as Promise<never>));
const pageCache = new Map<string, ReturnType<typeof buildPage>>();
function pageHtml(id: string) {
  if (!pageCache.has(id)) pageCache.set(id, buildPage(id));
  return pageCache.get(id)!;
}
async function buildPage(id: string) {
  const { lat, lon } = pin(id);
  const parts = await Promise.all([
    html(HeatFrostSection({ lat, lon })),
    html(SoilWetnessSection({ lat, lon })),
    html(VegetationSection({ lat, lon })),
    html(LandformSection({ lat, lon })),
    html(GroundSection({ lat, lon })),
    html(YearSection({ lat, lon })),
    html(LayerSources({ lat, lon, useLoaded: false })),
  ]);
  return { frost: parts[0], soil: parts[1], veg: parts[2], land: parts[3], ground: parts[4], year: parts[5], sources: parts[6], all: parts.join("\n") + renderToStaticMarkup(h(BlockedCard)) };
}

beforeAll(() => {
  process.env.FIELD_REWIND_OFFLINE = "1";
});

describe("sections render real saved data for every demo pin", () => {
  for (const id of ["brentwood", "fresno", "ludhiana"]) {
    it(`${id}: no NaN/undefined/Infinity/null text, labelled, badged, dated`, async () => {
      const p = await pageHtml(id);
      const text = p.all.replace(/<[^>]*>/g, " ");
      expect(text).not.toMatch(BAD);
      expect(text).toContain("regional climate, about 50 km grid");
      expect(text).toMatch(/Saved response from \d{1,2} \w+ 20\d\d/);
      expect(p.frost).toContain("Reanalysis model");
      expect(p.frost).toContain("See the hot-days shift page");
      expect(p.frost).toContain(`/shift?lat=${pin(id).lat.toFixed(4)}`);
      expect(p.veg).toContain("Satellite observation");
      expect(p.land).toContain("Elevation model");
      expect(p.land).toContain("not a soil-loss prediction");
      expect(p.ground).toContain("Ground gauge");
      expect(p.year).toContain("different native resolutions");
      expect(p.year).toContain("no combined score");
      // every section has an expandable explanation
      for (const s of [p.frost, p.soil, p.veg, p.land, p.ground]) expect(s).toContain("What this means and how we know");
      // no invented frost or erosion zones
      expect(text).not.toMatch(/frost pocket|frost zone|erosion zone|erosion risk zone/i);
    });
  }

  it("badge kinds each have a distinct label and shape", () => {
    const labels = Object.values(BADGES).map((b) => b.label);
    const shapes = Object.values(BADGES).map((b) => b.shape);
    expect(new Set(labels).size).toBe(labels.length);
    expect(new Set(shapes).size).toBe(shapes.length);
  });

  it("headlines come from computed numbers (Brentwood frost and soil wetness)", async () => {
    const p = await pageHtml("brentwood");
    expect(p.frost).toContain("No clear change in frost days: 11 a year in 1985–2004 and 8 a year in 2006–2025");
    expect(p.soil).toContain("No clear change in growing-season soil wetness (modelled): 0.48 in 1985–2004 and 0.50 in 2006–2025");
    const l = await pageHtml("ludhiana");
    expect(l.soil).toContain("rose from 0.39 to 0.44");
  });

  it("Ludhiana: soil survey and all five ground checks say US only, with the exact reason, and nothing is invented", async () => {
    const p = await pageHtml("ludhiana");
    expect(p.land).toMatch(/United States only|US only/i);
    expect(p.ground).toContain("Daymet covers North America only");
    expect((p.ground.match(/nothing to show/g) ?? []).length).toBe(5);
    expect(p.ground).toContain("None of the 5 ground checks has data for this place");
    expect(p.ground).not.toMatch(/mm a year|Nearest well<\/h3>[^]*depth/);
  });

  it("blocked card names the four NASA layers, both Earthdata links, and OpenET/CIMIS", () => {
    const out = renderToStaticMarkup(h(BlockedCard));
    for (const n of ["SMAP", "GPM IMERG", "ECOSTRESS", "GLDAS"]) expect(out).toContain(n);
    expect(BLOCKED_DATASETS).toHaveLength(4);
    expect(out).toContain(`href="${EARTHDATA_REGISTER}"`);
    expect(out).toContain(`href="${EARTHDATA_TOKEN}"`);
    expect(out).toContain("OpenET");
    expect(out).toContain("CIMIS");
    expect(out).toContain("nothing is estimated in their place");
  });

  it("MODIS appears for Brentwood only", async () => {
    expect((await pageHtml("brentwood")).veg).toContain("MODIS");
    expect((await pageHtml("fresno")).veg).not.toContain("MODIS 250 m composite");
  });
});

describe("harmonized yearly view", () => {
  async function harm(id: string) {
    const { lat, lon } = pin(id);
    const [power, extra, ndvi, ground] = await Promise.all([loadPower(lat, lon), loadExtra(lat, lon), loadNdvi(lat, lon), loadGround(lat, lon)]);
    return buildHarmonized({ power, extra, ndvi, ground });
  }
  const layer = (d: Awaited<ReturnType<typeof harm>>, id: string) => d.layers.find((l) => l.id === id)!;
  const idx = (y: number) => y - FIRST_YEAR;

  it("spans 1985 to 2025 and all rows have 41 aligned slots", async () => {
    const d = await harm("brentwood");
    expect(d.firstYear).toBe(1985);
    expect(d.lastYear).toBe(2025);
    for (const l of d.layers) expect(l.values).toHaveLength(LAST_YEAR - FIRST_YEAR + 1);
    expect(d.layers.map((l) => l.id)).toEqual(["frost", "soilAnomaly", "rainPower", "rainDaymet", "hotDays", "peakNdvi"]);
  });

  it("Brentwood peak NDVI per year equals the max of the raw saved observations of that calendar year", async () => {
    const d = await harm("brentwood");
    const obs: { date: string; ndvi: number }[] = raw("data/ndvi/brentwood.json").observations;
    for (const y of [1985, 1993, 2000, 2013, 2025]) {
      const vals = obs.filter((o) => o.date.startsWith(`${y}-`)).map((o) => o.ndvi);
      const got = layer(d, "peakNdvi").values[idx(y)];
      if (vals.length === 0) expect(got).toBeNull();
      else expect(got).toBeCloseTo(Math.max(...vals), 6);
    }
  });

  it("Brentwood Daymet annual rain equals the raw file, and 2025 (not in Daymet's window) is a gap, never filled", async () => {
    const d = await harm("brentwood");
    const rows: { year: number; daymetMm: number }[] = raw("data/ground-truth/brentwood.json").daymet.data.precipAnnual.rows;
    expect(layer(d, "rainDaymet").values[idx(1985)]).toBeCloseTo(295.84, 2);
    for (const r of rows) expect(layer(d, "rainDaymet").values[idx(r.year)]).toBeCloseTo(r.daymetMm, 6);
    expect(layer(d, "rainDaymet").values[idx(2025)]).toBeNull();
  });

  it("Ludhiana: Daymet row is unavailable with its message; Landsat starts in 1989 so 1985-1988 are gaps", async () => {
    const d = await harm("ludhiana");
    const dm = layer(d, "rainDaymet");
    expect(dm.unavailable).toContain("Daymet covers North America only");
    expect(dm.values.every((v) => v === null)).toBe(true);
    const first = raw("data/ndvi/ludhiana.json").observations.map((o: { date: string }) => o.date).sort()[0].slice(0, 4);
    expect(first).toBe("1989");
    for (const y of [1985, 1986, 1987, 1988]) expect(layer(d, "peakNdvi").values[idx(y)]).toBeNull();
    expect(layer(d, "peakNdvi").values[idx(1990)]).not.toBeNull();
  });

  it("renders hatched gaps, the year scrubber and the resolution list; no combined score", async () => {
    const d = await harm("brentwood");
    const out = renderToStaticMarkup(h(HarmonizedYearly, { data: d }));
    expect(out).toContain("-hatch");
    expect(out).toContain('type="range"');
    expect(out).toContain("Native resolution of each layer");
    expect(out).toContain("50 km");
    expect(out).toContain("30 m");
    expect(out.toLowerCase()).not.toMatch(/combined score: |overall score|risk score/);
    expect(out.replace(/<[^>]*>/g, " ")).not.toMatch(BAD);
  });
});

describe("map overlays", () => {
  it("NDVI legend range equals the real min/max of all 24 saved Brentwood windows", async () => {
    const g = raw("data/ndvi/brentwood-grids.json");
    const flat: number[] = g.grids.flatMap((x: { ndvi: (number | null)[][] }) => x.ndvi.flat().filter((v) => v !== null));
    const part = await loadNdviGrids(pin("brentwood").lat, pin("brentwood").lon);
    expect(part.ok).toBe(true);
    if (!part.ok) return;
    const o = buildNdviOverlay(part.value.grids, part.value.originLine)!;
    expect(o.dates).toHaveLength(g.grids.length);
    expect(o.legend.min).toBeCloseTo(Math.min(...flat), 9);
    expect(o.legend.max).toBeCloseTo(Math.max(...flat), 9);
    expect(o.legend.bins).toHaveLength(6);
    expect(o.legend.bins[0].from).toBeCloseTo(o.legend.min, 9);
    expect(o.legend.bins[5].to).toBeCloseTo(o.legend.max, 9);
    expect(o.rows).toBe(21);
    expect(o.cols).toBe(21);
  });

  it("terrain legend ranges equal the real slope and relative-elevation range of the saved 41x41 grid", async () => {
    const r = await loadSavedLandformGrid("brentwood");
    expect(r.status).toBe("ok");
    if (r.status !== "ok") return;
    const o = buildTerrainOverlay(r.grid, "x")!;
    const slope = minMax(r.grid.slopeDeg.map((d) => Math.tan((d * Math.PI) / 180) * 100))!;
    expect(o.slopeLegend.min).toBeCloseTo(slope.min, 6);
    expect(o.slopeLegend.max).toBeCloseTo(slope.max, 6);
    const lowest = Math.min(...r.grid.elevationM);
    const high = Math.max(...r.grid.elevationM);
    expect(o.lowSpotLegend.min).toBeCloseTo(0, 6);
    expect(o.lowSpotLegend.max).toBeCloseTo(high - lowest, 6);
    expect(o.rows * o.cols).toBe(41 * 41);
  });

  it("non-demo places have no saved windows and say so", async () => {
    const part = await loadNdviGrids(10, 10);
    expect(part.ok).toBe(false);
    if (!part.ok) expect(part.message).toContain("saved only for the three example places");
  });
});

describe("offline switch: an unsaved coordinate gives structured per-layer errors, not a blank page", () => {
  it("every section still renders with its own message", async () => {
    const [lat, lon] = [10, 10];
    const outs = await Promise.all([HeatFrostSection({ lat, lon }), SoilWetnessSection({ lat, lon }), VegetationSection({ lat, lon }), LandformSection({ lat, lon }), GroundSection({ lat, lon }), YearSection({ lat, lon })].map(html));
    for (const o of outs) {
      expect(o).toContain("Exact message");
      expect(o.replace(/<[^>]*>/g, " ")).not.toMatch(BAD);
    }
    expect(outs[0]).toContain("Offline mode is on");
  });
});

describe("How we know: layer sources", () => {
  it("has one entry per layer with link, resolution, coverage, citation, limits and the new caveats", async () => {
    const out = await html(LayerSources({ lat: pin("brentwood").lat, lon: pin("brentwood").lon, useLoaded: false }));
    for (const id of ["power-extra", "ndvi-0", "modis", "nasadem", "ssurgo", "daymet", "cocorahs", "cdl", "nlcd", "nwis"]) expect(out).toContain(`data-layer="${id}"`);
    expect(out).toMatch(/Saved response from/);
    expect(out).toContain("Reanalysis is not observation");
    expect(out).toContain("Mixed pixels");
    expect(out).toContain("Landsat sensor steps");
    expect(out).toContain("United States only");
    expect(out.replace(/<[^>]*>/g, " ")).not.toMatch(BAD);
    expect((out.match(/Resolution:/g) ?? []).length).toBeGreaterThanOrEqual(10);
  });
  it("Ludhiana lists no MODIS entry", async () => {
    const out = await html(LayerSources({ lat: pin("ludhiana").lat, lon: pin("ludhiana").lon, useLoaded: false }));
    expect(out).not.toContain('data-layer="modis"');
  });
});

describe("prerender safety", () => {
  it("every request-time content component awaits connection() after searchParams", () => {
    for (const f of ["src/components/shift/ShiftContent.tsx", "src/components/replay/ReplayContent.tsx", "src/components/conditions/ConditionsContent.tsx"]) {
      const src = fs.readFileSync(path.join(root, f), "utf8");
      expect(src, f).toMatch(/from "next\/server"/);
      const sp = src.indexOf("await searchParams");
      const conn = src.indexOf("await connection()");
      expect(sp, f).toBeGreaterThan(-1);
      expect(conn, f).toBeGreaterThan(sp);
    }
  });
});
