/** All tunable values for the NDVI layer, in one place. Sources are cited in docs/ndvi.md. */

export const STAC_URL = "https://planetarycomputer.microsoft.com/api/stac/v1";
export const TOKEN_URL = "https://planetarycomputer.microsoft.com/api/sas/v1/token/landsat-c2-l2";
export const COLLECTION = "landsat-c2-l2";
export const USER_AGENT = "field-rewind";

/** Landsat Collection 2 Level-2 surface reflectance: reflectance = DN * 0.0000275 - 0.2 (all missions, USGS). */
export const SR_SCALE = 0.0000275;
export const SR_OFFSET = -0.2;
/** Valid surface-reflectance DN range stated on the USGS Landsat C2 L2 science products page (1..65455; 0 is fill). */
export const SR_DN_MIN = 1;
export const SR_DN_MAX = 65455;

/** QA_PIXEL bit numbers (USGS Landsat C2 L2 product guide). */
export const QA_BITS = { fill: 0, dilatedCloud: 1, cirrus: 2, cloud: 3, cloudShadow: 4, snow: 5, clear: 6, water: 7 } as const;
/** Bits whose being set rejects the observation. */
export const QA_REJECT_BITS = [QA_BITS.fill, QA_BITS.dilatedCloud, QA_BITS.cirrus, QA_BITS.cloud, QA_BITS.cloudShadow, QA_BITS.snow] as const;

export const NDVI_UNITS = "NDVI (unitless, -1..1)";
export const PIXEL_SIZE_M = 30;
export const GRID_RADIUS_PX = 10; // 21 x 21 window, about 630 m square

/** Network behaviour. Polite: low concurrency, bounded retries, explicit timeouts. */
export const STAC_TIMEOUT_MS = 30_000;
export const TOKEN_TIMEOUT_MS = 15_000;
export const COG_TIMEOUT_MS = 40_000;
export const MAX_RETRIES = 3;
export const BACKOFF_BASE_MS = 1_000;
export const MAX_BACKOFF_MS = 15_000;
export const SCENE_CONCURRENCY = 3;
/** Refresh the read token this long before its stated expiry. */
export const TOKEN_REFRESH_MARGIN_MS = 5 * 60_000;

/** Scene-level cloud cover filter in the search (per-pixel QA is applied afterwards). */
export const MAX_SCENE_CLOUD_PCT = 40;

/** Live path (getNdviSeries on a point that is not a saved demo pin). */
export const LIVE_YEARS = 3;
export const LIVE_MAX_SCENES = 40;

/** First calendar year with verified Landsat data in the saved files (set after the verification in docs/ndvi.md). */
export const SAVED_END_YEAR = 2025;

/** Indicator definitions (see docs/ndvi.md for the sources). */
export const MIN_OBS_PER_YEAR = 6;
export const MAX_INTERP_GAP_DAYS = 60;
export const GREENUP_FRACTION = 0.5;
export const GREENUP_MIN_AMPLITUDE = 0.15;
export const SMOOTH_STEP_DAYS = 5;
export const SMOOTH_WINDOW_STEPS = 3;
/** Upper NDVI bound for bare or nearly bare ground (NASA Earth Observatory, Measuring Vegetation). */
export const BARE_NDVI_MAX = 0.2;
export const STRESS_DOY_HALF_WINDOW = 15;
export const STRESS_MIN_COMPARISON_YEARS = 5;
export const STRESS_Z_CUTOFF = -3.5;
export const STRESS_MIN_DROP = 0.15;
export const STRESS_MAD_FLOOR = 0.03;
