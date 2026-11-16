import nutrientsJson from "../../../data/crops/nutrients.json";
import { NUTRIENT_KEYS } from "./types";
import type { CropNutrients, NutrientCatalog, NutrientKey, RotationCredit } from "./types";

export * from "./types";

export const NUTRIENT_CATALOG: NutrientCatalog = nutrientsJson as NutrientCatalog;

export const NUTRIENT_CAVEAT =
  "Nutrient figures are published averages for harvested product from other regions, not a soil test and not a measurement of this field.";

export function getNutrients(cropId: string): CropNutrients | undefined {
  return NUTRIENT_CATALOG.crops.find((c) => c.cropId === cropId);
}

export type RemovalResult = {
  cropId: string;
  yieldUnit: string;
  yieldPerAcre: number;
  /** lb per acre removed in the harvested product, null where the removal figure is unknown. */
  lbPerAcre: Record<NutrientKey, number | null>;
  /** Nutrients with no sourced figure for this crop. */
  unknown: NutrientKey[];
};

/** Removal for one crop at a stated yield (in the crop's yield unit per acre). Never fills a missing figure. */
export function removalAtYield(cropId: string, yieldPerAcre: number): RemovalResult | { error: string } {
  const c = getNutrients(cropId);
  if (!c) return { error: `No nutrient entry for crop "${cropId}".` };
  if (!Number.isFinite(yieldPerAcre) || yieldPerAcre < 0) return { error: "Yield must be a number of zero or more." };
  const lbPerAcre = { n: null, p2o5: null, k2o: null } as Record<NutrientKey, number | null>;
  const unknown: NutrientKey[] = [];
  for (const k of NUTRIENT_KEYS) {
    const v = c.removalPerUnit[k].value;
    if (v === null || v === undefined) unknown.push(k);
    else lbPerAcre[k] = v * yieldPerAcre;
  }
  return { cropId, yieldUnit: c.yieldUnit, yieldPerAcre, lbPerAcre, unknown };
}

export function creditsBetween(fromCropId: string, toCropId: string, credits: RotationCredit[] = NUTRIENT_CATALOG.rotationCredits): RotationCredit[] {
  return credits.filter(
    (r) => r.fromCropId === fromCropId && r.toCropId === toCropId && r.lbNPerAcre.value !== null,
  );
}

/** True when a printed nitrogen-fixation range exists for this crop. */
export function fixationKnown(cropId: string): boolean {
  const c = getNutrients(cropId);
  return !!c && c.nFixationLbPerAcre.low.value !== null && c.nFixationLbPerAcre.high.value !== null;
}
