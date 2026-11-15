import type { PowerResult } from "../types";
import { createPowerService } from "./service";

export { createPowerService } from "./service";
export type { PowerServiceDeps } from "./service";
export { OFFLINE_ENV, OFFLINE_MESSAGE, offlineFromEnv } from "./offline";
export { gridCell, validateCoordinates, roundToHalf } from "./grid";
export { normalizePower, errorResult } from "./normalize";
export { fetchPowerRaw, fetchPowerUrl, buildPowerUrl, PowerFetchError } from "./client";
export { splitDateRange, enumerateDays } from "./dates";

// Server-side only: uses node:fs and the runtime cache. Do not import from client components.
const service = createPowerService();

/** Cache-aware lookup: saved demo pin, else runtime cache, else live NASA POWER. Never fabricates data. */
export function getPowerData(lat: number, lon: number, opts?: { fresh?: boolean }): Promise<PowerResult> {
  return service.getPowerData(lat, lon, opts);
}

/** Reads only the committed saved file for a demo pin. Works with no network. */
export function loadSavedDemoPin(pinId: string): Promise<PowerResult> {
  return service.loadSavedDemoPin(pinId);
}
