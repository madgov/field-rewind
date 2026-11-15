import { gridCell } from "@/lib/power/grid";

export type Pin = { lat: number; lon: number };

/** Leaflet can report longitudes beyond +-180 when the world map repeats. Fold into -180..180. */
export function normalizeLon(lon: number): number {
  const wrapped = ((((lon + 180) % 360) + 360) % 360) - 180;
  return wrapped === -180 && lon > 0 ? 180 : wrapped;
}

export function clampLat(lat: number): number {
  return Math.max(-90, Math.min(90, lat));
}

export function normalizePin(lat: number, lon: number): Pin {
  return { lat: clampLat(lat), lon: normalizeLon(lon) };
}

/** Plain-English coordinate, e.g. "37.9300° N". */
export function formatLat(lat: number): string {
  return `${Math.abs(lat).toFixed(4)}° ${lat >= 0 ? "N" : "S"}`;
}
export function formatLon(lon: number): string {
  return `${Math.abs(lon).toFixed(4)}° ${lon >= 0 ? "E" : "W"}`;
}

export function formatSigned(n: number): string {
  return n.toFixed(4);
}

/**
 * Centre of the 0.5-degree climate grid cell containing the pin.
 * Uses the same pure function as the server's cache key (src/lib/power/grid.ts, no node: imports),
 * so what the map shows and which saved/cached data is used can never disagree.
 */
export function gridCellCenter(pin: Pin): Pin {
  const { latCenter, lonCenter } = gridCell(pin.lat, pin.lon);
  return { lat: latCenter, lon: lonCenter };
}

export function samePin(a: Pin | null, b: Pin | null): boolean {
  if (!a || !b) return a === b;
  return Math.abs(a.lat - b.lat) < 1e-9 && Math.abs(a.lon - b.lon) < 1e-9;
}
