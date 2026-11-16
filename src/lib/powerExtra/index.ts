import { createPowerExtraService } from "./service";
import type { PowerExtraResult } from "./types";

export type { ExtraField, PowerExtraDay, PowerExtraResult, PowerExtraStatus } from "./types";
export { POWER_EXTRA_LABEL, SOIL_MODELLED_NOTE, POWER_EXTRA_PARAMETERS, POWER_EXTRA_PARAMETER_CATALOGUE_URL } from "./constants";
export { createPowerExtraService } from "./service";
export type { PowerExtraServiceDeps } from "./service";
export { normalizePowerExtra, errorExtraResult } from "./normalize";
export { fetchPowerExtraRaw, buildPowerExtraUrl } from "./client";
export { computeFrost, crossCheckFrostFlag, frostYear, frostDateOf, refDayText, FROST_DEFINITION } from "./frost";
export type { FrostResult, FrostYear, FrostDate, FrostCrossCheck, DateMetric } from "./frost";
export { computeSoilWetness, GROWING_SEASON, DRY_DAY_PERCENTILE, SOIL_DEFINITION } from "./soil";
export type { SoilWetnessResult, SoilYear } from "./soil";
export { computeSkinTemperature } from "./heat";
export type { SkinTemperatureResult, SkinTempYear } from "./heat";
export { compareSeries, periodOf } from "./stats";
export type { MetricCompare } from "./stats";
export { frostWording, soilWetnessWording, skinTemperatureWording, powerExtraLabel } from "./wording";
export type { Wording } from "./wording";

// Server-side only: uses node:fs and the runtime cache. Do not import from client components
// (client components may import POWER_EXTRA_LABEL and the pure compute/wording modules directly).
const service = createPowerExtraService();

/** Saved demo pin, else runtime cache, else live NASA POWER. Never fabricates data. */
export function getPowerExtra(lat: number, lon: number, opts?: { fresh?: boolean }): Promise<PowerExtraResult> {
  return service.getPowerExtra(lat, lon, opts);
}

/** Reads only the committed saved file for a demo pin. Works with no network. */
export function loadSavedPowerExtra(pinId: string): Promise<PowerExtraResult> {
  return service.loadSavedPowerExtra(pinId);
}
