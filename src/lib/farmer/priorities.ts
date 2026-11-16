import type { RotationNutrientResult } from "../soilhealth";
import type { RotationResult } from "../replay/types";
import { waterCostForNeed } from "./budget";
import type { BudgetInput } from "./budget";

export type PriorityId = "dependable-water" | "use-less-water" | "low-water-cost" | "protect-soil-nutrients" | "grow-more-crops";

export const PRIORITIES: Record<PriorityId, { label: string; plain: string; metricLabel: string; unit: string; better: "lower" | "higher" }> = {
  "dependable-water": {
    label: "Fewer seasons short of water",
    plain: "Fewest seasons where modelled water need exceeds your supply in the historical replay.",
    metricLabel: "Seasons short of water",
    unit: "seasons",
    better: "lower",
  },
  "use-less-water": {
    label: "Use less water",
    plain: "Lowest typical (median) water the crops needed from irrigation.",
    metricLabel: "Median water needed from irrigation",
    unit: "mm per season",
    better: "lower",
  },
  "low-water-cost": {
    label: "Keep the water bill low",
    plain: "Lowest typical water cost, from your own water price. Needs a price.",
    metricLabel: "Median water cost",
    unit: "per season",
    better: "lower",
  },
  "protect-soil-nutrients": {
    label: "Less nitrogen removed in harvest",
    plain: "Least nitrogen carried off in the harvested crop, from published averages and your yield assumptions. This does not measure soil-health improvement.",
    metricLabel: "Nitrogen removed",
    unit: "lb per acre per season",
    better: "lower",
  },
  "grow-more-crops": {
    label: "Grow a mix of crops",
    plain: "More different crops in the cycle, and no crop twice in a row.",
    metricLabel: "Different crops in the cycle",
    unit: "crops",
    better: "higher",
  },
};

export type PriorityRow = { rotation: string; value: number | null; note?: string };

export type PriorityView = {
  priority: PriorityId;
  /** 1 = the farmer's first priority. */
  rank: number;
  label: string;
  plain: string;
  metricLabel: string;
  unit: string;
  rows: PriorityRow[];
  /** Rotations with the best value; more than one when tied. Empty when the metric is unknown for any rotation. */
  best: string[];
  comparable: boolean;
};

export type PriorityInput = {
  /** Farmer's order, most important first. Duplicates and unknown ids are ignored. */
  order: PriorityId[];
  rotations: RotationResult[];
  nutrients: RotationNutrientResult[];
  /** Needed for the water-cost priority; without it that priority is reported as not computable. */
  price?: Pick<BudgetInput, "units" | "waterPrice">;
};

function round(v: number): number {
  return Math.round(v * 100) / 100;
}

/**
 * Lays each chosen priority side by side with the computed numbers for every rotation. It does NOT combine them into one
 * score: the farmer's order is shown, and the best rotation for each priority is named only when every rotation has a number.
 */
export function viewPriorities(input: PriorityInput): PriorityView[] {
  const seen = new Set<PriorityId>();
  const order = input.order.filter((p) => p in PRIORITIES && !seen.has(p) && (seen.add(p), true));
  return order.map((priority, i) => {
    const meta = PRIORITIES[priority];
    const rows: PriorityRow[] = input.rotations.map((rot) => {
      const nut = input.nutrients.find((n) => n.name === rot.name);
      switch (priority) {
        case "dependable-water":
          return { rotation: rot.name, value: rot.totals.evaluable > 0 ? rot.totals.short : null, note: rot.totals.evaluable > 0 ? `of ${rot.totals.evaluable} seasons judged` : "No season could be judged." };
        case "use-less-water":
          return { rotation: rot.name, value: rot.totals.needMedianMm === null ? null : round(rot.totals.needMedianMm) };
        case "low-water-cost": {
          if (!input.price) return { rotation: rot.name, value: null, note: "No water price entered." };
          const c = rot.totals.needMedianMm === null ? null : waterCostForNeed(rot.totals.needMedianMm, input.price);
          return { rotation: rot.name, value: c === null ? null : round(c), note: input.price.units === "us" ? "per acre" : "per hectare" };
        }
        case "protect-soil-nutrients": {
          const v = nut?.cycle.n.perSeasonLbPerAcre ?? null;
          return { rotation: rot.name, value: v, note: v === null ? "Needs a yield for every crop in the cycle." : undefined };
        }
        case "grow-more-crops":
          return { rotation: rot.name, value: nut ? nut.flags.distinctCrops : null, note: nut?.flags.sameCropBackToBack ? "Same crop in two neighbouring seasons." : undefined };
      }
    });
    const comparable = rows.length > 1 && rows.every((r) => r.value !== null);
    let best: string[] = [];
    if (comparable) {
      const vals = rows.map((r) => r.value as number);
      const target = meta.better === "lower" ? Math.min(...vals) : Math.max(...vals);
      best = rows.filter((r) => r.value === target).map((r) => r.rotation);
    }
    return { priority, rank: i + 1, label: meta.label, plain: meta.plain, metricLabel: meta.metricLabel, unit: meta.unit, rows, best, comparable };
  });
}
