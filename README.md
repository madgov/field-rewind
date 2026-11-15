# Field Rewind

Built for NASA Space Apps 2026 (Field Shift). It answers one question for a farmer, a farm adviser or a student:

**"Would your crop rotation have survived the last 40 seasons with your water supply?"**

Drop a pin on the map. The app shows (1) how the regional climate at that spot has shifted between 1985-2004 and 2006-2025, and (2) a 40-season replay (1986 to 2025) of up to three crop rotations against a water supply you choose, season by season.

It is not deployed. There is no public URL yet. Run it locally as below.

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

Data scripts (each needs the network; the first rewrites the saved NASA POWER files in `data/power/`, so do not run it casually):

```bash
npx tsx scripts/fetch-demo-pins.ts   # re-fetch the 3 demo pins from NASA POWER
npx tsx scripts/fetch-cimis.ts       # CIMIS station 47; needs CIMIS_APP_KEY
npx tsx scripts/fetch-openet.ts      # OpenET monthly ET; needs OPENET_API_KEY (optional pin id, default brentwood)
```

There are also report scripts, `scripts/shift-report.ts` and `scripts/replay-report.ts`, that print results to the terminal.

## Environment variables

Put these in `.env.local` (never commit it; `.env.example` lists the names). They are read on the server only.

| Name | Purpose |
| --- | --- |
| `CIMIS_APP_KEY` | CIMIS Web API key. Register at https://et.water.ca.gov |
| `OPENET_API_KEY` | OpenET API key. Register at https://account.etdata.org |
| `FIELD_REWIND_OFFLINE` | `1`, `true`, `yes` or `on`: the server never contacts NASA; only saved example places work. See `docs/example-mode.md`. |

The app runs without the two keys; the CIMIS and OpenET panels then say so.

## Pages

- `/` map with demo pins (Brentwood CA, Fresno CA, Ludhiana Punjab), your own coordinates, and "Load example farm (Brentwood)".
- `/shift` "Your field has shifted": hot days over 35 C, crop water demand (ET0) and rainfall, early versus late 20-year periods, year stripes. Headlines are generated from the computed numbers; if there is no shift it says so, and if a measure cannot be compared it says that.
- `/replay` choose 2 or 3 rotations and a seasonal water supply; 40-season strips, a season scrubber with water gauges, a "How we know" panel and a one-page printable report (Print report button).
- `/dev` the raw saved-data summary for the three demo pins.
- `/api/power` JSON endpoint for NASA POWER data.

## Data sources

- **NASA POWER** daily API, community AG, 1985-01-01 to 2025-12-31 (https://power.larc.nasa.gov/docs/services/api/temporal/daily/). Always labelled "regional climate, about 50 km grid": it is reanalysis, not a sensor in a field. Details: `docs/power-integration.md`.
- **FAO-56 Penman-Monteith ET0** (Allen et al. 1998, https://www.fao.org/4/x0490e/x0490e00.htm), with a unit test against the paper's worked example. Details: `docs/et0-mapping.md`.
- **Crop parameters** (crop factors, stage lengths, planting windows, heat thresholds), each with its source: `data/crops/catalog.json`, explained in `docs/crop-sources.md`. A crop with any unsourced value is excluded.
- **Effective rainfall**: USDA Soil Conservation Service monthly formula as used in FAO CROPWAT.
- **CIMIS station 47 (Brentwood)**, https://et.water.ca.gov, for a station-versus-POWER ET0 check: `docs/cimis-check.md`.
- **OpenET** (https://openetdata.org), satellite actual ET, optional panel: `docs/openet-check.md`.
- The Fresno July temperature comparison in "How we know" uses the NOAA NCEI U.S. Climate Normals 1991-2020 (station FRESNO YOSEMITE INTL AP, USW00093193), cited on the page.

Method write-ups: `docs/shift-method.md`, `docs/replay-method.md`, `docs/example-mode.md`.

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

## Known limitations

- Crop values are California values (California Delta / Central Valley). The replay page and report print that region, and warn when the pin is outside California. That check is an approximate bounding shape, not real borders (`src/lib/crops/region.ts`).
- Up to 10 missing ET0 days per season add 0 to crop water use; up to 10 missing rain days add 0 rain. Beyond 10 the season is grey.
- In the water gauge, a short season's red part is drawn at least a small fixed height (4% of the vessel) so a near miss stays visible; the gauge says so when this applies.
- The runtime cache uses 0.5 degree cells, which differ from POWER's native grids.
- CIMIS and OpenET comparisons have never run, because no API keys are set. Their parsers are unverified against real responses.
- Only 4 of the 7 catalog crops are usable; the others lack a sourced value and are excluded.
- The effective-rainfall formula was verified from a secondary source (training slides), not an FAO page.
- Heat thresholds and planting windows were not re-verified against the source papers.
- There is no land or ocean check for pins.
- POWER reads hotter than weather stations (see the Fresno example in "How we know"), so hot-day counts are regional-grid counts. The change between periods is the point.
- The default example supply of 700 mm was derived from the Brentwood record and is used as the default on every pin.
- No soil water carry-over and no delivery losses are modelled.

## Status of CIMIS and OpenET

Not run. Exact blocker: `CIMIS_APP_KEY` and `OPENET_API_KEY` are not set, so `data/cimis` and `data/openet` hold no saved responses and both panels show a no-key message.

## 60-second demo

1. `npm run dev`, open the home page.
2. Click "Load example farm (Brentwood)". The page says "Saved response from [date]", "Regional climate, about 50 km grid" and "Constructed example, not records of a real farm".
3. Look at the three strips: red cells are seasons short of the 700 mm supply; the headline per rotation compares 1986-1995 with 2016-2025.
4. Drag the water supply slider and watch the cells and headlines change.
5. Drag the season scrubber (or press play) and read the water gauges.
6. Open "How we know" for data sources, the 50 km caveat and the crop sources.
7. Press "Print report" for the one-page report.
8. Go back to the map, choose the Ludhiana pin and open the replay: a warning says the crop values are California values.
