/**
 * Place search through OpenStreetMap Nominatim, called from the server only. No fallback results: a failure is reported as it is.
 * Usage policy: https://operations.osmfoundation.org/policies/nominatim/ (identifying User-Agent, light use).
 */
import type { GeocodeResponse, GeocodeResult } from "./types";

export const NOMINATIM_BASE = "https://nominatim.openstreetmap.org";
export const NOMINATIM_SOURCE = "OpenStreetMap Nominatim";
export const USER_AGENT = "FieldRewind/0.1 (hackathon project)";
export const GEOCODE_TIMEOUT_MS = 8000;

export function validateQuery(q: unknown): { ok: true; q: string } | { ok: false; message: string } {
  if (typeof q !== "string") return { ok: false, message: "Type a place name to search for." };
  const t = q.trim();
  if (t.length < 2) return { ok: false, message: "Type at least 2 characters of the place name." };
  if (t.length > 120) return { ok: false, message: "The place name is too long (120 characters at most)." };
  return { ok: true, q: t };
}

export function nominatimUrl(q: string): string {
  return `${NOMINATIM_BASE}/search?format=jsonv2&limit=5&q=${encodeURIComponent(q)}`;
}

/** Maps Nominatim jsonv2 rows to results. Rows without a name or valid coordinates are dropped, never repaired. */
export function mapNominatim(json: unknown): GeocodeResult[] | null {
  if (!Array.isArray(json)) return null;
  const out: GeocodeResult[] = [];
  for (const row of json) {
    if (typeof row !== "object" || row === null) continue;
    const r = row as { display_name?: unknown; lat?: unknown; lon?: unknown };
    const lat = Number(r.lat);
    const lon = Number(r.lon);
    if (typeof r.display_name !== "string" || typeof r.lat !== "string" || typeof r.lon !== "string") continue;
    if (!Number.isFinite(lat) || !Number.isFinite(lon) || Math.abs(lat) > 90 || Math.abs(lon) > 180) continue;
    out.push({ name: r.display_name, lat, lon });
  }
  return out;
}

/** The real network call. */
export async function searchPlaces(q: string, fetchImpl: typeof fetch = fetch): Promise<GeocodeResponse> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), GEOCODE_TIMEOUT_MS);
  try {
    const res = await fetchImpl(nominatimUrl(q), { headers: { "User-Agent": USER_AGENT, "Accept-Language": "en" }, signal: ctrl.signal });
    if (!res.ok) return { status: "error", message: `OpenStreetMap place search returned HTTP ${res.status}.` };
    const results = mapNominatim(await res.json());
    if (!results) return { status: "error", message: "OpenStreetMap place search returned an unexpected answer." };
    return { status: "ok", results, source: NOMINATIM_SOURCE, sourceUrl: NOMINATIM_BASE, fetchedAt: new Date().toISOString() };
  } catch (e) {
    if (ctrl.signal.aborted) return { status: "error", message: `OpenStreetMap place search did not answer within ${GEOCODE_TIMEOUT_MS / 1000} seconds.` };
    return { status: "error", message: `OpenStreetMap place search could not be reached (${e instanceof Error ? e.message : "network error"}).` };
  } finally {
    clearTimeout(timer);
  }
}
