# Field Rewind: judge pitch pack

Plain English. Every number below is quoted from README.md or docs/*.md, with the doc named. Nothing is recomputed.

**Check before presenting:** the `/ask` page exists in the code (`src/app/ask/page.tsx`, `src/lib/assistant/`), but README.md and docs/*.md do not describe it yet. The `/ask` details below come from the page's own text and the code. Run through it once on the live URL before you demo it. Do not claim anything about `/ask` that you have not watched it do.

Public demo: https://field-rewind-t4fe.vercel.app (README.md). README says the deployed version may differ from local changes, and that the Vercel AI connection has not been verified (docs/local-verification.md, docs/advisor-method.md). Demo from a local run if you can.

---

## 1. Spoken pitches

### 30 seconds

"A farmer opens Field Rewind and says, or types, where they farm, what they grow, how much water they have and what they can spend. The app builds a plan from 40 years of NASA weather, their soil and what their crops need. It shows what it understood, and the farmer can fix it. An AI writes the plan in plain English, but it never makes up a number. Every figure is rebuilt on the server from real data, and a summary that fails that check is not shown. Then the farmer can ask 'what if it is 2 degrees C warmer, or 20 percent drier?' Those answers are labelled what-ifs, never forecasts."

### 2 minutes

"Most farm tools start with a dashboard. We start with the farmer.

A farmer opens `/ask`. They pick their place by searching or tapping the map. They speak or type: what they grow, how much water they have, what their budget is. The page shows back 'what we understood' in boxes they can edit, so a misheard word never silently changes the plan.

Then we answer one question: would your water supply have met your crops' modelled needs over the last 40 seasons? We replay 1986 to 2025, season by season, against the water supply the farmer chose. We use NASA POWER daily weather, FAO-56 Penman-Monteith crop water demand, sourced crop factors, and the soil and terrain at that spot. A season is 'short' if the supply is below the modelled need beyond rain, and 'covered' if not.

An AI writes the plan in plain English, but it is not trusted. The server rebuilds every number from the same data the page uses. The summary is shown only if every number sits at a data path the paragraph cites. If it fails the check, even after one retry, the farmer sees nothing from the AI and sees why.

Then the what-ifs. The farmer can ask for rain 20 percent lower or 2 degrees C warmer. It runs on the real daily record, on the server, and is labelled 'What-if applied to the real 1985-2025 record. Not a forecast.'

We say what we do not know. NASA POWER is regional climate on about a 50 km grid, not a sensor in the field. Crop values are California values, and the app warns on Ludhiana. If a layer is missing, it says 'not available' and fills nothing in. We checked our crop water demand against a real California weather station and against satellite evapotranspiration, and we show the results in 'How we know'.

It does not predict yield, survival or soil health. It tells a farmer how their water would have held up against the last 40 seasons of weather."

---

## 2. 60-second live demo click path

Rehearse once. If `/ask` misbehaves live, skip to step 2 and say so.

| Time | Click | Say |
| --- | --- | --- |
| 0:00-0:20 | **`/ask`**. Search a place (try Brentwood) or tap the map. Speak or type a short sentence: crop, water, budget. | "A farmer says where they farm, what they grow and their water. This is what we understood. They can edit it." Point at the editable box. Point at the "Regional climate, about 50 km grid" chip. |
| 0:20-0:35 | **`/replay`** (the plan opens here, or use "Load example farm (Brentwood)" from `/`). Drag the season scrubber or press play. | "Red cells are seasons where the supply fell short, 1986 to 2025. The gauge shows the water, season by season." Drag the water supply slider and watch the cells and headlines change. |
| 0:35-0:45 | Section 4 what-if sliders (rain, temperature). | "A what-if, labelled 'Not a forecast', run on the real record." |
| 0:45-0:52 | **`/conditions`** (link in the replay header). | "Soil, terrain, satellite vegetation, frost, ground checks. And a list of the layers we have not connected." |
| 0:52-1:00 | Back on `/replay`, open **"How we know"**. | "Every source, the 50 km caveat, and our checks against a station and satellite ET." |

Steps from README.md "60-second demo": load the example farm, read the strips, drag the supply slider, drag the scrubber, open "How we know". No keys are needed for any of it except the AI summary.

---

## 3. Which NASA and partner data we use

Only datasets that README.md or docs/*.md say are connected and saved in `data/`.

| Dataset | Used for | Source doc |
| --- | --- | --- |
| NASA POWER daily, community AG, 1985-01-01 to 2025-12-31 | Weather for FAO-56 ET0, rainfall, hot days, the shift screen and the 40-season replay. Always labelled "regional climate, about 50 km grid" | docs/power-integration.md |
| NASA POWER soil wetness, frost, surface heat | Modelled soil wetness, frost and heat on `/conditions` | docs/power-extra.md |
| NASA SMAP SPL3SMP_E v006 (2025-07-01 to 2025-07-07 sample) | Dated surface-soil-moisture snapshot with quality flags. Values failing the quality check are withheld, not replaced | docs/earthdata.md |
| NASA GPM IMERG Final monthly v07 (July 2025) | Dated satellite rainfall snapshot | docs/earthdata.md |
| Landsat Collection 2 Level-2 NDVI (30 m, one pixel per pin) and ORNL MODIS 250 m (Brentwood only) | Vegetation greenness, "unusually low" flags | docs/ndvi.md |
| NASADEM terrain | Slope and elevation | docs/landform.md |
| USDA NRCS SSURGO soil (US only) | Soil at the pin. Shows "not available" outside the US | docs/landform.md |
| Daymet, CoCoRaHS, USDA NASS Cropland Data Layer, NLCD, USGS wells | Ground checks against the NASA numbers | docs/ground-truth.md |
| CIMIS station 47 (Brentwood), daily ASCE ETo | Check of our ET0 against a real station | docs/cimis-check.md |
| OpenET Ensemble monthly (Brentwood and Fresno) | Satellite actual-ET panel | docs/openet-check.md |
| University of Arkansas FSA2176, University of Nebraska CNMP tables, Montana State Extension | Nutrient removal per unit of yield, with source and page | docs/nutrient-sources.md |
| Google Gemini API | Writes the optional plain-English summary only, never a number | docs/advisor-method.md |

SMAP and IMERG are saved dated snapshots for the demo pins. They are not a 40-season history and not live field readings, and they do not change the water replay (README.md).

### Not connected, and why

| Layer | Why (from README.md) |
| --- | --- |
| ECOSTRESS, GLDAS/NLDAS | Unimplemented |
| USDA market prices | Not connected, so nothing says what a rotation earns |
| Live SMAP or IMERG for any pin | Only the dated demo-pin snapshots exist; no arbitrary-pin live fetch |
| OpenET for Ludhiana | OpenET is US only |
| Soil for Ludhiana | The soil survey is US only; shows "not available" |
| Plant-available N, P, K | The soil survey does not provide them |
| Nitrogen fixation and other replenishment | "Unknown" for all seven catalog crops, since no source gave a usable figure. Unknown is never treated as zero |
| Soil water carry-over, delivery losses | Not modelled |

---

## 4. Why trust it

Only numbers that appear in the docs, quoted exactly.

- **FAO-56 unit test.** The code gives **3.880 mm/day** for the FAO-56 worked example whose published value is 3.88 (docs/et0-mapping.md).
- **Test suite.** 921 tests in 79 files passed, with lint, typecheck and production build passing (docs/local-verification.md). Earlier baseline: 912 tests in 78 files (docs/audit-stage7.md).
- **Real station check.** CIMIS station 47 data file holds 5,844 real daily values, 2010-01-01 to 2025-12-31, compared with our ET0 (docs/cimis-check.md). The comparison statistics are computed by the app and shown in "How we know"; the docs deliberately do not repeat them, so we do not quote any here.
- **Real satellite ET.** OpenET: 142 real monthly values each for Brentwood and Fresno, 2015-01 to 2026-10 (docs/openet-check.md).
- **Browser checks.** 73 checks, 71 pass, with the 2 remaining "failures" being inline text links exempt from the tap-size rule (docs/audit-stage7.md). Historical: they were not rerun later (docs/local-verification.md).
- **AI checked against data.** Real Gemini requests through the local production app passed for all three demo pins: Fresno about 10 s (1 attempt), Brentwood about 8 s (1 attempt), Ludhiana about 20 s (2 attempts, one repair) (docs/advisor-method.md).
- **What-if.** The wheat-maize what-if returned 7 to 18 short seasons out of 40 (docs/local-verification.md).
- **Honest labelling.** Saved data always reads "Saved response from [date]". Only data fetched in that request may say "Fetched from NASA POWER just now" (README.md).
- **The checker catches real errors.** It rejected real replies for invented paths, numbers not at a cited path, and one wrong word. It also had false alarms of its own, which were fixed and tested (docs/advisor-method.md).

**Say this openly:** passing the number check does not prove the explanation is right. Manual review found an unsupported causal statement in the Fresno summary and reference evapotranspiration mislabelled as crop water demand in the Ludhiana summary (docs/local-verification.md). Those remain open.

---

## 5. What it does not do

From README.md "Known limitations" and the intro.

- It does not predict crop survival, yield or soil-health change. "Covered" means the supply meets the modelled water need beyond rain.
- Yields come from the user and are not adjusted when water is short. Nutrient removal does not measure nutrients left in the soil.
- No forecast. What-ifs rerun the real 1985-2025 record.
- NASA POWER is reanalysis on a regional grid, not a field sensor. It reads hotter than weather stations, so hot-day counts are regional counts. The change between periods is the point.
- Crop values are California values. The app warns outside California, and that check is an approximate bounding shape, not real borders.
- Only 4 of 7 catalog crops are usable. The rest lack a sourced value and are excluded.
- Heat thresholds and planting windows were not re-verified against the source papers. The effective-rainfall formula was checked from a secondary source.
- No soil water carry-over and no delivery losses.
- Nutrient figures are published averages from Arkansas, Nebraska and Montana, not California measurements. Not a soil test.
- Some demo pins are not farmland. The Fresno pin is developed land.
- Ten seasons per decade is a small sample, so no trend is claimed.
- The AI summary is not agronomic advice. Free-tier models can be busy or out of quota, and the first reply often fails the check and is retried once.
- No market prices, so nothing says what a rotation earns.

---

## 6. Likely judge questions

**Is this real data or mock data?**
Real. The weather, soil, satellite and station numbers are saved responses from the real services, each labelled with its fetch date. If a service is blocked, the app says so and does not substitute made-up values.

**Is the AI making up numbers?**
It is not allowed to supply any. The server rebuilds every figure, and the summary is shown only if each number matches a data path the paragraph cites. If not, nothing is shown. The check does not prove the explanation is right. We found two wrong explanations by hand-reading real replies (docs/local-verification.md), and we say so.

**Why should a farmer trust 50 km weather?**
They should not treat it as their field. It is labelled "regional climate, about 50 km grid" everywhere. We checked it against CIMIS station 47 and OpenET and show those in "How we know". The point of the app is the change over 40 years, not one day's reading.

**Is "2 degrees warmer" a forecast?**
No. It reruns the real 1985-2025 daily record with a shift applied, and the page says "Not a forecast".

**Does it work outside California?**
Partly. The weather works anywhere POWER covers. Crop values are California values and the app warns outside California. Soil and several ground layers are US only, so Ludhiana shows "not available". Say this plainly.

**What if the farmer's voice input is misheard?**
`/ask` shows "what we understood" in editable fields before anything is computed. Confirm this on the live page before saying it.

**Does it say what to plant or how much money I will make?**
No. It shows whether the water you have would have covered the rotations you picked, and nutrient removal against published figures. There are no market prices.

**What does it do offline or with no keys?**
It runs with no keys. The CIMIS and OpenET panels read saved responses. With `FIELD_REWIND_OFFLINE=1` only the saved example places work and the AI is off. Without a Gemini key the AI block says it is not connected and writes nothing in its place.

**What did the farmer's data go to?**
When the AI summary is used, Google receives the computed results, yields and priorities, the location rounded to the 50 km grid, and rotation letters. It does not receive money amounts, field size or typed names. On the free tier Google says content may be used to improve its products, and the page says so next to the button.

**What would you do next?**
From the docs: verify the Vercel Gemini connection, fix the semantic errors found in AI replies before extending claims, add a legume with a sourced nitrogen-fixation figure, and add market prices.
