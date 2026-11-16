import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { describe, expect, it, vi } from "vitest";
import type { RasterReader, WindowRead } from "./cog";
import { NdviHttpError, type FetchLike } from "./http";
import { mapLimit, retrieveSeries, thinEvenly } from "./retrieve";
import { readScene, utmDefinition } from "./scene";
import { createNdviService } from "./service";
import type { StacItem } from "./stac";
import { TokenManager } from "./token";

// ---- fixtures (tests only) -------------------------------------------------------------------------------------
const item = (date: string, platform = "landsat-8", id = `scene-${date}`): StacItem => ({
  id,
  properties: { datetime: `${date}T18:00:00Z`, platform, "proj:epsg": 32610, "eo:cloud_cover": 5 },
  assets: { red: { href: `https://blob/${id}_B4.TIF` }, nir08: { href: `https://blob/${id}_B5.TIF` }, qa_pixel: { href: `https://blob/${id}_QA.TIF` } },
});
const CLEAR = 64;
/** Fake reader: the image origin is chosen so the pin pixel is col 100, row 100. */
type Pix = { red: number; nir: number; qa: number };
function makeReader(pix: (scene: string, col: number, row: number) => Pix, calls?: string[]): RasterReader {
  return async (url, x, y, radius) => {
    calls?.push(url);
    const scene = /blob\/(.+?)_(B4|B5|QA)\.TIF/.exec(url)![1];
    const band = /_(B4|B5|QA)\.TIF/.exec(url)![1];
    const originX = Math.floor(x / 30) * 30 - 100 * 30;
    const originY = Math.ceil(y / 30) * 30 + 100 * 30;
    const col = Math.floor((x - originX) / 30);
    const row = Math.floor((y - originY) / -30);
    const x0 = col - radius, y0 = row - radius, width = 2 * radius + 1, height = 2 * radius + 1;
    const data: number[] = [];
    for (let r = 0; r < height; r++) for (let c = 0; c < width; c++) {
      const p = pix(scene, x0 + c, y0 + r);
      data.push(band === "B4" ? p.red : band === "B5" ? p.nir : p.qa);
    }
    return { x0, y0, width, height, data, originX, originY, resX: 30, resY: -30, imageWidth: 7000, imageHeight: 7000, epsg: 32610 } satisfies WindowRead;
  };
}
const tokenFetch = () => vi.fn<FetchLike>(async () => new Response(JSON.stringify({ token: "tok", "msft:expiry": "2099-01-01T00:00:00Z" }), { status: 200 }));
const stacFetch = (items: StacItem[], tok = tokenFetch()) =>
  vi.fn<FetchLike>(async (url, init) => {
    if (url.includes("/sas/")) return tok(url, init);
    return new Response(JSON.stringify({ features: items, links: [] }), { status: 200 });
  });
const good: Pix = { red: 10000, nir: 30000, qa: CLEAR }; // NDVI 0.786

describe("utmDefinition", () => {
  it("north and south zones, else null", () => {
    expect(utmDefinition(32610)).toContain("+zone=10");
    expect(utmDefinition(32610)).not.toContain("+south");
    expect(utmDefinition(32743)).toContain("+south");
    expect(utmDefinition(4326)).toBeNull();
  });
});

describe("readScene", () => {
  const lat = 37.93, lon = -121.66;
  it("computes the pin pixel NDVI and the 21 x 21 grid, masking QA-flagged pixels as null", async () => {
    const reader = makeReader((_s, c, r) => (c === 105 && r === 100 ? { ...good, qa: CLEAR | 8 } : good));
    const tokens = new TokenManager({ fetchImpl: tokenFetch() });
    const r = await readScene(item("2024-06-09"), lat, lon, 10, { reader, tokens });
    expect(r.centerNdvi).toBeCloseTo(0.786, 3);
    expect(r.satellite).toBe("Landsat 8");
    const g = r.grid!;
    expect(g.rows).toBe(21);
    expect(g.cols).toBe(21);
    expect(g.ndvi[10][10]).toBeCloseTo(0.786, 3);
    expect(g.ndvi[10][15]).toBeNull(); // the cloudy pixel, 5 columns east of the pin pixel
    expect(g.validFraction).toBeCloseTo(440 / 441, 3);
    expect(g.pixelSizeM).toBe(30);
    expect(g.crs).toBe("EPSG:32610");
    expect(g.bounds.west).toBeLessThan(lon);
    expect(g.bounds.east).toBeGreaterThan(lon);
    expect(g.bounds.north).toBeGreaterThan(lat);
    expect(g.bounds.south).toBeLessThan(lat);
    // 21 pixels x 30 m = 630 m; about 0.0071 degrees of longitude / 0.0057 of latitude at 38 N
    expect(g.bounds.north - g.bounds.south).toBeCloseTo(630 / 111_000, 3);
    expect(g.bounds.east - g.bounds.west).toBeCloseTo(630 / (111_320 * Math.cos((lat * Math.PI) / 180)), 3);
    expect(g.crsBounds.xMax - g.crsBounds.xMin).toBeCloseTo(630, 6);
  });
  it("masks a cloudy pin pixel (centerNdvi null)", async () => {
    const reader = makeReader(() => ({ ...good, qa: CLEAR | 8 }));
    const r = await readScene(item("2024-06-09"), lat, lon, 0, { reader, tokens: new TokenManager({ fetchImpl: tokenFetch() }) });
    expect(r.centerNdvi).toBeNull();
    expect(r.grid).toBeUndefined();
  });
  it("on a 403 invalidates the token and retries once with a new one", async () => {
    let n = 0;
    const urls: string[] = [];
    const inner = makeReader(() => good, urls);
    const reader: RasterReader = async (...a) => {
      if (n++ < 3) throw new NdviHttpError("http", "forbidden", 403);
      return inner(...a);
    };
    const tok = tokenFetch();
    const tokens = new TokenManager({ fetchImpl: tok });
    const r = await readScene(item("2024-06-09"), lat, lon, 0, { reader, tokens, sleep: async () => {} });
    expect(r.centerNdvi).not.toBeNull();
    expect(tok).toHaveBeenCalledTimes(2);
  });
  it("rejects a scene with a non-UTM CRS and one missing an asset", async () => {
    const tokens = new TokenManager({ fetchImpl: tokenFetch() });
    const bad = item("2024-06-09");
    bad.properties["proj:epsg"] = 3857;
    await expect(readScene(bad, lat, lon, 0, { reader: makeReader(() => good), tokens })).rejects.toThrow(/UTM only/);
    const noQa = item("2024-06-09");
    delete noQa.assets.qa_pixel;
    await expect(readScene(noQa, lat, lon, 0, { reader: makeReader(() => good), tokens })).rejects.toThrow(/missing/);
  });
});

describe("retrieveSeries", () => {
  const p = { lat: 37.93, lon: -121.66, start: "2024-01-01", end: "2024-12-31" };
  it("keeps clear observations, counts masked scenes, sorts by date, tags the satellite", async () => {
    const items = [item("2024-03-01"), item("2024-02-01", "landsat-9"), item("2024-04-01"), item("2024-05-01", "landsat-4")];
    const reader = makeReader((s) => (s.includes("04-01") ? { ...good, qa: CLEAR | 16 } : good));
    const r = await retrieveSeries(p, { fetchImpl: stacFetch(items), reader, sleep: async () => {}, now: () => new Date("2026-01-01T00:00:00Z") });
    expect(r.status).toBe("ok");
    expect(r.counts).toEqual({ scenesFound: 3, scenesRead: 3, clear: 2, masked: 1, failed: 0, skippedByCap: 0 }); // Landsat 4 is not an included platform
    expect(r.observations.map((o) => [o.date, o.satellite, o.ndvi])).toEqual([
      ["2024-02-01", "Landsat 9", 0.786],
      ["2024-03-01", "Landsat 8", 0.786],
    ]);
    expect(r.origin).toBe("live");
    expect(r.fetchedAt).toBe("2026-01-01T00:00:00.000Z");
    expect(r.units).toBe("NDVI (unitless, -1..1)");
  });
  it("reports no-coverage (not an invented value) when every pixel is masked, and when no scenes exist", async () => {
    const masked = await retrieveSeries(p, { fetchImpl: stacFetch([item("2024-03-01")]), reader: makeReader(() => ({ ...good, qa: CLEAR | 8 })), sleep: async () => {} });
    expect(masked.status).toBe("no-coverage");
    expect(masked.observations).toEqual([]);
    expect(masked.message).toMatch(/masked/);
    const none = await retrieveSeries(p, { fetchImpl: stacFetch([]), reader: makeReader(() => good), sleep: async () => {} });
    expect(none.status).toBe("no-coverage");
    expect(none.message).toMatch(/No Landsat scenes/);
  });
  it("one failing scene makes the result partial and is reported; all failing is an error", async () => {
    const items = [item("2024-03-01"), item("2024-04-01")];
    const inner = makeReader(() => good);
    const flaky: RasterReader = async (url, ...a) => {
      if (url.includes("2024-04-01")) throw new NdviHttpError("http", "boom", 404);
      return inner(url, ...a);
    };
    const r = await retrieveSeries(p, { fetchImpl: stacFetch(items), reader: flaky, sleep: async () => {} });
    expect(r.status).toBe("partial");
    expect(r.counts.failed).toBe(1);
    expect(r.notes.join(" ")).toMatch(/could not be read/);
    const all = await retrieveSeries(p, { fetchImpl: stacFetch(items), reader: async () => { throw new NdviHttpError("http", "boom", 404); }, sleep: async () => {} });
    expect(all.status).toBe("error");
  });
  it("caps the number of scenes and says so", async () => {
    const items = Array.from({ length: 10 }, (_, i) => item(`2024-0${(i % 9) + 1}-1${i}`.slice(0, 10), "landsat-8", `s${i}`));
    const calls: string[] = [];
    const r = await retrieveSeries({ ...p, maxScenes: 4 }, { fetchImpl: stacFetch(items), reader: makeReader(() => good, calls), sleep: async () => {} });
    expect(r.counts.scenesFound).toBe(10);
    expect(r.counts.scenesRead).toBe(4);
    expect(r.counts.skippedByCap).toBe(6);
    expect(r.status).toBe("partial");
    expect(r.notes[0]).toMatch(/6 of 10/);
    expect(calls.length).toBe(12); // 4 scenes x 3 bands
  });
  it("search failure is a structured error", async () => {
    const f = vi.fn<FetchLike>(async () => new Response("x", { status: 500 }));
    const r = await retrieveSeries(p, { fetchImpl: f, reader: makeReader(() => good), sleep: async () => {}, maxRetries: 1 });
    expect(r.status).toBe("error");
    expect(r.message).toMatch(/Could not search the Landsat archive/);
    expect(f).toHaveBeenCalledTimes(2);
  });
});

describe("helpers", () => {
  it("thinEvenly keeps first and last", () => {
    expect(thinEvenly([1, 2, 3, 4, 5, 6, 7, 8, 9, 10], 4)).toEqual([1, 4, 7, 10]);
    expect(thinEvenly([1, 2], 5)).toEqual([1, 2]);
  });
  it("mapLimit never exceeds the concurrency bound and keeps order", async () => {
    let live = 0, peak = 0;
    const out = await mapLimit([1, 2, 3, 4, 5, 6, 7], 3, async (n) => {
      peak = Math.max(peak, ++live);
      await new Promise((r) => setTimeout(r, 5));
      live--;
      return n * 2;
    });
    expect(out).toEqual([2, 4, 6, 8, 10, 12, 14]);
    expect(peak).toBeLessThanOrEqual(3);
  });
});

describe("offline switch", () => {
  const throwing = () => vi.fn<FetchLike>(async () => { throw new Error("fetch must not be called"); });
  const tmpData = () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "ndvi-test-"));
    fs.writeFileSync(path.join(dir, "brentwood.json"), JSON.stringify({
      pinId: "brentwood", lat: 37.93, lon: -121.66, fetchedAt: "2026-02-03T04:05:06Z", period: { start: "2020-01-01", end: "2020-12-31" }, units: "NDVI (unitless, -1..1)", label: "x", sources: [],
      counts: { scenesFound: 2, scenesRead: 2, clear: 2, masked: 0, failed: 0, skippedByCap: 0 }, notes: [],
      observations: [{ date: "2020-06-01", ndvi: 0.7, satellite: "Landsat 8", sceneId: "a" }, { date: "2020-07-01", ndvi: 0.6, satellite: "Landsat 7", sceneId: "b" }],
    }));
    return dir;
  };
  it("serves a saved demo pin with no network call and an unsaved coordinate with a structured error", async () => {
    const f = throwing();
    const reader = vi.fn(async () => { throw new Error("reader must not be called"); });
    const svc = createNdviService({ fetchImpl: f, reader: reader as unknown as RasterReader, offline: true, dataDir: tmpData() });
    const saved = await svc.getNdviSeries(37.93, -121.66);
    expect(saved.status).toBe("ok");
    expect(saved.origin).toBe("saved");
    expect(saved.observations).toHaveLength(2);
    expect(saved.satellites.sort()).toEqual(["Landsat 7", "Landsat 8"]);
    const other = await svc.getNdviSeries(40.0, -100.0);
    expect(other.status).toBe("error");
    expect(other.message).toMatch(/Offline mode is on/);
    const fresh = await svc.getNdviSeries(37.93, -121.66, { fresh: true });
    expect(fresh.status).toBe("error"); // offline refuses a forced live fetch
    expect(f).not.toHaveBeenCalled();
    expect(reader).not.toHaveBeenCalled();
  });
  it("online, an unsaved coordinate reads live once and then answers from memory as a cache hit", async () => {
    const f = stacFetch([item("2025-03-01"), item("2025-04-01")]);
    const svc = createNdviService({ fetchImpl: f, reader: makeReader(() => good), offline: false, dataDir: tmpData(), sleep: async () => {}, now: () => new Date("2026-06-01T00:00:00Z") });
    const a = await svc.getNdviSeries(40.0, -100.0);
    expect(a.origin).toBe("live");
    expect(a.counts.clear).toBe(2);
    const calls = f.mock.calls.length;
    const b = await svc.getNdviSeries(40.0, -100.0);
    expect(b.origin).toBe("cache");
    expect(b.fetchedAt).toBe(a.fetchedAt);
    expect(f.mock.calls.length).toBe(calls);
  });
  it("rejects invalid coordinates and unknown pins", async () => {
    const svc = createNdviService({ offline: true, fetchImpl: throwing() });
    expect((await svc.getNdviSeries(120, 0)).status).toBe("error");
    expect((await svc.loadSavedNdvi("nowhere")).status).toBe("error");
  });
});
