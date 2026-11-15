/**
 * Effective rainfall: the USDA Soil Conservation Service formula as used in FAO CROPWAT.
 *
 *   P <= 250 mm/month:  Pe = P * (125 - 0.2 P) / 125
 *   P  > 250 mm/month:  Pe = 125 + 0.1 P
 *
 * (The two branches meet at P = 250, where both give 150 mm.)
 *
 * Source actually fetched and read: Mladen Todorovic (CIHEAM-IAMB), "Soil Water Balance and Irrigation
 * Scheduling", ClimaSouth training, LARI Tal Amara, Lebanon, 12-16 December 2016, slide on effective
 * rainfall methods ("USDA Soil Conservation Method ... to be used over the total growing season, or on a
 * monthly basis"):
 *   https://www.climamed.eu/wp-content/uploads/files/Soil-water-balance-and-irrigation-scheduling_ClimaSouth.pdf
 * This is a secondary source, not an FAO page. The FAO pages that were fetched do NOT print this formula:
 *   - FAO Irrigation and Drainage Paper 25 (Dastane 1974), https://www.fao.org/4/x5560e/x5560e03.htm section 3.4,
 *     describes the original USDA-SCS method as a table lookup (Tables 7 and 8) on monthly rain and
 *     consumptive use, not this closed formula.
 *   - FAO "Irrigation Water Management: Irrigation Water Needs", https://www.fao.org/4/S2022E/s2022e08.htm
 *     section 4.2, prints a different, simpler pair of formulas (0.8P - 25 and 0.6P - 10); NOT used here.
 * CROPWAT documentation itself was not reachable, so "as used in CROPWAT" rests on the secondary source
 * above and on several papers that describe CROPWAT's USDA-SC option with the same two branches.
 *
 * It is a monthly method. A season rarely matches whole months, so the season gets the share of each month's
 * Pe equal to the share of that month's rain that fell on season days (see seasonEffectiveRain).
 * That pro-rating is this app's approximation, not part of the published method.
 */

export const SCS_THRESHOLD_MM = 250;

/** Effective rainfall for one calendar month's total rain, mm. */
export function effectiveRainMonthly(monthlyRainMm: number): number {
  if (!Number.isFinite(monthlyRainMm) || monthlyRainMm < 0) {
    throw new RangeError(`Monthly rainfall must be a finite number of mm, 0 or more (got ${monthlyRainMm}).`);
  }
  const p = monthlyRainMm;
  return p <= SCS_THRESHOLD_MM ? (p * (125 - 0.2 * p)) / 125 : 125 + 0.1 * p;
}

export type MonthRain = {
  /** Total rain over all available days of the calendar month, mm. */
  monthTotalMm: number;
  /** Rain that fell on season days of that month, mm. */
  seasonRainMm: number;
};

/**
 * Effective rainfall attributed to a season: for each month, Pe(month total) x (season rain / month total).
 * A month with no rain contributes zero.
 */
export function seasonEffectiveRain(months: MonthRain[]): number {
  let sum = 0;
  for (const m of months) {
    if (m.monthTotalMm <= 0) continue;
    const share = Math.min(1, m.seasonRainMm / m.monthTotalMm);
    sum += effectiveRainMonthly(m.monthTotalMm) * share;
  }
  return sum;
}
