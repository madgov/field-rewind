/**
 * USDA NASS Cropland Data Layer (CDL) point check through the NASS CropScape web service (George Mason University host).
 * GET https://nassgeodata.gmu.edu/axis2/services/CDLService/GetCDLValue?year=<y>&x=<EPSG:5070 x>&y=<EPSG:5070 y>
 * Used only to confirm what is growing at a sample point; not part of the live result. Server-side only.
 */
import proj4 from "proj4";
import type { LandUseCheck } from "./types";

/** NAD83 / Conus Albers, EPSG:5070 (EPSG registry definition). */
export const EPSG_5070 = "+proj=aea +lat_0=23 +lon_0=-96 +lat_1=29.5 +lat_2=45.5 +x_0=0 +y_0=0 +datum=NAD83 +units=m +no_defs";

export function toAlbers5070(lat: number, lon: number): { x: number; y: number } {
  const [x, y] = proj4("EPSG:4326", EPSG_5070, [lon, lat]);
  return { x, y };
}

export function cdlUrl(year: number, lat: number, lon: number): string {
  const { x, y } = toAlbers5070(lat, lon);
  return `https://nassgeodata.gmu.edu/axis2/services/CDLService/GetCDLValue?year=${year}&x=${x.toFixed(1)}&y=${y.toFixed(1)}`;
}

/** Parse the service's XML body: <Result>"category: 75, value: 'Almonds'..." (format checked against a real response). */
export function parseCdlBody(body: string): { value: string; category: string | null } | null {
  const m = /<Result>([\s\S]*?)<\/Result>/.exec(body);
  if (!m) return null;
  const text = m[1].replace(/&apos;|&#39;/g, "'").replace(/&quot;/g, '"').trim();
  const cat = /category:\s*"?([^",]+)"?/.exec(text) ?? /category:\s*'?([^',]+)'?/.exec(text);
  const val = /value:\s*["']?([^"',]+)["']?/.exec(text);
  return val ? { value: val[1].trim(), category: cat ? cat[1].trim() : null } : { value: text, category: null };
}

export async function fetchCdlValue(lat: number, lon: number, year = 2023, fetchImpl: typeof fetch = fetch): Promise<LandUseCheck & { rawBody: string }> {
  const url = cdlUrl(year, lat, lon);
  const res = await fetchImpl(url, { headers: { "user-agent": "field-rewind" }, signal: AbortSignal.timeout(60_000) });
  const body = await res.text();
  if (!res.ok) throw new Error(`NASS CropScape answered HTTP ${res.status}.`);
  const parsed = parseCdlBody(body);
  if (!parsed) throw new Error(`NASS CropScape reply could not be read: ${body.slice(0, 200)}`);
  return { source: "USDA NASS Cropland Data Layer (CropScape point query)", year, url, value: parsed.value, category: parsed.category, fetchedAt: new Date().toISOString(), rawBody: body };
}
