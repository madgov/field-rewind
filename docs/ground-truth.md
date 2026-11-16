# Ground check and local crop context

Server-side only. Code: `src/lib/groundTruth/`, saved data: `data/ground-truth/<pinId>.json` (+ raw Daymet CSV in `data/ground-truth/raw/`),
fetch script: `npx tsx scripts/fetch-ground-truth.ts [pinId ...]` (live requests; POWER side comes from the saved `data/power` files).

Framing rule: this is "satellite and reanalysis versus ground". Daymet vs POWER is a comparison of TWO GRIDDED PRODUCTS, not an accuracy claim about either.
`GROUND_TRUTH_LABEL` carries that sentence. Crop history is "what a satellite classification says this pixel was", not the farmer's record.

## Export surface (`src/lib/groundTruth/index.ts`)
- `loadSavedGroundTruth(pinId)`: reads only the saved file. No network.
- `getGroundTruth(lat, lon, { fresh? })`: demo pin and not fresh -> saved file. Otherwise live. With `FIELD_REWIND_OFFLINE=1`: demo pin -> saved; anything else (or `fresh`) -> `{ status: "error", message: GROUND_OFFLINE_MESSAGE }`; no fetch is made.
- Result: `{ status: "ok", origin: "live" | "saved", daymet, gauge, cdl, nlcd, wells }`, each a `Layer<T>` = `{ status: "ok" | "no-coverage" | "error" | "not-checked", message, data, source{name,citation,url,terms}, fetchedAt, requestUrls }`.
- Chart series: `result.daymet.data.precipAnnual.rows` = `[{ year, days, daymetMm, powerMm, diffMm, ratio }]` (1985-2024).
- Wording: `groundCheckWording(result)`, `cropHistoryWording(result)`; both generate sentences only from the numbers and throw on a non-finite number. Labels use the "Saved response from [date]" pattern (`groundOriginLine`).
- `GROUND_TRUTH_LABEL`, `*_SOURCE` citations, pure functions (`compareDaymetPower`, `alignDaily`, `majorityVote`, ...), types.

## Sources

### Daymet V4 R1 (ORNL DAAC)
`GET https://daymet.ornl.gov/single-pixel/api/data?lat=..&lon=..&vars=prcp,tmax,tmin&start=1985-01-01&end=2024-12-31&format=csv`. Keyless. 1 km grid, daily, interpolated from ground weather station observations (GHCN-Daily), North America and Hawaii, 1980 onward. About 2 s.
- Citation (as printed in the CSV header and on the earthdata.nasa.gov catalog page): Thornton, M.M., R. Shrestha, Y. Wei, P.E. Thornton, S.-C. Kao, and B.E. Wilson. 2022. Daymet: Daily Surface Weather Data on a 1-km Grid for North America, Version 4 R1. ORNL DAAC. https://doi.org/10.3334/ORNLDAAC/2129
- Terms read (catalog page): "openly shared, without restriction" per EOSDIS data use and citation guidance; citation requested. (daac.ornl.gov's own guide page was rejected by the fetch tool's certificate check, so terms and citation came from the NASA Earthdata catalog record and the CSV header.)
- Leap years: per daymet.ornl.gov/overview, every Daymet year has 365 days; leap day is kept, 31 December is dropped. Handled explicitly in `alignDaily`: those dates are counted as `droppedLeapDec31` (10 days in 1985-2024) and excluded from BOTH products; never shifted.
- Outside coverage (Ludhiana): the service returns HTTP 400 "Daymet Tile was not found with input lat and lon". Saved as `no-coverage` with that fact.
- Statistics: POWER minus Daymet. `r2` is the squared Pearson correlation. Annual totals use only days where both have a value, and a year needs at least 360 paired days (all 40 years qualify).

### CoCoRaHS (community rain gauges)
`exportstations.aspx?State=CA&County=CC&Format=XML`, then `exportreports.aspx?ReportType=Daily&Format=XML&Station=<id>&ReportDateType=reportdate&StartDate=1/1/2018&EndDate=12/31/2024&TimesInGMT=False`. Keyless. Amounts in inches, converted at 25.4 mm/in.
- Terms read (cocorahs.org data usage policy page): free to governments, academia and the private sector; asks that everyone "acknowledge its source when displaying it"; CC BY 4.0 unless noted; data supplied with no guarantee. No citation format is given, so the citation line names CoCoRaHS / Colorado Climate Center.
- Station choice (written into the result): nearest station by straight-line distance within 15 km that returned at least 300 daily reports in 2018-2024; up to 5 candidates tried. Brentwood: CA-CC-36 "Brentwood 2.5 SSW", 6.5 km. Fresno: the nearer stations CA-FR-38 (0 reports) and CA-FR-33 (279 reports) were skipped, so CA-FR-34 "Fresno 1.5 ENE", 5.9 km.
- Only days the gauge reported a readable amount are compared (and the product has a value). A missing day is never zero. "NA" is unreadable, not zero. Wet-day agreement uses a 1 mm threshold (a documented choice).
- Limits: one gauge, kilometres from the grid cells; gauge, Daymet and POWER define a "day" differently and are matched by date label only. Indicative only.
- County lookup is not built: the gauge check runs only for the configured example places (Brentwood CA-CC, Fresno CA-FR). Any other point returns `not-checked`; Ludhiana returns `no-coverage`.

### USDA NASS Cropland Data Layer
`GET https://nassgeodata.gmu.edu/axis2/services/CDLService/GetCDLValue?year=<y>&x=<EPSG:5070 x>&y=<EPSG:5070 y>`, years 2008-2024, `proj4` EPSG:5070 (NAD83 CONUS Albers).
- Noise reduction: a 3 x 3 block of points 30 m apart (the CDL pixel size), centre first, 9 requests per year, 154 in total with one probe. Majority class per year; `agree` = pixels carrying it; ties go to the centre pixel if it is among the tied classes, else the lowest code, and `tie` is flagged. Failed pixels are retried once, then left out and counted (`failedRequests`), never filled in.
- Terms read (nass.usda.gov CDL FAQ): public domain, "as is"; "NASS does not warrant any conclusions drawn from these data"; users "are solely responsible for interpretations". Published accuracy ("generally 85% to 95%" producer's accuracy) applies to major crop categories, not single pixels or field edges. Suggested citation form: "USDA NASS Cropland Data Layer".
- The block majority often differs from the single centre pixel (Brentwood: 2012, 2014, 2016, 2017 and 2008 differ). The wording says so.
- Outside CONUS the service answers HTTP 500 "Failed to get value" (Ludhiana): saved as `no-coverage`. If a probe request ever times out for a point outside a rough CONUS box, the layer is `no-coverage` and the message says the real request did not return a value (one earlier Ludhiana run timed out at 60 s; the rerun got the fast 500).

### NLCD 2021 land cover (MRLC)
WMS `GetFeatureInfo` on `NLCD_2021_Land_Cover_L48`, 3 x 3 pixel window, centre pixel; returns `PALETTE_INDEX` = the NLCD class code. Names from the official legend on mrlc.gov (class legend page, read): 11 Open Water ... 95 Emergent Herbaceous Wetlands (20 classes, in `nlcd.ts`). An empty feature list = outside coverage (Ludhiana). A code not in the legend is an error, not shown.
- The exact NLCD 2021 dataset citation (Dewitz, USGS data release) was NOT confirmed from a page opened in this build, so `NLCD_SOURCE.citation` cites MRLC/USGS and the legend page only.

### USGS NWIS (new OGC API; the legacy waterservices are retired)
`https://api.waterdata.usgs.gov/ogcapi/v0/collections/{monitoring-locations,field-measurements}/items`. Keyless. Wells (`site_type_code=GW`) within about 22 km (0.2 degrees); `parameter_code=72019` (depth to water level, feet below land surface).
- "Nearest well with any reading": the 12 nearest wells are queried (newest 20 readings each); the nearest one with a reading wins. "Nearest well with a reading since 2015": one box query (limit 1000 rows) grouped by well. If both are the same well, only the first is returned. The site list is capped at 500 (the box held 500 sites at both Brentwood and Fresno, so the list may be truncated and a nearer well could in principle be missing; documented limit).
- Wording states plainly when the latest reading is 5+ years older than the saved response or when fewer than 3 readings exist.
- A well's depth to water is a fact about that well, not about the user's field.
- Streamflow gauges near Brentwood were inactive in the probe, so no streamflow fact is provided.

## Timings (live, one run each, whole call, this machine)
Brentwood about 34 s, Fresno about 17-38 s, Ludhiana about 4 s (probe-based no-coverage answers). Daymet about 2-3 s, NLCD under 1 s, wells a few seconds; the 154 CDL requests dominate (concurrency 6). CoCoRaHS adds 2-6 requests. The UI should use the saved files for the demo pins.

## Saved files
`data/ground-truth/{brentwood,fresno,ludhiana}.json` (16, 20, 8 KB) hold the derived results (annual series, stats, CDL years, gauge comparison, wells), the exact request URLs and a `fetchedAt` per layer; `data/ground-truth/raw/daymet-<pin>.csv` is the raw Daymet response (about 370 KB each). All saved results are labelled "Saved response from [date]". Re-run the script to refresh; it saves nothing for a pin whose layer ended in `error`.

## Not verified
- NLCD dataset citation text (see above). USGS parameter 72019 meaning is from USGS convention, not re-read from a page in this build.
- The CoCoRaHS gauge comparison for non-configured places (no county lookup).
- Daymet and CDL freshness beyond 2024; the saved POWER file runs to 2025, only 1985-2024 is compared.
