# OpenET check (optional Stage 4 panel)

**Status: run on 2026-11-16 with a real key.** `data/openet/brentwood.json` and `data/openet/fresno.json` each hold 142 real monthly values (2015-01 to 2026-10, mm, Ensemble model). Two corrections to this document's earlier assumptions came from the first real requests:
- **One request may cover at most 10 years.** A 2000-2026 request returned HTTP 404 `{"detail":"Date range cannot exceed 10 years."}` even for monthly data. The client now asks in windows of at most 9 years, one request (one quota query) per window, joins the records in order, and fails the whole fetch if any window fails (no series with a hole is saved). The saved file lists the windows under `chunks`.
- **Monthly Ensemble data starts in 2015 here, not 2000.** One-year probes for a Brentwood point returned HTTP 406 `"No collection found for the specified variable/model combination"` for 2000, 2008, 2012 and 2014, and data for 2015 and 2016. The OpenET Data Availability page said 2000. The client's start is 2015-01-01.
- The response shape was confirmed: a JSON array of `{ "time": "YYYY-MM-01", "et": <mm> }`, which the existing normalizer reads.
- Each demo pin used 2 quota queries (two windows) plus 8 one-year probes and 2 failed attempts while finding the above, out of 100 free queries per month.

## Getting a key and running the fetch
1. Create a free account at https://account.etdata.org and generate an API key in the Account Dashboard.
2. Put `OPENET_API_KEY=...` in `.env.local` (server-side only; never commit it).
3. Run `npx tsx scripts/fetch-openet.ts` (default pin `brentwood`; also accepts `fresno`). It requests monthly data from 2015-01-01 to the end of last month in windows of at most 9 years and writes `data/openet/<pinId>.json` (`pinId, lon, lat, fetchedAt, request, chunks, response`; the key is never written). Without a key it exits with code 2 and writes nothing. `ludhiana` is outside coverage and is refused without a request.

## Verified API contract (from https://openet-api.org/openapi.json v3.2 and https://openet.gitbook.io/docs, read 2026-11-15)
- `POST https://openet-api.org/raster/timeseries/point`, key in the `Authorization` header (raw key, no `Bearer`), JSON body.
- Required fields: `date_range` ["YYYY-MM-DD","YYYY-MM-DD"], `interval` (daily|monthly), `geometry` **[longitude, latitude]**, `model` (ensemble, disalexi, eemetric, geesebal, ptjpl, sims, ssebop; case-insensitive), `variable` (et, eto, etr, etof, ndvi, pr, count, model_count, et_mad_min/max, etaw), `reference_et` (gridmet, cimis, era5land, fret; CIMIS is California only), `file_format` (csv|json).
- Optional: `units` (mm default, in), `version` (2.0 or 2.1, default 2.1), `overpass` (boolean, daily only).
- Our request matches the expected one exactly: Ensemble, ET, gridMET, mm, JSON, monthly, `[lon, lat]`. No differences found.
- The published availability page listed Ensemble monthly from 2000 and daily from 2016. Authenticated monthly requests at Brentwood only returned data from 2015, and the monthly endpoint also enforced the 10-year limit; the client follows those observed limits, as described above.
- Coverage: v2.1 is the **conterminous US (CONUS)**; v2.0 is "Western US". The Ludhiana, India pin is outside coverage. Our client pre-checks a coarse CONUS bounding box (approximate, not the real mask) and returns `no-coverage` without spending quota.
- Provisional data: the most recent ~120 days can change; the client lists them in `coverage.provisionalMonths`.
- Quota (free tier): 100 queries per month, resets on the 1st (UTC); rate limit 20 per minute, 500 per hour. Exceeding the quota blocks the query.
- Response shape: **the public docs do not publish a response schema** (the OpenAPI response is an empty schema). The normalizer accepts only an array of records with a date (`time` or `date`) and a numeric `et`, optionally a `units` field that must be mm. Anything else becomes an `error` with reason `shape`; nothing is guessed. The authenticated saved responses confirmed the `time` and `et` shape.
- Pixel size: the docs say OpenET uses Landsat 8 and 9 imagery and offer 10/20/30 m resample options; they contain no explicit native-resolution sentence. The caveat text says "roughly 30 m Landsat pixel", which is the standard Landsat resolution, not a figure read from the API docs.

## What an unauthenticated real call returned (2026-11-15)
- No `Authorization` header: HTTP 403, body `{"detail":"Not authenticated"}`.
- `Authorization: invalid`: HTTP 500, body `Internal Server Error` (plain text). So a bad key looks like a server error, not 401; the client's 5xx message says so, and 5xx is retried a bounded number of times.
- The exact status/body OpenET uses for an out-of-coverage point or an exhausted quota could not be observed without a key. The client maps them by status plus message keywords (a heuristic); an empty or all-null 200 response is also reported as `no-coverage`.

## What can and cannot be compared
OpenET is satellite-based **actual** evapotranspiration of whatever is really growing at the pin's roughly 30 m pixel. The app shows **modelled** water use for the crop the user picked. The pin may be a different crop, fallow, or not farmland, so a gap does not mean either is wrong. `compareMonthly(...)` returns this caveat in a fixed `caveat` field that the UI must always show. Saved responses must be displayed as "saved response from [date]".

## Code
`src/lib/openet`: `client.ts` (fetch, retries, status mapping), `normalize.ts`, `compare.ts`, `index.ts` (`loadSavedOpenEt`, `getOpenEtMonthly`). Tests: `npx vitest run src/lib/openet`.
