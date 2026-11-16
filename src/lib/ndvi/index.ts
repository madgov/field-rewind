// Server-side only (node:fs, network). Do not import from client components; pass results to them as props.
import { createNdviService } from "./service";
import type { NdviSeriesResult } from "./types";

export { createNdviService } from "./service";
export type { NdviServiceDeps } from "./service";
export { loadSavedNdviGrid } from "./saved";
export { loadSavedNdviModis } from "./modisSaved";
export { computeNdviIndicators, yearlyPeaks, smoothedYearCurve, interpolatedYearCurve, greenUpForYear, barePeriods, stressFlags } from "./indicators";
export type { NdviIndicators, YearPeak, GreenUp, BarePeriod, StressFlag, CurvePoint } from "./indicators";
export { ndviWording, NDVI_CAVEAT } from "./wording";
export type { NdviWording, NdviWordingOptions } from "./wording";
export { NDVI_LABEL, NDVI_GRID_LABEL, NDVI_SOURCES, NDVI_UNITS_LABEL, ndviOriginLine, MODIS_SOURCE } from "./sources";
export { NDVI_OFFLINE_MESSAGE } from "./offline";
export type * from "./types";

const service = createNdviService();

/** Saved demo pin, else live Landsat read (slow: tens of seconds, capped at 40 scenes), else a structured error. Offline switch honoured. */
export function getNdviSeries(lat: number, lon: number, opts?: { fresh?: boolean }): Promise<NdviSeriesResult> {
  return service.getNdviSeries(lat, lon, opts);
}

/** Reads only the committed data/ndvi/<pinId>.json. Works with no network. */
export function loadSavedNdvi(pinId: string): Promise<NdviSeriesResult> {
  return service.loadSavedNdvi(pinId);
}
