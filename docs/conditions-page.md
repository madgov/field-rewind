# Field conditions page (`/conditions?lat=&lon=`)

A page for any pin that puts the Stage 1 to 5 data layers side by side. Nothing on it is synthetic. Every layer shows its own origin line, and a saved copy always says "Saved response from [date]".

## Sections (each in its own Suspense boundary)
1. Heat and frost: POWER frost days, frost-free season, last spring and first autumn frost; link to the hot-days shift page.
2. Soil wetness (modelled): growing-season anomaly bars; the driest seasons are named. The dry-day count appears only in the details, with its caveat.
3. NASA snapshots: saved SMAP July 1–7, 2025 morning composites and IMERG July 2025 rainfall for the three demo pins, with fetch dates, product versions, quality fields and explicit exclusions. These snapshots do not change the replay or the yearly view. See `docs/earthdata.md`.
4. Vegetation seen from space: Landsat 30 m NDVI (plus MODIS 250 m for Brentwood), stress flags, bare spells, green-up with its uncertainty, pixel caveats.
5. Soil and terrain: NASADEM terrain, SSURGO soil facts, NRCS meanings, slope bands and erodibility as separate facts, labelled "not a soil-loss prediction".
6. Map: Leaflet, exact-bounds rasters (Landsat NDVI date timeline, slope, low spots), the pin, window outlines, legends built from the real min and max (6 equal bins, colour-blind-safe palettes with labelled bins), hover or tap for the real pixel value. No frost or erosion zones are drawn. The cold-air sentence about low spots is general background with no citation.
7. Ground checks: POWER vs Daymet rain chart, one CoCoRaHS gauge, USDA crop history, NLCD land cover, nearest USGS well, each with a data-type badge.
8. Harmonized yearly view, 1985 to 2025: frost days, soil wetness anomaly, POWER rain, Daymet rain, hot days over 35 C, peak Landsat NDVI. A year scrubber highlights the year in every row. Missing years are hatched, never filled. No combined score.
9. Data layers not connected: ECOSTRESS and GLDAS/NLDAS remain unimplemented. OpenET and CIMIS are in "How we know" on /shift and /replay and read real saved responses; keys are needed only to fetch replacements.

## Data flow
`ConditionsContent` awaits `searchParams`, then `connection()` (request time), snaps a point within 0.0005 degrees of a demo pin to it (`?example=1` is Brentwood), and renders sections. Loaders in `load.ts` are wrapped in React `cache()`, so sections share one load per request, and return `Part` results so one failing layer never blanks the page. View models (`models.ts`, `overlay.ts`) are pure and unit-tested.

## Saved versus live
Demo pins read the committed files in `data/` and need no network. Other places go through each supported layer's live service; Earthdata snapshots are demo-only and make no request while a page loads. With `FIELD_REWIND_OFFLINE=1` they return a structured per-layer error (exact message and next step). Landsat windows for the map are saved for the three demo pins only; elsewhere the map says so.

## Limits
- Reanalysis (POWER) is not observation; the grid is about 50 km.
- A Landsat pixel is 30 m and can be mixed; Landsat sensors differ slightly and no adjustment is applied.
- SSURGO, Daymet, CoCoRaHS, CDL, NLCD and NWIS are United States (Daymet: North America) only. Ludhiana shows each as "nothing to show" with the service's exact reason.
- Layers have different native resolutions (30 m pixel to 50 km grid); the yearly view lines them up by year and nothing more.

## Build notes
- `await connection()` in `ShiftContent`, `ReplayContent` and `ConditionsContent` removes the "unstable value new Date() while prerendering" log. A test checks the call exists after `searchParams`.
- `next.config.ts` adds `data/power-extra`, `ndvi`, `landform`, `ground-truth` and `earthdata` to `outputFileTracingIncludes` for `/conditions`, `/shift` and `/replay` (the How we know panel reads their saved dates).
- Pages are large for places with many observations (Fresno HTML about 1.6 MB) because observations are drawn as SVG.
