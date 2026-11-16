import { getCrop } from "../crops/catalog";
import { creditsBetween, fixationKnown, getNutrients, removalAtYield, NUTRIENT_KEYS } from "../nutrients";
import type { NutrientKey } from "../nutrients";

export const SOILHEALTH_LABEL =
  "Estimated nutrient removal from published crop-removal averages and your yield assumptions. It does not measure nutrients remaining in the soil or changes in soil health. It is not a soil test and not a prediction.";

export type RotationNutrientInput = {
  name: string;
  /** Crop ids, one per season, repeating in a cycle (same shape as the replay). */
  sequence: string[];
};

/** Yield per acre for each crop, in that crop's own yield unit (see getNutrients(id).yieldUnit). */
export type YieldInputs = Record<string, number | undefined>;

export type CropRemovalLine = {
  cropId: string;
  cropName: string;
  yieldUnit: string;
  /** null when the user gave no yield for this crop */
  yieldPerAcre: number | null;
  lbPerAcre: Record<NutrientKey, number | null>;
  /** Why a nutrient is null for this crop: "no yield entered" or "no sourced removal figure". */
  missing: Partial<Record<NutrientKey, "no yield entered" | "no sourced removal figure">>;
};

export type CycleNutrient = {
  /** Sum over one full cycle of the sequence, lb per acre. Null when any season's figure is unknown. */
  totalLbPerAcre: number | null;
  /** totalLbPerAcre divided by the number of seasons in the cycle. */
  perSeasonLbPerAcre: number | null;
  /** Crop ids that made the total unknown. */
  unknownFor: string[];
};

export type Replenishment = {
  /** "unknown" = no crop in the cycle has a sourced nitrogen-fixation figure. */
  fixation: { status: "none-known" | "some-known" | "all-known"; knownFor: string[]; unknownFor: string[] };
  /** Printed fertilizer credits that apply to a pair of neighbouring crops in this cycle. */
  credits: { fromCropId: string; toCropId: string; lbNPerAcre: number; source: string; page: string; note?: string }[];
};

export type RotationFlags = {
  /** Same crop in two neighbouring seasons (including the wrap from the last season to the first). */
  sameCropBackToBack: boolean;
  /** One crop only in the whole cycle. */
  singleCrop: boolean;
  distinctCrops: number;
  seasonsInCycle: number;
};

export type WaterFigure = { short: number; evaluable: number; supplyMm: number };

export type RotationNutrientResult = {
  name: string;
  sequence: string[];
  perCrop: CropRemovalLine[];
  cycle: Record<NutrientKey, CycleNutrient>;
  replenishment: Replenishment;
  flags: RotationFlags;
  /** From the replay when given: seasons short of water out of seasons judged, at the supply used. */
  water: WaterFigure | null;
  problems: string[];
};

export type RotationComparison = {
  label: string;
  rotations: RotationNutrientResult[];
  /** Per nutrient: rotation names ordered from least to most removed per season, only when every rotation has a known figure. */
  orderedByRemoval: Record<NutrientKey, { comparable: boolean; names: string[] }>;
  notes: string[];
};

function round(v: number): number {
  return Math.round(v * 100) / 100;
}

export function analyzeRotation(
  rot: RotationNutrientInput,
  yields: YieldInputs,
  water?: WaterFigure | null,
): RotationNutrientResult {
  const problems: string[] = [];
  const seq = rot.sequence;
  if (seq.length === 0) problems.push("The rotation has no crops.");

  const perCropMap = new Map<string, CropRemovalLine>();
  for (const id of new Set(seq)) {
    const crop = getCrop(id);
    const nut = getNutrients(id);
    if (!crop || !nut) {
      problems.push(`No nutrient entry for crop "${id}".`);
      continue;
    }
    const y = yields[id];
    const line: CropRemovalLine = {
      cropId: id,
      cropName: crop.name,
      yieldUnit: nut.yieldUnit,
      yieldPerAcre: typeof y === "number" && Number.isFinite(y) && y >= 0 ? y : null,
      lbPerAcre: { n: null, p2o5: null, k2o: null },
      missing: {},
    };
    if (line.yieldPerAcre === null) {
      for (const k of NUTRIENT_KEYS) line.missing[k] = "no yield entered";
    } else {
      const r = removalAtYield(id, line.yieldPerAcre);
      if ("error" in r) problems.push(r.error);
      else
        for (const k of NUTRIENT_KEYS) {
          if (r.lbPerAcre[k] === null) line.missing[k] = "no sourced removal figure";
          else line.lbPerAcre[k] = round(r.lbPerAcre[k]!);
        }
    }
    perCropMap.set(id, line);
  }

  const cycle = {} as Record<NutrientKey, CycleNutrient>;
  for (const k of NUTRIENT_KEYS) {
    let total = 0;
    const unknownFor: string[] = [];
    for (const id of seq) {
      const line = perCropMap.get(id);
      const v = line?.lbPerAcre[k] ?? null;
      if (v === null) {
        if (!unknownFor.includes(id)) unknownFor.push(id);
      } else total += v;
    }
    const known = unknownFor.length === 0 && seq.length > 0;
    cycle[k] = {
      totalLbPerAcre: known ? round(total) : null,
      perSeasonLbPerAcre: known ? round(total / seq.length) : null,
      unknownFor,
    };
  }

  const distinct = Array.from(new Set(seq));
  const knownFix = distinct.filter(fixationKnown);
  const credits: Replenishment["credits"] = [];
  for (let i = 0; i < seq.length; i++) {
    const from = seq[i];
    const to = seq[(i + 1) % seq.length];
    if (seq.length < 2) break;
    for (const c of creditsBetween(from, to))
      if (!credits.some((x) => x.fromCropId === from && x.toCropId === to))
        credits.push({
          fromCropId: from,
          toCropId: to,
          lbNPerAcre: c.lbNPerAcre.value as number,
          source: c.lbNPerAcre.source,
          page: c.lbNPerAcre.page,
          note: c.lbNPerAcre.note,
        });
  }

  let back = false;
  for (let i = 0; i < seq.length; i++) if (seq.length > 1 && seq[i] === seq[(i + 1) % seq.length]) back = true;

  return {
    name: rot.name,
    sequence: seq,
    perCrop: distinct.map((id) => perCropMap.get(id)).filter((x): x is CropRemovalLine => !!x),
    cycle,
    replenishment: {
      fixation: {
        status: knownFix.length === 0 ? "none-known" : knownFix.length === distinct.length ? "all-known" : "some-known",
        knownFor: knownFix,
        unknownFor: distinct.filter((id) => !knownFix.includes(id)),
      },
      credits,
    },
    flags: { sameCropBackToBack: back, singleCrop: distinct.length === 1 && seq.length > 0, distinctCrops: distinct.length, seasonsInCycle: seq.length },
    water: water ?? null,
    problems,
  };
}

export function compareRotations(
  rotations: RotationNutrientInput[],
  yields: YieldInputs,
  waterByName: Record<string, WaterFigure | undefined> = {},
): RotationComparison {
  const results = rotations.map((r) => analyzeRotation(r, yields, waterByName[r.name] ?? null));
  const ordered = {} as RotationComparison["orderedByRemoval"];
  for (const k of NUTRIENT_KEYS) {
    const comparable = results.length > 1 && results.every((r) => r.cycle[k].perSeasonLbPerAcre !== null);
    ordered[k] = {
      comparable,
      names: comparable
        ? [...results].sort((a, b) => (a.cycle[k].perSeasonLbPerAcre as number) - (b.cycle[k].perSeasonLbPerAcre as number)).map((r) => r.name)
        : [],
    };
  }
  const notes = [
    "Removal is nutrient carried off in the harvested product. Residues left on the field, fertilizer applied and what is already in the soil are not counted, because no sourced figures for them were read.",
    "Replenishment is shown only where a source prints a figure. 'Unknown' means no figure was found, not zero.",
  ];
  return { label: SOILHEALTH_LABEL, rotations: results, orderedByRemoval: ordered, notes };
}
