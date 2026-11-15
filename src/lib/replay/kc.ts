/**
 * FAO-56 single crop coefficient (Kc) curve.
 *
 * Source: Allen, Pereira, Raes, Smith (1998), FAO Irrigation and Drainage Paper 56, Chapter 6
 *   https://www.fao.org/4/x0490e/x0490e0b.htm
 *   - "Construction of the Kc curve" (Figure 34): Kc is a constant Kc ini through the initial stage,
 *     rises linearly to Kc mid through the crop development stage, is a constant Kc mid through the
 *     mid-season stage, and falls linearly to Kc end through the late-season stage.
 *   - "Numerical determination of Kc", Equation 66, for the day-by-day values on the sloping parts:
 *       Kc_i = Kc_prev + [(i - sum(L_prev)) / L_stage] * (Kc_next - Kc_prev)
 *     with i the day number within the growing season (1 = first day), sum(L_prev) the total length of
 *     all previous stages and L_stage the length of the current stage (see FAO-56 Example 28:
 *     Kc = 0.15 + [(40 - 25)/25] x (1.19 - 0.15)). The page prints the equation as an image; the form
 *     used here is the one the page's variable definitions and Example 28 spell out.
 *
 * NOT applied: the Eq. 62 / Eq. 65 climate adjustments of Kc mid / Kc end (for wind and humidity), and
 * the Eq. 59-61 wetting adjustment of Kc ini. Tabulated Kc values are used as they are.
 */
import type { ResolvedCrop } from "./types";
import { resolveCrop } from "./crop";
import type { Crop } from "../crops/types";

function asResolved(crop: Crop | ResolvedCrop): ResolvedCrop {
  if ("kcIni" in crop) return crop;
  const r = resolveCrop(crop);
  if (!r.ok) throw new Error(r.reason);
  return r.crop;
}

/** Kc for every day of the season (index 0 = day 1). Length = season length. */
export function kcCurve(cropIn: Crop | ResolvedCrop): number[] {
  const c = asResolved(cropIn);
  const { ini, dev, mid, late } = c.stageDays;
  const total = ini + dev + mid + late;
  const out = new Array<number>(total);
  for (let idx = 0; idx < total; idx++) {
    const i = idx + 1; // FAO-56 day number, 1-based
    let kc: number;
    if (i <= ini) {
      kc = c.kcIni;
    } else if (i <= ini + dev) {
      kc = c.kcIni + ((i - ini) / dev) * (c.kcMid - c.kcIni); // Eq. 66
    } else if (i <= ini + dev + mid) {
      kc = c.kcMid;
    } else {
      kc = c.kcMid + ((i - ini - dev - mid) / late) * (c.kcEnd - c.kcMid); // Eq. 66
    }
    out[idx] = kc;
  }
  return out;
}

/** Kc on one day of the season. dayIndexInSeason is 0-based (0 = planting day). */
export function kcForDay(crop: Crop | ResolvedCrop, dayIndexInSeason: number): number {
  const c = asResolved(crop);
  const total = c.stageDays.ini + c.stageDays.dev + c.stageDays.mid + c.stageDays.late;
  if (!Number.isInteger(dayIndexInSeason) || dayIndexInSeason < 0 || dayIndexInSeason >= total) {
    throw new RangeError(`Day index ${dayIndexInSeason} is outside the ${total}-day season of ${c.name}.`);
  }
  return kcCurve(c)[dayIndexInSeason];
}
