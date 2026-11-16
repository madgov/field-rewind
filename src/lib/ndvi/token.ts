import { TOKEN_REFRESH_MARGIN_MS, TOKEN_TIMEOUT_MS, TOKEN_URL } from "./constants";
import { requestJson, withRetries, type HttpOptions } from "./http";

type TokenResponse = { token?: string; "msft:expiry"?: string };

export type TokenOptions = HttpOptions & {
  /** Injected clock for tests (ms since epoch). */
  now?: () => number;
  marginMs?: number;
  url?: string;
};

/**
 * Anonymous read token for the Landsat blobs (Microsoft Planetary Computer SAS endpoint, no account).
 * Cached until `expiry - margin`, refreshed on demand; concurrent callers share one refresh.
 * The token is never logged or returned to the browser.
 */
export class TokenManager {
  private cur: { token: string; expiresAt: number } | null = null;
  private pending: Promise<string> | null = null;
  fetchCount = 0;
  constructor(private opts: TokenOptions = {}) {}

  private now() {
    return (this.opts.now ?? Date.now)();
  }

  /** A token that is valid for at least `margin` more milliseconds. */
  async get(): Promise<string> {
    const margin = this.opts.marginMs ?? TOKEN_REFRESH_MARGIN_MS;
    if (this.cur && this.now() < this.cur.expiresAt - margin) return this.cur.token;
    this.pending ??= this.refresh().finally(() => {
      this.pending = null;
    });
    return this.pending;
  }

  /** Drop the cached token (call after a 403 from the blob store). */
  invalidate(): void {
    this.cur = null;
  }

  private async refresh(): Promise<string> {
    this.fetchCount++;
    const body = await withRetries(() => requestJson<TokenResponse>(this.opts.url ?? TOKEN_URL, { timeoutMs: TOKEN_TIMEOUT_MS }, this.opts), this.opts);
    if (!body.token) throw new Error("The Planetary Computer token response had no token.");
    const exp = body["msft:expiry"] ? Date.parse(body["msft:expiry"]) : NaN;
    // If the expiry is missing or unreadable, assume the documented short lifetime (1 hour) rather than caching forever.
    const expiresAt = Number.isFinite(exp) ? exp : this.now() + 60 * 60_000;
    this.cur = { token: body.token, expiresAt };
    return body.token;
  }
}
