import { GRID_RADIUS_PX, LIVE_MAX_SCENES, NDVI_UNITS, SCENE_CONCURRENCY } from "./constants";
import { geotiffReader, type RasterReader } from "./cog";
import { NdviHttpError, type HttpOptions } from "./http";
import { satelliteName } from "./math";
import { readScene } from "./scene";
import { NDVI_LABEL, NDVI_SOURCES } from "./sources";
import { searchScenes, type StacItem } from "./stac";
import { TokenManager } from "./token";
import type { NdviCounts, NdviGrid, NdviObservation, NdviSeriesResult } from "./types";

export type RetrieveDeps = HttpOptions & {
  reader?: RasterReader;
  tokens?: TokenManager;
  /** Max scenes read at once. */
  concurrency?: number;
  /** Called after each scene (for sparse progress logging in scripts). */
  onProgress?: (done: number, total: number) => void;
  now?: () => Date;
  timeoutMs?: number;
};

/** Run async work over items with at most `limit` in flight; results keep input order. */
export async function mapLimit<T, R>(items: T[], limit: number, fn: (item: T, i: number) => Promise<R>): Promise<R[]> {
  const out = new Array<R>(items.length);
  let next = 0;
  const worker = async () => {
    while (next < items.length) {
      const i = next++;
      out[i] = await fn(items[i], i);
    }
  };
  await Promise.all(Array.from({ length: Math.max(1, Math.min(limit, items.length)) }, worker));
  return out;
}

/** Evenly thin a date-sorted list to at most `cap` items (keeps first and last). */
export function thinEvenly<T>(items: T[], cap: number): T[] {
  if (items.length <= cap) return items;
  if (cap <= 1) return items.slice(0, cap);
  return Array.from({ length: cap }, (_, k) => items[Math.round((k * (items.length - 1)) / (cap - 1))]);
}

export type RetrieveParams = {
  lat: number;
  lon: number;
  start: string;
  end: string;
  /** Max scenes to read; extra scenes are thinned evenly and reported. */
  maxScenes?: number;
  pinId?: string;
  /** Platforms to include (STAC `platform` values). Default: Landsat 5, 7, 8, 9 (verified, see docs/ndvi.md). */
  platforms?: string[];
};

export const DEFAULT_PLATFORMS = ["landsat-5", "landsat-7", "landsat-8", "landsat-9"];

/**
 * Landsat NDVI observations for the pixel containing the point, for every scene in the period (up to maxScenes).
 * Scenes that cannot be read after retries are counted in counts.failed and listed in notes; nothing is invented.
 */
export async function retrieveSeries(p: RetrieveParams, deps: RetrieveDeps = {}): Promise<NdviSeriesResult> {
  const now = deps.now ?? (() => new Date());
  const base = { lat: p.lat, lon: p.lon, pinId: p.pinId, units: NDVI_UNITS, label: NDVI_LABEL, sources: NDVI_SOURCES, period: { start: p.start, end: p.end } };
  const emptyCounts: NdviCounts = { scenesFound: 0, scenesRead: 0, clear: 0, masked: 0, failed: 0, skippedByCap: 0 };
  let items: StacItem[];
  try {
    items = await searchScenes({ lat: p.lat, lon: p.lon, start: p.start, end: p.end }, deps);
  } catch (e) {
    return { ...base, status: "error", origin: "live", fetchedAt: now().toISOString(), observations: [], satellites: [], counts: emptyCounts, notes: [], message: `Could not search the Landsat archive: ${e instanceof Error ? e.message : String(e)}` };
  }
  const allowed = new Set(p.platforms ?? DEFAULT_PLATFORMS);
  items = items.filter((i) => allowed.has(String(i.properties.platform)));
  const found = items.length;
  const cap = p.maxScenes ?? Number.POSITIVE_INFINITY;
  const chosen = thinEvenly(items, cap);
  const reader = deps.reader ?? geotiffReader;
  const tokens = deps.tokens ?? new TokenManager({ fetchImpl: deps.fetchImpl, sleep: deps.sleep, maxRetries: deps.maxRetries, backoffBaseMs: deps.backoffBaseMs });
  let done = 0;
  const failures: string[] = [];
  const reads = await mapLimit(chosen, deps.concurrency ?? SCENE_CONCURRENCY, async (item) => {
    try {
      const r = await readScene(item, p.lat, p.lon, 0, { ...deps, reader, tokens });
      return r;
    } catch (e) {
      failures.push(`${String(item.properties.datetime ?? "").slice(0, 10)} ${satelliteName(item.properties.platform)}: ${e instanceof NdviHttpError || e instanceof Error ? e.message : String(e)}`);
      return null;
    } finally {
      deps.onProgress?.(++done, chosen.length);
    }
  });

  const obs = new Map<string, NdviObservation>();
  let read = 0;
  let masked = 0;
  for (const r of reads) {
    if (!r) continue;
    read++;
    if (r.centerNdvi === null) {
      masked++;
      continue;
    }
    const key = `${r.date}|${r.satellite}`;
    if (!obs.has(key)) obs.set(key, { date: r.date, ndvi: Math.round(r.centerNdvi * 1000) / 1000, satellite: r.satellite, sceneId: r.sceneId });
  }
  const observations = [...obs.values()].sort((a, b) => a.date.localeCompare(b.date) || a.satellite.localeCompare(b.satellite));
  const counts: NdviCounts = { scenesFound: found, scenesRead: read, clear: observations.length, masked, failed: chosen.length - read, skippedByCap: found - chosen.length };

  const notes: string[] = [];
  if (counts.skippedByCap > 0) notes.push(`${counts.skippedByCap} of ${found} candidate scenes were skipped to keep the request short (scenes were thinned evenly in time).`);
  if (counts.failed > 0) notes.push(`${counts.failed} scene(s) could not be read after retries and are missing from the series. First error: ${failures[0]}`);
  const status = found === 0 || observations.length === 0 ? (counts.failed > 0 && read === 0 ? "error" : "no-coverage") : counts.failed > 0 || counts.skippedByCap > 0 ? "partial" : "ok";
  const message =
    status === "no-coverage" ? (found === 0 ? "No Landsat scenes with low cloud cover were found for this point and period." : "Landsat scenes were found, but the pixel at this point was cloudy, shadowed or otherwise masked in every one.") : status === "error" ? `Every Landsat read failed. First error: ${failures[0]}` : undefined;
  return { ...base, status, origin: "live", fetchedAt: now().toISOString(), observations, satellites: [...new Set(observations.map((o) => o.satellite))], counts, notes, message };
}

/** Read the 21 x 21 window for each given scene (used by the fetch script for chosen dates). */
export async function retrieveGrids(
  items: StacItem[],
  lat: number,
  lon: number,
  deps: RetrieveDeps = {},
  radius = GRID_RADIUS_PX,
): Promise<{ grids: NdviGrid[]; failed: number }> {
  const reader = deps.reader ?? geotiffReader;
  const tokens = deps.tokens ?? new TokenManager({ fetchImpl: deps.fetchImpl, sleep: deps.sleep, maxRetries: deps.maxRetries, backoffBaseMs: deps.backoffBaseMs });
  let failed = 0;
  const reads = await mapLimit(items, deps.concurrency ?? SCENE_CONCURRENCY, async (item) => {
    try {
      return await readScene(item, lat, lon, radius, { ...deps, reader, tokens });
    } catch {
      failed++;
      return null;
    }
  });
  return { grids: reads.flatMap((r) => (r?.grid ? [r.grid] : [])), failed };
}

export { LIVE_MAX_SCENES };
