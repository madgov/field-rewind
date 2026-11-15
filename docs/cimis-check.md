# CIMIS station check (Stage 4)

Status: **the comparison has NOT been run.** No CIMIS app key exists on this machine, so there is no saved
response (`data/cimis/station47.json` does not exist) and this document contains no comparison numbers.

## What is compared

Daily reference evapotranspiration, 2010-01-01 to 2025-12-31, for Brentwood:

- **Station**: CIMIS station 47 (Brentwood, Contra Costa County), data item `day-asce-eto`, metric (mm/day).
- **App**: the app's own FAO-56 Penman-Monteith ET0 (`src/lib/et0/fao56.ts`) computed from the saved NASA POWER
  daily data for the Brentwood pin (`loadSavedDemoPin("brentwood")`), labelled "regional climate, about 50 km grid".

Only dates where both are non-null are compared. The pure comparison is `src/lib/cimis/compare.ts`.

## Why they differ by nature (not just by error)

- A point station sited over irrigated reference grass vs a reanalysis grid cell of roughly 50 km that mixes
  surrounding land cover. Expect POWER to differ systematically, especially in dry or irrigated areas.
- Equation: the CIMIS docs list `day-asce-eto` as "ASCE ETo (PM ETo)", i.e. the ASCE standardized Penman-Monteith
  reference ET for a short (grass) crop, computed from the station's own hourly measurements. (`day-eto` is a
  different item, the older "CIMIS ETo".) The app uses FAO-56 Penman-Monteith at a daily step with POWER's daily
  mean humidity (FAO-56 Eq. 19), 2 m wind and modelled solar radiation (see `docs/et0-mapping.md`). The two
  equations are close for grass but not identical, and the inputs are measured vs modelled.
- Statistics are POWER (y) regressed on station (x). R-squared is the square of Pearson r. Bias is POWER minus
  station. The annual-total ratio uses only paired days and only years with at least 350 paired days.

## Real API findings (probed 2026-11-14/15, no key)

| Request | Result |
|---|---|
| `/api/data?...` with no `appKey` parameter | HTTP 404, `application/json`, `{"Message":"No HTTP resource was found that matches the request URI ..."}` (the route needs the parameter) |
| `appKey=` (empty) | HTTP **200**, `text/html`, a gateway page titled "Request Rejected" with a support ID. Not JSON, so the client treats a non-JSON 200 as a parse error |
| `appKey=0000...` (well-formed, invalid) | HTTP 403, `application/json`, body is a JSON string: `"[ERR1006-INVALID APP KEY] Invalid application key [<the key sent>]."` The body echoes the key, so the client redacts error text |
| `/api/station/47` | HTTP 200, no key needed |
| `/api/station` | HTTP 200, no key needed (all stations) |

No redirects were observed. No request with a valid key could be made, so the real shape of a data response is
**unverified**; the client follows the documented shape.

Station 47 metadata (real, from `/api/station/47`): name Brentwood, city Brentwood, North Central Region Office,
Contra Costa County, connected 11/18/1985, disconnect date 12/31/2050 (placeholder), `IsActive` True,
`IsEtoStation` True, elevation 45 (the API gives no unit; CIMIS lists it in feet), ground cover Grass,
latitude 37.928258, longitude -121.6599, zip codes 94548, 94514, 94513.

Documentation (https://et.water.ca.gov/Rest/Index, text dated 2014, still current):

- Parameters: `appKey` (required), `targets` (station numbers, comma list), `startDate`, `endDate` (`yyyy-mm-dd`),
  `unitOfMeasure` (`E` default, or `M`), `dataItems` (comma list), `prioritizeSCS` (zip codes only).
- Earliest data 1982-06-07; future dates are an error (ERR1010).
- Per-request limit: the docs only name ERR2112 "DATA VOLUME VIOLATION" (HTTP 400, "exceeds data limitations") and
  give **no number**. The believed ~1,750 records could not be confirmed. The client uses 1,750-day chunks and, if
  ERR2112 comes back, halves the chunk and retries.
- JSON: send `Accept: application/json`. Structure
  `{"Data":{"Providers":[{"Name","Type","Owner","Records":[{"Date","Julian","Station","Standard","ZipCodes","Scope","DayAsceEto":{"Value":"0.03","Qc":" ","Unit":"(in)"}}]}]}}`.
  Values are strings; the unit is `(in)` for English and, by the documented pattern, `(mm)` for metric (not yet
  observed). The client refuses anything else rather than convert.
- Errors documented: ERR1006 invalid key (403), ERR1019 station not found (404), ERR1035 data item not found (404),
  ERR1010 future date, ERR1011 date before 1982-06-07, ERR1012 date order, ERR1032 bad unit (400), ERR2112 volume (400).

## QC flag handling

The live docs show a `Qc` field but **do not define the letters**, and the CIMIS site's own flag pages could not be
retrieved (they are a JavaScript app). Evidence in the docs by example only: `N` and `S` appear with empty values,
`R` and `H` appear with values. Treatment, in `src/lib/cimis/normalize.ts`:

- Empty or non-numeric value, or negative value: `null`.
- Flags `M`, `N`, `Q`, `S` (missing / no data / sensor problem): value forced to `null`.
- Every other flag, including blank, `R` (documented example: value present), `H`, `I`, `Y`, `P`: value kept, flag carried.
- Counts per flag, and how many became null, are returned (`CimisResult.flags`) and printed by the fetch script.

**Check these letters against the first real response and CIMIS's QC documentation before trusting the numbers.**

## Get a key and run it

1. Register (free) at https://et.water.ca.gov and obtain an app key.
2. Put `CIMIS_APP_KEY=...` in `.env.local` (server-side only, never commit it).
3. Run `npx tsx scripts/fetch-cimis.ts`. It writes `data/cimis/station47.json` (raw responses, key redacted as
   `appKey=REDACTED`) and prints day counts and per-flag counts. Without a key it exits 1 and writes nothing.

## For the UI

Server side: `loadCimisComparison()` (from `src/lib/cimis`) returns `status: "ok"` with `comparison`, `savedLabel`
("saved response from YYYY-MM-DD", always show it), or `no-saved-data` / `no-key` / `error` with `message` and
`nextStep`. Show no chart in any non-ok state. `comparison.points` has every paired point; `comparison.binned` has
0.25 mm cells with counts, which is the better choice for SVG (a few hundred marks instead of thousands).
