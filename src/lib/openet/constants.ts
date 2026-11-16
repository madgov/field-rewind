/** OpenET raster point time series endpoint (verified against https://openet-api.org/openapi.json, API v3.2). */
export const OPENET_POINT_URL = "https://openet-api.org/raster/timeseries/point";
export const OPENET_SIGNUP_URL = "https://account.etdata.org";
export const OPENET_KEY_ENV = "OPENET_API_KEY";

/** Exact blocker text used whenever no key is configured. */
export const NO_KEY_MESSAGE =
  "OPENET_API_KEY is not set; the user must create a key at https://account.etdata.org and put it in .env.local, then run `npx tsx scripts/fetch-openet.ts`";

/**
 * Earliest month requested. OpenET's Data Availability page says monthly Ensemble ET starts in 2000, but the real API (v3.2, probed
 * with a real key on 2026-11-16, one point in Brentwood) answered HTTP 406 {"detail":"No collection found for the specified
 * variable/model combination"} for 2000, 2008, 2012 and 2014, and returned data for 2015 and 2016. So the series starts in 2015.
 */
export const MONTHLY_START = "2015-01-01";

/**
 * OpenET v2.1 covers the conterminous US (CONUS) only (docs: Data Availability page).
 * This is a coarse bounding box used only to avoid spending quota on points that are
 * clearly outside; it is not the real coverage mask.
 */
export const CONUS_BBOX = { minLat: 24.4, maxLat: 49.6, minLon: -125.0, maxLon: -66.9 } as const;

export const DEFAULT_TIMEOUT_MS = 60_000;
export const DEFAULT_MAX_RETRIES = 2;
export const DEFAULT_BACKOFF_BASE_MS = 1_000;
export const MAX_BACKOFF_MS = 15_000;

/** Docs: real-time OpenET data is provisional for the last 120 days. */
export const PROVISIONAL_DAYS = 120;

/** Fixed caveat shown with every comparison. */
export const COMPARISON_CAVEAT =
  "These two numbers measure different things. OpenET is satellite-based actual evapotranspiration of whatever is really growing on the roughly 30 m Landsat pixel at your pin (it uses Landsat 8 and 9 imagery), which may be a different crop, fallow ground, or something else entirely. The app's figure is modelled water use for the crop you picked. A gap between them does not by itself mean either one is wrong.";

/**
 * OpenET rejects a date range longer than 10 years (HTTP 404 {"detail":"Date range cannot exceed 10 years."}, seen on the first
 * real request). The client asks for windows of at most this many years, one request (one quota query) per window.
 */
export const MAX_RANGE_YEARS = 9;
