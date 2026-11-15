import fs from "node:fs/promises";
import path from "node:path";
import { DEMO_PINS } from "../demoPins";
import type { PowerResult } from "../types";
import { DiskCache } from "./cache";
import { fetchPowerRaw, PowerFetchError, type ClientOptions } from "./client";
import { DEFAULT_END, DEFAULT_START } from "./constants";
import { gridCell, validateCoordinates } from "./grid";
import { errorResult, normalizePower } from "./normalize";
import type { PowerSavedFile } from "./rawTypes";

export type PowerServiceDeps = {
  client?: ClientOptions;
  /** Directory holding committed saved responses (<pinId>.json). */
  savedDir?: string;
  /** Preferred runtime cache dir; falls back to the OS temp dir if not writable. */
  cacheDir?: string;
  /** Where to cache when cacheDir is not writable (default: OS temp dir). */
  cacheFallbackDir?: string;
  start?: string;
  end?: string;
};

export function createPowerService(deps: PowerServiceDeps = {}) {
  const start = deps.start ?? DEFAULT_START;
  const end = deps.end ?? DEFAULT_END;
  const savedDir = deps.savedDir ?? path.join(process.cwd(), "data", "power");
  const disk = new DiskCache(deps.cacheDir ?? path.join(process.cwd(), ".cache", "power"), deps.cacheFallbackDir);
  const mem = new Map<string, PowerSavedFile>();
  const inflight = new Map<string, Promise<PowerResult>>();

  /** Normalize a stored/fetched wrapper for the requested point, noting cell sharing when points differ. */
  function build(saved: PowerSavedFile, lat: number, lon: number, origin: PowerResult["origin"]): PowerResult {
    const same = saved.lat === lat && saved.lon === lon;
    const note = same ? undefined : `Data was fetched for ${saved.lat}, ${saved.lon} and is shared by every point in this 0.5-degree cell.`;
    return normalizePower({ lat, lon, responses: saved.responses, fetchedAt: saved.fetchedAt, sourceUrls: saved.sourceUrls, origin, start, end, note });
  }

  async function readSaved(pinId: string): Promise<PowerSavedFile | null> {
    try {
      return JSON.parse(await fs.readFile(path.join(savedDir, `${pinId}.json`), "utf8")) as PowerSavedFile;
    } catch {
      return null;
    }
  }

  async function loadSavedDemoPin(pinId: string): Promise<PowerResult> {
    const pin = DEMO_PINS.find((p) => p.id === pinId);
    if (!pin) return errorResult({ lat: NaN, lon: NaN, coordsValid: false, start, end, origin: "saved", message: `Unknown demo pin "${pinId}".` });
    const saved = await readSaved(pinId);
    if (!saved) return errorResult({ lat: pin.lat, lon: pin.lon, start, end, origin: "saved", message: `Saved response data/power/${pinId}.json is missing or unreadable.` });
    return normalizePower({ lat: pin.lat, lon: pin.lon, responses: saved.responses, fetchedAt: saved.fetchedAt, sourceUrls: saved.sourceUrls, origin: "saved", start, end });
  }

  async function liveFetch(lat: number, lon: number, key: string): Promise<PowerResult> {
    let raw;
    try {
      raw = await fetchPowerRaw(lat, lon, start, end, deps.client);
    } catch (e) {
      const msg = e instanceof PowerFetchError || e instanceof Error ? e.message : String(e);
      return errorResult({ lat, lon, start, end, message: msg, origin: "live" });
    }
    const saved: PowerSavedFile = { lat, lon, fetchedAt: raw.fetchedAt, sourceUrls: raw.sourceUrls, responses: raw.responses };
    const result = normalizePower({ lat, lon, responses: raw.responses, fetchedAt: raw.fetchedAt, sourceUrls: raw.sourceUrls, origin: "live", start, end });
    if (result.status !== "error") {
      mem.set(key, saved);
      await disk.write(key, saved);
    }
    return result;
  }

  async function getPowerData(lat: number, lon: number, opts: { fresh?: boolean } = {}): Promise<PowerResult> {
    const bad = validateCoordinates(lat, lon);
    if (bad) return errorResult({ lat, lon, start, end, message: bad, coordsValid: false });
    const cell = gridCell(lat, lon);

    if (!opts.fresh) {
      // (a) committed saved response of a demo pin in the same cell
      const pin = DEMO_PINS.find((p) => gridCell(p.lat, p.lon).key === cell.key);
      if (pin) {
        const saved = await readSaved(pin.id);
        if (saved) {
          const r = build(saved, lat, lon, "saved");
          if (r.status !== "error") return r;
        }
      }
      // (b) runtime cache: memory, then disk
      const m = mem.get(cell.key);
      if (m) return build(m, lat, lon, "cache");
      const d = await disk.read(cell.key);
      if (d) {
        const r = build(d, lat, lon, "cache");
        if (r.status !== "error") {
          mem.set(cell.key, d);
          return r;
        }
      }
    }

    // (c) live fetch at the exact requested point (deduplicated per cell)
    const existing = inflight.get(cell.key);
    if (existing && !opts.fresh) {
      const r = await existing;
      const stored = mem.get(cell.key);
      // another request just fetched this cell; serve it as a cache hit for our point
      return r.status === "error" || !stored ? r : build(stored, lat, lon, "cache");
    }
    const p = liveFetch(lat, lon, cell.key).finally(() => {
      if (inflight.get(cell.key) === p) inflight.delete(cell.key);
    });
    inflight.set(cell.key, p);
    return p;
  }

  return { getPowerData, loadSavedDemoPin };
}
