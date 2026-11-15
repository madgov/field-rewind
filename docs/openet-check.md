# OpenET check (optional Stage 4 panel)

**Status: no OpenET data has been retrieved yet.** No API key was available on the build machine, so `data/openet/` is empty and no OpenET number appears anywhere in this repo. Nothing here is a real result until the fetch below has been run.

## Getting a key and running the fetch
1. Create a free account at https://account.etdata.org and generate an API key in the Account Dashboard.
2. Put `OPENET_API_KEY=...` in `.env.local` (server-side only; never commit it).
3. Run `npx tsx scripts/fetch-openet.ts` (default pin `brentwood`; also accepts `fresno`). It makes one monthly request for 2000-01-01 to the end of last month and writes `data/openet/<pinId>.json` (`pinId, lon, lat, fetchedAt, request, response`; the key is never written). Without a key it exits with code 2 and writes nothing. `ludhiana` is outside coverage and is refused without a request.

## Verified API contract (from https://openet-api.org/openapi.json v3.2 and https://openet.gitbook.io/docs, read 2026-11-15)
- `POST https://openet-api.org/raster/timeseries/point`, key in the `Authorization` header (raw key, no `Bearer`), JSON body.
- Required fields: `date_range` ["YYYY-MM-DD","YYYY-MM-DD"], `interval` (daily|monthly), `geometry` **[longitude, latitude]**, `model` (ensemble, disalexi, eemetric, geesebal, ptjpl, sims, ssebop; case-insensitive), `variable` (et, eto, etr, etof, ndvi, pr, count, model_count, et_mad_min/max, etaw), `reference_et` (gridmet, cimis, era5land, fret; CIMIS is California only), `file_format` (csv|json).
- Optional: `units` (mm default, in), `version` (2.0 or 2.1, default 2.1), `overpass` (boolean, daily only).
- Our request matches the expected one exactly: Ensemble, ET, gridMET, mm, JSON, monthly, `[lon, lat]`. No differences found.
- Data starts: Ensemble monthly **2000**, daily 2016. Daily point retrievals are limited to 10 years per request (we only use monthly).
- Coverage: v2.1 is the **conterminous US (CONUS)**; v2.0 is "Western US". The Ludhiana, India pin is outside coverage. Our client pre-checks a coarse CONUS bounding box (approximate, not the real mask) and returns `no-coverage` without spending quota.
- Provisional data: the most recent ~120 days can change; the client lists them in `coverage.provisionalMonths`.
- Quota (free tier): 100 queries per month, resets on the 1st (UTC); rate limit 20 per minute, 500 per hour. Exceeding the quota blocks the query.
- Response shape: **the public docs do not publish a response schema** (the OpenAPI response is an empty schema). The normalizer accepts only an array of records with a date (`time` or `date`) and a numeric `et`, optionally a `units` field that must be mm. Anything else becomes an `error` with reason `shape`; nothing is guessed. This shape is unverified against a real response until a key is used; if the real shape differs, fix `normalize.ts` and its tests.
- Pixel size: the docs say OpenET uses Landsat 8 and 9 imagery and offer 10/20/30 m resample options; they contain no explicit native-resolution sentence. The caveat text says "roughly 30 m Landsat pixel", which is the standard Landsat resolution, not a figure read from the API docs.

## What an unauthenticated real call returned (2026-11-15)
- No `Authorization` header: HTTP 403, body `{"detail":"Not authenticated"}`.
- `Authorization: invalid`: HTTP 500, body `Internal Server Error` (plain text). So a bad key looks like a server error, not 401; the client's 5xx message says so, and 5xx is retried a bounded number of times.
- The exact status/body OpenET uses for an out-of-coverage point or an exhausted quota could not be observed without a key. The client maps them by status plus message keywords (a heuristic); an empty or all-null 200 response is also reported as `no-coverage`.

## What can and cannot be compared
OpenET is satellite-based **actual** evapotranspiration of whatever is really growing at the pin's roughly 30 m pixel. The app shows **modelled** water use for the crop the user picked. The pin may be a different crop, fallow, or not farmland, so a gap does not mean either is wrong. `compareMonthly(...)` returns this caveat in a fixed `caveat` field that the UI must always show. Saved responses must be displayed as "saved response from [date]".

## Code
`src/lib/openet`: `client.ts` (fetch, retries, status mapping), `normalize.ts`, `compare.ts`, `index.ts` (`loadSavedOpenEt`, `getOpenEtMonthly`). Tests: `npx vitest run src/lib/openet`.
