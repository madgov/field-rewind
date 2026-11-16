/**
 * Erosion risk INDICATOR from slope and soil erodibility. This is not a soil-loss prediction and not a risk score.
 *
 * What is cited and what is not:
 *  - Slope bands: 0-2, 2-9, 9-15 and 15 percent or more are the slope breaks NRCS uses in the California guide for assigning
 *    land capability subclasses (subclass e, erosion, depends on these bands), National Soil Survey Handbook 430-H, 622.23
 *    (Amendment 34, January 2018), "Subclass by Slope Gradient (%)".
 *    https://directives.nrcs.usda.gov/sites/default/files2/1725389663/National%20Soil%20Survey%20Handbook%20%28entire%20handbook%29.pdf
 *  - Kf: NSSH 618.60 says Kf quantifies soil detachment by runoff and raindrop impact, measured Kw values vary from 0.02 to
 *    0.69 and for soil interpretations are grouped in 14 classes (0.02 ... 0.64). Higher means more easily detached.
 *  - No published convention that combines these two into one class could be opened and quoted, so NO combined class is
 *    produced (combinedClass is always null). Slope and Kf are shown as separate sourced facts.
 */
import { kfClassRank } from "./soil";
import type { ErosionIndicator } from "./types";

export const EROSION_LABEL = "Erosion risk indicator from slope and soil erodibility, not a soil-loss prediction";

export const SLOPE_BANDS: ReadonlyArray<{ label: string; fromPct: number; toPct: number | null }> = [
  { label: "0 to 2 percent", fromPct: 0, toPct: 2 },
  { label: "2 to 9 percent", fromPct: 2, toPct: 9 },
  { label: "9 to 15 percent", fromPct: 9, toPct: 15 },
  { label: "15 percent or steeper", fromPct: 15, toPct: null },
];

/** A slope exactly on a break belongs to the steeper band. */
export function slopeBand(slopePct: number | null): ErosionIndicator["slopeBand"] {
  if (slopePct === null || !Number.isFinite(slopePct) || slopePct < 0) return null;
  for (let i = SLOPE_BANDS.length - 1; i >= 0; i--) if (slopePct >= SLOPE_BANDS[i].fromPct) return { ...SLOPE_BANDS[i] };
  return null;
}

export function erosionIndicator(slopePct: number | null, kf: number | null): ErosionIndicator {
  return {
    slopePct,
    slopeBand: slopeBand(slopePct),
    kf,
    kfClassRank: kfClassRank(kf),
    combinedClass: null,
    label: EROSION_LABEL,
  };
}
