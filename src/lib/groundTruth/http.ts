export type FetchLike = (url: string, init?: { signal?: AbortSignal; headers?: Record<string, string> }) => Promise<{
  ok: boolean;
  status: number;
  text(): Promise<string>;
}>;

export const USER_AGENT = "field-rewind";

export type HttpOptions = {
  fetchImpl?: FetchLike;
  timeoutMs?: number;
  maxRetries?: number;
  sleep?: (ms: number) => Promise<void>;
};

export class HttpError extends Error {
  constructor(message: string, readonly status: number | null, readonly body: string) {
    super(message);
    this.name = "HttpError";
  }
}

const defaultSleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

/**
 * GET text with a timeout and retries on network errors, 429 and 5xx. 4xx is returned to the caller as HttpError
 * (status set) without retrying. Throws HttpError when it gives up.
 */
export async function getText(url: string, opts: HttpOptions = {}): Promise<string> {
  const fetchImpl: FetchLike = opts.fetchImpl ?? ((u, init) => fetch(u, init));
  const timeoutMs = opts.timeoutMs ?? 60_000;
  const maxRetries = opts.maxRetries ?? 2;
  const sleep = opts.sleep ?? defaultSleep;
  let last: HttpError | null = null;
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    const ctl = new AbortController();
    const timer = setTimeout(() => ctl.abort(), timeoutMs);
    try {
      const res = await fetchImpl(url, { signal: ctl.signal, headers: { "User-Agent": USER_AGENT } });
      const body = await res.text();
      if (res.ok) return body;
      last = new HttpError(`HTTP ${res.status}`, res.status, body.slice(0, 500));
      if (res.status !== 429 && res.status < 500) throw last;
    } catch (e) {
      if (e instanceof HttpError && e.status !== null && e.status !== 429 && e.status < 500) throw e;
      if (e instanceof HttpError) last = e;
      else if ((e as Error)?.name === "AbortError") throw new HttpError(`timed out after ${timeoutMs / 1000} s`, null, "");
      else last = new HttpError(`network error: ${(e as Error)?.message ?? String(e)}`, null, "");
    } finally {
      clearTimeout(timer);
    }
    if (attempt < maxRetries) await sleep(Math.min(500 * 2 ** attempt, 5000));
  }
  throw last ?? new HttpError("request failed", null, "");
}

/** Run `fn` over items with at most `limit` in flight; results keep input order. */
export async function mapLimit<T, R>(items: readonly T[], limit: number, fn: (item: T, index: number) => Promise<R>): Promise<R[]> {
  const out = new Array<R>(items.length);
  let next = 0;
  const workers = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (true) {
      const i = next++;
      if (i >= items.length) return;
      out[i] = await fn(items[i] as T, i);
    }
  });
  await Promise.all(workers);
  return out;
}
