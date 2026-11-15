import catalogJson from "../../../data/crops/catalog.json";
import type { Crop, CropCatalog, Sourced } from "./types";

export type { Crop, CropCatalog, Sourced } from "./types";

export const CROP_CATALOG: CropCatalog = catalogJson as CropCatalog;

export type CropUsability = { usable: true } | { usable: false; missing: string[] };

export function getCrop(id: string): Crop | undefined {
  return CROP_CATALOG.crops.find((c) => c.id === id);
}

/** Every Sourced value a crop must carry to be used in the replay, as [field path, value]. */
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
    ["heatThresholdC", crop.heatThresholdC],
  ];
}

/** A crop is usable only if every Sourced value is non-null. */
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
