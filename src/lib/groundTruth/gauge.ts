import { pairStats, pearson } from "./stats";
import type { DaymetDay, GaugeProductStats, GaugeReport, GaugeStation } from "./types";
import type { DailyRecord } from "../types";

export const MM_PER_INCH = 25.4;
/** A day counts as "wet" at or above this many mm (used for the wet-day agreement counts). */
export const WET_DAY_MM = 1;

function tag(block: string, name: string): string | null {
  const m = new RegExp(`<${name}>([\\s\\S]*?)</${name}>`).exec(block);
  return m ? (m[1] as string).trim() : null;
}

export function haversineKm(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6371.0088;
  const rad = Math.PI / 180;
  const dLat = (lat2 - lat1) * rad;
  const dLon = (lon2 - lon1) * rad;
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(lat1 * rad) * Math.cos(lat2 * rad) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(a));
}

/** Parse the CoCoRaHS station export, with distances from the pin, nearest first. */
export function parseStations(xml: string, lat: number, lon: number): GaugeStation[] {
  const out: GaugeStation[] = [];
  for (const m of xml.matchAll(/<Station>([\s\S]*?)<\/Station>/g)) {
    const b = m[1] as string;
    const sLat = Number(tag(b, "Latitude"));
    const sLon = Number(tag(b, "Longitude"));
    const id = tag(b, "StationNumber");
    if (!id || !Number.isFinite(sLat) || !Number.isFinite(sLon) || (sLat === 0 && sLon === 0)) continue;
    out.push({ id, name: tag(b, "StationName") ?? id, lat: sLat, lon: sLon, status: tag(b, "StationStatus") ?? "unknown", distanceKm: haversineKm(lat, lon, sLat, sLon) });
  }
  return out.sort((a, b) => a.distanceKm - b.distanceKm);
}

/**
 * Parse daily reports. Amount is inches; "NA", empty or anything not a number becomes null (unreadable), NEVER zero.
 * A date reported twice keeps the later entry.
 */
export function parseReports(xml: string): GaugeReport[] {
  const byDate = new Map<string, { stamp: string; precipMm: number | null }>();
  for (const m of xml.matchAll(/<DailyPrecipReport>([\s\S]*?)<\/DailyPrecipReport>/g)) {
    const b = m[1] as string;
    const date = tag(b, "ObservationDate");
    if (!date || !/^\d{4}-\d{2}-\d{2}$/.test(date)) continue;
    const raw = tag(b, "TotalPrecipAmt");
    const inches = raw !== null && /^\d+(\.\d+)?$/.test(raw) ? Number(raw) : null;
    const stamp = tag(b, "DateTimeStamp") ?? "";
    const prev = byDate.get(date);
    if (!prev || stamp >= prev.stamp) byDate.set(date, { stamp, precipMm: inches === null ? null : inches * MM_PER_INCH });
  }
  return [...byDate.entries()].sort((a, b) => (a[0] < b[0] ? -1 : 1)).map(([date, v]) => ({ date, precipMm: v.precipMm }));
}

/** Gauge vs one product on days the gauge reported (readable amount) AND the product has a value. */
export function compareToGauge(reports: readonly GaugeReport[], product: ReadonlyMap<string, number | null>): GaugeProductStats | null {
  const g: number[] = [];
  const p: number[] = [];
  for (const r of reports) {
    if (r.precipMm === null) continue;
    const v = product.get(r.date);
    if (v === undefined || v === null) continue;
    g.push(r.precipMm);
    p.push(v);
  }
  if (!g.length) return null;
  const s = pairStats(g, p);
  const gt = g.reduce((a, b) => a + b, 0);
  const pt = p.reduce((a, b) => a + b, 0);
  const wet = { threshold: WET_DAY_MM, both: 0, gaugeOnly: 0, productOnly: 0, neither: 0 };
  g.forEach((gv, i) => {
    const gw = gv >= WET_DAY_MM;
    const pw = (p[i] as number) >= WET_DAY_MM;
    if (gw && pw) wet.both++;
    else if (gw) wet.gaugeOnly++;
    else if (pw) wet.productOnly++;
    else wet.neither++;
  });
  return { n: g.length, gaugeTotalMm: gt, productTotalMm: pt, biasMmPerDay: s.bias, ratio: gt > 0 ? pt / gt : null, r: pearson(g, p), r2: s.r2, wetDays: wet };
}

export function powerPrecipMap(days: readonly DailyRecord[]): Map<string, number | null> {
  return new Map(days.map((d) => [d.date, d.precipMm]));
}

export function daymetPrecipMap(days: readonly DaymetDay[]): Map<string, number | null> {
  return new Map(days.map((d) => [d.date, d.prcpMm]));
}

/** Number of calendar days from start to end inclusive (ISO dates). */
export function daysInclusive(start: string, end: string): number {
  return Math.round((Date.parse(end) - Date.parse(start)) / 86_400_000) + 1;
}
