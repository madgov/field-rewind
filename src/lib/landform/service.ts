/**
 * Landform service: saved places, runtime cache, live fetch, offline switch. Server-side only.
 *
 * Lookup order for getLandform(lat, lon):
 *  1. A saved place (three demo pins and the Orange Cove sample point) within 0.001 degrees: origin "saved".
 *  2. Runtime cache (memory, then .cache/landform): origin "cache".
 *  3. Live fetch (NASADEM + Soil Data Access): origin "live". Errors are never cached.
 * With FIELD_REWIND_OFFLINE=1 only step 1 runs and nothing touches the network.
 */
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { OFFLINE_ENV, offlineFromEnv } from "../power/offline";
import { validateCoordinates } from "../power/grid";
import { assemble, buildSoil, buildTerrain } from "./assemble";
import { fetchNasademRaw } from "./nasadem";
import { findSavedPoint } from "./pins";
import { fetchSdaRaw } from "./sda";
import { loadSavedGridSync, loadSavedLandformSync } from "./saved";
import type { LandformOrigin, LandformResult, SdaRaw, TerrainGrid, TerrainRaw } from "./types";

export const LANDFORM_OFFLINE_MESSAGE = `Offline mode is on (${OFFLINE_ENV}), so this server is not allowed to contact the elevation or soil services. Only the saved example places (Brentwood, Fresno, Ludhiana, and the Orange Cove sample point) are available.`;

export type LandformServiceDeps = {
  fetchTerrain?: (lat: number, lon: number) => Promise<TerrainRaw>;
  fetchSda?: (lat: number, lon: number) => Promise<SdaRaw>;
  offline?: boolean;
  dataDir?: string;
  cacheDir?: string;
};

type CacheEntry = { terrain: TerrainRaw | null; sda: SdaRaw | null };

function errorResult(lat: number, lon: number, message: string): LandformResult {
  return { status: "error", lat, lon, origin: "live", fetchedAt: null, message, terrain: { status: "error", message }, soil: { status: "error", message }, erosion: null };
}

const keyOf = (lat: number, lon: number) => `${lat.toFixed(4)}_${lon.toFixed(4)}`;

export function createLandformService(deps: LandformServiceDeps = {}) {
  const memory = new Map<string, CacheEntry>();
  const inflight = new Map<string, Promise<CacheEntry & { terrainErr?: string; sdaErr?: string }>>();
  const fetchTerrain = deps.fetchTerrain ?? ((lat, lon) => fetchNasademRaw(lat, lon));
  const fetchSda = deps.fetchSda ?? ((lat, lon) => fetchSdaRaw(lat, lon));
  const isOffline = () => deps.offline ?? offlineFromEnv();
  const cacheDirs = () => (deps.cacheDir ? [deps.cacheDir] : [path.join(process.cwd(), ".cache", "landform"), path.join(os.tmpdir(), "field-rewind-landform-cache")]);

  function readDisk(key: string): CacheEntry | null {
    for (const dir of cacheDirs()) {
      try {
        return JSON.parse(fs.readFileSync(path.join(dir, `${key}.json`), "utf8")) as CacheEntry;
      } catch {
        /* try next */
      }
    }
    return null;
  }
  function writeDisk(key: string, entry: CacheEntry) {
    for (const dir of cacheDirs()) {
      try {
        fs.mkdirSync(dir, { recursive: true });
        fs.writeFileSync(path.join(dir, `${key}.json`), JSON.stringify(entry));
        return;
      } catch {
        /* try next; failing to cache is not an error */
      }
    }
  }

  function fromEntry(lat: number, lon: number, e: CacheEntry, origin: LandformOrigin, errs: { terrainErr?: string; sdaErr?: string } = {}): LandformResult {
    const terrain = e.terrain ? buildTerrain(e.terrain, origin, true) : { status: "error" as const, message: errs.terrainErr ?? "No elevation data." };
    const soil = e.sda ? buildSoil(e.sda, origin) : { status: "error" as const, message: errs.sdaErr ?? "No soil data." };
    return assemble({ lat, lon, origin, terrain, soil });
  }

  async function getLandform(lat: number, lon: number, opts: { fresh?: boolean } = {}): Promise<LandformResult> {
    const v = validateCoordinates(lat, lon);
    if (v) return errorResult(lat, lon, v);
    const saved = opts.fresh && !isOffline() ? null : findSavedPoint(lat, lon);
    if (saved) {
      const r = loadSavedLandformSync(saved.id, { includeGrid: true, dir: deps.dataDir });
      return { ...r, lat, lon };
    }
    if (isOffline()) return errorResult(lat, lon, `${LANDFORM_OFFLINE_MESSAGE} No saved response exists for ${lat}, ${lon}.`);
    const key = keyOf(lat, lon);
    if (!opts.fresh) {
      const mem = memory.get(key) ?? readDisk(key);
      if (mem) {
        memory.set(key, mem);
        return fromEntry(lat, lon, mem, "cache");
      }
    }
    let p = inflight.get(key);
    if (!p) {
      p = (async () => {
        const [t, s] = await Promise.allSettled([fetchTerrain(lat, lon), fetchSda(lat, lon)]);
        return {
          terrain: t.status === "fulfilled" ? t.value : null,
          sda: s.status === "fulfilled" ? s.value : null,
          terrainErr: t.status === "rejected" ? (t.reason instanceof Error ? t.reason.message : String(t.reason)) : undefined,
          sdaErr: s.status === "rejected" ? (s.reason instanceof Error ? s.reason.message : String(s.reason)) : undefined,
        };
      })().finally(() => inflight.delete(key));
      inflight.set(key, p);
    }
    const got = await p;
    const result = fromEntry(lat, lon, got, "live", got);
    // Cache only parts that succeeded and were usable; an error part is never stored.
    if (result.terrain.status === "ok" && result.soil.status !== "error") {
      const entry: CacheEntry = { terrain: got.terrain, sda: got.sda };
      memory.set(key, entry);
      writeDisk(key, entry);
    }
    return result;
  }

  return {
    getLandform,
    loadSavedLandform(pinId: string): LandformResult {
      return loadSavedLandformSync(pinId, { dir: deps.dataDir });
    },
    loadSavedLandformGrid(pinId: string): { status: "ok"; grid: TerrainGrid; origin: "saved"; fetchedAt: string } | { status: "error"; message: string } {
      const g = loadSavedGridSync(pinId, deps.dataDir);
      return "error" in g ? { status: "error", message: g.error } : { status: "ok", grid: g.grid, origin: "saved", fetchedAt: g.raw.fetchedAt };
    },
  };
}
