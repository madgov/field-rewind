# Soil, terrain and erosion layer

Server-side only. Code: `src/lib/landform/`, fetch script: `scripts/fetch-landform.ts`, saved data: `data/landform/`.
Import from `@/lib/landform` (`getLandform`, `loadSavedLandform`, `loadSavedLandformGrid`, `landformWording`, `LANDFORM_LABEL`, derived helpers, types).
Client components may import the pure modules directly (`soil`, `terrain`, `erosion`, `wording`, `label`); `index.ts` pulls in node:fs and the network clients.

Label (`LANDFORM_LABEL`): Terrain: NASADEM elevation, NASA's reprocessing of SRTM radar data, 1 arc-second (about 30 m) surface model. Soil: USDA NRCS SSURGO soil survey via Soil Data Access (United States only). Erosion: indicator from slope and soil erodibility, not a soil-loss prediction.

## Lookup order and offline switch
`getLandform(lat, lon, { fresh? })`:
1. A saved place within 0.001 degrees (three demo pins and the Orange Cove sample point): `origin: "saved"`.
2. Runtime cache (memory, then `.cache/landform`): `origin: "cache"`.
3. Live NASADEM + Soil Data Access in parallel: `origin: "live"`. Errors are never cached.

`FIELD_REWIND_OFFLINE=1` (same switch as POWER) runs step 1 only. Nothing touches the network; an unsaved coordinate returns `status: "error"` with `LANDFORM_OFFLINE_MESSAGE`.
`status`: `ok` (terrain ok, soil ok or no-coverage), `partial` (one of terrain or soil failed), `error` (nothing usable). Non-US soil is `soil.status: "no-coverage"`, not an error.
UI rule: `origin !== "live"` must be shown through `landformOriginLine` / `landformDataLabel` ("Saved response from [date]").

## Terrain: NASADEM
- Source: NASADEM (NASA reprocessing of SRTM, about 1 arc-second, about 30 m posting). It is a SURFACE model: radar reflects off canopy and roofs, so buildings and trees raise it. Slope on developed or wooded ground is not farm slope (the Fresno pin is developed land).
- Hosting: Microsoft Planetary Computer, anonymous. `POST https://planetarycomputer.microsoft.com/api/stac/v1/search` with `{"collections":["nasadem"],"intersects":{"type":"Point","coordinates":[lon,lat]}}` returns the 1 x 1 degree tile (e.g. `NASADEM_HGT_n37w122`) and its `elevation` COG asset. A read token (about 1 hour) comes from `GET https://planetarycomputer.microsoft.com/api/sas/v1/token/nasadem`. A 43 x 43 window is read with geotiff.js. The token is never saved (saved files hold the asset URL without it).
- Grid: 41 x 41 samples at 1 arc-second around the pin cell (the extra ring in the 43 x 43 window feeds the 3 x 3 slope kernel). That is about 1.26 km north-south by 1.0 km (at 38 N) to 1.2 km (at 31 N) east-west, because the spacing is equal in degrees, not metres. `grid.bounds` are cell EDGES (west, south, east, north) for an image overlay; arrays are row-major with row 0 = north. Elevation is metres above the NASADEM vertical datum (EGM96 geoid).
- Cell size in metres uses the WGS84 series `111132.92 - 559.82 cos 2phi + 1.175 cos 4phi` (N-S) and `111412.84 cos phi - 93.5 cos 3phi` (E-W) per degree.
- Slope and aspect, Horn (1981) 3 x 3 weighted differences. With neighbours a b c / d e f / g h i (row 0 north):
  `dz/dx = ((c + 2f + i) - (a + 2d + g)) / (8 dx)` (positive when ground rises east),
  `dz/dy = ((a + 2b + c) - (g + 2h + i)) / (8 dy)` (positive when ground rises north),
  `slope = atan(sqrt(dz/dx^2 + dz/dy^2))`, `percent = 100 tan(slope)`,
  `aspect = atan2(-dz/dx, -dz/dy)` = compass direction the slope faces (downhill), degrees clockwise from north; flat cells have aspect null.
  Reference: B. K. P. Horn, "Hill shading and the reflectance map", Proceedings of the IEEE 69(1), 14-47, 1981, doi:10.1109/PROC.1981.11918 (cited from memory, I did not open the paper). NRCS National Soil Survey Handbook 618.57 (opened) says slope gradient may be computed from a DEM with a 3 x 3 neighbourhood (it names Evans-Young and Zevenbergen-Thorne), output in percent, and that a 3 x 3 neighbourhood suits 10-30 m cells.
- Validation: `terrain.test.ts` checks hand-computed planes (rising to each compass direction, a z = x + y plane giving atan(sqrt 2) facing 225, unequal dx/dy) and a metre-accurate tilted plane built on the real lattice.
- "Relative low spots": `relativeElevation(grid)` = height above the lowest cell in the window (metres). The UI shades it; no threshold is invented.
- Summary: pin-cell elevation, slope (deg and percent), aspect, window min/max/relief, median and 90th percentile slope. The erosion indicator uses the pin-cell slope.
- Limits: 30 m cells hide ditches and field edges; the pin-cell slope is one noisy cell (compare with the window median); a pin within 22 cells of a tile edge returns an error (edge stitching not implemented); no-data cells give an error.

## Soil: SSURGO via Soil Data Access
- Endpoint: `POST https://sdmdataaccess.sc.egov.usda.gov/Tabular/post.rest`, body `{"query": "...", "format": "JSON+COLUMNNAME"}`, no key. Step 1: `SELECT * FROM SDA_Get_Mukey_from_intersection_with_WktWgs84('point(<lon> <lat>)')` (WKT is lon lat). Step 2: components with `comppct_r >= 15` of that map unit joined to horizons (`chorizon`), ordered by `comppct_r` desc then horizon top. Timeout 90 s, one retry on network error or 5xx. Earlier probes saw 11-28 s per call; this session's calls took 0.1-0.8 s (server-side caching). Errors come back as an XML `ServiceException` and are reported with its text.
- Outside the US, step 1 returns HTTP 200 with the body `{}` (verified for Ludhiana, saved verbatim in `data/landform/ludhiana.json`). The code maps an empty result to `status: "no-coverage"` with "SSURGO soil maps cover the United States only, and the soil service returned no map unit for this point." It does not guess from a bounding box; the service answer decides.
- Column definitions (NRCS Soil Data Mart 4.3 "Table Column Descriptions" https://sdmdataaccess.nrcs.usda.gov/documents/TableColumnDescriptionsReport.pdf and "Tables and Columns" https://sdmdataaccess.nrcs.usda.gov/documents/TablesAndColumnsReport.pdf, both opened):
  - `sandtotal_r`, `silttotal_r`, `claytotal_r`: percent by weight of the fine-earth fraction (sand 0.05-2.0 mm).
  - `om_r`: "The amount by weight of decomposed plant and animal residue expressed as a weight percentage of the less than 2 mm soil material" (percent, 0-100).
  - `awc_r`: "The amount of water that an increment of soil depth, inclusive of fragments, can store that is available to plants. AWC is expressed as a volume fraction, and is commonly estimated as the difference between the water contents at 1/10 or 1/3 bar (field capacity) and 15 bars (permanent wilting point) tension and adjusted for salinity, and fragments." Unit cm/cm, range 0-0.7.
  - `kffact`: "An erodibility factor which quantifies the susceptibility of soil particles to detachment by water." (Kf applies to the fine-earth fraction; Kw to the whole soil, NSSH 618.60.)
  - `ksat_r`: "The amount of water that would move vertically through a unit area of saturated soil in unit time under unit hydraulic gradient." Unit micrometres per second (stored, not otherwise used in derived numbers).
  - `hydgrp`: "A group of soils having similar runoff potential under similar storm and cover conditions. Examples are A and A/D."
  - `drainagecl`: "Identifies the natural drainage conditions of the soil and refers to the frequency and duration of wet periods."
  - `hzdept_r`, `hzdepb_r`: horizon top and bottom depth, cm. `comppct_r`: "The percentage of the component of the mapunit."
- Texture class: USDA texture classes from sand/silt/clay, NSSH 618 ("the basic texture classes ... are given graphically in section 618.86 as a percentage of sand, silt, and clay", opened). The triangle itself is a figure there and the boundary table in the Soil Survey Manual was not opened by me, so the class rules in `textureClass()` (documented in its comment, tested on the edges and with an exhaustive no-gap test over all whole-percent triples) are the standard USDA definitions written from knowledge. A point exactly on a line is assigned to the class listed first in the rule order. The two real surface horizons (Brentwood clay, Fresno and Orange Cove sandy loam) match the texture names SSURGO gives those map units. Sums outside 98-102 give no class.
- Profile available water capacity (top 100 cm): per component `AWC_mm = sum over horizons( awc_r x thickness_cm inside 0-100 cm x 10 )`; horizons with no `awc_r` contribute nothing and are not counted as covered. Across components `AWC = sum(comppct x AWC_component) / sum(comppct)` over components that have any `awc_r`, with the share of listed component percentage that contributed reported (`coveragePct`). A component with fewer than 100 cm of horizons with `awc_r` sets `shallowOrIncomplete`.
- Organic matter and Kf in the result are those of the surface (shallowest) horizon of the largest component. The component list keeps every listed horizon.
- Hydrologic soil group, quoted from NRCS National Engineering Handbook Part 630, Chapter 7 "Hydrologic Soil Groups" (210-VI-NEH, January 2009), p. 7-3. Opened copy: https://www.damtoolbox.org/images/e/e9/NEH7.pdf (third-party copy; NRCS index of Part 630: https://directives.nrcs.usda.gov/sites/default/files2/1712930634/Part%20630%20-%20Hydrology.pdf, which I opened but it holds only the table of contents; the current NRCS-hosted chapter text was not located):
  - A: "Soils in this group have low runoff potential when thoroughly wet. Water is transmitted freely through the soil."
  - B: "...moderately low runoff potential when thoroughly wet. Water transmission through the soil is unimpeded."
  - C: "...moderately high runoff potential when thoroughly wet. Water transmission through the soil is somewhat restricted."
  - D: "...high runoff potential when thoroughly wet. Water movement through the soil is restricted or very restricted."
  - Dual groups A/D, B/D, C/D: "The first letter applies to the drained condition and the second to the undrained condition."

## Erosion risk indicator
Label: "Erosion risk indicator from slope and soil erodibility, not a soil-loss prediction". There is NO risk score and NO combined class (`combinedClass` is always `null`). What is given, each sourced:
- Slope band of the NASADEM pin-cell slope: 0-2, 2-9, 9-15, 15 percent or steeper. These are the slope breaks in the NRCS California land capability guide where the erosion subclass (e) is assigned, NSSH 430-H, 622.23 "Subclass by Slope Gradient (%)" (Amendment 34, January 2018), https://directives.nrcs.usda.gov/sites/default/files2/1725389663/National%20Soil%20Survey%20Handbook%20%28entire%20handbook%29.pdf (opened, searched as text). The band names are my plain labels of those breaks; a value exactly on a break goes in the steeper band. In that guide the erosion subclass also depends on texture and drainage, which this indicator does not reproduce.
- Kf of the surface horizon and its position among the 14 NRCS Kf classes (0.02, 0.05, 0.10, 0.15, 0.17, 0.20, 0.24, 0.28, 0.32, 0.37, 0.43, 0.49, 0.55, 0.64). NSSH 618.60: Kf and Kw "quantify soil detachment by runoff and raindrop impact", measured Kw varies from 0.02 to 0.69, "for soil interpretations, the factors are grouped into 14 classes". Higher means more easily detached. NSSH gives no low/medium/high names, so none are used.
- Not found / not used: I could not open an NRCS or RUSLE table that combines slope and K into classes (the NRCS "Erosion Hazard (Off-Road, Off-Trail)" interpretation is built on slope and K but I could not retrieve its criteria table; one USGS ScienceBase layer uses K/slope thresholds but is a derived dataset, not a standard). HEL status needs rainfall erosivity and the soil-loss tolerance, which are not in this layer. Slope length (NSSH 618.58) is also needed for soil-loss equations and is unknown.

## Saved data
`npx tsx scripts/fetch-landform.ts [id ...]` fetches live and writes, per place, `data/landform/<id>.json` (raw SDA responses, terrain metadata, optional land-use check) and `<id>-grid.json` (raw 43 x 43 elevation window). Slope, texture, AWC and wording are recomputed on load by the same code that handles live data, so saved and live cannot disagree. Places: `brentwood`, `fresno`, `ludhiana` (demo pins) and `orange-cove` (36.68, -119.28, a labelled sample point, not a demo pin). Exits non-zero and writes nothing for a place it could not fetch. Each file is a few KB.
Orange Cove land use (USDA NASS Cropland Data Layer, CropScape point query, `GET https://nassgeodata.gmu.edu/axis2/services/CDLService/GetCDLValue?year=2023&x=<EPSG:5070 x>&y=<EPSG:5070 y>`, EPSG:5070 via proj4 with the standard Albers definition `+proj=aea +lat_0=23 +lon_0=-96 +lat_1=29.5 +lat_2=45.5 +x_0=0 +y_0=0 +datum=NAD83`): the point is class 176, Grass/Pasture, NOT cropland (2021-2024 all 176). Citrus (class 72) appears about 1 km south (36.67, -119.28; slope 4.3 percent there). The saved file records the check as it came back.

## Limits to show users
- NASADEM is a surface model with 30 m cells; SSURGO map units are polygons, so soil at an exact point can differ from the listed components (percent shown).
- SSURGO covers the United States only (Ludhiana has none).
- The erosion indicator is two sourced facts, not a prediction.
