# Crop nutrient data, rotation comparison, farmer inputs and advisor payload (Stage 7, Batch 1)

Status: built and unit-tested. No model call exists yet (Batch 2). Compiled 2026-11-15.

Code: `src/lib/nutrients/`, `src/lib/soilhealth/`, `src/lib/farmer/`, `src/lib/expertise/`, `src/lib/advisor/`.
Data: `data/crops/nutrients.json`, `data/expertise/notes.json`.

## Where the nutrient numbers come from
`data/crops/nutrients.json` is separate from the crop catalog so the replay's "usable crop" rules do not change. Same `Sourced` shape (value, source, page, url, note); a value that could not be read is `null` with a reason and the crop is shown as unknown for it. Removal is nutrient carried off in the harvested product per unit of yield. The farmer enters yield in the unit printed (bushel, bale, ton), so no unit conversion is invented.

| Crop | Unit | N | P2O5 | K2O | Source read |
|---|---|---|---|---|---|
| Winter wheat | bushel of grain | 1.2 | 0.48 | 0.29 | Univ. of Arkansas FSA2176 (2015), Table 1, quoting IPNI |
| Maize (grain) | bushel of grain | 0.67 | 0.35 | 0.25 | same, row 'Corn (bushels)' |
| Cotton | bale of lint | 32 | 14 | 19 | same, row 'Cotton Lint (bale)' |
| Rice | bushel | 0.57 | 0.30 | 0.16 | same, row 'Rice (bushels)' |
| Sunflower | bushel of seed (28 lb) | 0.8 | 0.31 | 0.25 | Montana State Extension, Nutrient Uptake & Removal, footnote b (Manitoba median) |
| Sugar beet | ton of roots | 3.5 | 1.6 | unknown | Univ. of Nebraska CNMP Reference Tables, Table R-1 |
| Dry bean | bushel (60 lb) | 3 | 0.79 | 0.92 | Montana State Extension, dry bean table headed 'Fertilizer Guidelines for Montana Crops' (the graph above it cites Heard and Brolley 2008) |

All figures are lb per unit. Each entry also lists the other published readings found (`removalAlternatives`) so the spread between sources is visible. They differ: for example wheat grain N is 1.2 (Arkansas, Nebraska) and 1.25 (Montana); dry bean N is 3 per 60 lb bushel (Montana) against about 2.5 (Nebraska 4.1 per cwt).

How the values were read: the Arkansas and Nebraska tables were text-extracted from the PDF files with a PDF reader and the rows transcribed; the Montana State page was fetched twice and the rows matched. The Arkansas rows were also checked by arithmetic: the unit tests reproduce the printed example yields (for example corn at 150 bu gives 101 lb N, 53 P2O5, 38 K2O).

Limits, stated in the data and on screen:
- The sources are for other regions (Arkansas, Nebraska, Montana, Manitoba). None is a California measurement.
- Removal in the harvested product only. Residues, fertilizer and soil supply are not counted; no sourced figure for them was read.
- Search-result summaries of these tables disagreed with the documents (one gave wheat N as 1.5; the Arkansas table prints 1.2), so only values read from the documents themselves were used.

## Replenishment
`nFixationLbPerAcre` is null for every catalog crop and says why. The only fixation source read (UC IPM, Dry Beans) prints a rate per bean type (20 to 120 lb N/acre/season); the catalog crop has no bean type, so no figure is chosen. For non-legumes no figure was printed in any source read, and zero is NOT assumed: replenishment shows "unknown".
No rotation credit is stored. One candidate was read (Nebraska CNMP Table R-4, row 'Sugar beet tops, followed by dry beans', 100 lb N/acre) but the row sits under a 'Previous Crop' column and can be read two ways, and neither crop runs in the replay, so it was left out rather than stored as an interpretation. The mechanism (`rotationCredits`, `creditsBetween`) is in place and tested.
**Consequence:** the current catalog has no legume with a usable fixation figure, so "nutrients that are replenished" cannot be computed yet. Adding one (for example soybean or a cover-crop legume) needs FAO-56 Kc, stage lengths, NASS planting dates, a heat threshold and a fixation figure, all sourced. That is a decision for the user.

## Rotation comparison (`src/lib/soilhealth`)
`compareRotations(rotations, yields, waterByName)`: for each rotation, removal per crop, total and per-season average over one cycle for N, P2O5, K2O (null if any crop in the cycle lacks a yield or a figure), flags (same crop in neighbouring seasons including the wrap, single crop, distinct crops), printed credits, and the replay's seasons short. It orders rotations by removal only when every rotation has a known figure. It gives no single "soil health score".

## Farmer inputs (`src/lib/farmer`)
- Budget to mm: US (budget / price per acre-foot / acres, x 304.8 mm per foot) or metric (budget / price per m3 / (hectares x 10,000) x 1000). All three inputs required; no defaults; the steps with the numbers used are returned so the farmer can check them. Currency is a label only.
- Priorities: dependable water, use less water, low water cost (needs a price), take less nitrogen out, grow a mix of crops. They are laid out side by side with the computed numbers in the farmer's order; the best rotation is named only when every rotation has a number, and ties are reported. No weighted score.

## Local-expertise notes (`data/expertise/notes.json`)
Four word-for-word quotations (two from UC Cooperative Extension, Fresno County; two from the Arkansas publication) with source, URL and read date. Gaps are recorded where nothing could be read:
- Brentwood: UC Delta Crops pages and a Delta Protection Commission page returned HTTP 403.
- Ludhiana: the Act text that could be opened was the Haryana Act (different state), so it was not used; the Punjab Act and PAU pages could not be opened.
- Fresno: only the west-side San Joaquin Valley summary was readable; it is an early-2000s project summary.

## Advisor payload (`src/lib/advisor/payload.ts`)
`buildAdvisorPayload` assembles the one package the model will be allowed to read: climate (regional climate, about 50 km grid; mean rain, ET0, July Tmax, the shift result), water (replay by rotation and decade, supply and how it was derived from the budget), soil (SSURGO, or "not available" with a reason), erosion indicator, nutrient comparison, priorities, expertise notes and gaps, and the limits that must be kept. `payloadNumerals` returns every numeral in the payload as the allow-list for the Batch 2 guard. Tested on real saved Brentwood and Ludhiana data (Ludhiana: soil not available, outside-California warning, expertise gap). The yields and budget in those tests are test inputs, not data about any farm.
The payload also carries the terrain caveat with the erosion indicator (a NASADEM surface model, so slope at a city point is not farm slope) and a land-cover section from the saved satellite record. When every year's class is non-crop (Fresno: Developed), a limit tells the model the point is not cropland and must not be called a field.
Payload size is about 12 kB per pin.

## Wiring into /replay
Done in Batch 2 (docs/advisor-method.md): the budget form, yields, priorities table, nutrient table with a per-figure source list, local notes with their gaps, and the AI summary are in section 4 of `/replay`. This document describes the Batch 1 data and logic.
