import {
  CIMIS_BASE_URL,
  CIMIS_DATA_ITEM,
  CIMIS_STATION,
  CIMIS_UNIT_OF_MEASURE,
  DEFAULT_BACKOFF_BASE_MS,
  DEFAULT_END,
  DEFAULT_MAX_DAYS_PER_REQUEST,
  DEFAULT_MAX_RETRIES,
  DEFAULT_START,
  DEFAULT_TIMEOUT_MS,
  MAX_BACKOFF_MS,
} from "./constants";
import { addDays, daysInclusive, isIsoDate, splitDays } from "./dates";
import { coverageOf, normalizeCimis } from "./normalize";
import { redactText, redactUrl } from "./redact";
import { NO_KEY_MESSAGE, type CimisResult } from "./types";

export type FetchLike = (input: string, init?: { signal?: AbortSignal; headers?: Record<string, string> }) => Promise<Response>;

export type CimisClientOptions = {
  /** Defaults to process.env.CIMIS_APP_KEY. Never logged, never in errors, never saved. */
  appKey?: string | null;
  fetchImpl?: FetchLike;
  timeoutMs?: number;
  maxRetries?: number;
  backoffBaseMs?: number;
  maxDaysPerRequest?: number;
  sleep?: (ms: number) => Promise<void>;
  start?: string;
  end?: string;
};

export type CimisFetchErrorKind = "timeout" | "network" | "http" | "parse" | "volume";

/** Messages are already redacted when thrown. */
export class CimisFetchError extends Error {
  constructor(
    public kind: CimisFetchErrorKind,
    message: string,
    public status?: number,
    public retryAfter?: string | null,
  ) {
    super(message);
    this.name = "CimisFetchError";
  }
}

/** Request URL. Contains the key: pass through redactUrl before storing or showing. */
export function buildCimisUrl(appKey: string, start: string, end: string): string {
  const q = new URLSearchParams({
    appKey,
    targets: String(CIMIS_STATION),
    startDate: start,
    endDate: end,
    dataItems: CIMIS_DATA_ITEM,
    unitOfMeasure: CIMIS_UNIT_OF_MEASURE,
  });
  return `${CIMIS_BASE_URL}?${q.toString()}`;
}

export function resolveKey(opts: { appKey?: string | null } = {}): string | null {
  const k = (opts.appKey !== undefined ? opts.appKey : process.env.CIMIS_APP_KEY) ?? "";
  const t = k.trim();
  return t === "" ? null : t;
}

const defaultSleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

function retryDelay(attempt: number, base: number, retryAfter: string | null): number {
  const ra = retryAfter ? Number(retryAfter) : NaN;
  return Math.min(Number.isFinite(ra) ? ra * 1000 : base * 2 ** attempt, MAX_BACKOFF_MS);
}

async function attemptOnce(url: string, key: string, fetchImpl: FetchLike, timeoutMs: number): Promise<unknown> {
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
      res = await fetchImpl(url, { signal: ctrl.signal, headers: { Accept: "application/json" } });
      text = await res.text();
    } catch (e) {
      if (timedOut) throw new CimisFetchError("timeout", `CIMIS request timed out after ${timeoutMs} ms`);
      throw new CimisFetchError("network", redactText(`Network error contacting CIMIS: ${e instanceof Error ? e.message : String(e)}`, key));
    }
    if (!res.ok) {
      const detail = redactText(text.slice(0, 300).replace(/\s+/g, " "), key);
      const volume = /ERR2112/.test(text);
      throw new CimisFetchError(
        volume ? "volume" : "http",
        `CIMIS returned HTTP ${res.status}${res.statusText ? " " + res.statusText : ""}: ${detail}`,
        res.status,
        res.headers?.get?.("retry-after") ?? null,
      );
    }
    try {
      return JSON.parse(text);
    } catch {
      // Observed live: an empty/malformed key can get an HTTP 200 text/html "Request Rejected" page from a gateway.
      const head = redactText(text.slice(0, 120).replace(/\s+/g, " "), key);
      throw new CimisFetchError("parse", `CIMIS returned HTTP ${res.status} but the body is not JSON (first bytes: ${head})`);
    }
  } finally {
    clearTimeout(timer);
  }
}

const isRetryable = (e: CimisFetchError) => e.kind === "network" || (e.kind === "http" && (e.status === 429 || (e.status ?? 0) >= 500));

export async function fetchCimisUrl(url: string, key: string, opts: CimisClientOptions = {}): Promise<unknown> {
  const fetchImpl = opts.fetchImpl ?? (globalThis.fetch as FetchLike);
  const timeoutMs = opts.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const maxRetries = opts.maxRetries ?? DEFAULT_MAX_RETRIES;
  const base = opts.backoffBaseMs ?? DEFAULT_BACKOFF_BASE_MS;
  const sleep = opts.sleep ?? defaultSleep;
  for (let attempt = 0; ; attempt++) {
    try {
      return await attemptOnce(url, key, fetchImpl, timeoutMs);
    } catch (e) {
      if (!(e instanceof CimisFetchError)) throw new CimisFetchError("network", redactText(e instanceof Error ? e.message : String(e), key));
      if (!isRetryable(e) || attempt >= maxRetries) {
        if (attempt > 0) e.message += ` (after ${attempt + 1} attempts)`;
        throw e;
      }
      await sleep(retryDelay(attempt, base, e.retryAfter ?? null));
    }
  }
}

export type CimisRawFetch = {
  responses: unknown[];
  /** Redacted */
  sourceUrls: string[];
  failed: { start: string; end: string; message: string }[];
  fetchedAt: string;
};

/** Fetch one range; on ERR2112 (data volume) split in half, down to single days. */
async function fetchRange(key: string, start: string, end: string, opts: CimisClientOptions, out: CimisRawFetch): Promise<void> {
  const url = buildCimisUrl(key, start, end);
  try {
    const body = await fetchCimisUrl(url, key, opts);
    out.responses.push(body);
    out.sourceUrls.push(redactUrl(url));
  } catch (e) {
    const n = daysInclusive(start, end);
    if (e instanceof CimisFetchError && e.kind === "volume" && n > 1) {
      const mid = addDays(start, Math.floor(n / 2) - 1);
      await fetchRange(key, start, mid, opts, out);
      await fetchRange(key, addDays(mid, 1), end, opts, out);
      return;
    }
    out.failed.push({ start, end, message: redactText(e instanceof Error ? e.message : String(e), key) });
  }
}

/** Fetch the whole range sequentially in date order. Requires a key (callers check first). */
export async function fetchCimisRaw(key: string, start: string, end: string, opts: CimisClientOptions = {}): Promise<CimisRawFetch> {
  const out: CimisRawFetch = { responses: [], sourceUrls: [], failed: [], fetchedAt: new Date().toISOString() };
  for (const c of splitDays(start, end, opts.maxDaysPerRequest ?? DEFAULT_MAX_DAYS_PER_REQUEST)) {
    await fetchRange(key, c.start, c.end, opts, out);
  }
  out.fetchedAt = new Date().toISOString();
  return out;
}

function empty(start: string, end: string): Pick<CimisResult, "station" | "requested" | "coverage" | "unit" | "fetchedAt" | "sourceUrls" | "origin" | "days" | "flags"> {
  return { station: CIMIS_STATION, requested: { start, end }, coverage: null, unit: null, fetchedAt: null, sourceUrls: [], origin: null, days: [], flags: null };
}

export type CimisLiveFetch = { result: CimisResult; raw: CimisRawFetch | null };

/** Live fetch + normalize. With no key: returns status "no-key" and performs NO network call. */
export async function fetchCimis(opts: CimisClientOptions = {}): Promise<CimisLiveFetch> {
  const start = opts.start ?? DEFAULT_START;
  const end = opts.end ?? DEFAULT_END;
  if (!isIsoDate(start) || !isIsoDate(end) || start > end) {
    return { raw: null, result: { ...empty(start, end), status: "error", message: `Invalid date range ${start}..${end}` } };
  }
  const key = resolveKey(opts);
  if (!key) {
    return { raw: null, result: { ...empty(start, end), status: "no-key", message: NO_KEY_MESSAGE, nextStep: NO_KEY_MESSAGE } };
  }
  const raw = await fetchCimisRaw(key, start, end, opts);
  if (raw.responses.length === 0) {
    return {
      raw,
      result: { ...empty(start, end), status: "error", sourceUrls: raw.sourceUrls, failedRanges: raw.failed, message: raw.failed[0]?.message ?? "No CIMIS response received." },
    };
  }
  const norm = normalizeCimis(raw.responses);
  if (!norm.ok) {
    return { raw, result: { ...empty(start, end), status: "error", fetchedAt: raw.fetchedAt, sourceUrls: raw.sourceUrls, message: norm.message } };
  }
  const result: CimisResult = {
    status: raw.failed.length ? "partial" : "ok",
    station: CIMIS_STATION,
    requested: { start, end },
    coverage: coverageOf(norm.days),
    unit: norm.unit,
    fetchedAt: raw.fetchedAt,
    sourceUrls: raw.sourceUrls,
    origin: "live",
    days: norm.days,
    flags: norm.flags,
    ...(raw.failed.length ? { failedRanges: raw.failed, message: `${raw.failed.length} request(s) failed; the series has gaps.` } : {}),
  };
  return { raw, result };
}
