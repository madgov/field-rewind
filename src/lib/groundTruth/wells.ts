import { haversineKm } from "./gauge";
import type { WellFact, WellReading } from "./types";

type Feature = { id?: string; geometry?: { coordinates?: [number, number] } | null; properties?: Record<string, unknown> };

export type WellSite = { id: string; name: string | null; lat: number; lon: number; distanceKm: number };

export function parseSites(json: string, lat: number, lon: number): WellSite[] {
  const fc = JSON.parse(json) as { features?: Feature[] };
  const out: WellSite[] = [];
  for (const f of fc.features ?? []) {
    const c = f.geometry?.coordinates;
    const id = (f.properties?.id as string | undefined) ?? f.id;
    if (!c || !id) continue;
    out.push({ id, name: (f.properties?.monitoring_location_name as string | undefined) ?? null, lat: c[1], lon: c[0], distanceKm: haversineKm(lat, lon, c[1], c[0]) });
  }
  return out.sort((a, b) => a.distanceKm - b.distanceKm);
}

/** Parse field-measurement rows (parameter 72019). Rows with a non-numeric value or no date are dropped. Newest first. */
export function parseReadings(json: string): (WellReading & { siteId: string; lat: number | null; lon: number | null })[] {
  const fc = JSON.parse(json) as { features?: Feature[] };
  const out: (WellReading & { siteId: string; lat: number | null; lon: number | null })[] = [];
  for (const f of fc.features ?? []) {
    const p = f.properties ?? {};
    const value = Number(p.value);
    const time = typeof p.time === "string" ? p.time : null;
    if (!time || p.value === null || p.value === "" || !Number.isFinite(value)) continue;
    const q = p.qualifier;
    out.push({
      date: time.slice(0, 10),
      value,
      unit: typeof p.unit_of_measure === "string" ? p.unit_of_measure : "unknown unit",
      qualifier: Array.isArray(q) ? q.join(", ") || null : null,
      approval: typeof p.approval_status === "string" ? p.approval_status : null,
      siteId: String(p.monitoring_location_id ?? ""),
      lat: f.geometry?.coordinates ? f.geometry.coordinates[1] : null,
      lon: f.geometry?.coordinates ? f.geometry.coordinates[0] : null,
    });
  }
  return out.sort((a, b) => (a.date < b.date ? 1 : -1));
}

/**
 * From rows (any wells) pick the nearest well that has at least one reading on or after `since` (or any reading if
 * `since` is null). `sites` supplies coordinates and names; rows' own coordinates are used as a fallback.
 */
export function nearestWellWithReadings(
  rows: ReturnType<typeof parseReadings>,
  sites: readonly WellSite[],
  lat: number,
  lon: number,
  since: string | null,
  maxReadings = 5,
): WellFact | null {
  const bySite = new Map<string, typeof rows>();
  for (const r of rows) {
    if (!r.siteId) continue;
    if (since && r.date < since) continue;
    bySite.set(r.siteId, [...(bySite.get(r.siteId) ?? []), r]);
  }
  let best: { id: string; d: number; name: string | null; rs: typeof rows } | null = null;
  for (const [id, rs] of bySite) {
    const s = sites.find((x) => x.id === id);
    const first = rs[0] as (typeof rows)[number];
    const d = s ? s.distanceKm : first.lat !== null && first.lon !== null ? haversineKm(lat, lon, first.lat, first.lon) : null;
    if (d === null) continue;
    if (!best || d < best.d) best = { id, d, name: s?.name ?? null, rs };
  }
  if (!best) return null;
  // Readings for the fact are all of that well's rows we hold (not filtered by `since`), newest first.
  const all = rows.filter((r) => r.siteId === best.id).slice(0, maxReadings);
  return {
    id: best.id,
    name: best.name,
    distanceKm: best.d,
    readings: all.map(({ date, value, unit, qualifier, approval }) => ({ date, value, unit, qualifier, approval })),
    readingsReturned: rows.filter((r) => r.siteId === best.id).length,
  };
}
