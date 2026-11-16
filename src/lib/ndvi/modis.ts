/**
 * ORNL DAAC MODIS web service, MOD13Q1 250 m NDVI. OFFLINE PRECOMPUTE ONLY (latency is erratic: seconds to minutes per
 * request), never a user-facing live path. Used by scripts/fetch-ndvi.ts --modis.
 */
import fs from "node:fs";
import { requestJson, withRetries } from "./http";
import { MODIS_SOURCE } from "./sources";

const BASE = "https://modis.ornl.gov/rst/api/v1/MOD13Q1";
export const MODIS_SCALE = 0.0001;
export const MODIS_FILL = -3000;
export const MODIS_VALID = { min: -2000, max: 10000 };
const BATCH = 10;
const TIMEOUT_MS = 600_000;

export type ModisObservation = { date: string; ndvi: number };
export type ModisSavedFile = {
  pinId: string;
  lat: number;
  lon: number;
  fetchedAt: string;
  product: string;
  units: string;
  label: string;
  sources: (typeof MODIS_SOURCE)[];
  period: { start: string; end: string };
  /** Reliability rank 0 (good data) only; every other composite is dropped and counted. */
  counts: { composites: number; kept: number; droppedFillOrInvalid: number; droppedReliability: number };
  observations: ModisObservation[];
};

type Subset = { subset?: { modis_date: string; calendar_date: string; data: number[] }[] };
type Dates = { dates?: { modis_date: string; calendar_date: string }[] };

/** Convert a raw MODIS value to NDVI, or null for fill / out of range. */
export function modisNdvi(raw: number): number | null {
  if (raw === MODIS_FILL || raw < MODIS_VALID.min || raw > MODIS_VALID.max) return null;
  return Math.round(raw * MODIS_SCALE * 1000) / 1000;
}

export async function fetchModis(pin: { id: string; lat: number; lon: number }, o: { outFile: string; log: (m: string) => void; start?: string; end?: string }): Promise<void> {
  const start = o.start ?? "2000-01-01";
  const end = o.end ?? "2025-12-31";
  const opt = { maxRetries: 2, backoffBaseMs: 5000 };
  const q = `latitude=${pin.lat}&longitude=${pin.lon}`;
  const dates = (await withRetries(() => requestJson<Dates>(`${BASE}/dates?${q}`, { timeoutMs: 120_000 }, opt), opt)).dates ?? [];
  const wanted = dates.filter((d) => d.calendar_date >= start && d.calendar_date <= end);
  if (!wanted.length) throw new Error("MODIS service returned no composite dates for the period.");
  const grab = async (band: string, batch: typeof wanted) => {
    const url = `${BASE}/subset?${q}&band=${band}&startDate=${batch[0].modis_date}&endDate=${batch[batch.length - 1].modis_date}&kmAboveBelow=0&kmLeftRight=0`;
    const r = await withRetries(() => requestJson<Subset>(url, { timeoutMs: TIMEOUT_MS }, opt), opt);
    return new Map((r.subset ?? []).map((s) => [s.calendar_date, s.data[0]]));
  };
  const ndvi = new Map<string, number>();
  const rel = new Map<string, number>();
  for (let i = 0; i < wanted.length; i += BATCH) {
    const batch = wanted.slice(i, i + BATCH);
    for (const [m, band] of [[ndvi, "250m_16_days_NDVI"], [rel, "250m_16_days_pixel_reliability"]] as const) {
      for (const [k, v] of await grab(band, batch)) m.set(k, v);
    }
    if ((i / BATCH) % 10 === 0) o.log(`MODIS ${batch[0].calendar_date}: ${ndvi.size} of ${wanted.length} composites read`);
  }
  const observations: ModisObservation[] = [];
  let invalid = 0;
  let unreliable = 0;
  for (const d of wanted) {
    const raw = ndvi.get(d.calendar_date);
    const v = raw === undefined ? null : modisNdvi(raw);
    if (v === null) {
      invalid++;
      continue;
    }
    if (rel.get(d.calendar_date) !== 0) {
      unreliable++;
      continue;
    }
    observations.push({ date: d.calendar_date, ndvi: v });
  }
  const file: ModisSavedFile = {
    pinId: pin.id, lat: pin.lat, lon: pin.lon, fetchedAt: new Date().toISOString(), product: "MOD13Q1 v6.1 250m_16_days_NDVI",
    units: "NDVI (unitless, -1..1)",
    label: "Coarser, longer record: MODIS 250 m NDVI, 16-day composites. One 250 m pixel (about 6 hectares), so it mixes everything inside it. Not a field boundary.",
    sources: [MODIS_SOURCE], period: { start, end },
    counts: { composites: wanted.length, kept: observations.length, droppedFillOrInvalid: invalid, droppedReliability: unreliable }, observations,
  };
  fs.writeFileSync(o.outFile, JSON.stringify(file));
  o.log(`MODIS saved ${observations.length} of ${wanted.length} composites`);
}
