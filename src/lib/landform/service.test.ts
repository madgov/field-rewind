import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { describe, expect, it, vi } from "vitest";
import { landformDataLabel, landformOriginLine } from "./label";
import { LANDFORM_OFFLINE_MESSAGE, createLandformService } from "./service";
import { loadSavedLandformSync, readSavedFile, readSavedGridFile } from "./saved";
import { offlineFromEnv } from "../power/offline";

const tmp = () => path.join(fs.mkdtempSync(path.join(os.tmpdir(), "landform-test-")), "cache");
const boom = () =>
  vi.fn(async () => {
    throw new Error("network must not be called");
  });

describe("offline switch (FIELD_REWIND_OFFLINE)", () => {
  it("is read from the same environment variable as the POWER layer", () => {
    expect(offlineFromEnv({ FIELD_REWIND_OFFLINE: "1" })).toBe(true);
  });
  it("serves saved demo pins and the sample point with no network call", async () => {
    const t = boom();
    const s = boom();
    const svc = createLandformService({ offline: true, fetchTerrain: t, fetchSda: s, cacheDir: tmp() });
    for (const [lat, lon, id] of [[37.93, -121.66, "brentwood"], [36.74, -119.79, "fresno"], [30.9, 75.85, "ludhiana"], [36.68, -119.28, "orange-cove"]] as const) {
      const r = await svc.getLandform(lat, lon);
      expect(r.status, id).toBe("ok");
      expect(r.origin).toBe("saved");
      expect(r.terrain.status === "ok" && r.terrain.grid?.rows).toBe(41);
    }
    expect(t).not.toHaveBeenCalled();
    expect(s).not.toHaveBeenCalled();
  });
  it("returns a structured plain-English error for an unsaved coordinate and never calls the network", async () => {
    const t = boom();
    const s = boom();
    const svc = createLandformService({ offline: true, fetchTerrain: t, fetchSda: s, cacheDir: tmp() });
    const r = await svc.getLandform(10.5, 20.5);
    expect(r.status).toBe("error");
    expect(r.message).toContain(LANDFORM_OFFLINE_MESSAGE);
    expect(r.terrain.status).toBe("error");
    expect(r.soil.status).toBe("error");
    expect(r.erosion).toBeNull();
    expect(t).not.toHaveBeenCalled();
    expect(s).not.toHaveBeenCalled();
  });
  it("fresh does not bypass the saved file when offline", async () => {
    const t = boom();
    const svc = createLandformService({ offline: true, fetchTerrain: t, fetchSda: boom(), cacheDir: tmp() });
    expect((await svc.getLandform(37.93, -121.66, { fresh: true })).origin).toBe("saved");
    expect(t).not.toHaveBeenCalled();
  });
  it("rejects invalid coordinates", async () => {
    const svc = createLandformService({ offline: true, cacheDir: tmp() });
    expect((await svc.getLandform(95, 0)).status).toBe("error");
  });
});

describe("live path with injected fetchers (the raw responses are the real saved ones)", () => {
  const terrainRaw = readSavedGridFile("orange-cove").terrain;
  const sdaRaw = readSavedFile("orange-cove").sda;
  it("fetches once, then serves from cache labelled as such; fresh fetches again; errors are not cached", async () => {
    const t = vi.fn(async () => terrainRaw);
    const s = vi.fn(async () => sdaRaw);
    const svc = createLandformService({ offline: false, fetchTerrain: t, fetchSda: s, cacheDir: tmp() });
    const a = await svc.getLandform(37.0, -121.0);
    expect(a.origin).toBe("live");
    expect(a.status).toBe("ok");
    const b = await svc.getLandform(37.0, -121.0);
    expect(b.origin).toBe("cache");
    expect(t).toHaveBeenCalledTimes(1);
    await svc.getLandform(37.0, -121.0, { fresh: true });
    expect(t).toHaveBeenCalledTimes(2);

    const bad = vi.fn(async () => {
      throw new Error("The soil service (USDA Soil Data Access) did not answer within 90 seconds.");
    });
    const svc2 = createLandformService({ offline: false, fetchTerrain: t, fetchSda: bad, cacheDir: tmp() });
    const c = await svc2.getLandform(38.0, -121.0);
    expect(c.status).toBe("partial");
    expect(c.soil.status).toBe("error");
    expect(c.terrain.status).toBe("ok");
    expect(c.message).toMatch(/did not answer/);
    const d = await svc2.getLandform(38.0, -121.0);
    expect(d.origin).toBe("live"); // nothing cached after a failure
  });
  it("both parts failing is an error with both messages", async () => {
    const svc = createLandformService({ offline: false, fetchTerrain: async () => { throw new Error("tile down"); }, fetchSda: async () => { throw new Error("soil down"); }, cacheDir: tmp() });
    const r = await svc.getLandform(40, -100);
    expect(r.status).toBe("error");
    expect(r.message).toMatch(/tile down/);
    expect(r.message).toMatch(/soil down/);
  });
  it("a non-US point is ok with terrain, soil no-coverage", async () => {
    const svc = createLandformService({ offline: false, fetchTerrain: async () => terrainRaw, fetchSda: async () => readSavedFile("ludhiana").sda, cacheDir: tmp() });
    const r = await svc.getLandform(31.5, 76.0);
    expect(r.status).toBe("ok");
    expect(r.soil.status).toBe("no-coverage");
  });
});

describe("origin wording", () => {
  it("says saved response from [date] for saved and cache, just now only for live", () => {
    expect(landformOriginLine({ origin: "saved", fetchedAt: "2026-11-16T01:30:43.322Z" })).toBe("Saved response from 16 Nov 2026, 01:30 UTC.");
    expect(landformOriginLine({ origin: "cache", fetchedAt: "2026-11-16T01:30:43.322Z" })).toMatch(/^Saved response from/);
    expect(landformOriginLine({ origin: "live", fetchedAt: "2026-11-16T01:30:43.322Z" })).toMatch(/^Fetched just now/);
    expect(landformDataLabel({ origin: "saved", fetchedAt: "2026-11-16T01:30:43.322Z" })).toContain("NASADEM 30 m surface model");
  });
});

describe("saved files (real data)", () => {
  const dir = path.join(process.cwd(), "data", "landform");
  it("each file is under 3 MB, holds no read token, and the grids contain their pin", () => {
    for (const id of ["brentwood", "fresno", "ludhiana", "orange-cove"]) {
      for (const f of [`${id}.json`, `${id}-grid.json`]) {
        const p = path.join(dir, f);
        expect(fs.statSync(p).size).toBeLessThan(3 * 1024 * 1024);
        const text = fs.readFileSync(p, "utf8");
        expect(text).not.toMatch(/sig=|sv=20|"token"/);
      }
      const r = loadSavedLandformSync(id, { includeGrid: true });
      expect(r.terrain.status).toBe("ok");
      if (r.terrain.status !== "ok" || !r.terrain.grid) throw new Error("no grid");
      const b = r.terrain.grid.bounds;
      expect(r.lon).toBeGreaterThan(b.west);
      expect(r.lon).toBeLessThan(b.east);
      expect(r.lat).toBeGreaterThan(b.south);
      expect(r.lat).toBeLessThan(b.north);
      expect(r.terrain.grid.elevationM).toHaveLength(41 * 41);
      expect(r.origin).toBe("saved");
      expect(r.fetchedAt).toMatch(/^2026-/);
    }
  });
  it("real numbers per place", () => {
    const b = loadSavedLandformSync("brentwood");
    if (b.terrain.status !== "ok" || b.soil.status !== "ok") throw new Error("x");
    expect(b.terrain.summary.centerElevationM).toBe(12);
    expect(b.terrain.summary.centerSlopeDeg).toBeCloseTo(1.1, 1);
    expect(b.terrain.summary.centerAspectDeg).toBe(328);
    expect(b.soil.derived.textureClass).toBe("clay");
    expect(b.soil.derived.profileAwc?.mm).toBeCloseTo(150, 0);
    expect(b.soil.derived.hydgrp).toBe("C");
    expect(b.erosion?.slopeBand?.label).toBe("0 to 2 percent");

    const f = loadSavedLandformSync("fresno");
    if (f.terrain.status !== "ok" || f.soil.status !== "ok") throw new Error("x");
    expect(f.terrain.summary.centerElevationM).toBe(90);
    expect(f.terrain.summary.centerSlopeDeg).toBeCloseTo(4.3, 1);
    expect(f.soil.derived.textureClass).toBe("sandy loam");
    expect(f.soil.derived.hydgrp).toBe("A");

    const o = loadSavedLandformSync("orange-cove");
    if (o.terrain.status !== "ok" || o.soil.status !== "ok") throw new Error("x");
    expect(o.terrain.summary.centerElevationM).toBe(188);
    expect(o.terrain.summary.centerSlopePct).toBeCloseTo(13.9, 1);
    expect(o.soil.mukey).toBe("464407");
    expect(o.landUse).toMatchObject({ year: 2023, value: "176", category: "Grass/Pasture" });
  });
  it("an unknown id is a structured error, not a crash", () => {
    const r = loadSavedLandformSync("nowhere");
    expect(r.status).toBe("error");
    expect(r.message).toMatch(/No saved landform response/);
    expect(loadSavedLandformSync("../etc/passwd").status).toBe("error");
  });
});
