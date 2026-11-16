import catalogJson from "../../../data/crops/catalog.json";
import type { Crop, CropCatalog, Sourced } from "./types";

export type { Crop, CropCatalog, Sourced } from "./types";

export const CROP_CATALOG: CropCatalog = catalogJson as CropCatalog;

export type CropUsability = { usable: true } | { usable: false; missing: string[] };

export function getCrop(id: string): Crop | undefined {
  return CROP_CATALOG.crops.find((c) => c.id === id);
}

/**
 * Every WATER parameter a crop must carry to be used in the replay, as [field path, value].
 * The heat threshold is not here: it only feeds the information-only hot-day count and never
 * changes the water result. See heatThresholdKnown().
 */
function requiredFields(crop: Crop): [string, Sourced<unknown>][] {
  return [
    ["kc.ini", crop.kc.ini],
    ["kc.mid", crop.kc.mid],
    ["kc.end", crop.kc.end],
    ["stageDays.ini", crop.stageDays.ini],
    ["stageDays.dev", crop.stageDays.dev],
    ["stageDays.mid", crop.stageDays.mid],
    ["stageDays.late", crop.stageDays.late],
    ["planting.windowStart", crop.planting.windowStart],
    ["planting.windowEnd", crop.planting.windowEnd],
    ["planting.defaultDate", crop.planting.defaultDate],
  ];
}

/** True when the crop has a sourced heat threshold. When false, hot days are reported as unknown (null), never 0. */
export function heatThresholdKnown(crop: Crop): boolean {
  const v = crop.heatThresholdC.value;
  return typeof v === "number" && Number.isFinite(v);
}

export { HEAT_THRESHOLD_UNKNOWN_TEXT } from "./heat";

/** A crop is usable for the water replay only if every water parameter is sourced (non-null). */
export function isCropUsable(crop: Crop): CropUsability {
  const missing = requiredFields(crop)
    .filter(([, f]) => f.value === null || f.value === undefined)
    .map(([path]) => path);
  return missing.length === 0 ? { usable: true } : { usable: false, missing };
}

export function usableCrops(): Crop[] {
  return CROP_CATALOG.crops.filter((c) => isCropUsable(c).usable);
}

export function excludedCrops(): { crop: Crop; missing: string[] }[] {
  const out: { crop: Crop; missing: string[] }[] = [];
  for (const crop of CROP_CATALOG.crops) {
    const u = isCropUsable(crop);
    if (!u.usable) out.push({ crop, missing: u.missing });
  }
  return out;
}
