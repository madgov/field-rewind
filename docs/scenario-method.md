# What-if scenarios: "what if the past had been drier or hotter?"

Code: `src/lib/scenario/`. Label shown with every result: "What-if applied to the real 1985-2025 record. Not a forecast." (`SCENARIO_LABEL`).

A scenario is a transformation of the REAL NASA POWER daily record (regional reanalysis, roughly 50 km grid). The transformed copy is then fed, unchanged, to the existing replay (`src/lib/replay`) and shift (`src/lib/shift`) code, so every downstream number comes from the same evaluated code. It is a sensitivity test on past weather. It is not a forecast, not a measurement, and says nothing about causes.

## The transform (`scenarioPower`)
Input `{ rainFactor, tempDeltaC, humidity? }`. UI ranges: rain 0.70 to 1.30 step 0.05; temperature -2 to +4 C step 0.5. A new object is returned; the input is never changed. `origin`, `fetchedAt`, `sourceUrls`, coverage and missing counts are carried over so the saved/live label still reads correctly, and a `scenario` field records what was applied.

1. Rain: each day's PRECTOTCORR is multiplied by `rainFactor`. Every storm keeps its real date; only amounts are scaled. A dry day stays dry, so no new rain days are created. Missing (null) stays null.
2. Temperature: `tempDeltaC` is added to T2M_MAX and T2M_MIN on every day. Wind, solar radiation and the grid-cell elevation are unchanged. Missing stays missing.
3. Humidity (matters for ET0 only when `tempDeltaC` is not 0):
   - **`hold-vapour-pressure` (default).** Each day's actual vapour pressure ea is computed from the real record exactly as the ET0 code does, FAO-56 Eq. 19: ea = RH/100 x (e0(Tmax) + e0(Tmin))/2, with e0(T) = 0.6108 exp(17.27 T / (T + 237.3)) (Eq. 11; mean es is Eq. 12). Relative humidity is then recomputed for the shifted temperatures, RH' = 100 x ea / ((e0(Tmax+d) + e0(Tmin+d))/2), so the unchanged ET0 function (Eq. 19 path) sees the same ea. Because warmer air can hold more vapour, RH' is lower than RH, the vapour pressure deficit (es - ea) grows, and ET0 rises through the aerodynamic term of Eq. 6.
   - **`hold-rh`.** RH2M is left as recorded, so ea rises with temperature and the deficit grows less. The two options bracket the plausible answer and the difference is shown in the results.
   - Why the default: FAO-56 Chapter 3 treats ea (derived from the dew point, or from RH and temperature) as the humidity variable that matters, and the dew point of an air mass changes far more slowly than its temperature. Holding the real ea keeps the day's measured moisture content and only changes how warm the air is, which is the smallest assumption about the real day. Holding RH would instead add water vapour to the atmosphere that the record never had. The choice is an assumption, not a finding, and is therefore exposed.
   - RH' is limited to 0-100. A day that would exceed 100% (this happens when cooling) is set to 100 and counted in `rhClampedDays`; on those days ea is slightly lower than the real one. Days where RH' could not be computed (missing temperature or invalid RH) keep the recorded RH and are counted in `rhNotAdjustedDays`. Neither count is hidden.
4. Identity: at rain 1.0 and shift 0 the day values are returned identical to the original, so results reproduce exactly (tested: Brentwood example rotations at 700 mm give 2,2,2,1 / 9,8,8,8 / 6,4,4,6 per decade; shift result deep-equals the original).

## Entry points
- `runScenarioReplay(power, crops, { rotations, supplyMm, scenario })` -> `{ replay, scenario, label }`
- `runScenarioShift(power, scenario)` -> `{ shift, scenario, label }`
- `scenarioSweep(power, crops, { rotations, supplyMm, humidity? })`: years short in 2016-2025 and over all 40 seasons for each rotation, at rain 0.70..1.30 with no temperature shift, and at -2..+4 C with rain 1.0 (25 distinct replays, baseline shared).
- `scenarioWording(baselineReplay, scenarioReplay, scenario)`: sentences generated only from the computed counts, e.g. "With 20% less rain on every day of the real record, the maize-then-cotton rotation would have been short of water in 35 of 40 seasons instead of 33."

## Limits (read before trusting a number)
- Uniform scaling and shifting are crude perturbations. Real wetter or drier years change storm size, frequency, timing and season length differently; none of that is modelled.
- Seasonality and storm timing do not change. Rain days stay the same days.
- Wind speed and solar radiation are unchanged, so any ET0 effect of cloud, radiation or wind is absent.
- Humidity has no feedback beyond the chosen option; neither option is a prediction of how humidity would behave.
- Crop planting dates, stage lengths and Kc are the same as in the base replay (no heat-driven earlier maturity), and the replay's own limits (docs/replay-method.md) all still apply.
- Cooling with ea held pushes many days against RH = 100% (Brentwood at -2 C: 1,664 days clamped), so the cooler end of the temperature slider is the least faithful.
- Counts of years short are small-sample numbers and move in steps; a step in a chart is a threshold being crossed, not a smooth response.
- Underlying data is regional reanalysis (about 50 km grid), not a farm sensor.

## The sliders on /replay and the AI hookup (Stage 7)
Code: `src/components/replay/ScenarioPanel.tsx`, `src/app/api/scenario/route.ts`, `src/lib/advisor/scenarioView.ts`, `src/lib/advisor/server.ts` (`buildScenarioResponse`).

- **Controls.** Rain 0.70 to 1.30 (step 0.05), shown as "20% less rain" / "as recorded"; temperature -2 to +4 C (step 0.5); the humidity option with the plain-English reason for each choice (only active when the temperature is changed); a reset button. "What-if applied to the real 1985-2025 record. Not a forecast." sits beside the controls and results.
- **Where it runs.** The page only holds the supply-independent season table, not the daily weather, and the scenario has to change the daily rain, temperature and humidity before ET0 and effective rain are recomputed. So the panel posts the place, rotations, supply and settings to `POST /api/scenario`, which loads the same saved or live record as the AI route, runs `replay` (as recorded) and `runScenarioReplay` (what-if) and returns both side by side. The daily record never goes to the browser. The route accepts only the slider ranges, a body of at most 20 kB, and needs no key.
- **Neutral.** Rain 1 and shift 0 make no request; the panel says the result is the replay above (the engine returns the record unchanged there, and a test checks the counts equal the normal replay).
- **Shown per rotation.** Seasons short as recorded vs in the what-if, by decade, with animated bars; the sentence from `scenarioWording`; the notes; the humidity note. Caveats are generated from the run: the cooler settings are called the least faithful part (cooling with the real moisture kept pushes many days to the 100 percent humidity ceiling), the number of days where humidity was held at the limit, days where humidity could not be adjusted, and the crude-perturbation limit. Counts are small samples (10 seasons per decade).
- **AI.** The same settings go to `POST /api/advisor` (only when not neutral). The server reruns the what-if on the anonymised rotations and adds a `scenario` section to the data package: label, settings, as-recorded and what-if seasons short per rotation and decade, the generated sentences (which name crops, not the rotation letters), notes and caveats. Neutral or absent gives `{status: "not-applied"}` and the prompt tells the model to mention no what-if. The prompt requires a what-if to be described only from that section, as a what-if on the real record and not a forecast; the existing reply check applies unchanged (every figure must sit at a cited path), and the section's own sentences pass it when quoted.
- **Not done.** The slider values are not in the share link. The main strips and gauges are not redrawn for the what-if; the panel has its own side-by-side view. Not exercised in a browser (none available to the worker): the page markup, the route and the pure code are tested, but dragging a slider, the bar animation and the loading state were not seen on screen.
