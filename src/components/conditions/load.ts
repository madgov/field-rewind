/**
 * Server-side loaders for the Field conditions page. Each layer is loaded on its own and never throws: a failure becomes
 * a `Part` with the exact message, so one layer failing cannot blank the page. React's cache() makes the sections of one
 * request share one load per layer. Nothing here makes up a value: every result is a saved response, the runtime cache,
 * or a live fetch from the layer's own service (which honours FIELD_REWIND_OFFLINE).
 */
import { cache } from "react";
import { getPowerData } from "@/lib/power";
import { getPowerExtra } from "@/lib/powerExtra";
import { getNdviSeries, loadSavedNdviGrid, loadSavedNdviModis, ndviOriginLine } from "@/lib/ndvi";
import { getLandform } from "@/lib/landform";
import { getGroundTruth, loadSavedGroundTruth } from "@/lib/groundTruth";
import { DEMO_PINS } from "@/lib/demoPins";
import type { ModisSavedFile } from "@/lib/ndvi/modis";
import type { NdviGrid } from "@/lib/ndvi/types";
import type { Part } from "./models";

async function safe<T>(fn: () => Promise<T>): Promise<Part<T>> {
  try {
    return { ok: true, value: await fn() };
  } catch (e) {
    return { ok: false, message: e instanceof Error ? e.message : String(e) };
  }
}

export const loadPower = cache((lat: number, lon: number) => safe(() => getPowerData(lat, lon)));
export const loadExtra = cache((lat: number, lon: number) => safe(() => getPowerExtra(lat, lon)));
export const loadNdvi = cache((lat: number, lon: number) => safe(() => getNdviSeries(lat, lon)));
export const loadLandform = cache((lat: number, lon: number) => safe(() => getLandform(lat, lon)));
export const loadGround = cache((lat: number, lon: number) => safe(() => getGroundTruth(lat, lon)));

/** The saved MODIS record, only for a demo pin that has one (Brentwood). Never fetches. */
export const loadModis = cache((lat: number, lon: number): Promise<ModisSavedFile | null> => {
  const id = demoIdFor(lat, lon);
  return id ? loadSavedNdviModis(id) : Promise.resolve(null);
});

export type NdviGridsPart = Part<{ grids: NdviGrid[]; originLine: string }>;

/** All saved Landsat windows of a demo pin (24 clear dates). Other places have none: the app does not fetch them live. */
export const loadNdviGrids = cache(async (lat: number, lon: number): Promise<NdviGridsPart> => {
  const id = demoIdFor(lat, lon);
  if (!id) {
    return { ok: false, message: "Satellite windows around the pin (21 by 21 Landsat pixels per date) are saved only for the three example places. This place has none, and the app does not fetch them while a page loads." };
  }
  const first = await loadSavedNdviGrid(id);
  if (first.status !== "ok") return { ok: false, message: first.message ?? "The saved satellite windows could not be read." };
  const grids: NdviGrid[] = [];
  for (const d of first.availableDates) {
    const r = await loadSavedNdviGrid(id, d);
    if (r.status === "ok" && r.grid && r.grid.date === d) grids.push(r.grid);
  }
  if (grids.length === 0) return { ok: false, message: "The saved satellite windows hold no dates." };
  return { ok: true, value: { grids, originLine: ndviOriginLine({ origin: "saved", fetchedAt: first.fetchedAt ?? "" }) } };
});

export function demoIdFor(lat: number, lon: number): string | null {
  return DEMO_PINS.find((p) => Math.abs(p.lat - lat) < 0.0005 && Math.abs(p.lon - lon) < 0.0005)?.id ?? null;
}

export { loadSavedGroundTruth };
