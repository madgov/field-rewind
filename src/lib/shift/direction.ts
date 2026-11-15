import type { MetricId } from "./types";

/** What a clear change means for each measure, in plain words. Pure description of the computed direction: no judgement of good or bad. */
export const CLEAR_PHRASE: Record<MetricId, { increase: string; decrease: string }> = {
  hotDays: { increase: "more days over 35 °C", decrease: "fewer days over 35 °C" },
  et0: { increase: "higher crop water demand", decrease: "lower crop water demand" },
  precip: { increase: "more rain", decrease: "less rain" },
};

/** "More days over 35 °C", "Lower crop water demand", "Less rain"; null when the verdict is not a clear change. */
export function directionText(id: MetricId, verdict: "increase" | "decrease" | "no-clear-change" | "insufficient-data"): string | null {
  if (verdict !== "increase" && verdict !== "decrease") return null;
  const s = CLEAR_PHRASE[id][verdict];
  return s.charAt(0).toUpperCase() + s.slice(1);
}
