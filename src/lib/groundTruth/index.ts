import { createGroundTruthService } from "./service";
import type { GroundTruthResult } from "./types";

export { createGroundTruthService, GROUND_OFFLINE_MESSAGE, matchDemoPin } from "./service";
export type { GroundTruthDeps } from "./service";
export { GROUND_TRUTH_LABEL, groundOriginLine, DAYMET_SOURCE, COCORAHS_SOURCE, CDL_SOURCE, NLCD_SOURCE, NWIS_SOURCE } from "./label";
export { cropHistoryWording, groundCheckWording } from "./wording";
export type { CropHistoryWording, GroundCheckWording } from "./wording";
export { compareDaymetPower, alignDaily, annualPrecip, parseDaymetCsv, daymetDate } from "./daymet";
export { majorityVote, parseCdlValue, toAlbers, blockPoints } from "./cdl";
export { NLCD_CLASSES, nlcdClassFromCode } from "./nlcd";
export { compareToGauge, parseReports, parseStations } from "./gauge";
export type * from "./types";

// Server-side only: uses node:fs. Do not import from client components.
const service = createGroundTruthService();

/** Saved demo pin: ground-truth file only. Works with no network. */
export function loadSavedGroundTruth(pinId: string): Promise<GroundTruthResult> {
  return service.loadSavedGroundTruth(pinId);
}

/**
 * Demo pin (not fresh): the saved file. Otherwise live, all layers in parallel; measured whole-call times were 17 to 34 s (Daymet ~2-3 s, NLCD <1 s, CDL 154 small requests is most of it)
 * + NWIS wells (a few seconds); the CoCoRaHS gauge check runs only for configured example places. Offline switch: structured error.
 * Annual rain series for a chart: result.daymet.data.precipAnnual.rows.
 */
export function getGroundTruth(lat: number, lon: number, opts?: { fresh?: boolean }): Promise<GroundTruthResult> {
  return service.getGroundTruth(lat, lon, opts);
}
