// Hand-built fixtures for tests ONLY. Never import this file from app code.
import { enumerateDays, toCompact } from "../power/dates";
import type { PowerRawResponse } from "../power/rawTypes";
import { EXTRA_FIELDS } from "./constants";
import type { PowerExtraDay } from "./types";

export const REAL_EXTRA_UNITS = {
  GWETROOT: "1",
  GWETTOP: "1",
  GWETPROF: "1",
  T2MDEW: "C",
  TS: "C",
  EVLAND: "mm/day",
  PS: "kPa",
  FROST_DAYS: "Days",
} as const;

const DEFAULTS: Record<keyof typeof REAL_EXTRA_UNITS, number> = { GWETROOT: 0.5, GWETTOP: 0.4, GWETPROF: 0.6, T2MDEW: 5, TS: 15, EVLAND: 1, PS: 100, FROST_DAYS: 0 };

export function makeExtraRaw(opts: {
  start: string;
  end: string;
  /** value for (parameter, ISO date); return undefined to use the default */
  value?: (param: keyof typeof REAL_EXTRA_UNITS, date: string) => number | null | undefined;
  omit?: string[];
  fill?: number;
  units?: Partial<Record<keyof typeof REAL_EXTRA_UNITS, string>>;
  dropParameter?: keyof typeof REAL_EXTRA_UNITS;
}): PowerRawResponse {
  const parameter: Record<string, Record<string, number | null>> = {};
  for (const p of Object.keys(REAL_EXTRA_UNITS) as (keyof typeof REAL_EXTRA_UNITS)[]) {
    if (p === opts.dropParameter) continue;
    parameter[p] = {};
    for (const d of enumerateDays(opts.start, opts.end)) {
      if (opts.omit?.includes(d)) continue;
      const v = opts.value?.(p, d);
      parameter[p][toCompact(d)] = v === undefined ? DEFAULTS[p] : v;
    }
  }
  const parameters: Record<string, { units: string; longname: string }> = {};
  for (const [p, u] of Object.entries(REAL_EXTRA_UNITS)) parameters[p] = { units: opts.units?.[p as keyof typeof REAL_EXTRA_UNITS] ?? u, longname: p };
  return {
    type: "Feature",
    geometry: { type: "Point", coordinates: [-121.66, 37.93, 105.1] },
    properties: { parameter },
    header: { title: "NASA/POWER Source Native Resolution Daily Data", fill_value: opts.fill ?? -999, start: toCompact(opts.start), end: toCompact(opts.end) },
    messages: [],
    parameters,
  };
}

/** One calendar year of PowerExtraDay records built directly (skips normalization). */
export function yearDays(year: number, make: (date: string, index: number) => Partial<Omit<PowerExtraDay, "date">> = () => ({})): PowerExtraDay[] {
  return enumerateDays(`${year}-01-01`, `${year}-12-31`).map((date, i) => {
    const rec = { date } as PowerExtraDay;
    for (const f of EXTRA_FIELDS) rec[f] = f === "soilRootWetness" ? 0.5 : f === "frostFlag" ? 0 : 1;
    return Object.assign(rec, make(date, i));
  });
}

export function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
}
