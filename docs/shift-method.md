# How "Your field has shifted" is computed

Code: `src/lib/shift/compute.ts` (pure function `computeShift`). Data: NASA POWER daily reanalysis, regional climate on a roughly 50 km grid, 1985-2025.

## Periods
- Early: 1985-2004 (20 years). Late: 2006-2025 (20 years).
- 2005 belongs to neither, so the two periods are cleanly separated. It still appears in the year list.

## Three yearly numbers
1. Days over 35 °C: count of days with daily maximum temperature strictly above 35 °C (35.0 does not count).
2. Crop water demand (ET0): sum of daily FAO-56 Penman-Monteith reference evapotranspiration, in mm. Needs max/min temperature, humidity, wind, sunshine energy and the grid cell's elevation.
3. Rainfall: sum of daily precipitation, in mm.

## Missing data
- No filling, no scaling, no interpolation.
- A year with 1-10 missing days (for that metric's inputs) is used as it is. Its total is then a slight under-count, and the missing-day count is kept so the screen can say so.
- A year with more than 10 missing days, or one that is not a full calendar year in the record, is flagged and left out of the averages.
- A period needs at least 15 usable years. Otherwise that metric reads "not enough data" and no averages are shown.
- If POWER gave no elevation for the grid cell, crop water demand is not computed (the app never assumes an elevation); the other two still are.
- If POWER returned an error or no coverage, the whole screen is unavailable and says why.

## When is a change "clear"?
Take the average of the 20 yearly values in each period and the gap between them. Each period's yearly values swing up and down by themselves, so the gap is compared with that noise:

`noise = sqrt(s1^2/n1 + s2^2/n2)` (s = sample standard deviation of the yearly values, n = usable years).

The change is called clear only if `|gap| > 2 x noise`. This is a deliberately plain yardstick, chosen before looking at results and not tuned. If the yearly values are identical within both periods (noise = 0), any non-zero gap is clear and a zero gap is not. A gap that rounds to zero in the units shown is never called clear, so the screen never shows a signed zero.

Display rule: the difference written in any sentence is round(late average) minus round(early average), so the numbers on screen add up; the exact difference is kept in the data.

All wording (headline, detail, overall summary) is generated from these numbers. When nothing passes the rule, the screen says there is no clear shift.

## What this does not claim
- It does not say why anything changed. It describes what the record shows, nothing about cause.
- It is regional reanalysis on a roughly 50 km grid, not a sensor in your field.
- POWER tends to read hotter than weather stations at these pins. Example, Fresno: the saved POWER record gives a July mean daily high of 40.0 °C (computed from `data/power/fresno.json`, 41 complete Julys 1985-2025, by `julyMeanTmax` in `src/lib/summary/julyTmax.ts`; the page computes it again at render time), against 36.5 °C for the NOAA NCEI U.S. Climate Normals 1991-2020 July maximum at FRESNO YOSEMITE INTL AP, CA US (USW00093193), read 15 Nov 2026 from https://www.ncei.noaa.gov/access/services/data/v1?dataset=normals-monthly-1991-2020&stations=USW00093193&dataTypes=MLY-TMAX-NORMAL&format=json&units=metric (97.7 °F in standard units). The periods and the places (a grid square versus one airport) differ, so the gap is rough. So counts of days over 35 °C are regional-grid counts, likely higher than a station would record. The change between the periods is the point, not the absolute count.
- Twenty years per period and a 2x rule mean small real changes can be missed, and about one in twenty no-change cases could still be flagged by chance. Three metrics are checked, so one clear result is not strong evidence on its own.
