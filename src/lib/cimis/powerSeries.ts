import { et0FromDailyRecord } from "../et0/fao56";
import type { PowerResult } from "../types";
import type { SeriesPoint } from "./compare";

export type PowerEt0Series =
  | { ok: true; series: SeriesPoint[]; lat: number; elevationM: number; fetchedAt: string; origin: PowerResult["origin"] }
  | { ok: false; message: string };

/**
 * Daily FAO-56 ET0 (the app's own method, src/lib/et0/fao56.ts) from a normalized POWER result, for dates in
 * [start, end]. Days with any missing POWER input are null (never filled).
 */
export function powerEt0Series(power: PowerResult, start: string, end: string): PowerEt0Series {
  if (power.status === "error" || power.status === "no-coverage") return { ok: false, message: power.message ?? `POWER data status is ${power.status}.` };
  if (power.elevationM === null) return { ok: false, message: "POWER did not report a grid-cell elevation, which FAO-56 needs." };
  const series: SeriesPoint[] = [];
  for (const rec of power.days) {
    if (rec.date < start || rec.date > end) continue;
    series.push({ date: rec.date, value: et0FromDailyRecord(rec, power.lat, power.elevationM) });
  }
  return { ok: true, series, lat: power.lat, elevationM: power.elevationM, fetchedAt: power.fetchedAt, origin: power.origin };
}
