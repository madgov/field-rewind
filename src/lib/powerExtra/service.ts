import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { DEMO_PINS } from "../demoPins";
import { DiskCache } from "../power/cache";
import { PowerFetchError, type ClientOptions } from "../power/client";
import { DEFAULT_END, DEFAULT_START } from "../power/constants";
import { gridCell, validateCoordinates } from "../power/grid";
import { OFFLINE_MESSAGE, offlineFromEnv } from "../power/offline";
import type { PowerSavedFile } from "../power/rawTypes";
import { fetchPowerExtraRaw } from "./client";
import { errorExtraResult, normalizePowerExtra } from "./normalize";
import type { PowerExtraResult } from "./types";

export type PowerExtraServiceDeps = {
  client?: ClientOptions;
  /** Directory holding committed saved responses (<pinId>.json). */
  savedDir?: string;
  cacheDir?: string;
  cacheFallbackDir?: string;
  start?: string;
  end?: string;
  /** Offline switch: no network call, no runtime cache; only saved demo pins. Default: FIELD_REWIND_OFFLINE. */
  offline?: boolean | (() => boolean);
};

export function createPowerExtraService(deps: PowerExtraServiceDeps = {}) {
  const start = deps.start ?? DEFAULT_START;
  const end = deps.end ?? DEFAULT_END;
  const savedDir = deps.savedDir ?? path.join(process.cwd(), "data", "power-extra");
  const disk = new DiskCache(
    deps.cacheDir ?? path.join(process.cwd(), ".cache", "power-extra"),
    deps.cacheFallbackDir ?? path.join(os.tmpdir(), "field-rewind-power-extra-cache"),
  );
  const mem = new Map<string, PowerSavedFile>();
  const inflight = new Map<string, Promise<PowerExtraResult>>();
  const isOffline = () => (typeof deps.offline === "function" ? deps.offline() : (deps.offline ?? offlineFromEnv()));

  function build(saved: PowerSavedFile, lat: number, lon: number, origin: PowerExtraResult["origin"]): PowerExtraResult {
    const same = saved.lat === lat && saved.lon === lon;
    const note = same
      ? undefined
      : `This history was fetched for ${Math.abs(saved.lat)}° ${saved.lat >= 0 ? "N" : "S"}, ${Math.abs(saved.lon)}° ${saved.lon >= 0 ? "E" : "W"} and is shared by every point in the same 0.5-degree grid square (about 50 km across).`;
    return normalizePowerExtra({ lat, lon, responses: saved.responses, fetchedAt: saved.fetchedAt, sourceUrls: saved.sourceUrls, origin, start, end, note });
  }

  async function readSaved(pinId: string): Promise<PowerSavedFile | null> {
    try {
      return JSON.parse(await fs.readFile(path.join(savedDir, `${pinId}.json`), "utf8")) as PowerSavedFile;
    } catch {
      return null;
    }
  }

  async function loadSavedPowerExtra(pinId: string): Promise<PowerExtraResult> {
    const pin = DEMO_PINS.find((p) => p.id === pinId);
    if (!pin) return errorExtraResult({ lat: NaN, lon: NaN, coordsValid: false, start, end, origin: "saved", message: `Unknown demo pin "${pinId}".` });
    const saved = await readSaved(pinId);
    if (!saved) return errorExtraResult({ lat: pin.lat, lon: pin.lon, start, end, origin: "saved", message: `Saved response data/power-extra/${pinId}.json is missing or unreadable.` });
    return normalizePowerExtra({ lat: pin.lat, lon: pin.lon, responses: saved.responses, fetchedAt: saved.fetchedAt, sourceUrls: saved.sourceUrls, origin: "saved", start, end });
  }

  async function liveFetch(lat: number, lon: number, key: string): Promise<PowerExtraResult> {
    let raw;
    try {
      raw = await fetchPowerExtraRaw(lat, lon, start, end, deps.client);
    } catch (e) {
      const msg = e instanceof PowerFetchError || e instanceof Error ? e.message : String(e);
      return errorExtraResult({ lat, lon, start, end, message: msg, origin: "live" });
    }
    const saved: PowerSavedFile = { lat, lon, fetchedAt: raw.fetchedAt, sourceUrls: raw.sourceUrls, responses: raw.responses };
    const result = normalizePowerExtra({ lat, lon, responses: raw.responses, fetchedAt: raw.fetchedAt, sourceUrls: raw.sourceUrls, origin: "live", start, end });
    if (result.status !== "error") {
      mem.set(key, saved);
      await disk.write(key, saved);
    }
    return result;
  }

  async function getPowerExtra(lat: number, lon: number, opts: { fresh?: boolean } = {}): Promise<PowerExtraResult> {
    const bad = validateCoordinates(lat, lon);
    if (bad) return errorExtraResult({ lat, lon, start, end, message: bad, coordsValid: false });
    const cell = gridCell(lat, lon);
    const offline = isOffline();

    if (!opts.fresh) {
      const pin = DEMO_PINS.find((p) => gridCell(p.lat, p.lon).key === cell.key);
      if (pin) {
        const saved = await readSaved(pin.id);
        if (saved) {
          const r = build(saved, lat, lon, "saved");
          if (r.status !== "error") return r;
        }
      }
      const m = offline ? undefined : mem.get(cell.key);
      if (m) return build(m, lat, lon, "cache");
      const d = offline ? null : await disk.read(cell.key);
      if (d) {
        const r = build(d, lat, lon, "cache");
        if (r.status !== "error") {
          mem.set(cell.key, d);
          return r;
        }
      }
    }

    if (offline) return errorExtraResult({ lat, lon, start, end, message: OFFLINE_MESSAGE, origin: "live" });

    const existing = inflight.get(cell.key);
    if (existing && !opts.fresh) {
      const r = await existing;
      const stored = mem.get(cell.key);
      return r.status === "error" || !stored ? r : build(stored, lat, lon, "cache");
    }
    const p = liveFetch(lat, lon, cell.key).finally(() => {
      if (inflight.get(cell.key) === p) inflight.delete(cell.key);
    });
    inflight.set(cell.key, p);
    return p;
  }

  return { getPowerExtra, loadSavedPowerExtra };
}
