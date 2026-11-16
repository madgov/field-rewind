import { fetchPowerUrl, type ClientOptions } from "../power/client";
import { DEFAULT_CHUNK_YEARS, POWER_BASE_URL, POWER_COMMUNITY } from "../power/constants";
import { splitDateRange, toCompact } from "../power/dates";
import type { PowerRawResponse } from "../power/rawTypes";
import { POWER_EXTRA_PARAMETERS } from "./constants";

export function buildPowerExtraUrl(lat: number, lon: number, start: string, end: string): string {
  const q = new URLSearchParams({
    parameters: POWER_EXTRA_PARAMETERS.join(","),
    community: POWER_COMMUNITY,
    longitude: String(lon),
    latitude: String(lat),
    start: toCompact(start),
    end: toCompact(end),
    format: "JSON",
  });
  return `${POWER_BASE_URL}?${q.toString().replaceAll("%2C", ",")}`;
}

export type PowerExtraRawFetch = { responses: PowerRawResponse[]; sourceUrls: string[]; fetchedAt: string };

/** Fetch the whole range for one point (timeout 45 s, up to 2 retries on network/429/5xx; see src/lib/power/client.ts). */
export async function fetchPowerExtraRaw(lat: number, lon: number, start: string, end: string, opts: ClientOptions = {}): Promise<PowerExtraRawFetch> {
  const chunks = splitDateRange(start, end, opts.chunkYears ?? DEFAULT_CHUNK_YEARS);
  const sourceUrls: string[] = [];
  const responses: PowerRawResponse[] = [];
  for (const c of chunks) {
    const url = buildPowerExtraUrl(lat, lon, c.start, c.end);
    sourceUrls.push(url);
    responses.push(await fetchPowerUrl(url, opts));
  }
  return { responses, sourceUrls, fetchedAt: new Date().toISOString() };
}
