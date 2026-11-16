# Field Rewind

Built for NASA Space Apps 2026 (Field Shift). It answers one question for a farmer, a farm adviser or a student:

**"Would your water supply have met your crops' modelled needs over the last 40 seasons?"**

Drop a pin on the map. The app shows (1) how the regional climate at that spot has shifted between 1985-2004 and 2006-2025, (2) a 40-season replay (1986 to 2025) of up to three crop rotations against a water supply you choose, season by season, (3) the field conditions around the pin (soil, terrain, satellite vegetation, frost, ground checks), and (4) on the replay page, your water budget, yield assumptions and priorities set against published nutrient figures, with an optional plain-English summary written by AI from those computed numbers.

"Covered" means the selected supply meets modelled water need beyond rain. The replay does not predict crop survival, yield or soil-health change. Yield entries come from the user's records or assumptions and are used for nutrient-removal estimates; they are not adjusted when water is short. Nutrient removal does not measure the nutrients remaining in the soil.

Public demo: https://field-rewind-t4fe.vercel.app. The deployed version may differ from local changes; a working homepage does not verify every feature or the AI connection. Run it locally as below.

## Setup and run

Needs Node.js 22 or newer and npm.

```bash
npm install
npm run dev            # http://localhost:3000
npm test               # vitest, all tests
npm run typecheck      # tsc --noEmit
npm run lint
npm run build          # production build
npm run start          # serve the production build
```

Run with no network at all (only the saved example places work):

```bash
FIELD_REWIND_OFFLINE=1 npx next start -p 3100   # after npm run build
```

Data scripts. Each needs the network and each overwrites committed saved files in `data/`, so do not run them casually. They fail loudly and write nothing rather than save placeholder data.

```bash
npx tsx scripts/fetch-demo-pins.ts      # NASA POWER daily weather for the 3 demo pins  -> data/power/
npx tsx scripts/fetch-power-extra.ts    # POWER soil wetness, frost, surface heat         -> data/power-extra/
npx tsx scripts/fetch-landform.ts [id]  # NASADEM terrain + SSURGO soil                   -> data/landform/
npx tsx scripts/fetch-ndvi.ts [pin]     # Landsat NDVI (add --modis for Brentwood MODIS)  -> data/ndvi/ (slow, resumable)
npx tsx scripts/fetch-earthdata.ts [pin|all] [YYYY-MM] # SMAP daily sample + IMERG month -> data/earthdata/; needs EARTHDATA_TOKEN
npx tsx scripts/fetch-ground-truth.ts   # Daymet, CDL, NLCD, CoCoRaHS, USGS wells         -> data/ground-truth/
npx tsx scripts/fetch-cimis.ts          # CIMIS station 47; needs CIMIS_APP_KEY
npx tsx scripts/fetch-openet.ts         # OpenET monthly ET; needs OPENET_API_KEY (optional pin id, default brentwood)
```

There are also report scripts, `scripts/shift-report.ts` and `scripts/replay-report.ts`, that print results to the terminal.

## Environment variables

Put these in `.env.local` or `.env` (both are git-ignored; never commit them; `.env.example` lists the names). They are read on the server only and never reach the browser.

| Name | Purpose |
| --- | --- |
| `CIMIS_APP_KEY` | CIMIS Web API key (sent in the `Ocp-Apim-Subscription-Key` header). Register at https://cimis.water.ca.gov/ and get it from your account page. The old registration site no longer exists. |
| `OPENET_API_KEY` | OpenET API key. Register at https://account.etdata.org |
| `GEMINI_API_KEY` | Google Gemini API key (free tier works), from Google AI Studio. Enables the AI summary on `/replay`. |
| `GEMINI_MODEL` | Optional. First model to try, e.g. `gemini-3.6-flash`. If it is busy, out of quota or missing, the route tries other free-tier models and names the one that answered. |
| `EARTHDATA_TOKEN` | Fetch-machine only: NASA Earthdata bearer token for `scripts/fetch-earthdata.ts`. NASA GES DISC terms must also be accepted by the account owner for IMERG. The site reads saved files and needs no Earthdata token at runtime. |
| `FIELD_REWIND_OFFLINE` | `1`, `true`, `yes` or `on`: the server contacts no outside service (NASA POWER, the ground-check and soil services, Gemini); only saved example places work and the AI summary is off. See `docs/example-mode.md`. |

The app runs without any of the keys. The CIMIS and OpenET panels read the saved responses included in `data/`; their keys are needed only to fetch replacements. Without a Gemini key the AI block says it is not connected and writes nothing in its place; everything else on the page still works.

## Pages

- `/` map with demo pins (Brentwood CA, Fresno CA, Ludhiana Punjab), your own coordinates, and "Load example farm (Brentwood)".
- `/shift` "Your field has shifted": hot days over 35 C, crop water demand (ET0) and rainfall, early versus late 20-year periods, year stripes. Headlines are generated from the computed numbers; if there is no shift it says so, and if a measure cannot be compared it says that.
- `/replay` choose 2 or 3 rotations and a seasonal water supply; 40-season strips, a season scrubber with water gauges, then section 4, a what-if panel (rain 0.70 to 1.30 times the real record, temperature -2 to +4 C, run on the real daily record on the server, labelled "What-if applied to the real 1985-2025 record. Not a forecast."), then section 5: a water-budget form (money to mm), user-entered yield assumptions, a priorities table, nutrients carried off with a source for every figure, local-expert quotes, and the AI summary. Then a "How we know" panel and a one-page printable report (Print report button).
- `/conditions` field conditions for a pin: heat and frost, modelled soil wetness, dated SMAP surface-moisture and IMERG rainfall snapshots for the three demo places, Landsat vegetation, soil and terrain, a map, ground checks, a harmonized 1985 to 2025 yearly view, and a list of data layers that are not connected. The Earthdata snapshots remain separate from the yearly view and replay. See `docs/conditions-page.md` and `docs/earthdata.md`.
- `/glossary` 33 plain-English terms, each with what it does not tell you and the sources it was read from (`docs/site-pages.md`).
- `/satellite-vs-ground` what satellite and model layers can and cannot say compared with ground measurements, for every layer this app uses, including findings from the saved data and the layers that are not connected.
- `/dev` the raw saved-data summary for the three demo pins.
- `/api/power` JSON endpoint for NASA POWER data.
- `/api/scenario` POST: runs the what-if on the server and returns baseline and what-if side by side. No key needed.
- `/api/advisor` POST: your choices in, a checked AI summary out (or a plain reason why not). Server side only.

## Data sources

- **NASA POWER** daily API, community AG, 1985-01-01 to 2025-12-31 (https://power.larc.nasa.gov/docs/services/api/temporal/daily/). Always labelled "regional climate, about 50 km grid": it is reanalysis, not a sensor in a field. Details: `docs/power-integration.md`.
- **FAO-56 Penman-Monteith ET0** (Allen et al. 1998, https://www.fao.org/4/x0490e/x0490e00.htm), with a unit test against the paper's worked example. Details: `docs/et0-mapping.md`.
- **Crop parameters** (crop factors, stage lengths, planting windows, heat thresholds), each with its source: `data/crops/catalog.json`, explained in `docs/crop-sources.md`. A crop with any unsourced value is excluded.
- **Effective rainfall**: USDA Soil Conservation Service monthly formula as used in FAO CROPWAT.
- **CIMIS station 47 (Brentwood)**, https://cimis.water.ca.gov/, daily ASCE ETo for a station-versus-POWER ET0 check, 2010 to 2025: `docs/cimis-check.md`.
- **OpenET** (https://openetdata.org), satellite actual ET, monthly Ensemble 2015 to 2026 for Brentwood and Fresno (the API serves nothing earlier and limits a request to 10 years): `docs/openet-check.md`.
- **Field-condition layers** (all labelled with their own origin line; US-only layers say "not available" elsewhere):
  - NASA POWER soil wetness, frost and surface heat, regional climate, about 50 km grid: `docs/power-extra.md`.
  - Landsat Collection 2 Level-2 NDVI (30 m, one pixel per pin) and, for Brentwood, ORNL MODIS 250 m: `docs/ndvi.md`.
  - NASADEM terrain (about 30 m surface model) and USDA NRCS SSURGO soil via Soil Data Access (US only): `docs/landform.md`.
  - Ground checks: Daymet rain, CoCoRaHS gauge, USDA NASS Cropland Data Layer crop history (a satellite classification, not a farm record), NLCD land cover, USGS wells: `docs/ground-truth.md`.
  - SMAP SPL3SMP_E v006 morning surface-soil-moisture sample (2025-07-01 to 2025-07-07), with retrieval-quality flags, and GPM IMERG Final monthly v07 rainfall (July 2025): `docs/earthdata.md`. These are real saved snapshots for the demo pins, not a 40-season history or current field readings. Rejected and missing SMAP retrievals are excluded; no nearby valid value is substituted.
- **Crop nutrient removal** per unit of yield from published tables (University of Arkansas FSA2176, University of Nebraska CNMP tables, Montana State Extension), each value with source and page: `data/crops/nutrients.json`, `docs/nutrient-sources.md`. Not California measurements and not a soil test.
- **Local-expert quotes**, word for word with source and read date: `data/expertise/notes.json`.
- **Google Gemini API** writes the optional summary: `docs/advisor-method.md`.
- The Fresno July temperature comparison in "How we know" uses the NOAA NCEI U.S. Climate Normals 1991-2020 (station FRESNO YOSEMITE INTL AP, USW00093193), cited on the page.

Method write-ups: `docs/shift-method.md`, `docs/replay-method.md`, `docs/example-mode.md`, `docs/scenario-method.md`, `docs/nutrient-sources.md`, `docs/advisor-method.md`.

## How saved, cached and live data are labelled

One function (`src/lib/power/label.ts`) words it for every screen, the replay chip, the printed report, "How we know" and `/dev`:

- Saved responses (the committed files in `data/power/`) and runtime-cached responses both read "Saved response from [date, time UTC]", with the real fetch time.
- Only data fetched in that very request may say "Fetched from NASA POWER just now".
- CIMIS and OpenET saved data say "saved response from [date]" too.

## The method in a few lines

1. Daily POWER weather gives ET0 by FAO-56 Penman-Monteith.
2. Crop water use for a season = sum over days of crop factor (by growth stage) times ET0.
3. Need beyond rain = max(0, crop water use minus effective rain). The season is "short" if the need is above your supply, otherwise covered, and grey (not judged) if more than 10 days lack ET0 or more than 10 days lack rain, or the season is outside the record.
4. Counts of short seasons are shown per decade. Ten seasons per decade is a small sample, so no trend is claimed.

## The AI summary: what it is and what it is not

On `/replay`, section 5 can send the computed results to Google Gemini and show a short plain-English summary. Rules it runs under (details and live test results: `docs/advisor-method.md`):

- The model never supplies a number. The server rebuilds every figure from the same data the page uses, and the summary is shown only if every number in each paragraph sits at a data path that paragraph cites. A summary that fails the check, even after one retry, is not shown at all, and the reasons are listed.
- Missing layers stay missing: a place with no soil data (for example Ludhiana) is reported as "not available", and nothing fills the gap.
- What is sent to Google: the computed results, your yields and priorities, your location rounded to the 50 km grid, and rotation letters instead of the names you typed. Not sent: money amounts, field size, your typed names. On the free tier Google says content may be used to improve its products; the page says this next to the button. In offline mode nothing is sent.
- It is not a forecast, not a soil test and not agronomic advice. Every summary is labelled as written by AI.

## Known limitations

- Crop values are California values (California Delta / Central Valley). The replay page and report print that region, and warn when the pin is outside California. That check is an approximate bounding shape, not real borders (`src/lib/crops/region.ts`).
- Up to 10 missing ET0 days per season add 0 to crop water use; up to 10 missing rain days add 0 rain. Beyond 10 the season is grey.
- In the water gauge, a short season's red part is drawn at least a small fixed height (4% of the vessel) so a near miss stays visible; the gauge says so when this applies.
- The runtime cache uses 0.5 degree cells, which differ from POWER's native grids.
- CIMIS and OpenET saved data came from the first real requests on 2026-11-16, and both clients had to be corrected against the real APIs (CIMIS moved to a new API and header; OpenET limits a request to 10 years and starts in 2015). Only Brentwood has a CIMIS check, only Brentwood and Fresno have OpenET (US only), and CIMIS QC flag letters other than N are carried but not interpreted. The legacy CIMIS API is past its announced end date, so a re-fetch depends on the new one.
- Only 4 of the 7 catalog crops are usable; the others lack a sourced value and are excluded.
- The effective-rainfall formula was verified from a secondary source (training slides), not an FAO page.
- Heat thresholds and planting windows were not re-verified against the source papers.
- There is no land or ocean check for pins.
- POWER reads hotter than weather stations (see the Fresno example in "How we know"), so hot-day counts are regional-grid counts. The change between periods is the point.
- The default example supply of 700 mm was derived from the Brentwood record and is used as the default on every pin.
- No soil water carry-over and no delivery losses are modelled.
- Nutrient figures are published averages for harvested product from Arkansas, Nebraska and Montana, not California measurements. Residues, fertilizer and soil supply are not counted. Nitrogen fixation and other replenishment are "unknown" for all seven catalog crops (no source gave a usable figure), and unknown is never treated as zero. There is no legume in the catalog yet.
- The soil survey has no plant-available nitrogen, phosphorus or potassium. Soil and several ground layers are US only, so Ludhiana shows "not available".
- Some demo-pin points are not farmland: the Fresno pin is developed land, so its crop history and vegetation say so, and the AI is told not to call it a field. Slope comes from a surface model and is not farm slope on built-up ground.
- Local-expert notes are sparse: only Fresno has a place-specific quote; Brentwood and Ludhiana show a stated gap (the pages could not be opened).
- The AI summary used the free Gemini tier in testing. Free models are sometimes busy and have small quotas, the first reply often fails the check and is retried once, and a "limit reached" message is possible on a busy day.
- SMAP and IMERG cover only the dated demo-pin snapshots in `data/earthdata/`, with no arbitrary-pin live fetch, forecast, or change to the water replay. SMAP's posted 9 km grid comes from an approximately 36 km footprint, and values failing its quality check stay unavailable. ECOSTRESS and GLDAS/NLDAS remain unimplemented. Market prices (USDA) are not connected, so nothing says what a rotation earns.
- The `/conditions` pages are heavy (about 1 MB for Brentwood and 1.6 MB for Fresno). NDVI map windows exist only for the three demo pins.

## Status of CIMIS and OpenET

Both have run. `data/cimis/station47.json` (5,844 daily values, 2010 to 2025) and `data/openet/brentwood.json`, `data/openet/fresno.json` (142 monthly values each, 2015 to October 2026) were fetched on 2026-11-16 and every screen labels them "saved response from 2026-11-16". The keys are needed only to re-fetch (`scripts/fetch-cimis.ts`, `scripts/fetch-openet.ts`); the site reads the saved files, so the deployed site does not need them.

## 60-second demo (no keys needed)

1. `npm run dev`, open the home page.
2. Click "Load example farm (Brentwood)". The page says "Saved response from [date]", "Regional climate, about 50 km grid" and "Constructed example, not records of a real farm".
3. Look at the three strips: red cells are seasons short of the 700 mm supply; the headline per rotation compares 1986-1995 with 2016-2025.
4. Drag the water supply slider and watch the cells and headlines change.
5. Drag the season scrubber (or press play) and read the water gauges.
6. Open "How we know" for data sources, the 50 km caveat and the crop sources.
7. Press "Print report" for the one-page report. The new sections on the page are hidden in print.
8. Move the what-if rain and temperature sliders and read baseline against what-if. Then in section 5: type a budget, a water price and a field size and press "Use ... as my water supply"; enter yields; tick two priorities and read them side by side; open "Where each nutrient figure comes from".
9. With `GEMINI_API_KEY` set, press "Send these results to Gemini and write the summary". Without it the block says exactly what is missing.
10. Open `/conditions` from the replay header for the soil, vegetation, ground checks and the not-connected list.
11. Open the footer links "Plain-English glossary" and "Satellite vs ground" to see what each data layer can and cannot say.
12. Go back to the map, choose the Ludhiana pin and open the replay: a warning says the crop values are California values, and soil shows as not available.
