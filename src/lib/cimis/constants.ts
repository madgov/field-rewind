export const CIMIS_STATION = 47 as const;
export const CIMIS_BASE_URL = "https://et.water.ca.gov/api/data";
export const CIMIS_DATA_ITEM = "day-asce-eto";
/** Metric: ETo in mm. */
export const CIMIS_UNIT_OF_MEASURE = "M";

export const DEFAULT_START = "2010-01-01";
export const DEFAULT_END = "2025-12-31";

/**
 * Days per request. The live CIMIS docs (checked 2026-11) name an ERR2112 "DATA VOLUME VIOLATION" but give no
 * number. ~1,750 records was the believed limit; one station and one daily item is 1 record per day, so we use
 * 1,750 days and also split a chunk in half when the server answers ERR2112.
 */
export const DEFAULT_MAX_DAYS_PER_REQUEST = 1750;

export const DEFAULT_TIMEOUT_MS = 45_000;
/** Retries after the first attempt. Network errors, 429 and 5xx only. */
export const DEFAULT_MAX_RETRIES = 2;
export const DEFAULT_BACKOFF_BASE_MS = 500;
export const MAX_BACKOFF_MS = 5_000;

/** Minimum paired days in a calendar year before its annual totals are compared. */
export const MIN_PAIRED_DAYS_PER_YEAR = 350;

/** Fixed Brentwood demo-pin id in the POWER saved data. */
export const BRENTWOOD_PIN_ID = "brentwood";
