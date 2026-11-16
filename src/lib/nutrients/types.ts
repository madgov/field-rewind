import type { Sourced } from "../crops/types";

export type NutrientKey = "n" | "p2o5" | "k2o";
export const NUTRIENT_KEYS: readonly NutrientKey[] = ["n", "p2o5", "k2o"] as const;
export const NUTRIENT_LABEL: Record<NutrientKey, string> = {
  n: "Nitrogen (N)",
  p2o5: "Phosphorus (as P2O5)",
  k2o: "Potassium (as K2O)",
};

/** A second published reading of the same removal figures, kept so the spread between sources can be shown. */
export type RemovalAlternative = {
  label: string;
  unit: string;
  n: number | null;
  p2o5: number | null;
  k2o: number | null;
  source: string;
  url?: string;
  page: string;
  note?: string;
};

export type CropNutrients = {
  /** Matches Crop.id in data/crops/catalog.json */
  cropId: string;
  /** What one unit of yield is, e.g. "bushel of grain". The user's yield must be entered in this unit. */
  yieldUnit: string;
  yieldUnitNote: string;
  /** Nutrient removed in the harvested product, per one yield unit (see each value's note for the printed unit). */
  removalPerUnit: Record<NutrientKey, Sourced<number>>;
  removalAlternatives: RemovalAlternative[];
  /** Nitrogen fixed by the crop, lb N per acre per season. null value = unknown (never assumed zero). */
  nFixationLbPerAcre: { low: Sourced<number>; high: Sourced<number> };
};

/** Nitrogen fertilizer credit for the crop that follows a given crop (a printed pair). */
export type RotationCredit = {
  fromCropId: string;
  toCropId: string;
  lbNPerAcre: Sourced<number>;
};

export type NutrientCatalog = {
  compiledOn: string;
  note: string;
  crops: CropNutrients[];
  rotationCredits: RotationCredit[];
};
