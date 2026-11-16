import { BACKOFF_BASE_MS, MAX_BACKOFF_MS, MAX_RETRIES, USER_AGENT } from "./constants";

export type FetchLike = (
  input: string,
  init?: { method?: string; body?: string; signal?: AbortSignal; headers?: Record<string, string> },
) => Promise<Response>;

export type HttpOptions = {
  fetchImpl?: FetchLike;
  sleep?: (ms: number) => Promise<void>;
  maxRetries?: number;
  backoffBaseMs?: number;
};

export class NdviHttpError extends Error {
  constructor(
    public kind: "timeout" | "network" | "http" | "parse",
    message: string,
    public status?: number,
  ) {
    super(message);
    this.name = "NdviHttpError";
  }
}

export const defaultSleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

export function backoffMs(attempt: number, base = BACKOFF_BASE_MS): number {
  return Math.min(base * 2 ** attempt, MAX_BACKOFF_MS);
}

const retryable = (e: unknown) => e instanceof NdviHttpError && (e.kind === "network" || e.kind === "timeout" || (e.kind === "http" && (e.status === 429 || (e.status ?? 0) >= 500)));

/** Run `fn` with bounded retries and exponential backoff on retryable errors (network, timeout, 429, 5xx). */
export async function withRetries<T>(fn: (attempt: number) => Promise<T>, opts: HttpOptions = {}): Promise<T> {
  const max = opts.maxRetries ?? MAX_RETRIES;
  const sleep = opts.sleep ?? defaultSleep;
  let last: unknown;
  for (let attempt = 0; attempt <= max; attempt++) {
    try {
      return await fn(attempt);
    } catch (e) {
      last = e;
      if (attempt === max || !retryable(e)) throw e;
      await sleep(backoffMs(attempt, opts.backoffBaseMs));
    }
  }
  throw last;
}

/** One JSON request with an explicit timeout. Throws NdviHttpError. */
export async function requestJson<T>(
  url: string,
  init: { method?: string; body?: unknown; timeoutMs: number },
  opts: HttpOptions = {},
): Promise<T> {
  const f: FetchLike = opts.fetchImpl ?? ((u, i) => fetch(u, i));
  const ctl = new AbortController();
  const timer = setTimeout(() => ctl.abort(), init.timeoutMs);
  try {
    let res: Response;
    try {
      res = await f(url, {
        method: init.method ?? "GET",
        body: init.body === undefined ? undefined : JSON.stringify(init.body),
        signal: ctl.signal,
        headers: { "user-agent": USER_AGENT, accept: "application/json", ...(init.body === undefined ? {} : { "content-type": "application/json" }) },
      });
    } catch (e) {
      if (ctl.signal.aborted) throw new NdviHttpError("timeout", `No answer from ${new URL(url).host} within ${Math.round(init.timeoutMs / 1000)} s.`);
      throw new NdviHttpError("network", `Could not reach ${new URL(url).host}: ${e instanceof Error ? e.message : String(e)}`);
    }
    if (!res.ok) throw new NdviHttpError("http", `${new URL(url).host} answered HTTP ${res.status}.`, res.status);
    try {
      return (await res.json()) as T;
    } catch {
      throw new NdviHttpError("parse", `${new URL(url).host} returned a response that is not JSON.`);
    }
  } finally {
    clearTimeout(timer);
  }
}
