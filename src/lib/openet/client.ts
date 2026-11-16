import {
  CONUS_BBOX,
  DEFAULT_BACKOFF_BASE_MS,
  DEFAULT_MAX_RETRIES,
  DEFAULT_TIMEOUT_MS,
  MAX_BACKOFF_MS,
  MAX_RANGE_YEARS,
  MONTHLY_START,
  NO_KEY_MESSAGE,
  OPENET_POINT_URL,
} from "./constants";
import { describeCoverage, normalizeOpenEt, OpenEtShapeError } from "./normalize";
import type { OpenEtErrorReason, OpenEtRequestBody, OpenEtResult, OpenEtStatus } from "./types";

export type FetchLike = (
  input: string,
  init?: { method?: string; signal?: AbortSignal; headers?: Record<string, string>; body?: string },
) => Promise<Response>;

export type OpenEtOptions = {
  /** API key. The caller reads it from process.env; it is only ever sent in the Authorization header. */
  apiKey?: string | null;
  fetchImpl?: FetchLike;
  timeoutMs?: number;
  maxRetries?: number;
  backoffBaseMs?: number;
  sleep?: (ms: number) => Promise<void>;
  now?: () => Date;
  /** Skip the coarse CONUS bounding-box pre-check. */
  skipCoverageCheck?: boolean;
};

export type OpenEtFetch = {
  /** The date windows actually requested, one request each. OpenET rejects a range longer than 10 years. */
  chunks?: [string, string][];
  result: OpenEtResult;
  /** Raw response body (parsed JSON) when the call succeeded; never contains the key. */
  raw: unknown;
  /** Request body that was (or would have been) sent. No key in it. */
  request: OpenEtRequestBody | null;
};

export function validateLatLon(lat: number, lon: number): string | null {
  if (!Number.isFinite(lat) || lat < -90 || lat > 90) return `latitude ${lat} is not within -90..90`;
  if (!Number.isFinite(lon) || lon < -180 || lon > 180) return `longitude ${lon} is not within -180..180`;
  return null;
}

export function insideConusBox(lat: number, lon: number): boolean {
  return lat >= CONUS_BBOX.minLat && lat <= CONUS_BBOX.maxLat && lon >= CONUS_BBOX.minLon && lon <= CONUS_BBOX.maxLon;
}

/** Body for the point endpoint. OpenET wants geometry as [LONGITUDE, LATITUDE]. */
export function buildOpenEtBody(lat: number, lon: number, start: string, end: string): OpenEtRequestBody {
  return {
    date_range: [start, end],
    interval: "monthly",
    geometry: [lon, lat],
    model: "Ensemble",
    variable: "ET",
    reference_et: "gridMET",
    units: "mm",
    file_format: "JSON",
  };
}

const addDays = (iso: string, n: number): string => new Date(Date.parse(`${iso}T00:00:00Z`) + n * 86_400_000).toISOString().slice(0, 10);

/**
 * Split [start, end] into windows of at most `years` calendar years, in order, with no gap and no overlap.
 * Found with the first real key: OpenET answers HTTP 404 {"detail":"Date range cannot exceed 10 years."} for a longer range.
 */
export function splitDateRange(start: string, end: string, years = MAX_RANGE_YEARS): [string, string][] {
  const out: [string, string][] = [];
  let cur = start;
  while (cur <= end) {
    const y = Number(cur.slice(0, 4)) + years;
    const next = `${String(y).padStart(4, "0")}${cur.slice(4)}`; // same month and day, `years` later
    const windowEnd = addDays(next, -1);
    const e = windowEnd < end ? windowEnd : end;
    out.push([cur, e]);
    cur = addDays(e, 1);
  }
  return out;
}

class HttpFail extends Error {
  constructor(
    public kind: "timeout" | "network" | "http" | "parse",
    message: string,
    public status: number | null = null,
    public body = "",
    public retryAfter: string | null = null,
  ) {
    super(message);
  }
}

const defaultSleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));
const retryable = (e: HttpFail) => e.kind === "network" || (e.kind === "http" && (e.status === 429 || (e.status ?? 0) >= 500));

async function attempt(fetchImpl: FetchLike, body: OpenEtRequestBody, apiKey: string, timeoutMs: number): Promise<unknown> {
  const ctrl = new AbortController();
  let timedOut = false;
  const timer = setTimeout(() => {
    timedOut = true;
    ctrl.abort();
  }, timeoutMs);
  try {
    let res: Response;
    let text: string;
    try {
      res = await fetchImpl(OPENET_POINT_URL, {
        method: "POST",
        signal: ctrl.signal,
        headers: { Authorization: apiKey, "Content-Type": "application/json", Accept: "application/json" },
        body: JSON.stringify(body),
      });
      text = await res.text();
    } catch (e) {
      if (timedOut) throw new HttpFail("timeout", `OpenET request timed out after ${timeoutMs} ms`);
      throw new HttpFail("network", `Network error contacting OpenET: ${e instanceof Error ? e.message : String(e)}`);
    }
    if (!res.ok) {
      throw new HttpFail("http", `OpenET returned HTTP ${res.status}`, res.status, text.slice(0, 400), res.headers?.get?.("retry-after") ?? null);
    }
    try {
      return JSON.parse(text);
    } catch {
      throw new HttpFail("parse", "OpenET returned HTTP 200 but the body is not valid JSON");
    }
  } finally {
    clearTimeout(timer);
  }
}

const COVERAGE_RE = /outside|coverage|not available|no data|out of (bounds|range)|does not intersect|no images?/i;
const QUOTA_RE = /quota|limit|exceed/i;

function mapHttp(e: HttpFail): { status: OpenEtStatus; reason: OpenEtErrorReason; message: string } {
  const body = e.body.replace(/\s+/g, " ");
  const s = e.status ?? 0;
  if (s === 429 || ((s === 400 || s === 402 || s === 403) && QUOTA_RE.test(body))) {
    return { status: "quota", reason: "http", message: `OpenET refused the request (HTTP ${s}): rate limit or monthly quota reached. Free tier is 100 queries per month, 20 per minute; quota resets on the 1st (UTC).` };
  }
  if (s === 401 || s === 403) {
    return { status: "error", reason: "auth", message: `OpenET rejected the API key (HTTP ${s}). Check OPENET_API_KEY at https://account.etdata.org.` };
  }
  if (s === 400 || s === 404 || s === 422) {
    if (COVERAGE_RE.test(body)) return { status: "no-coverage", reason: "http", message: `OpenET has no data for this point (HTTP ${s}): ${body.slice(0, 200)}` };
    return { status: "error", reason: "validation", message: `OpenET rejected the request (HTTP ${s}): ${body.slice(0, 200)}` };
  }
  if (s >= 500) {
    return { status: "error", reason: "http", message: `OpenET server error (HTTP ${s}). Observed: an invalid API key also returns HTTP 500 "Internal Server Error", so check the key if this repeats.` };
  }
  return { status: "error", reason: "http", message: `OpenET returned HTTP ${s}: ${body.slice(0, 200)}` };
}

/** Remove the key from any text, defensively. */
function scrub(text: string, key: string | null | undefined): string {
  return key ? text.split(key).join("[redacted]") : text;
}

function lastDayOfPreviousMonth(d: Date): string {
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), 0)).toISOString().slice(0, 10);
}

/** Monthly Ensemble ET (mm) at one point. Default range: 2015-01-01 (the first month the real API serves) to the end of last month. */
export async function fetchOpenEtMonthly(lat: number, lon: number, opts: OpenEtOptions & { start?: string; end?: string } = {}): Promise<OpenEtFetch> {
  const now = (opts.now ?? (() => new Date()))();
  const start = opts.start ?? MONTHLY_START;
  const end = opts.end ?? lastDayOfPreviousMonth(now);
  const base: OpenEtResult = {
    status: "error",
    message: null,
    reason: null,
    httpStatus: null,
    series: [],
    unitsReported: null,
    unitsRequested: "mm",
    model: "Ensemble",
    variable: "ET",
    interval: "monthly",
    coverage: null,
    fetchedAt: null,
    sourceUrl: OPENET_POINT_URL,
  };
  const fail = (patch: Partial<OpenEtResult>, request: OpenEtRequestBody | null = null): OpenEtFetch => ({ result: { ...base, ...patch }, raw: null, request });

  const bad = validateLatLon(lat, lon);
  if (bad) return fail({ status: "error", reason: "input", message: bad });
  if (!(start <= end) || !/^\d{4}-\d{2}-\d{2}$/.test(start) || !/^\d{4}-\d{2}-\d{2}$/.test(end)) {
    return fail({ status: "error", reason: "input", message: `invalid date range ${start}..${end}` });
  }
  const request = buildOpenEtBody(lat, lon, start, end);
  if (!opts.skipCoverageCheck && !insideConusBox(lat, lon)) {
    return fail({ status: "no-coverage", message: "OpenET covers the conterminous United States only; this point is outside it (approximate bounding-box check, no request made)." }, request);
  }
  const apiKey = opts.apiKey?.trim();
  if (!apiKey) return fail({ status: "no-key", message: NO_KEY_MESSAGE }, request);

  const fetchImpl = opts.fetchImpl ?? (globalThis.fetch as FetchLike);
  const timeoutMs = opts.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const maxRetries = opts.maxRetries ?? DEFAULT_MAX_RETRIES;
  const sleep = opts.sleep ?? defaultSleep;
  const baseDelay = opts.backoffBaseMs ?? DEFAULT_BACKOFF_BASE_MS;

  const chunks = splitDateRange(start, end);
  const merged: unknown[] = [];
  for (const [cs, ce] of chunks) {
    const chunkBody = buildOpenEtBody(lat, lon, cs, ce);
    let rawChunk: unknown;
    for (let n = 0; ; n++) {
      try {
        rawChunk = await attempt(fetchImpl, chunkBody, apiKey, timeoutMs);
        break;
      } catch (e) {
        if (!(e instanceof HttpFail)) throw e;
        if (retryable(e) && n < maxRetries) {
          const ra = e.retryAfter ? Number(e.retryAfter) : NaN;
          await sleep(Math.min(Number.isFinite(ra) ? ra * 1000 : baseDelay * 2 ** n, MAX_BACKOFF_MS));
          continue;
        }
        // Any failed window fails the whole fetch: a series with a silent hole is never returned or saved.
        if (e.kind === "http") {
          const m = mapHttp(e);
          const f = fail({ status: m.status, reason: m.reason, httpStatus: e.status, message: scrub(`${m.message} (window ${cs} to ${ce})`, apiKey) }, request);
          return { ...f, chunks };
        }
        const f = fail({ status: "error", reason: e.kind, message: scrub(`${e.message}${n > 0 ? ` (after ${n + 1} attempts)` : ""} (window ${cs} to ${ce})`, apiKey) }, request);
        return { ...f, chunks };
      }
    }
    const inner = rawChunk && typeof rawChunk === "object" && !Array.isArray(rawChunk) ? ((rawChunk as Record<string, unknown>).data ?? (rawChunk as Record<string, unknown>).results ?? (rawChunk as Record<string, unknown>).result) : rawChunk;
    if (!Array.isArray(inner)) {
      const f = fail({ status: "error", reason: "shape", httpStatus: 200, message: `OpenET response for ${cs} to ${ce} is not a list of monthly records.` }, request);
      return { ...f, chunks };
    }
    merged.push(...inner);
  }
  const raw: unknown = merged;

  const fetchedAt = now.toISOString();
  let norm;
  try {
    norm = normalizeOpenEt(raw, "et");
  } catch (e) {
    if (e instanceof OpenEtShapeError) return fail({ status: "error", reason: e.kind, httpStatus: 200, fetchedAt, message: e.message }, request);
    throw e;
  }
  const { series, coverage } = describeCoverage(norm.series, start, end, fetchedAt);
  const common = { series, coverage, unitsReported: norm.unitsReported, fetchedAt, httpStatus: 200 };
  if (coverage.withData === 0) {
    return { result: { ...base, ...common, status: "no-coverage", message: "OpenET returned no ET values for this point and range (empty or all null)." }, raw, request, chunks };
  }
  if (coverage.missingMonths.length > 0) {
    return { result: { ...base, ...common, status: "partial", message: `${coverage.missingMonths.length} of ${coverage.requestedMonths} requested months have no value.` }, raw, request, chunks };
  }
  return { result: { ...base, ...common, status: "ok" }, raw, request, chunks };
}
