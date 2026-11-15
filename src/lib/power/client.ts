import {
  DEFAULT_BACKOFF_BASE_MS,
  DEFAULT_CHUNK_YEARS,
  DEFAULT_MAX_RETRIES,
  DEFAULT_TIMEOUT_MS,
  MAX_BACKOFF_MS,
  POWER_BASE_URL,
  POWER_COMMUNITY,
  POWER_PARAMETERS,
} from "./constants";
import { splitDateRange, toCompact } from "./dates";
import type { PowerRawResponse } from "./rawTypes";

export type FetchLike = (input: string, init?: { signal?: AbortSignal; headers?: Record<string, string> }) => Promise<Response>;

export type ClientOptions = {
  fetchImpl?: FetchLike;
  timeoutMs?: number;
  maxRetries?: number;
  backoffBaseMs?: number;
  chunkYears?: number;
  sleep?: (ms: number) => Promise<void>;
};

export type PowerFetchErrorKind = "timeout" | "network" | "http" | "parse";

export class PowerFetchError extends Error {
  constructor(
    public kind: PowerFetchErrorKind,
    message: string,
    public status?: number,
    public retryAfter?: string | null,
  ) {
    super(message);
    this.name = "PowerFetchError";
  }
}

export function buildPowerUrl(lat: number, lon: number, start: string, end: string): string {
  const q = new URLSearchParams({
    parameters: POWER_PARAMETERS.join(","),
    community: POWER_COMMUNITY,
    longitude: String(lon),
    latitude: String(lat),
    start: toCompact(start),
    end: toCompact(end),
    format: "JSON",
  });
  // keep commas readable in the recorded source URL
  return `${POWER_BASE_URL}?${q.toString().replaceAll("%2C", ",")}`;
}

const defaultSleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

function retryDelay(attempt: number, base: number, retryAfter: string | null): number {
  const ra = retryAfter ? Number(retryAfter) : NaN;
  const ms = Number.isFinite(ra) ? ra * 1000 : base * 2 ** attempt;
  return Math.min(ms, MAX_BACKOFF_MS);
}

/** One attempt: returns parsed JSON or throws PowerFetchError. */
async function attemptOnce(url: string, fetchImpl: FetchLike, timeoutMs: number): Promise<PowerRawResponse> {
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
      if (timedOut) throw new PowerFetchError("timeout", `NASA POWER request timed out after ${timeoutMs} ms`);
      const cause = e instanceof Error ? e.message : String(e);
      throw new PowerFetchError("network", `Network error contacting NASA POWER: ${cause}`);
    }
    if (!res.ok) {
      const detail = text.slice(0, 300).replace(/\s+/g, " ");
      throw new PowerFetchError(
        "http",
        `NASA POWER returned HTTP ${res.status}${res.statusText ? " " + res.statusText : ""}: ${detail}`,
        res.status,
        res.headers?.get?.("retry-after") ?? null,
      );
    }
    try {
      return JSON.parse(text) as PowerRawResponse;
    } catch {
      throw new PowerFetchError("parse", `NASA POWER returned HTTP ${res.status} but the body is not valid JSON (first bytes: ${text.slice(0, 80)})`);
    }
  } finally {
    clearTimeout(timer);
  }
}

const isRetryable = (e: PowerFetchError) => e.kind === "network" || (e.kind === "http" && (e.status === 429 || (e.status ?? 0) >= 500));

/** Fetch one URL with timeout and bounded retry (network errors, 429, 5xx). Timeouts are not retried. */
export async function fetchPowerUrl(url: string, opts: ClientOptions = {}): Promise<PowerRawResponse> {
  const fetchImpl = opts.fetchImpl ?? (globalThis.fetch as FetchLike);
  const timeoutMs = opts.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const maxRetries = opts.maxRetries ?? DEFAULT_MAX_RETRIES;
  const base = opts.backoffBaseMs ?? DEFAULT_BACKOFF_BASE_MS;
  const sleep = opts.sleep ?? defaultSleep;
  for (let attempt = 0; ; attempt++) {
    try {
      return await attemptOnce(url, fetchImpl, timeoutMs);
    } catch (e) {
      if (!(e instanceof PowerFetchError)) throw e;
      if (!isRetryable(e) || attempt >= maxRetries) {
        if (attempt > 0) e.message += ` (after ${attempt + 1} attempts)`;
        throw e;
      }
      await sleep(retryDelay(attempt, base, e.retryAfter ?? null));
    }
  }
}

export type PowerRawFetch = { responses: PowerRawResponse[]; sourceUrls: string[]; fetchedAt: string };

/** Fetch the whole range for one point, chunked by years, sequentially, in date order. */
export async function fetchPowerRaw(lat: number, lon: number, start: string, end: string, opts: ClientOptions = {}): Promise<PowerRawFetch> {
  const chunks = splitDateRange(start, end, opts.chunkYears ?? DEFAULT_CHUNK_YEARS);
  const sourceUrls: string[] = [];
  const responses: PowerRawResponse[] = [];
  for (const c of chunks) {
    const url = buildPowerUrl(lat, lon, c.start, c.end);
    sourceUrls.push(url);
    responses.push(await fetchPowerUrl(url, opts));
  }
  return { responses, sourceUrls, fetchedAt: new Date().toISOString() };
}
