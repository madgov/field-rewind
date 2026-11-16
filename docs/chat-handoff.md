# Field Rewind chat handoff

## Instructions for the next chat

Continue collaborating on Field Rewind using this context. Start by inspecting the current repository and verification documents, because work may have continued after this handoff. Preserve the existing UI and calculations unless a specific change requires otherwise. The user wants the highest-value improvements for the challenge, with minimal UI disruption. This handoff records planning and review; it does not authorize implementing the entire roadmap or deploying.

Workspace: `/Users/justenwu/Downloads/field-rewind MAIN 2`.
Public demo: https://field-rewind-t4fe.vercel.app. The deployed version may differ from local code.
Context date: November 15, 2026, America/Los_Angeles. Some recorded timestamps are November 16 UTC; do not confuse this with a later local day.

Read `AGENTS.md` first. It requires reading relevant guides in `node_modules/next/dist/docs/` before writing code: this Next.js version has breaking changes. Read applicable nested instructions too. `CLAUDE.md` contains original project constraints, but its crop-survival framing is obsolete: the app compares modelled water needs with supply, not survival. Never expose or commit credentials, invent data, silently substitute mocks, or present missing values as zero. Do not deploy unless requested. The folder previously had no `.git` metadata; verify before making branch, commit or repository claims. No commits, pushes or deployments were performed during this conversation.

## Challenge and intended outcome

The user supplied the full Field Shift challenge. Its central request is a decision-support tool combining NASA Earth observations, local soil information, crop characteristics and farmer priorities to help farmers explore rotation strategies that could improve soil health and resilience to changing weather and water conditions.

The brief suggests comparing at least three strategies including the existing rotation, explaining evidence, benefits, gaps and risks requiring local review. It offers nutrient cycling, erosion, organic matter, pest disruption, water use, forage and markets as possible comparison dimensions. It encourages understandable visualizations, uncertainty explanations and local expertise. Individual datasets and optional features are suggestions, not a mandatory checklist. Do not invent an official judging rubric or numerical deductions.

Full user-supplied challenge text is at `/Users/justenwu/.codex/attachments/20290535-b4ee-4649-b30e-e70f7d49d054/Pasted text.txt`. Read it if available; it includes resource descriptions and links. The original AI request is also summarized in `docs/stage7-ai-advisor.md`: cross-reference climate, soil, irrigation budget and crop needs; account for removal and replenishment; explain sustainable choices. That file is a historical brief, not a reliable current implementation checklist. Its original Anthropic provider instructions were superseded by the user's Gemini choice.

## Current application

Next.js App Router, TypeScript, React, Leaflet. Package versions observed: Next 16.4.6, React 19.3.0, official Google GenAI SDK. Verify installed versions before relying on them.

- Home: map, coordinates, three demo pins and constructed Brentwood example.
- `/shift`: historical regional climate comparisons between 1985–2004 and 2006–2025.
- `/replay`: two or three user-constructed rotations, 40 harvest-year seasons from 1986 through 2025, water-supply slider, decade counts, season scrubber, gauges, what-if rain/temperature panel, budget-to-water conversion, yield assumptions, priorities, nutrient removal, source details, expert notes, optional Gemini summary and printable report.
- `/conditions`: weather, modelled wetness, Landsat/MODIS vegetation, terrain, soil survey, ground checks, map overlays, yearly view and newly added NASA snapshots.
- Glossary, satellite-versus-ground explanations and How We Know panels explain provenance and limitations.
- APIs: weather, what-if scenario and AI advisor.

Weather comes from NASA POWER, labelled regional climate, about 50 km grid. Daily FAO-56 ET0 and crop coefficients estimate water use; effective rain is subtracted and the remainder compared with selected supply. Covered does not mean surviving or producing a predicted yield. Yield assumptions estimate harvested nutrient removal and do not decrease when water is short. Removal is not remaining soil nutrients or a soil-health measurement. Irrigation delivery losses and soil-water carry-over are not modelled.

Supporting layers include saved CIMIS for Brentwood, OpenET for Brentwood/Fresno, Landsat/MODIS, NASADEM, SSURGO, Daymet, CoCoRaHS, crop classifications, land cover and wells. Coverage and measurement types differ. SSURGO does not provide plant-available N/P/K. Ludhiana lacks US soil coverage. Fresno's demo point is classified as developed land; do not describe its observed history as farmland.

## Crops and schedules

Four of seven catalog crops were usable at review: winter wheat, maize grain, cotton and rice. Sunflower and sugar beet lacked heat thresholds. Dry bean already exists, with water parameters and nutrient removal, but is excluded because planting-window/default-date values are missing. Verify current catalog rather than adding a duplicate legume.

Planting dates and fixed stage lengths determine harvest-year schedules. The replay already detects adjacent-season overlaps and displays warnings; overlapping days can still count in both crop seasons. A generated shortlist must exclude infeasible schedules. There is no editable planting-date calendar yet. Any future calendar must use the same schedule functions as the replay.

Nutrient removal uses published averages from other regions and user-entered yields. All catalog fixation figures were unknown and no rotation credits were stored. Diversity, removal and documented benefits must remain separate. Nitrogen fixed is not automatically nitrogen available to the following crop, and legumes do not establish phosphorus/potassium replenishment. Never infer complete nutrient balance or soil improvement from harvest removal alone.

## Earthdata status changed during the conversation

Earlier notes said SMAP and IMERG were absent or in progress. Latest inspected local files now include implementation, saved data for all three pins and `docs/earthdata.md`. Read those before making status claims; older README and verification statements may lag.

Current documented scope: saved SMAP SPL3SMP_E v006 morning observations for July 1–7, 2025, and IMERG Final monthly v07 for July 2025, for Brentwood, Fresno and Ludhiana. These are bounded context snapshots, not current conditions, trends or inputs to the 40-season replay. SMAP has a 9 km posting grid and approximately 36 km radiometer footprint, measures near-surface moisture, and preserves retrieval quality flags. IMERG precipitation rates are converted using actual calendar-month hours. Missing observations remain missing. ECOSTRESS and GLDAS/NLDAS remain unimplemented.

Fetch scripts need a server-side Earthdata token; saved display does not. Access was product-specific, including a user-resolved GES DISC terms blocker. Do not access credentials or repeat acceptance steps casually. This chat did not independently certify the final Earthdata build or browser results.

## Verification evidence and open issues

Read `docs/local-verification.md`, `docs/advisor-method.md`, `docs/audit-stage7.md` and `docs/earthdata.md`.

Recorded local baseline: 912 tests in 78 files, lint, typecheck and production build passed. Offline production HTTP checks recorded 13 pages, saved weather at all pins, invalid-input handling and offline advisor behavior. A what-if with 700 mm supply, 20 percent less rain and +2 C changed the first wheat/maize rotation from 7 to 18 short seasons out of 40. This baseline does not certify subsequent Earthdata work.

Real local Gemini calls passed for ALL THREE pins, including Fresno. This was initially overlooked in an earlier recommendation and then corrected after inspecting updated docs and saved records:

| Pin | HTTP and app status | Model | Elapsed | Attempts |
| --- | --- | --- | --- | --- |
| Fresno | 200 / ok | gemini-3.6-flash | about 10 seconds | 1 |
| Brentwood | 200 / ok | gemini-3.6-flash | about 8 seconds | 1 |
| Ludhiana | 200 / ok | gemini-3.5-flash-lite | about 20 seconds | 2 |

Inputs were example rotations, 700 mm supply, no yields and water-related priorities. Saved records are ignored `scratchpad/gemini-<pin>-live.json`; timestamps and detailed inputs are in the advisor method doc. Local connectivity is demonstrated for those cases. Vercel Gemini configuration and accepted responses remain separately unverified in the recorded evidence.

The validator checks numbers against cited payload paths and selected wording/missing-data rules. It does not prove scientific correctness. Accepted Fresno prose incorrectly suggested slope gives the soil erodibility factor. Accepted Ludhiana prose called annual reference ET crop water demand and placed the California warning later than requested. These are confirmed open semantic findings, not fixed by updating documentation. Free-tier quota/model availability and first-response validation also affect reliability.

Historical Stage 7 browser audit: 73 checks, 71 pass; the two remaining reported failures were inline links described as exempt. It used stubbed advisor responses, not live Gemini. Later HTTP checks did not repeat that browser audit. Keyboard coverage, measured contrast, screen readers, real phones, NDVI interaction checks and current print pagination remain incomplete or require a fresh pass. No fresh deployed end-to-end review was performed here.

Method gaps: effective-rain formula was checked against a secondary source; planting windows and heat thresholds still need the documented source rechecks. Some crop thresholds have growth-stage-specific meanings, so avoid overstating whole-season suitability.

## User roadmap and acceptance criteria

The user supplied these seven options, numbered 2–8:

2. Reusable farm profile: location, crops, water, planting and priorities in one place; optional soil tests with units, sampling depth and date; local saving/deletion. Editing must consistently update relevant comparisons.
3. Rotation calendar: sourced default timing and overlap flags; editable dates only when the engine recalculates correctly. Calendar and replay must share schedules.
4. Crop and soil-health evidence: recheck parameters and research one region-appropriate legume/cover crop; calculate only sourced values; separate diversity, removal and documented benefits; keep unknowns explicit.
5. SMAP pilot: real access, quality flags, saved responses, coverage and interpretation; expand after one pin works. Latest local work has progressed beyond the originally proposed pilot; inspect current files.
6. Explainable shortlist: bounded valid alternatives evaluated by existing replay and priorities, reasons and disadvantages, traceable calculations; insufficient evidence prevents the relevant recommendation.
7. Stress testing/sharing: historical heat and shortage summaries, what-if settings in links and assumptions in reports. Shared scenarios must reproduce inputs and results.
8. Usability/release: keyboard, contrast, screen readers, mobile and NDVI; verify Gemini separately; deploy only when requested, then repeat live checks.

The user asked which TWO features matter most without disrupting the UI. Recommendation was #4, then a narrow #6. This is advice, not a user-approved implementation commitment. Treat verification and correction of known AI errors as completion work, not a reason to skip checks to fit the two-feature limit.

Suggested minimal UI: add the sourced legume to the existing crop selector and extend existing nutrient/source displays. Add one Compare alternatives button beside the rotation builder, show at most two alternatives alongside the existing rotation, and reuse current comparison components. Show advantages, disadvantages and missing evidence; avoid an invented overall soil-health score or sweeping best-rotation claim. Use only crops and schedules supported by the existing engine. A nitrogen-data gap should block nitrogen conclusions, not automatically suppress a valid water comparison.

USDA prices were discussed earlier. A real source exists in NASS Prices Received/Quick Stats, but exact commodity, region, period and unit coverage was not verified. The challenge also mentions AMS Market News. Price integration was lower priority; gross revenue requires yield assumptions, while profit requires production costs. Current yields do not respond to simulated water shortages. Do not promise profitability from price alone.

## Hypothetical judge assessment

The biggest risk is that a strong historical water tool only partly fulfills the healthier-rotation decision-support goal. Potential deductions discussed:

1. No demonstrated replenishment or supported soil-health benefit for alternatives.
2. Farmers must construct alternatives themselves; three-way comparison exists, but systematic suitable suggestions and tradeoffs are limited.
3. Many environmental layers are displayed as context without clearly changing rotation comparisons. Show one defensible link between local conditions and interpretation rather than collecting more datasets.
4. Global presentation exceeds California crop evidence; Ludhiana soil gaps and a developed Fresno demo point weaken local suitability claims. Lead with a credible agricultural California example and label the prototype region.
5. Misleading accepted AI explanations undermine trust.
6. Conflicting schedules can still be evaluated; suggestions must exclude infeasible options.
7. Tests and service connectivity do not prove farmer usefulness or agronomic validity. A documented farmer/adviser walkthrough and current mobile/live verification would strengthen the case.

Missing saved profiles, every NASA dataset or market prices are not automatic deductions under the supplied optional wording. No numeric score was assigned. Existing strengths include sourced computations, a long historical replay, three-rotation comparison, explicit unknowns, provenance, ground comparisons and restrained claims.

## Files and continuation workflow

- Overview: `README.md`.
- Current evidence: `docs/local-verification.md`, `docs/advisor-method.md`, `docs/audit-stage7.md`, `docs/earthdata.md`.
- Sources/methods: `docs/crop-sources.md`, `docs/nutrient-sources.md`, `docs/replay-method.md`, `docs/scenario-method.md`, CIMIS/OpenET docs.
- Data: `data/crops/catalog.json`, `data/crops/nutrients.json`, `data/earthdata/`.
- Engine: `src/lib/replay/assemble.ts`, `season.ts`, `replay.ts`; crops, nutrients, soilhealth, farmer priorities and advisor libraries.
- UI: `src/components/replay/RotationBuilder.tsx`, `FieldAdvisor.tsx`, replay app/content and conditions components.
- Earthdata: `scripts/fetch-earthdata.ts`, `scripts/lib/earthdata.ts`, `src/lib/earthdata/`.
- Commands: `npm test -- --maxWorkers=2`, `npm run lint`, `npm run typecheck`, `npm run build`. Choose checks appropriate to actual changes.
- Offline HTTP script: `scratchpad/verify-local.mjs`, expects an offline production server on port 3100; do not use it as evidence of live Gemini.

This conversation updated the local-verification, advisor-method and historical-audit docs to distinguish recorded local success, semantic defects and deployment boundaries. Saved HTTP/Gemini records and documentation links were checked. That documentation change did not rerun application tests, contact external services or fix application behavior.

Next chat should first establish what the user wants to implement, inspect changes since these observations and preserve concurrent work. If asked for implementation, prefer #4 followed by narrow #6, with focused validation and existing UI reuse. Do not restart completed connectivity tests merely because older docs say they were missing. Report what changed, what passed and what remains unresolved.
