import type { DailyRecord, PowerField, PowerResult } from "../types";
import { DEFAULT_END, DEFAULT_FILL_VALUE, DEFAULT_START, EXPECTED_UNITS, FIELD_BY_PARAMETER, POWER_FIELDS, POWER_PARAMETERS } from "./constants";
import { enumerateDays, fromCompact } from "./dates";
import { gridCell, type GridCell } from "./grid";
import type { PowerRawResponse } from "./rawTypes";

export type NormalizeInput = {
  lat: number;
  lon: number;
  responses: PowerRawResponse[];
  fetchedAt: string;
  sourceUrls: string[];
  origin: PowerResult["origin"];
  start?: string;
  end?: string;
  /** Optional note appended to the message (e.g. cell-sharing approximation). */
  note?: string;
};

const blankUnits = (): Record<PowerField, string> => ({ tMaxC: "", tMinC: "", rhPct: "", wind2mMs: "", solarMJm2: "", precipMm: "" });
const zeroMissing = (totalDays: number): PowerResult["missing"] => ({
  tMaxC: 0, tMinC: 0, rhPct: 0, wind2mMs: 0, solarMJm2: 0, precipMm: 0, anyField: 0, totalDays,
});

/** Result with status "error": days [], coverage null. */
export function errorResult(args: {
  lat: number;
  lon: number;
  message: string;
  start?: string;
  end?: string;
  fetchedAt?: string;
  sourceUrls?: string[];
  origin?: PowerResult["origin"];
  coordsValid?: boolean;
}): PowerResult {
  const start = args.start ?? DEFAULT_START;
  const end = args.end ?? DEFAULT_END;
  const cell: GridCell = args.coordsValid === false
    ? { key: "invalid", latCenter: NaN, lonCenter: NaN }
    : gridCell(args.lat, args.lon);
  return {
    status: "error",
    lat: args.lat,
    lon: args.lon,
    gridCell: cell,
    elevationM: null,
    units: blankUnits(),
    requested: { start, end },
    coverage: null,
    missing: zeroMissing(0),
    fetchedAt: args.fetchedAt ?? new Date().toISOString(),
    sourceUrls: args.sourceUrls ?? [],
    origin: args.origin ?? "live",
    days: [],
    message: args.message,
  };
}

/** Merge the date->value maps of several (chunked) responses, parameter by parameter. */
export function mergeParameters(responses: PowerRawResponse[]): Record<string, Map<string, number | null>> {
  const out: Record<string, Map<string, number | null>> = {};
  for (const p of POWER_PARAMETERS) out[p] = new Map();
  for (const r of responses) {
    const fill = typeof r.header?.fill_value === "number" ? r.header.fill_value : DEFAULT_FILL_VALUE;
    const param = r.properties?.parameter ?? {};
    for (const p of POWER_PARAMETERS) {
      for (const [d, v] of Object.entries(param[p] ?? {})) {
        out[p].set(fromCompact(d), typeof v === "number" && Number.isFinite(v) && v !== fill ? v : null);
      }
    }
  }
  return out;
}

/**
 * Turn raw POWER response(s) into a PowerResult. Used for live, cached and saved data alike.
 * Never throws; any structural problem becomes an "error" result.
 */
export function normalizePower(input: NormalizeInput): PowerResult {
  const start = input.start ?? DEFAULT_START;
  const end = input.end ?? DEFAULT_END;
  const base = { lat: input.lat, lon: input.lon, start, end, fetchedAt: input.fetchedAt, sourceUrls: input.sourceUrls, origin: input.origin };
  const { responses } = input;
  if (!Array.isArray(responses) || responses.length === 0) return errorResult({ ...base, message: "No NASA POWER response data to normalize." });

  // structure + units checks
  const reported: Partial<Record<PowerField, string>> = {};
  for (const [i, r] of responses.entries()) {
    const param = r?.properties?.parameter;
    if (!r || typeof r !== "object" || !param || typeof param !== "object") {
      return errorResult({ ...base, message: `Unparseable NASA POWER response (chunk ${i + 1}): missing properties.parameter.` });
    }
    for (const p of POWER_PARAMETERS) {
      if (!param[p] || typeof param[p] !== "object") {
        return errorResult({ ...base, message: `Unparseable NASA POWER response (chunk ${i + 1}): parameter ${p} is missing.` });
      }
      const u = r.parameters?.[p]?.units;
      if (typeof u !== "string") {
        return errorResult({ ...base, message: `NASA POWER response (chunk ${i + 1}) does not report units for ${p}; refusing to guess.` });
      }
      const field = FIELD_BY_PARAMETER[p];
      if (u !== EXPECTED_UNITS[field]) {
        return errorResult({ ...base, message: `Unit mismatch for ${p}: POWER reports "${u}" but "${EXPECTED_UNITS[field]}" is expected. Not converting silently.` });
      }
      reported[field] = u;
    }
  }
  const units = reported as Record<PowerField, string>;

  const coord = responses[0].geometry?.coordinates;
  const elev = Array.isArray(coord) && typeof coord[2] === "number" && Number.isFinite(coord[2]) ? coord[2] : null;

  const merged = mergeParameters(responses);
  const dates = enumerateDays(start, end);
  const missing = zeroMissing(dates.length);
  let first: string | null = null;
  let last: string | null = null;
  let anyValueCells = 0;

  const days: DailyRecord[] = dates.map((date) => {
    const rec = { date } as DailyRecord;
    let hasValue = false;
    let hasMissing = false;
    for (const p of POWER_PARAMETERS) {
      const field = FIELD_BY_PARAMETER[p];
      const v = merged[p].get(date) ?? null;
      rec[field] = v;
      if (v === null) {
        missing[field]++;
        hasMissing = true;
      } else {
        hasValue = true;
        anyValueCells++;
      }
    }
    if (hasMissing) missing.anyField++;
    if (hasValue) {
      first ??= date;
      last = date;
    }
    return rec;
  });

  const totalMissingCells = POWER_FIELDS.reduce((n, f) => n + missing[f], 0);
  const cell = gridCell(input.lat, input.lon);
  const common = {
    lat: input.lat,
    lon: input.lon,
    gridCell: cell,
    elevationM: elev,
    units,
    requested: { start, end },
    coverage: first && last ? { start: first, end: last } : null,
    missing,
    fetchedAt: input.fetchedAt,
    sourceUrls: input.sourceUrls,
    origin: input.origin,
    days,
  };
  const perField = POWER_FIELDS.filter((f) => missing[f] > 0).map((f) => `${f} ${missing[f]}`).join(", ");
  const notes = input.note ? ` ${input.note}` : "";

  if (anyValueCells === 0) {
    return { status: "no-coverage", ...common, message: `NASA POWER returned no valid values for any field between ${start} and ${end}.${notes}` };
  }
  if (totalMissingCells > 0) {
    return {
      status: "partial",
      ...common,
      message: `${missing.anyField} of ${dates.length} days have at least one missing value. Missing days by field: ${perField}.${notes}`,
    };
  }
  return { status: "ok", ...common, ...(input.note ? { message: input.note } : {}) };
}
