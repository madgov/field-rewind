import { excludedCrops } from "@/lib/crops/catalog";
import type { Crop } from "@/lib/crops/types";
import { resolveCropCached } from "@/lib/replay";
import type { ExcludedCrop } from "../replay/CropSources";

const FIELD_LABELS: Record<string, string> = {
  "kc.ini": "crop factor, initial stage",
  "kc.mid": "crop factor, mid-season",
  "kc.end": "crop factor, end of season",
  "stageDays.ini": "initial stage length",
  "stageDays.dev": "development stage length",
  "stageDays.mid": "mid-season length",
  "stageDays.late": "late-season length",
  "planting.windowStart": "planting window start",
  "planting.windowEnd": "planting window end",
  "planting.defaultDate": "default planting date",
  heatThresholdC: "heat threshold",
};

function fieldOf(crop: Crop, path: string) {
  let cur: unknown = crop;
  for (const p of path.split(".")) cur = (cur as Record<string, unknown>)[p];
  return cur as { source: string; page: string; url?: string; note?: string };
}

/** Crops left out of the replay and why, with the source of each missing value. */
export function buildExcludedCrops(): ExcludedCrop[] {
  return excludedCrops().map(({ crop, missing }) => {
    const r = resolveCropCached(crop);
    return {
      id: crop.id,
      name: crop.name,
      reason: r.ok ? `${crop.name} is left out.` : r.reason,
      fields: missing.map((path) => {
        const f = fieldOf(crop, path);
        return { label: FIELD_LABELS[path] ?? path, source: f.source, page: f.page, url: f.url ?? null, note: f.note ?? null };
      }),
    };
  });
}
