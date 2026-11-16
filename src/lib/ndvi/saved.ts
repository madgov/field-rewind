import fs from "node:fs/promises";
import path from "node:path";
import { DEMO_PINS } from "../demoPins";
import { NDVI_UNITS } from "./constants";
import { NDVI_GRID_LABEL, NDVI_LABEL, NDVI_SOURCES } from "./sources";
import { dayNumber } from "./indicators";
import type { NdviGridResult, NdviGridsFile, NdviSavedFile, NdviSeriesResult } from "./types";

const dir = (d?: string) => d ?? path.join(process.cwd(), "data", "ndvi");

async function readJson<T>(file: string): Promise<T | null> {
  try {
    return JSON.parse(await fs.readFile(file, "utf8")) as T;
  } catch {
    return null;
  }
}

function errorSeries(lat: number, lon: number, message: string, pinId?: string): NdviSeriesResult {
  return {
    status: "error", lat, lon, pinId, origin: "saved", fetchedAt: new Date(0).toISOString(), units: NDVI_UNITS, label: NDVI_LABEL, sources: NDVI_SOURCES,
    period: null, observations: [], satellites: [], counts: { scenesFound: 0, scenesRead: 0, clear: 0, masked: 0, failed: 0, skippedByCap: 0 }, notes: [], message,
  };
}
export { errorSeries };

/** Reads only the committed data/ndvi/<pinId>.json. No network. */
export async function loadSavedNdvi(pinId: string, dataDir?: string): Promise<NdviSeriesResult> {
  const pin = DEMO_PINS.find((p) => p.id === pinId);
  if (!pin) return errorSeries(NaN, NaN, `Unknown demo pin "${pinId}".`);
  const f = await readJson<NdviSavedFile>(path.join(dir(dataDir), `${pinId}.json`));
  if (!f || !Array.isArray(f.observations)) return errorSeries(pin.lat, pin.lon, `Saved satellite data data/ndvi/${pinId}.json is missing or unreadable.`, pinId);
  const sats = [...new Set(f.observations.map((o) => o.satellite))];
  return {
    status: f.observations.length ? (f.counts.failed > 0 ? "partial" : "ok") : "no-coverage",
    lat: pin.lat, lon: pin.lon, pinId, origin: "saved", fetchedAt: f.fetchedAt, units: f.units, label: f.label, sources: f.sources,
    period: f.period, observations: f.observations, satellites: sats, counts: f.counts, notes: f.notes,
  };
}

/** Saved 21 x 21 NDVI window for a date. Without dateIso: the most recent saved date. With dateIso: the nearest saved date (daysOff says how far). */
export async function loadSavedNdviGrid(pinId: string, dateIso?: string, dataDir?: string): Promise<NdviGridResult> {
  const fail = (message: string, availableDates: string[] = [], fetchedAt: string | null = null): NdviGridResult => ({ status: "error", origin: "saved", fetchedAt, label: NDVI_GRID_LABEL, availableDates, requestedDate: dateIso, message });
  if (!DEMO_PINS.some((p) => p.id === pinId)) return fail(`Unknown demo pin "${pinId}".`);
  const f = await readJson<NdviGridsFile>(path.join(dir(dataDir), `${pinId}-grids.json`));
  if (!f || !Array.isArray(f.grids)) return fail(`Saved satellite windows data/ndvi/${pinId}-grids.json are missing or unreadable.`);
  const dates = f.grids.map((g) => g.date).sort();
  if (!dates.length) return fail("No saved satellite windows for this place.", [], f.fetchedAt);
  let target = dates[dates.length - 1];
  if (dateIso) {
    if (Number.isNaN(Date.parse(dateIso))) return fail(`"${dateIso}" is not a valid date.`, dates, f.fetchedAt);
    const t = dayNumber(dateIso);
    target = dates.reduce((a, b) => (Math.abs(dayNumber(b) - t) < Math.abs(dayNumber(a) - t) ? b : a));
  }
  const grid = f.grids.find((g) => g.date === target)!;
  return { status: "ok", origin: "saved", fetchedAt: f.fetchedAt, label: NDVI_GRID_LABEL, availableDates: dates, requestedDate: dateIso, daysOff: dateIso ? Math.abs(dayNumber(target) - dayNumber(dateIso)) : 0, grid };
}
