# Crops that fit your water (alternatives)

Code: `src/lib/alternatives/index.ts`, route `POST /api/alternatives`, UI `src/components/ask/Alternatives.tsx` (on /ask, Step 3).

## Method
- For the pin, load NASA POWER daily data (saved demo pin for the example farm, otherwise `getPowerData`, which honours the offline switch). Labelled "regional climate, about 50 km grid" with the saved-response date.
- For every crop in `usableCrops()`, build the supply-independent season table (`buildSeasonTable`): FAO-56 crop water need minus effective rain, each season 1986 to 2025, the crop grown alone.
- Repeat on two what-ifs made by the scenario engine (`scenarioPower`): 2 °C warmer (rain unchanged, vapour pressure held) and rain x0.8.
- Judge each season against the farmer's supply with `judgeSeason`. Count short seasons over all 40, 1986-1995 and 2016-2025.
- Rank by short seasons in 2016-2025 on the real record, then by the +2 °C count, then by median need. Crops with fewer than 8 judged seasons in the last decade (real, warmer or drier) are listed unranked with the reason.
- Every sentence is generated from those counts. The headline says plainly when no crop fits better than the farmer's current crops.

## Limits
- Water need only. Not yield, price, pests, markets, soil, frost or labour.
- Each crop alone, one season a year, at its catalog planting date; no double cropping or rotation effects.
- Warmer and drier are what-ifs on the real record, not forecasts.
- Heat days are shown only where the crop's heat threshold has a cited source; they are never used for ranking.
- Ten seasons is a small sample: a difference of one or two seasons is not meaningful on its own.

## Growing-season groups
- Crops are split by their catalog default planting month: "Cool season (planted Sep to Feb)" and "Warm season (planted Mar to Aug)". Ranking and headlines are within a group; the farmer's current crops' group is shown first.
- Each row shows the planting month and the FAO-56 Table 11 region row its stage lengths come from. Planting months may not match local practice.
- When the median irrigation need is under 50 mm the line says rain covered the modelled need in most seasons when planted in that month. It never says a crop needs no water.
