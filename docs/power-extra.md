# NASA POWER extra layers: soil wetness, frost, surface heat

Server-side retrieval in `src/lib/powerExtra/` (separate from `src/lib/power/`, which it imports from), saved data in `data/power-extra/`.
Pure derived indicators (`frost.ts`, `soil.ts`, `heat.ts`, `stats.ts`, `wording.ts`) have no network and no node imports, so UI code may import them.
All results are **regional climate, about 50 km grid** (`POWER_EXTRA_LABEL`). NASA POWER is reanalysis, not a farm sensor.

## Parameters

Same endpoint and community as the main integration (`https://power.larc.nasa.gov/api/temporal/daily/point`, community `AG`, 1985-01-01 to 2025-12-31,
one request, `-999` fill value). Official names, units and definitions come from the POWER parameter catalogue:
<https://power.larc.nasa.gov/api/system/manager/parameters?community=ag&temporal=daily>

| POWER parameter | Field | Units reported | Official definition (paraphrased from the catalogue) |
|---|---|---|---|
| `GWETROOT` | `soilRootWetness` | `1` (fraction) | Root Zone Soil Wetness: water available to plants in the root zone, generally the upper 1 m of soil, as a proportion; 0 completely dry, 1 saturated. |
| `GWETTOP` | `soilTopWetness` | `1` | Surface Soil Wetness: upper 5 cm of soil, 0 to 1. |
| `GWETPROF` | `soilProfileWetness` | `1` | Profile Soil Moisture: surface down to bedrock, 0 to 1. |
| `T2MDEW` | `dewPointC` | `C` | Dew/frost point temperature at 2 m. |
| `TS` | `skinTempC` | `C` | Earth Skin Temperature: the average temperature at the earth's surface. |
| `EVLAND` | `evapLandMm` | `mm/day` | Evaporation over land at the surface. |
| `PS` | `pressureKPa` | `kPa` | Atmospheric pressure at the surface. |
| `FROST_DAYS` | `frostFlag` | `Days` | A frost day occurs when the 2 m temperature cools to the dew point temperature and both are below 0 C (32 F). Values are 0 or 1. |

`GWET*` values are **modelled** wetness from the MERRA-2 reanalysis, not measured soil moisture. They are reported in steps of 0.01.
The normalizer rejects any other unit string with a plain message and never converts.

## Retrieval

- `client.ts`: builds the 8-parameter URL; reuses the bounded-retry, 45 s timeout fetch of `src/lib/power/client.ts` (network errors, 429, 5xx retried up to 2 times; timeouts and 4xx not retried).
- `normalize.ts`: same shape of logic as `normalizePower`; `-999` (or the header's `fill_value`) becomes `null`; every calendar day is present; status `ok | partial | no-coverage | error`; `origin`, `fetchedAt`, `sourceUrls`, `units`, `coverage`, `missing` counts and a `message`.
- `service.ts`: lookup order saved demo pin in the same 0.5-degree cell, runtime cache (`.cache/power-extra/`, falling back to the OS temp dir), then live fetch. Errors are never cached. With `FIELD_REWIND_OFFLINE=1` (or `offline: true`) no network call is made, the runtime cache is ignored, demo pins are served from `data/power-extra/*.json` and any other place returns a structured `error` with the shared offline message.
- Saved files: `npx tsx scripts/fetch-power-extra.ts` writes `{ pinId, lat, lon, fetchedAt, sourceUrls, responses }` (raw responses plus the real fetch time). They are normalized by the same code on load. Anything not fetched in this very request must be shown with `powerOriginLine` / `powerDataLabel` (`src/lib/power/label.ts`): "Saved response from [date]".

## Period comparison rules (same as `src/lib/shift/compute.ts`)

Constants are imported from that file, not copied: early period 1985-2004, late period 2006-2025, 2005 belongs to neither;
a year is flagged and excluded when it is not a complete calendar year or more than 10 of its days lack the needed input; a period mean needs at least 15 usable years;
a change is "clear" only if the gap between the two means is more than 2 standard errors (sample variances of each period) **and** the printed numbers still differ.
Display rule: the printed difference is `round(late mean) - round(early mean)` (rounded to the metric's decimals), so the sentence adds up; a gap that prints as zero is never "clear"; wording never puts "+" or "-" before digits.
`sampleVariance` and `periodStats` are not exported there, so `stats.ts` mirrors them.

## Derived indicators

### Frost (`computeFrost`)
- Frost day: `FROST_DAYS == 1`. A missing flag is not counted (the count can only be understated, by at most 10 days in a kept year).
- Northern Hemisphere split at 1 July: last spring frost = latest frost day 1 Jan to 30 Jun; first autumn frost = earliest frost day 1 Jul to 31 Dec. Frost on 1 Jan is a spring frost; on 31 Dec an autumn frost.
- Ludhiana (30.9 N) uses the same split. There the "last spring frost" is really the end of winter frost (January or February), and frost is rare (see results), so the date comparison usually has too few years and says so.
- Frost-free season: days from the day after the last spring frost (or 1 Jan if none) to the day before the first autumn frost (or 31 Dec if none). A year with no frost has 365 or 366 days.
- Southern Hemisphere (lat < 0): per-year frost-day counts only; dates and season are reported unavailable.
- Dates of year used for averaging and display use a 365-day reference calendar (29 Feb counts as 28 Feb); the season length uses real day numbers.
- Per year: frost days, last spring frost, first autumn frost, frost-free days, flagged. Period metrics also carry per-period medians of the dates and the number of years with no such frost. Verdicts on dates use the means; medians are reported alongside.
- Cross-check: `computeFrost(result, power)` (or `crossCheckFrostFlag`) compares `FROST_DAYS == 1` with `T2M_MIN <= 0` from the existing POWER data day by day and reports disagreements.

### Soil wetness (`computeSoilWetness`), modelled root-zone wetness
- Growing season = April to September (Northern Hemisphere only; Southern Hemisphere is reported unavailable).
- Growing-season mean per year; anomaly = year mean minus the mean of all usable years 1985-2025 (fraction units); z-like value = anomaly / sample standard deviation of those yearly means (null when no spread). Baseline needs at least 15 usable years.
- Driest month per year = lowest Apr-Sep monthly mean (each month needs at least 20 valid days).
- Dry days per year = growing-season days with wetness **at or below** the pin's own 10th percentile (linear interpolation over all valid Apr-Sep daily values, 1985-2025). This threshold is **relative and pin-specific, not an agronomic wilting point**. Because POWER gives 0.01 steps and wetness has a floor at some places, many days can tie at the threshold, so the count can cover well over 10% of days.
- Also returned: the three driest growing seasons.

### Surface heat (`computeSkinTemperature`)
Annual mean of `TS` only, same year rules. No threshold count is offered: there is no cited threshold for skin temperature and none is invented. TS is a modelled surface temperature, not air temperature.

## Wording (`frostWording`, `soilWetnessWording`, `skinTemperatureWording`)
Sentences are generated only from computed numbers, e.g. "Frost days at this spot fell from 11 a year to 6 a year between 1985–2004 and 2006–2025." If there is no clear change they say "No clear change in ...", and if data is short they say how many usable years there were. No causal claims. Each returns `{ headline, lines, label }` with `label === POWER_EXTRA_LABEL`; the soil wording also states that wetness is modelled and that the dry-day threshold is relative.

## Limits
- Reanalysis on about a 50 km grid (MERRA-2 about 0.5 x 0.625 degrees): regional, not field-level, and not a sensor reading.
- `GWET*` is a model output; it does not know about irrigation, drainage or soil type at a given field.
- `FROST_DAYS` is a daily flag, so frost dates are day-resolution and depend on the grid cell's smoothed temperatures.
- Only the three demo pins have saved files; other places need a live fetch (not available offline).
- Not verified: behaviour on the Southern Hemisphere with real data (covered by unit tests only); live fetches beyond the three demo pins in this stage; Vercel file tracing for `data/power-extra/**`.
