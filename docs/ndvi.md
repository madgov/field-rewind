# NDVI: satellite vegetation index

Server-side only. Code: `src/lib/ndvi/`, saved data: `data/ndvi/`, fetch script: `scripts/fetch-ndvi.ts`.

## What it is, and what it is not
NDVI = (NIR - Red) / (NIR + Red), unitless, -1..1, from Landsat surface reflectance. The series is ONE 30 m pixel: the pixel that contains the pin.
- It is a real satellite observation, not a field boundary and not a farm sensor. A real field can be larger or smaller than 30 m, and the pin may be on a field edge, a road or a farmyard.
- Urban or mixed pixels do not behave like a crop. The Fresno demo pin may sit on developed land or a mix of surfaces; see "What the saved pins look like" below for what the data actually shows.
- It only sees clear days. Cloudy and hazy dates are missing, not zero.
- `NDVI_LABEL` and `NDVI_GRID_LABEL` (exported) are the wordings to show next to any number or overlay.

## Sources (all checked)
- USGS Landsat Collection 2 Level-2 surface reflectance, Landsat 5 TM, 7 ETM+, 8 OLI, 9 OLI-2.
  https://www.usgs.gov/landsat-missions/landsat-collection-2-level-2-science-products (page read: scale 0.0000275, offset -0.2, valid DN range 1 to 65455; the QA_PIXEL bit table is in the Level-2 Science Product Guide, which this page only links to).
- Microsoft Planetary Computer, collection `landsat-c2-l2`: STAC `POST https://planetarycomputer.microsoft.com/api/stac/v1/search`, read token `GET https://planetarycomputer.microsoft.com/api/sas/v1/token/landsat-c2-l2` (no account; the token carries its own `msft:expiry`, observed about 24 h on 15 Nov 2026 although the probe saw about 1 h, so the code always reads the stated expiry and refreshes 5 minutes before it).
  https://planetarycomputer.microsoft.com/dataset/landsat-c2-l2
- Scale and offset are also confirmed per scene in the STAC item (`raster:bands`: scale 0.0000275, offset -0.2, nodata 0) for Landsat 5, 7 and 8 items (checked on live items). QA bit meanings are confirmed from the item's `classification:bitfields` on `qa_pixel`.
- Bare-ground and sparse-vegetation NDVI ranges: Weier, J. and Herring, D., "Measuring Vegetation (NDVI & EVI)", NASA Earth Observatory. https://science.nasa.gov/earth/earth-observatory/measuring-vegetation-ndvi-evi (read: barren areas 0.1 and below, shrub and grassland 0.2 to 0.3, rainforest 0.6 to 0.8).
- Green-up threshold idea: White, M.A., Thornton, P.E., Running, S.W. (1997), Global Biogeochemical Cycles 11(2):217-234, doi:10.1029/97GB00330; Jonsson, P. and Eklundh, L. (2002), IEEE TGRS 40(8):1824-1832, doi:10.1109/TGRS.2002.802519 (bibliographic details checked against Crossref; the papers' full text was not read here, so the 50% choice below is our own declared parameter, not a claim about what they use).
- Outlier rule: Iglewicz, B. and Hoaglin, D. (1993), How to Detect and Handle Outliers, ASQC Quality Press (modified z-score, cutoff 3.5). Not re-read here; cited from standard use.
- Sensor continuity: Roy, D.P. et al. (2016), Remote Sensing of Environment 185:57-70, doi:10.1016/j.rse.2015.12.024 (bibliographic details checked against Crossref).
- MODIS (optional, Brentwood only): ORNL DAAC MODIS web service, product MOD13Q1 v6.1, band `250m_16_days_NDVI`, scale 0.0001, fill -3000, valid -2000..10000, reliability band `250m_16_days_pixel_reliability` (0 = good data kept; everything else dropped). https://modis.ornl.gov/globalsubset/

## Processing
1. STAC search with the point, scene cloud cover below 40 % (scene-level, a coarse pre-filter only), platforms Landsat 5, 7, 8, 9. Landsat 4 (a handful of scenes) is excluded.
2. Read the `red`, `nir08` and `qa_pixel` COGs by HTTP range request (geotiff.js, no GDAL). The pin lon/lat is projected to the scene's UTM zone with proj4 (EPSG from the STAC item) and the window is computed from the file's own origin and pixel size.
3. Reflectance = DN x 0.0000275 - 0.2 (same for all four missions). Red and NIR are `red`/`nir08`: TM and ETM+ bands 3 and 4, OLI bands 4 and 5.
4. Pixel rejected when QA_PIXEL has any of: bit 0 fill, 1 dilated cloud, 2 cirrus, 3 cloud, 4 cloud shadow, 5 snow/ice; or when a DN is outside 1..65455. (Bit 2 cirrus is only produced for Landsat 8/9.) Water (bit 7) is not rejected: water gives negative NDVI and is a real observation.
5. One observation per date and satellite. Different dates of adjacent frames from the same pass are not double counted.
Network: 30 s STAC and 40 s per image timeouts, up to 3 retries with exponential backoff on network errors, timeouts, 429 and 5xx; three scenes in flight at a time; a 403 from blob storage refreshes the token once.

## Grids (map overlay)
`data/ndvi/<pin>-grids.json`: 21 x 21 pixel windows (about 630 m square) centred on the pin pixel, for up to 12 clear dates in each of 2024 and 2025 (windows with at least 60 % clear pixels, thinned evenly in time). Each grid has `ndvi[row][col]` (row 0 = north, col 0 = west, null = masked), `bounds` (west, south, east, north in lon/lat), `crsBounds` (metres), `crs`, `pixelSizeM`, `validFraction`. Draw it as an image overlay; the lon/lat box is the axis-aligned outline of a window that is square in UTM (the difference is a few metres at these latitudes). Label it `NDVI_GRID_LABEL`: it shows where around the pin it is greener or less green, not a field boundary.

## Indicators (`indicators.ts`, pure functions)
- Yearly peak: highest clear NDVI of the calendar year, with its date. A year with fewer than 6 clear observations is marked `sparse` (the real peak may fall between clouds). The typical peak is the median over non-sparse years.
- Display curve: `smoothedYearCurve` = linear interpolation at 5-day steps, then a centred 3-step (15-day) moving average. DISPLAY ONLY; no indicator uses it.
- Green-up: interpolate clear observations linearly to daily values (no estimate across gaps over 60 days); peak = highest interpolated value of the year; minimum = lowest value from 1 January to the peak; amplitude = peak - minimum; no green-up if amplitude < 0.15; threshold = minimum + 0.5 x amplitude; green-up = first day from the minimum on where the interpolated value reaches the threshold. Uncertainty: the true crossing lies between the two clear observations that bracket it, so `uncertaintyDays` is that bracket's width in days (a crossing inside a bracket wider than 60 days is reported as no date). It is a Northern-Hemisphere calendar-year definition and uses the year's global peak, so for a double-cropped pin (Ludhiana) it describes the main season only.
- Bare periods: runs of consecutive clear observations with NDVI below 0.2 (bare or nearly bare ground; NASA Earth Observatory: barren 0.1 and below, sparse vegetation starts at 0.2). Reported start/end are the first and last observed bare date; `earliestStart` and `latestEnd` give how far the spell could extend. A run is split across a gap of more than 60 days.
- Stress flags: for a clear observation x on day-of-year d, take one value per other year (mean of that year's clear observations within +-15 days of d, wrapping over new year); need at least 5 other years; typical = their median, spread = their MAD (floored at 0.03); modified z = 0.6745 (x - typical)/spread; flag when z <= -3.5 AND typical - x >= 0.15. Only unusually LOW values are flagged. A flag means "unusually low greenness for this pixel at this time of year"; it cannot separate crop stress from a different crop that year, an earlier harvest, residual haze or cloud edge. Wording says so.
- Wording (`ndviWording`) is built from these numbers only; with no flags it says "No clear stress signal."

## API
`getNdviSeries(lat, lon, {fresh?})`: a demo pin (within about 11 m) returns the saved file (`origin: "saved"`); otherwise a live Landsat read of the last 3 years, at most 40 scenes (thinned evenly), three at a time. Allow roughly 15 to 60 seconds; show a waiting state. Results are kept in memory and then returned as `origin: "cache"`. `FIELD_REWIND_OFFLINE=1` makes it return saved demo pins only and a structured error for anything else (no network call, also refuses `fresh`). Provenance wording: `ndviOriginLine(result)`; anything not `live` says "Saved response from [date]".
`loadSavedNdvi(pinId)`, `loadSavedNdviGrid(pinId, dateIso?)` (nearest saved date, `daysOff` says how far), `loadSavedNdviModis(pinId)` (Brentwood only, null otherwise), `computeNdviIndicators(result)`, `ndviWording(indicators)`.

## Landsat 5, 7, 8, 9 consistency
Included: Landsat 5 (from 1985), 7, 8 (from 2013), 9 (from late 2021). All four use the same Collection 2 Level-2 scale (0.0000275, offset -0.2; confirmed in the STAC items of Landsat 5, 7 and 8) and the same red/NIR common bands.
Cross-sensor check run on the saved data: pairs of clear observations from two different satellites 1 to 8 days apart (interleaved overpasses, so vegetation change is roughly symmetric), median of NDVI(A) - NDVI(B):

| Pair | Brentwood | Fresno | Ludhiana |
|---|---|---|---|
| Landsat 5 - 7 | -0.007 (118 pairs) | +0.029 (580) | +0.005 (58) |
| Landsat 7 - 8 | -0.029 (131) | -0.078 (418) | -0.069 (150) |
| Landsat 8 - 9 | 0.000 (55) | +0.004 (235) | +0.008 (75) |

Reading: Landsat 8 and 9 agree; Landsat 5 and 7 agree to within about 0.03; Landsat 7 reads lower than Landsat 8 by about 0.03 at the crop-like Brentwood pixel and by 0.07 to 0.08 at the Fresno and Ludhiana pixels. That is the size of the known ETM+ to OLI difference (Roy et al. 2016 give a regression between the sensors), but we did NOT apply any adjustment and we did not verify the size of the offset against a reference. So mixed-sensor series carry a possible step of up to about 0.03 (Brentwood) to 0.08 (low-NDVI pixels) around 2013. The stress rule compares a pin with its own other years, so such a step makes a flag slightly more or less likely; it cannot create a 0.15 drop. If you want a single-sensor view, `retrieveSeries({ platforms: [...] })` takes the platform list, or filter `observations` by `satellite`.
Landsat 7 SLC-off (after 31 May 2003): the stripe gaps are fill pixels (DN 0, QA bit 0), which the mask removes, so the pin simply has no observation on those dates. We did not measure what share of Landsat 7 observations this removes; the overall masked share per pin is in `counts`. Landsat 4 (a few scenes, 1982 to 1993) is excluded. The archive has no Landsat 5 scene for the Ludhiana pin before November 1989.
`counts.scenesRead - counts.clear - counts.masked` = clear scenes that repeat the same date and satellite (an adjacent frame of the same pass); they are kept once.

## Saved data (fetched 16 Nov 2026 UTC, `npx tsx scripts/fetch-ndvi.ts`)
Period 1985-2025 (Ludhiana's first scene is 1 Nov 1989). Fetch time: about 10 minutes for Brentwood, 26 for Fresno, 17 for Ludhiana, three scenes at a time, no failed reads.

| Pin | Scenes (cloud under 40 %) | Clear pin pixel | Masked | First | Typical yearly peak (median) |
|---|---|---|---|---|---|
| Brentwood | 870 | 733 | 137 | 1985-04-03 | 0.77 (40 years) |
| Fresno | 2404 | 1630 | 485 | 1985-01-31 | 0.27 (41 years) |
| Ludhiana | 1537 | 658 | 434 | 1989-11-01 | 0.37 (33 years) |

Windows: `<pin>-grids.json`, 12 clear dates in each of 2024 and 2025 per pin (24 per pin), each at least 60 % clear pixels.
MODIS: `brentwood-modis.json`, 571 of 595 16-day composites (2000-02-18 to 2025-11-17) kept; 24 dropped for pixel reliability other than 0; none were fill. The 250 m pixel mixes more than the Landsat pixel: yearly peaks are lower (for example 2005: MODIS 0.71 vs Landsat 0.82; 2023: 0.69 vs 0.86). Use it only as a longer, coarser cross-check, with its own label.

## What the saved pins look like
- Brentwood: strong seasonal pixel (yearly peaks about 0.72 to 0.87 in recent years). The summer dips that the stress rule flags (July in 1987, 2003, 2005, 2007, 2009, 2016, 2025) could be harvest or fallow timing in a rotation rather than stress; the data cannot tell which. Wording says "unusually low", not "drought".
- Fresno: NDVI never exceeds 0.48 and is often below 0.2 (minimum -0.21). The pixel is not green farmland; it is probably developed or sparsely vegetated land. Do not present it as a crop field. Its green-up is "none" in most recent years because the seasonal rise is under 0.15.
- Ludhiana: a winter-spring rise (wheat-like timing, green-up in late January to early March) but low peaks (typical 0.37, up to 0.69), so a mixed pixel, not a clean field.  The yearly-peak summary keeps only the highest value of the year, so any second (summer) crop is not described; we did not inspect for one.

