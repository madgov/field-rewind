import { PROVISIONAL_DAYS } from "./constants";
import type { OpenEtCoverage, OpenEtMonth } from "./types";

export class OpenEtShapeError extends Error {
  constructor(
    public kind: "shape" | "units",
    message: string,
  ) {
    super(message);
    this.name = "OpenEtShapeError";
  }
}

export type NormalizedSeries = { series: OpenEtMonth[]; unitsReported: string | null };

const DATE_KEYS = ["time", "date", "Date", "Time"];
const UNIT_KEYS = ["units", "unit"];

function toMonth(v: unknown): string | null {
  if (typeof v !== "string") return null;
  const m = /^(\d{4})-(\d{2})(?:-\d{2})?(?:T.*)?$/.exec(v.trim());
  if (!m || Number(m[2]) < 1 || Number(m[2]) > 12) return null;
  return `${m[1]}-${m[2]}`;
}

function toNumber(v: unknown): number | null {
  if (v === null || v === undefined || v === "") return null;
  const n = typeof v === "number" ? v : Number(v);
  return Number.isFinite(n) ? n : null;
}

/** Month list "YYYY-MM" from start to end inclusive of the two ISO dates. */
export function monthsInRange(start: string, end: string): string[] {
  const s = toMonth(start);
  const e = toMonth(end);
  if (!s || !e) return [];
  const out: string[] = [];
  let y = Number(s.slice(0, 4));
  let m = Number(s.slice(5, 7));
  const ey = Number(e.slice(0, 4));
  const em = Number(e.slice(5, 7));
  while (y < ey || (y === ey && m <= em)) {
    out.push(`${y}-${String(m).padStart(2, "0")}`);
    m++;
    if (m > 12) {
      m = 1;
      y++;
    }
  }
  return out;
}

const isMm = (u: string) => /^mm(\/month|\/mo)?$/i.test(u.trim());

/**
 * Turn a raw OpenET monthly point response into {month, etMm}[].
 *
 * The public docs do not publish a response schema, so only the shape OpenET is known to return for
 * JSON point queries is accepted: an array of objects, each with a date ("time" or "date") and a
 * numeric value under the variable name ("et"). Anything else raises OpenEtShapeError rather than
 * guessing. If the response states units they must be mm; the series is never silently converted.
 */
export function normalizeOpenEt(raw: unknown, variable = "et"): NormalizedSeries {
  let rows: unknown = raw;
  if (rows && typeof rows === "object" && !Array.isArray(rows)) {
    const o = rows as Record<string, unknown>;
    const inner = o.data ?? o.results ?? o.result;
    if (Array.isArray(inner)) rows = inner;
  }
  if (!Array.isArray(rows)) throw new OpenEtShapeError("shape", "OpenET response is not a list of monthly records.");
  const key = variable.toLowerCase();
  const byMonth = new Map<string, number | null>();
  let unitsReported: string | null = null;
  for (const r of rows) {
    if (!r || typeof r !== "object") throw new OpenEtShapeError("shape", "OpenET response contains a non-object record.");
    const rec = r as Record<string, unknown>;
    const dk = DATE_KEYS.find((k) => k in rec);
    const vk = Object.keys(rec).find((k) => k.toLowerCase() === key);
    const month = dk ? toMonth(rec[dk]) : null;
    if (!month || !vk) throw new OpenEtShapeError("shape", `OpenET record lacks a date and a "${key}" value (keys: ${Object.keys(rec).join(", ")}).`);
    for (const uk of UNIT_KEYS) {
      if (typeof rec[uk] === "string") {
        const u = rec[uk] as string;
        if (unitsReported !== null && unitsReported !== u) throw new OpenEtShapeError("units", `OpenET reported mixed units: "${unitsReported}" and "${u}".`);
        unitsReported = u;
      }
    }
    if (byMonth.has(month)) throw new OpenEtShapeError("shape", `OpenET response has duplicate month ${month}.`);
    byMonth.set(month, toNumber(rec[vk]));
  }
  if (unitsReported !== null && !isMm(unitsReported)) {
    throw new OpenEtShapeError("units", `OpenET reported units "${unitsReported}", expected mm. Not converting.`);
  }
  const series = [...byMonth.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([month, etMm]) => ({ month, etMm }));
  return { series, unitsReported };
}

/** Fill the requested range so missing months appear explicitly as null, and describe coverage. */
export function describeCoverage(series: OpenEtMonth[], start: string, end: string, fetchedAt: string): { series: OpenEtMonth[]; coverage: OpenEtCoverage } {
  const have = new Map(series.map((s) => [s.month, s.etMm]));
  const requested = monthsInRange(start, end);
  const filled = requested.map((month) => ({ month, etMm: have.get(month) ?? null }));
  const withValues = filled.filter((f) => f.etMm !== null);
  const fetchedMs = Date.parse(fetchedAt);
  const cutoff = fetchedMs - PROVISIONAL_DAYS * 86_400_000;
  const provisionalMonths = withValues
    .filter((f) => {
      const y = Number(f.month.slice(0, 4));
      const m = Number(f.month.slice(5, 7));
      return Date.UTC(y, m, 0) >= cutoff; // last day of the month
    })
    .map((f) => f.month);
  return {
    series: filled,
    coverage: {
      requestedMonths: requested.length,
      withData: withValues.length,
      missingMonths: filled.filter((f) => f.etMm === null).map((f) => f.month),
      firstMonth: withValues[0]?.month ?? null,
      lastMonth: withValues[withValues.length - 1]?.month ?? null,
      provisionalMonths,
    },
  };
}
