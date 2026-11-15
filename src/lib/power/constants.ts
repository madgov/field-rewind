import type { PowerField } from "../types";

/** NASA POWER daily point endpoint (verified with a real call, API v2.10.3). */
export const POWER_BASE_URL = "https://power.larc.nasa.gov/api/temporal/daily/point";
export const POWER_COMMUNITY = "AG";

/** POWER parameter name -> DailyRecord field. Order here is the order sent in the request. */
export const FIELD_BY_PARAMETER = {
  T2M_MAX: "tMaxC",
  T2M_MIN: "tMinC",
  RH2M: "rhPct",
  WS2M: "wind2mMs",
  ALLSKY_SFC_SW_DWN: "solarMJm2",
  PRECTOTCORR: "precipMm",
} as const satisfies Record<string, PowerField>;

export type PowerParameter = keyof typeof FIELD_BY_PARAMETER;
export const POWER_PARAMETERS = Object.keys(FIELD_BY_PARAMETER) as PowerParameter[];
export const POWER_FIELDS = Object.values(FIELD_BY_PARAMETER) as PowerField[];

/** Units documented in src/lib/types.ts. POWER must report exactly these; anything else is an error. */
export const EXPECTED_UNITS: Record<PowerField, string> = {
  tMaxC: "C",
  tMinC: "C",
  rhPct: "%",
  wind2mMs: "m/s",
  solarMJm2: "MJ/m^2/day",
  precipMm: "mm/day",
};

/** Date range the app always asks for. */
export const DEFAULT_START = "1985-01-01";
export const DEFAULT_END = "2025-12-31";

/** POWER's documented missing-value marker; the response header's fill_value overrides it. */
export const DEFAULT_FILL_VALUE = -999;

/** Per-request timeout (ms). A real 41-year request took about 1.6 s. */
export const DEFAULT_TIMEOUT_MS = 45_000;
/** Retries after the first attempt (so 3 attempts total). Network errors, 429 and 5xx only. */
export const DEFAULT_MAX_RETRIES = 2;
/** Backoff before retry n (0-based) is base * 2^n ms. */
export const DEFAULT_BACKOFF_BASE_MS = 500;
/** Cap on any wait, including a server-sent Retry-After. */
export const MAX_BACKOFF_MS = 5_000;
/**
 * Maximum years per request. A single request for all 41 years (1985-2025) succeeded
 * (HTTP 200, ~1.5 MB, 14975 days), so the default is one chunk. Lower it to split.
 */
export const DEFAULT_CHUNK_YEARS = 41;
