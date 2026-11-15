/**
 * The crop catalog holds California values (FAO-56 California rows, California planting windows; see data/crops/catalog.json
 * "region"). This file decides, roughly, whether a pin is outside California so the app can warn that planting dates and
 * stage lengths may not match local practice there.
 *
 * APPROXIMATE on purpose: a bounding box (about 32.5 to 42.0 N, 124.5 to 114.1 W) with the Nevada border cut off by two straight
 * lines (due south along 120 W from 42 N to 39 N, then a diagonal to the Colorado River near 35 N, 114.6 W). It does not use real
 * state borders, so points within a few tens of kilometres of the border can be classed wrongly, and it does not check land
 * versus ocean. A warning is shown only when the pin is clearly outside; never treat "inside" as proof that local practice matches.
 */
import { CROP_CATALOG } from "./catalog";

const SOUTH = 32.5;
const NORTH = 42.0;
const WEST = -124.5;
const EAST_FAR = -114.1;
const NV_START_LAT = 39.0;
const NV_START_LON = -120.0;
const NV_END_LAT = 35.0;
const NV_END_LON = -114.63;

export function isApproxInCalifornia(lat: number, lon: number): boolean {
  if (!Number.isFinite(lat) || !Number.isFinite(lon)) return false;
  if (lat < SOUTH || lat > NORTH || lon < WEST || lon > EAST_FAR) return false;
  let eastLimit: number;
  if (lat >= NV_START_LAT) eastLimit = NV_START_LON;
  else if (lat > NV_END_LAT) eastLimit = NV_START_LON + ((NV_START_LAT - lat) / (NV_START_LAT - NV_END_LAT)) * (NV_END_LON - NV_START_LON);
  else eastLimit = EAST_FAR;
  return lon <= eastLimit;
}

export type CropRegionNotice = {
  /** The catalog's own region text. */
  region: string;
  outsideCalifornia: boolean;
  /** Plain-English warning, or null inside California. */
  warning: string | null;
  /** One-sentence version for the one-page printed report. */
  shortWarning: string | null;
};

export function cropRegionNotice(lat: number, lon: number, region: string = CROP_CATALOG.region): CropRegionNotice {
  const outside = !isApproxInCalifornia(lat, lon);
  return {
    region,
    outsideCalifornia: outside,
    warning: outside
      ? "This place looks to be outside California, but the crop values here are California values. Planting dates and stage lengths are from California and may not match local practice. Read the results as how these California-style crops would have fared in this weather, not as a forecast for local farming."
      : null,
    shortWarning: outside
      ? "Outside California: planting dates and stage lengths are California values and may not match local practice."
      : null,
  };
}
