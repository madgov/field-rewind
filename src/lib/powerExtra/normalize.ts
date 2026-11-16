import { DEFAULT_END, DEFAULT_FILL_VALUE, DEFAULT_START } from "../power/constants";
import { enumerateDays, fromCompact } from "../power/dates";
import { gridCell } from "../power/grid";
import type { PowerRawResponse } from "../power/rawTypes";
import { EXTRA_EXPECTED_UNITS, EXTRA_FIELDS, EXTRA_FIELD_BY_PARAMETER, EXTRA_FIELD_LABEL, POWER_EXTRA_PARAMETERS } from "./constants";
import type { ExtraField, PowerExtraDay, PowerExtraResult } from "./types";

export type NormalizeExtraInput = {
  lat: number;
  lon: number;
  responses: PowerRawResponse[];
  fetchedAt: string;
  sourceUrls: string[];
  origin: PowerExtraResult["origin"];
  start?: string;
  end?: string;
  note?: string;
};

const n = (v: number) => v.toLocaleString("en-US");
const blankUnits = (): Record<ExtraField, string> => Object.fromEntries(EXTRA_FIELDS.map((f) => [f, ""])) as Record<ExtraField, string>;
const zeroMissing = (totalDays: number): PowerExtraResult["missing"] => ({
  ...(Object.fromEntries(EXTRA_FIELDS.map((f) => [f, 0])) as Record<ExtraField, number>),
  anyField: 0,
  totalDays,
});

export function errorExtraResult(args: {
  lat: number;
  lon: number;
  message: string;
  start?: string;
  end?: string;
  fetchedAt?: string;
  sourceUrls?: string[];
  origin?: PowerExtraResult["origin"];
  coordsValid?: boolean;
}): PowerExtraResult {
  return {
    status: "error",
    lat: args.lat,
    lon: args.lon,
    gridCell: args.coordsValid === false ? { key: "invalid", latCenter: NaN, lonCenter: NaN } : gridCell(args.lat, args.lon),
    units: blankUnits(),
    requested: { start: args.start ?? DEFAULT_START, end: args.end ?? DEFAULT_END },
    coverage: null,
    missing: zeroMissing(0),
    fetchedAt: args.fetchedAt ?? new Date().toISOString(),
    sourceUrls: args.sourceUrls ?? [],
    origin: args.origin ?? "live",
    days: [],
    message: args.message,
  };
}

function mergeExtra(responses: PowerRawResponse[]): Record<string, Map<string, number | null>> {
  const out: Record<string, Map<string, number | null>> = {};
  for (const p of POWER_EXTRA_PARAMETERS) out[p] = new Map();
  for (const r of responses) {
    const fill = typeof r.header?.fill_value === "number" ? r.header.fill_value : DEFAULT_FILL_VALUE;
    const param = r.properties?.parameter ?? {};
    for (const p of POWER_EXTRA_PARAMETERS) {
      for (const [d, v] of Object.entries(param[p] ?? {})) {
        out[p].set(fromCompact(d), typeof v === "number" && Number.isFinite(v) && v !== fill ? v : null);
      }
    }
  }
  return out;
}

/** Raw POWER response(s) -> PowerExtraResult. Same code for live, cached and saved data. Never throws. */
export function normalizePowerExtra(input: NormalizeExtraInput): PowerExtraResult {
  const start = input.start ?? DEFAULT_START;
  const end = input.end ?? DEFAULT_END;
  const base = { lat: input.lat, lon: input.lon, start, end, fetchedAt: input.fetchedAt, sourceUrls: input.sourceUrls, origin: input.origin };
  const { responses } = input;
  if (!Array.isArray(responses) || responses.length === 0) return errorExtraResult({ ...base, message: "No NASA POWER response data to normalize." });

  const reported: Partial<Record<ExtraField, string>> = {};
  for (const [i, r] of responses.entries()) {
    const param = r?.properties?.parameter;
    if (!r || typeof r !== "object" || !param || typeof param !== "object") {
      return errorExtraResult({ ...base, message: `Unparseable NASA POWER response (chunk ${i + 1}): missing properties.parameter.` });
    }
    for (const p of POWER_EXTRA_PARAMETERS) {
      if (!param[p] || typeof param[p] !== "object") {
        return errorExtraResult({ ...base, message: `Unparseable NASA POWER response (chunk ${i + 1}): parameter ${p} is missing.` });
      }
      const u = r.parameters?.[p]?.units;
      if (typeof u !== "string") {
        return errorExtraResult({ ...base, message: `NASA POWER response (chunk ${i + 1}) does not report units for ${p}; refusing to guess.` });
      }
      const field = EXTRA_FIELD_BY_PARAMETER[p];
      if (u !== EXTRA_EXPECTED_UNITS[field]) {
        return errorExtraResult({ ...base, message: `Unit mismatch for ${p}: POWER reports "${u}" but "${EXTRA_EXPECTED_UNITS[field]}" is expected. Not converting silently.` });
      }
      reported[field] = u;
    }
  }

  const merged = mergeExtra(responses);
  const dates = enumerateDays(start, end);
  const missing = zeroMissing(dates.length);
  let first: string | null = null;
  let last: string | null = null;
  let anyValueCells = 0;

  const days: PowerExtraDay[] = dates.map((date) => {
    const rec = { date } as PowerExtraDay;
    let hasValue = false;
    let hasMissing = false;
    for (const p of POWER_EXTRA_PARAMETERS) {
      const field = EXTRA_FIELD_BY_PARAMETER[p];
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

  const common = {
    lat: input.lat,
    lon: input.lon,
    gridCell: gridCell(input.lat, input.lon),
    units: reported as Record<ExtraField, string>,
    requested: { start, end },
    coverage: first && last ? { start: first, end: last } : null,
    missing,
    fetchedAt: input.fetchedAt,
    sourceUrls: input.sourceUrls,
    origin: input.origin,
    days,
  };
  const totalMissingCells = EXTRA_FIELDS.reduce((s, f) => s + missing[f], 0);
  const perField = EXTRA_FIELDS.filter((f) => missing[f] > 0)
    .map((f) => `${EXTRA_FIELD_LABEL[f]}: ${n(missing[f])} ${missing[f] === 1 ? "day" : "days"} missing`)
    .join("; ");
  const notes = input.note ? ` ${input.note}` : "";

  if (anyValueCells === 0) {
    return { status: "no-coverage", ...common, message: `NASA POWER returned no valid values for any soil, frost or surface field between ${start} and ${end}.${notes}` };
  }
  if (totalMissingCells > 0) {
    return {
      status: "partial",
      ...common,
      message: `${n(missing.anyField)} of ${n(dates.length)} days have at least one missing value, and missing values are never filled in. By measure: ${perField}.${notes}`,
    };
  }
  return { status: "ok", ...common, ...(input.note ? { message: input.note } : {}) };
}
