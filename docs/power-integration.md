# NASA POWER integration

Server-side only. Code: `src/lib/power/`, route: `src/app/api/power/route.ts`, saved data: `data/power/`.

## Endpoint (verified with real calls, API v2.10.3)

```
GET https://power.larc.nasa.gov/api/temporal/daily/point
  ?parameters=T2M_MAX,T2M_MIN,RH2M,WS2M,ALLSKY_SFC_SW_DWN,PRECTOTCORR
  &community=AG&longitude=<lon>&latitude=<lat>&start=YYYYMMDD&end=YYYYMMDD&format=JSON
```

No API key. Invalid input returns HTTP 422 with a JSON `detail` (e.g. longitude 200). Dates in 2026 were also accepted.

### Chunking
A single request for all of 1985-01-01 to 2025-12-31 works: HTTP 200, about 1.4-1.5 MB, 14,975 days, about 1.6 s.
So `DEFAULT_CHUNK_YEARS = 41` (one request). Chunking (`splitDateRange`, `fetchPowerRaw({chunkYears})`) is implemented and tested
(calendar-year-aligned chunks, merged by date) and can be enabled by lowering the constant if POWER ever starts rejecting large ranges.

### Response shape
`geometry.coordinates = [lon, lat, elevation_m]`; `properties.parameter.<PARAM>.<YYYYMMDD>`; `header.fill_value` (-999);
`parameters.<PARAM>.units`. Units reported by POWER, which match `src/lib/types.ts` exactly:
`T2M_MAX` C, `T2M_MIN` C, `RH2M` %, `WS2M` m/s, `ALLSKY_SFC_SW_DWN` MJ/m^2/day, `PRECTOTCORR` mm/day.
If POWER ever reports different units the normalizer returns an `error` result; it never converts silently.

## Normalization (`normalize.ts`)
Same code for live, cached and saved data. -999 (or the response's `fill_value`) becomes `null`. Every calendar day in the requested
range is present in `days`; a day missing from the response is an all-null record. Status: `ok` = no missing value, `partial` = some
missing, `no-coverage` = all missing, `error` = bad coordinates, timeout, HTTP failure (status in message), unparseable response or unit mismatch.

## Network behaviour (`client.ts`)
Timeout 45 s per request (AbortController). Up to 2 retries (3 attempts) with backoff 0.5 s, 1 s (capped at 5 s, honours numeric `Retry-After`)
on network errors, HTTP 429 and 5xx. 4xx validation errors are not retried. A timeout is reported immediately and is not retried
(fail fast for a user-facing request). All values are named constants in `constants.ts` and injectable (`ClientOptions`), including `fetch`.

## Lookup order and cache (`service.ts`)
Cells are 0.5 degrees; centre = lat and lon rounded to the nearest 0.5 (ties away from zero); key e.g. `"38.0_-121.5"`.
1. Committed saved response of a demo pin in the same cell: `origin: "saved"`.
2. Runtime cache (in-memory Map, then disk `.cache/power/<key>.json`, falling back to `os.tmpdir()/field-rewind-power-cache` when the project dir is not writable): `origin: "cache"`.
3. Live fetch at the exact requested point: `origin: "live"`, then written to the runtime cache. Errors are never cached.

`fetchedAt` is always the time the data was fetched from NASA (the saved file's timestamp or the cache entry's), never the read time.
`{ fresh: true }` / `?fresh=1` skips 1 and 2. Concurrent first requests for the same cell share one fetch.
UI rule from CLAUDE.md: `origin !== "live"` must be shown as "saved response from [fetchedAt date]".

## Approximation to disclose
Every point in a 0.5-degree cell gets the data of the first point fetched (or saved) for that cell. Results for a different
point in the cell carry a `message` saying so, and `lat/lon` echo the request, not the fetched point. POWER itself is gridded reanalysis,
not a station: meteorology (temperature, humidity, wind, precipitation) comes from MERRA-2 at about 0.5 x 0.625 degrees, solar from
CERES-based products at about 1 x 1 degree (the response header lists sources MERRA2, SRB, SYN1DEG, POWER). Values are regional,
not farm-level; label as "regional climate, about 50 km grid".

## Saved demo pins
`npx tsx scripts/fetch-demo-pins.ts` fetches brentwood, fresno and ludhiana live and writes `data/power/<pinId>.json`:
`{ pinId, lat, lon, fetchedAt, sourceUrls, responses: [raw POWER bodies] }`, compact JSON, about 1.4 MB each. The script exits non-zero and
writes nothing for a pin it could not fetch. `loadSavedDemoPin(pinId)` reads only these files (no network).
Deployment note: `data/power/**` must be included in the serverless bundle (Next file tracing normally picks up `process.cwd()/data/power` reads;
verify on Vercel).

## API
`GET /api/power?lat=..&lon=..[&fresh=1]` returns a `PowerResult`. 200 for ok/partial/no-coverage, 400 for invalid coordinates, 502 for upstream failure or timeout.
Server code should call `getPowerData(lat, lon, { fresh? })` from `@/lib/power`.
