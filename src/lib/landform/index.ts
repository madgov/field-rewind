/**
 * Soil, terrain and erosion-risk layer. Server-side only (uses node:fs and the network). Pure helpers can be imported
 * directly from "./soil", "./terrain", "./erosion", "./wording" and "./label" by client code.
 */
import { createLandformService } from "./service";
import type { LandformResult, TerrainGrid } from "./types";

export { createLandformService, LANDFORM_OFFLINE_MESSAGE } from "./service";
export type { LandformServiceDeps } from "./service";
export { LANDFORM_LABEL, TERRAIN_SOURCE_LABEL, SOIL_SOURCE_LABEL, TERRAIN_CAVEAT, SOIL_US_ONLY_NOTE, landformOriginLine, landformDataLabel } from "./label";
export { LANDFORM_POINTS, SAMPLE_POINTS, findSavedPoint } from "./pins";
export { textureClass, componentAwcMm, profileAwc, hydrologicGroupMeaning, kfClassRank, deriveSoil, HSG_MEANING, HSG_SOURCE, KF_CLASSES } from "./soil";
export { hornSlopeAspect, deriveTerrain, summarizeGrid, relativeElevation, compassName, metersPerDegree, slopePercentFromDegrees } from "./terrain";
export { erosionIndicator, slopeBand, SLOPE_BANDS, EROSION_LABEL } from "./erosion";
export { landformWording, terrainWording, soilWording, erosionWording } from "./wording";
export { parseSdaTable, parseSoil, SDA_NO_COVERAGE_MESSAGE } from "./sda";
export type * from "./types";
export type { LandformWording } from "./wording";

const service = createLandformService();

/** Saved place, else cache, else live NASADEM + Soil Data Access. Never fabricates data. Offline switch honoured. */
export function getLandform(lat: number, lon: number, opts?: { fresh?: boolean }): Promise<LandformResult> {
  return service.getLandform(lat, lon, opts);
}

/** Saved response for a demo pin id ("brentwood", "fresno", "ludhiana") or the sample point "orange-cove", without the grid. */
export function loadSavedLandform(pinId: string): Promise<LandformResult> {
  return Promise.resolve(service.loadSavedLandform(pinId));
}

/** Saved slope/elevation/aspect grid with lon/lat bounds, for drawing an overlay. */
export function loadSavedLandformGrid(pinId: string): Promise<{ status: "ok"; grid: TerrainGrid; origin: "saved"; fetchedAt: string } | { status: "error"; message: string }> {
  return Promise.resolve(service.loadSavedLandformGrid(pinId));
}
