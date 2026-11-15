# How the 40-season replay is computed

Code: `src/lib/replay/` (pure functions; take a NASA POWER `PowerResult` plus plain inputs). Report: `npx tsx scripts/replay-report.ts`. Climate data: regional reanalysis on a roughly 50 km grid, not a farm sensor.

## Seasons
- Seasons are labelled by harvest year, 1986 to 2025 (40 seasons).
- Planting is the crop's default "MM-DD", placed in the year that makes the season end (planting + total stage days - 1) fall in the harvest year. A winter crop's 1986 season starts in autumn 1985, which is why the data starts in 1985. Whether a season crosses 31 December is derived from the dates; if the catalog's `spansNewYear` flag disagrees, a warning is shown and the dates are followed.
- Calendar arithmetic is UTC day numbers, so a 29 February inside a season is counted. A 29 February planting date is rejected (it does not exist in most years and dates are never moved). A crop whose season is over 365 days, or ends so close to New Year that some year has no valid planting, is rejected with the reason.
- The same planting date and stage lengths are used every year.

## Crop water demand (ETc)
- Kc curve: FAO Irrigation and Drainage Paper 56, Chapter 6 (https://www.fao.org/4/x0490e/x0490e0b.htm), "Construction of the Kc curve" and Equation 66. Kc is Kc ini through the initial stage, rises linearly to Kc mid through development, is Kc mid through mid-season, and falls linearly to Kc end through the late season: Kc = Kc prev + [(i - sum of previous stage lengths) / stage length] x (Kc next - Kc prev), i = day number in the season (1 = planting day). The page prints Eq. 66 as an image; the form used is the one its variable definitions and Example 28 spell out.
- Tabulated Kc values are used as they are. The Eq. 62 / 65 climate adjustment of Kc mid / Kc end, and the Eq. 59-61 wetting adjustment of Kc ini, are NOT applied.
- ET0 is the Stage 1 FAO-56 Penman-Monteith daily value (`src/lib/et0/fao56.ts`).
- ETc = sum over season days of Kc(day) x ET0(day), in mm.

## Effective rainfall
- Formula (USDA Soil Conservation Service method as used in FAO CROPWAT), monthly: Pe = P x (125 - 0.2 P) / 125 for P up to 250 mm per month; Pe = 125 + 0.1 P above 250 mm. Both branches give 150 mm at 250.
- Source actually read: M. Todorovic (CIHEAM-IAMB), "Soil Water Balance and Irrigation Scheduling", ClimaSouth training, Tal Amara, Lebanon, 12-16 Dec 2016, effective-rainfall slide ("to be used over the total growing season, or on a monthly basis"): https://www.climamed.eu/wp-content/uploads/files/Soil-water-balance-and-irrigation-scheduling_ClimaSouth.pdf. This is a secondary source. FAO's own CROPWAT page and the FAO documents I could fetch do not print this formula: FAO Irrigation and Drainage Paper 25 section 3.4 (https://www.fao.org/4/x5560e/x5560e03.htm) describes the original USDA-SCS method as a table lookup, and the FAO training manual "Irrigation Water Management: Irrigation Water Needs" section 4.2 (https://www.fao.org/4/S2022E/s2022e08.htm) prints a different, simpler formula (0.8P - 25 / 0.6P - 10) that is not used here. "As used in CROPWAT" is therefore supported by that slide and by several papers describing CROPWAT's USDA-SC option, not by an FAO page.
- Pro-rating (this app's approximation, not part of the published method): for each calendar month the season touches, Pe is computed from the month's full rainfall total, then the season gets the share of that Pe equal to the share of the month's rain that fell on season days. A month with no rain gives zero.
- Days with no precipitation value add no rain and are counted; they are not filled.

## Irrigation need and the red/green result
- Irrigation need = max(0, ETc - effective rainfall), in mm.
- Displayed figures: crop water use and effective rain are each rounded to whole mm, and the "need beyond rain" shown is max(0, rounded water use - rounded rain), so the three numbers add up on screen (it can differ by 1 mm from the unrounded need). Inches are derived from those same whole-mm numbers. The red/green result is always decided on the unrounded need (`displayedFigures` in `src/lib/replay/wording.ts`).
- Short (red) when need is greater than the supply; otherwise OK (green). Margin = supply - need. The gauge value is need / supply (above 1 means short; none when the supply is 0).
- Days with daily maximum temperature above the crop's heat threshold are counted for information only. They do not change red or green.

## Missing data
- No filling. Days with no ET0 add nothing to ETc, so the need is then a slight under-count; the missing-day count is carried on the season.
- A season is grey ("insufficient-data") if more than 10 of its days have no ET0, or more than 10 of its days have no precipitation value, or if it is not fully inside the record. Up to 10 missing precipitation days add 0 mm of rain (so the rain is slightly undercounted and the need slightly overstated); up to 10 missing ET0 days add 0 to ETc (the need is slightly understated). Both counts are carried on the season and shown on the gauge.
- If POWER returned an error, no coverage, no days, or no elevation, the whole replay is unavailable with a reason and a next step.

## Rotations, decades, wording
- A rotation is 1 to 3 crops repeating: year Y uses `sequence[(Y - 1986) mod length]`. 2 or 3 rotations are compared at one seasonal supply (finite, 0 mm or more). Unknown or unusable crops (any unsourced value) are rejected with the reason, never skipped.
- If a season overlaps the next season of the rotation in dates, a warning says which crops and by how many days. Dates are not shifted; the overlapping days count in both seasons.
- Decades: 1986-1995, 1996-2005, 2006-2015, 2016-2025, each with its short count and the number of seasons that could be judged.
- Headline and sentence compare the first and last decade only, generated from the counts: more, fewer, the same, or never short. If the two decades have a different number of judged seasons they are compared as shares. A difference written in a sentence is the difference of the counts shown; no "+" or "-" precedes a digit; no causes are claimed.
- No "clear change" verdict or trend is attached. Ten seasons per decade is too small a sample for a defensible test, so the counts are reported as they are.

## Example inputs
`examples.ts` has three constructed rotations (wheat then maize; maize then cotton; rice, wheat, maize) built from catalog crops and one example supply of 700 mm. They are labelled "Constructed example, not records of a real farm." The supply was chosen for illustration by one rule, run once on the saved Brentwood record: the median of the 120 per-season needs of the three example rotations, rounded to the nearest 25 mm, so the strips mix red and green. It is not a real water allocation or a recommendation.

## Limitations
- No soil-moisture carry-over or stored winter rain: need is per-season atmospheric demand minus effective rain. This overstates the need of winter crops that draw on stored soil water.
- No irrigation efficiency or leaching: the supply is compared with the net crop need. A real system must deliver more than the net need.
- Tabulated Kc without the Eq. 62 climate adjustment.
- Fixed planting date and stage lengths every year.
- ET0 comes from ~50 km reanalysis, which may read high compared with an irrigated station.
- Pro-rated monthly effective rainfall is an approximation; the formula was verified from a secondary source (see above), not an FAO page.
- Heat days are informational only.
- Decade counts are small samples.

## Monthly modelled crop water use (Stage 4, OpenET comparison only)

`src/lib/replay/monthly.ts` sums Kc x ET0 by calendar month for a rotation, using the engine's own `seasonDates`, `kcCurve` and
`cropIndexForYear`. A month gets a number only if a season covers every day of it, no days overlap between seasons, and no ET0
day is missing. Every other month is `null` (never 0, never a partial sum). Months outside every season are not listed at all.
Reason: a fallow month's real water use is not zero (OpenET measures it), and a part-month sum compared with a whole-month
satellite value would make the model look low for reasons unrelated to the crop. These months are simply not compared.

## Crop region
The crop catalog holds California values (`data/crops/catalog.json` region: California Delta / Central Valley). The replay page and the printed report print that region next to the crops. When the pin is outside California a visible warning says planting dates and stage lengths are California values and may not match local practice. "Outside California" comes from `isApproxInCalifornia` in `src/lib/crops/region.ts`: a bounding box with two straight lines for the Nevada border. It is approximate (no real borders, no land/ocean check).
