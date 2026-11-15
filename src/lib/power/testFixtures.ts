// Hand-built fixtures shaped like the real NASA POWER daily point response (test use only).
import { enumerateDays, toCompact } from "./dates";
import type { PowerRawResponse } from "./rawTypes";

export const REAL_UNITS = {
  T2M_MAX: "C",
  T2M_MIN: "C",
  RH2M: "%",
  WS2M: "m/s",
  ALLSKY_SFC_SW_DWN: "MJ/m^2/day",
  PRECTOTCORR: "mm/day",
} as const;

export function makeRaw(opts: {
  start: string;
  end: string;
  /** dates (ISO) to leave out of every parameter */
  omit?: string[];
  /** per "PARAM|ISO date" override value */
  set?: Record<string, number | null>;
  fill?: number;
  units?: Partial<Record<keyof typeof REAL_UNITS, string>>;
  elevation?: number;
  lon?: number;
  lat?: number;
}): PowerRawResponse {
  const parameter: Record<string, Record<string, number | null>> = {};
  for (const p of Object.keys(REAL_UNITS)) {
    parameter[p] = {};
    enumerateDays(opts.start, opts.end).forEach((d, i) => {
      if (opts.omit?.includes(d)) return;
      const key = `${p}|${d}`;
      parameter[p][toCompact(d)] = key in (opts.set ?? {}) ? opts.set![key] : Number((10 + i * 0.5).toFixed(2));
    });
  }
  const parameters: Record<string, { units: string; longname: string }> = {};
  for (const [p, u] of Object.entries(REAL_UNITS)) {
    parameters[p] = { units: (opts.units as Record<string, string> | undefined)?.[p] ?? u, longname: p };
  }
  return {
    type: "Feature",
    geometry: { type: "Point", coordinates: [opts.lon ?? -121.66, opts.lat ?? 37.93, opts.elevation ?? 105.1] },
    properties: { parameter },
    header: { title: "NASA/POWER Source Native Resolution Daily Data", fill_value: opts.fill ?? -999, start: toCompact(opts.start), end: toCompact(opts.end) },
    messages: [],
    parameters,
  };
}

/** Fake fetch returning a JSON body. */
export function jsonResponse(body: unknown, status = 200): Response {
  return new Response(typeof body === "string" ? body : JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
}
