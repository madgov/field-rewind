# Saved NASA Earthdata snapshots

SMAP and GPM IMERG are implemented as fetch-once observation snapshots for Brentwood, Fresno and Ludhiana. They are contextual observations, not inputs to the 40-season crop-water replay. ECOSTRESS and GLDAS/NLDAS remain unimplemented.

## Products and interpretation

- **SMAP SPL3SMP_E, Version 006**, collection `C2938664763-NSIDC_CPRD`. Morning (`Soil_Moisture_Retrieval_Data_AM`) daily soil-moisture composites and their `retrieval_qual_flag`. Values are volume of water per volume of soil (cm³/cm³, equivalently m³/m³), describing near-surface moisture rather than a full root zone. The product is posted to a 9 km grid; the radiometer footprint is approximately 36 km. Do not describe it as 9 km independent field measurements. [Product, citation and DOI](https://nsidc.org/data/spl3smp_e/versions/6), [Version 6 user guide](https://nsidc.org/sites/default/files/documents/user-guide/spl3smp_e-v006-userguide.pdf), Tables 4 and 6.
- **GPM IMERG Final monthly Version 07**, collection `C2723754851-GES_DISC`. `Grid/precipitation` and `Grid/randomError` are in mm/hour; `Grid/precipitationQualityIndex` is reported in equivalent gauges per 2.5 degree box. The grid spacing is 0.1 degree, not a farm rain gauge. The monthly mean rate is multiplied by the actual number of hours in that month to display estimated precipitation in mm. It is a merged satellite/gauge product, not an independent satellite-only validation. [NASA product](https://www.earthdata.nasa.gov/data/catalog/ges-disc-gpm-3imergm-07), [IMERG technical documentation](https://gpm.nasa.gov/sites/default/files/2023-07/IMERG_TechnicalDocumentation_final_230713.pdf).

Default period: **SMAP 2025-07-01 through 2025-07-07; IMERG July 2025**. This is an explicitly bounded snapshot, not current conditions, a trend, or 40 seasons of Earthdata. Missing dates/retrievals are not filled or replaced by nearby valid cells. SMAP and IMERG describe different quantities; neither directly measures crop survival, crop yield or soil-health improvement.

## Fetch and save

```bash
node_modules/.bin/tsx scripts/fetch-earthdata.ts                     # all three pins, default month
node_modules/.bin/tsx scripts/fetch-earthdata.ts brentwood 2025-07   # one pin, explicit month
```

Set `EARTHDATA_TOKEN` in server-side `.env` or `.env.local` on the fetch machine. It is not needed by the deployed app. [Earthdata Login profile](https://urs.earthdata.nasa.gov/profile). Authentication/access is product-specific: a token accepted by SMAP does not establish access to IMERG.

The script fails explicitly without a token, on failed requests or on an unexpected data shape. Each pin is saved atomically only after both products return recognized responses; if one product fails the existing file for that pin is unchanged. Previously completed pins remain saved. A successfully fetched sample with no recommended-quality retrieval is saved as `no-data`, with the actual null values and quality fields. It is not an invented zero or an API failure.

1. SMAP: request selected dates and the moisture and quality variables through NASA Harmony's EDR cube API. Spatial subsets returned fill values where an independently sampled source raster had real data, so this implementation retains the full native EASE-Grid 2.0 (EPSG:6933) raster for each date. Each compressed moisture raster is only a few MiB. Rasters are reused across pins in process memory and are not saved to disk. Sample the native cell containing the pin; no reprojection or interpolation of quality flags. The projection is defined in Table 4 of the v006 guide. The original product already includes the interpolation described by its producers.
2. IMERG: discover the monthly granule through NASA CMR, verify the OPeNDAP units and dimension contract, then request only the pin's precipitation, random-error and quality-index scalars. Verify returned coordinates against the requested 0.1 degree cell.
3. Store only extracted observations, source granule names, sample coordinates, requested periods and the real fetch timestamp in `data/earthdata/<pin>.json`. No token, account metadata or signed download URL is stored. The response label always says “Saved response from [timestamp]”.

The downloader sends a bearer header only to explicitly allowed NASA service origins. Redirects to the known Harmony delivery CDN or AWS storage receive no bearer header. Downloads are capped at 12 MiB each; only one raster cell is decoded from each subset. Runtime code imports only the saved loader, not the fetch client.

## Quality and missing values

For SMAP v006, bits 0, 1 and 2 of `retrieval_qual_flag` must all be zero to show a moisture value. Thus flags **0 and 8** are accepted: bit 3 concerns the freeze/thaw retrieval, not soil-moisture quality. Other flags, fill values, missing quality flags, non-finite data and out-of-range moisture are excluded. The saved JSON preserves the usable raw moisture and flag separately; the UI reports the exclusion. It never averages missing observations into a zero.

IMERG fill/negative/non-finite values remain unavailable. The random-error field and quality index are displayed as reported. No unsupported “good/bad” threshold or confidence interval is invented. A zero rainfall estimate is a valid zero.

## Actual API surprises and access blocker

The first real requests showed that Harmony's SMAP EDR point route returned a global raster despite the point constraint. Explicit small bounding boxes, both native and reprojected, then returned fill values even though the source native raster had real values at the same points. This was caught by independently sampling the original raster, including a known-valid diagnostic cell. The implementation therefore subsets time/variables only and samples the source native grid locally. Reprojection is avoided so quality bits cannot be altered by resampling. Diagnostic coordinates are never substituted for a demo pin.

IMERG Harmony CSV failed with `giovanni-time-series-adapter:v1.1.14: Service request failed with an unknown error`. Its raster adapter and direct OPeNDAP data initially failed HTTP 403. The direct archive returned **`EULA Acceptance Failure`**, with this NASA-provided resolution link: https://urs.earthdata.nasa.gov/approve_app?client_id=e2WVk8Pw6weeLUKZYOxvTQ . The user accepted the NASA GES DISC terms themselves; the same token then returned real scalar data. This is why the script uses the verified direct constrained OPeNDAP route. If the blocker recurs, the account owner must review the NASA terms; the app does not bypass them.

## Verification

The final native-grid requests returned seven SMAP daily files and one IMERG month for each demo pin, saved on 2026-11-16 UTC (2026-11-15 America/Los_Angeles). Real native-grid raw moisture values were present on some dates, but **none of these three pins had a recommended-quality moisture value in this particular seven-day morning sample**. Returned non-missing quality flags were 1 for Brentwood, 9 for Fresno and 13 for Ludhiana; missing overpasses carried flag 7. The UI therefore reports no recommended values rather than showing the rejected raw moisture as a valid measurement. This does not establish that the entire SMAP record lacks usable observations at these places.

July 2025 IMERG estimates from the actual returned mean rates: Brentwood 0 mm (0 mm/hour), Fresno 1.488 mm (0.002 mm/hour), Ludhiana 252.96 mm (0.34 mm/hour). The UI rounds amounts for display while preserving source rates and computed amounts in the saved files. Each record includes the actual quality index and random-error estimate. The original native raster was independently sampled to confirm that spatial-subset fill values were a provider issue; a diagnostic non-demo cell also returned quality flag 0. That diagnostic is not used as a substitute in the app.

`src/lib/earthdata/earthdata.test.ts` checks quality-bit masking, calendar-month conversion, malformed data rejection and saved loading without network access. Root verification records the final test/build and offline page-render results. Browser visual QA, agronomic suitability, alternative periods, afternoon retrievals and arbitrary-pin live fetching are outside this stage.
