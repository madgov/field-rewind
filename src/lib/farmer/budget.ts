import { validateSupply } from "../replay/evaluate";

/**
 * Converts what a farmer can spend on irrigation water into mm of water per season, the unit the replay uses.
 * Pure unit arithmetic; nothing here is a measurement or an assumed default. All three inputs are required.
 *
 * US units: budget (money) / price per acre-foot = acre-feet; / acres = feet of water over the field; x 304.8 = mm
 *   (1 foot = 0.3048 m exactly, so 1 acre-foot per acre = 304.8 mm).
 * Metric units: budget / price per cubic metre = m3; / (hectares x 10,000 m2) = metres of water over the field; x 1000 = mm.
 */
export const MM_PER_FOOT = 304.8;
export const M2_PER_HECTARE = 10000;

export type BudgetInput = {
  units: "us" | "metric";
  /** Money available for irrigation water in one season, in the farmer's own currency. */
  budget: number;
  /** Price of water: per acre-foot (us) or per cubic metre (metric), same currency as the budget. */
  waterPrice: number;
  /** Field size: acres (us) or hectares (metric). */
  area: number;
  /** Shown only, e.g. "$" or "INR". No conversion is ever done. */
  currencyLabel?: string;
};

export type BudgetResult =
  | {
      status: "ok";
      supplyMm: number;
      /** Plain-English steps with the numbers used, so the farmer can check the arithmetic. */
      steps: string[];
      units: BudgetInput["units"];
      currencyLabel: string;
    }
  | { status: "invalid"; problems: string[] };

function positive(v: unknown): v is number {
  return typeof v === "number" && Number.isFinite(v) && v > 0;
}

export function budgetToSupplyMm(input: BudgetInput): BudgetResult {
  const problems: string[] = [];
  if (input.units !== "us" && input.units !== "metric") problems.push("Choose US units or metric units.");
  if (!positive(input.budget)) problems.push("Enter an irrigation budget greater than zero.");
  if (!positive(input.waterPrice)) problems.push("Enter the price of water, greater than zero.");
  if (!positive(input.area)) problems.push("Enter the field size, greater than zero.");
  if (problems.length) return { status: "invalid", problems };

  const cur = input.currencyLabel?.trim() || "";
  const money = (v: number) => `${cur}${cur.length > 1 ? " " : ""}${v}`;
  let supplyMm: number;
  const steps: string[] = [];
  if (input.units === "us") {
    const acreFeet = input.budget / input.waterPrice;
    const feet = acreFeet / input.area;
    supplyMm = feet * MM_PER_FOOT;
    steps.push(
      `${money(input.budget)} budget divided by ${money(input.waterPrice)} per acre-foot buys ${round(acreFeet)} acre-feet of water.`,
      `Spread over ${input.area} acres that is ${round(feet)} feet of water on the field.`,
      `1 foot is 304.8 mm, so that is ${round(supplyMm)} mm per season.`,
    );
  } else {
    const m3 = input.budget / input.waterPrice;
    const metres = m3 / (input.area * M2_PER_HECTARE);
    supplyMm = metres * 1000;
    steps.push(
      `${money(input.budget)} budget divided by ${money(input.waterPrice)} per cubic metre buys ${round(m3)} cubic metres of water.`,
      `Spread over ${input.area} hectares (${input.area * M2_PER_HECTARE} square metres) that is ${round(metres * 1000) / 1000} metres of water on the field.`,
      `1 metre is 1000 mm, so that is ${round(supplyMm)} mm per season.`,
    );
  }
  const bad = validateSupply(supplyMm);
  if (bad) return { status: "invalid", problems: [bad] };
  return { status: "ok", supplyMm, steps, units: input.units, currencyLabel: cur };
}

/** Water cost of a stated need in mm, in the farmer's currency per acre (us) or per hectare (metric). */
export function waterCostForNeed(needMm: number, input: Pick<BudgetInput, "units" | "waterPrice">): number | null {
  if (!Number.isFinite(needMm) || needMm < 0 || !positive(input.waterPrice)) return null;
  return input.units === "us" ? (needMm / MM_PER_FOOT) * input.waterPrice : (needMm / 1000) * M2_PER_HECTARE * input.waterPrice;
}

function round(v: number): number {
  return Math.round(v * 100) / 100;
}

/** 1 acre = 0.40468564224 hectare (exact by definition: the international acre is 4046.8564224 m2). */
export const HECTARES_PER_ACRE = 0.40468564224;

/** Yield typed per acre (us) or per hectare (metric), in the crop's own unit, as yield per acre. The unit itself (bushel, bale, ton) is never converted. */
export function yieldPerAcre(value: number, units: "us" | "metric"): number | null {
  if (!Number.isFinite(value) || value < 0) return null;
  return units === "us" ? value : value * HECTARES_PER_ACRE;
}
