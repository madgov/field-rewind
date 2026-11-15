import { CIMIS_STATION } from "./constants";
import { isIsoDate } from "./dates";
import type { CimisDay, CimisFlagCounts } from "./types";

/**
 * QC flag handling for day-asce-eto.
 *
 * SOURCE CAVEAT: the live CIMIS Web API documentation (https://et.water.ca.gov/Rest/Index, text dated 2014) shows
 * the Qc field but does NOT define the letters. The only evidence from that page is by example: records with
 * qc="N" and qc="S" have an empty value, records with qc="R" or "H" carry a value. The letter meanings below follow
 * the CIMIS data-quality documentation as recalled by the author and could not be re-fetched (cimis.water.ca.gov
 * serves a JavaScript shell only). They must be confirmed against the first real response; the per-flag counts are
 * reported so that is easy to do.
 *
 *   MISSING_FLAGS  M missing, N no data, Q missing, S sensor/station problem -> value forced to null
 *   everything else (blank, R "far out of normal range", H, I, Y, P, ...)   -> value kept, flag carried
 */
export const MISSING_FLAGS: ReadonlySet<string> = new Set(["M", "N", "Q", "S"]);

/** Units that mean millimetres. Anything else makes normalization fail (no silent conversion). */
const MM_UNIT = /^\(?\s*mm\s*\)?$/i;

export type NormalizeOk = { ok: true; days: CimisDay[]; unit: string; flags: CimisFlagCounts };
export type NormalizeFail = { ok: false; message: string };

type RawCell = { Value?: unknown; Qc?: unknown; Unit?: unknown };
type RawRecord = { Date?: unknown; Station?: unknown; Scope?: unknown; DayAsceEto?: RawCell | null };

function parseValue(v: unknown): number | null {
  if (typeof v === "number") return Number.isFinite(v) ? v : null;
  if (typeof v !== "string") return null;
  const s = v.trim();
  if (s === "") return null;
  const n = Number(s);
  return Number.isFinite(n) ? n : null;
}

function flagOf(qc: unknown): string | null {
  if (typeof qc !== "string") return null;
  const t = qc.trim();
  return t === "" ? null : t;
}

/** Normalize raw CIMIS response bodies (the parsed JSON, one per request) into one date-sorted daily series. */
export function normalizeCimis(responses: unknown[]): NormalizeOk | NormalizeFail {
  const byDate = new Map<string, CimisDay>();
  const counts: CimisFlagCounts = { byFlag: {}, nulledByFlag: {}, totalRecords: 0, usable: 0, duplicateDates: 0, otherStation: 0 };
  let unit: string | null = null;

  for (const [i, body] of responses.entries()) {
    const providers = (body as { Data?: { Providers?: unknown } } | null)?.Data?.Providers;
    if (!Array.isArray(providers)) return { ok: false, message: `Response ${i + 1} has no Data.Providers array; the CIMIS response structure is not what was documented.` };
    for (const p of providers) {
      const records = (p as { Records?: unknown }).Records;
      if (!Array.isArray(records)) continue;
      for (const r of records as RawRecord[]) {
        if (r.Scope !== undefined && r.Scope !== "daily") continue;
        const cell = r.DayAsceEto;
        if (!cell || typeof cell !== "object") continue;
        if (typeof r.Date !== "string" || !isIsoDate(r.Date)) return { ok: false, message: `Record with invalid Date ${JSON.stringify(r.Date)}.` };
        if (r.Station !== undefined && Number(r.Station) !== CIMIS_STATION) {
          counts.otherStation++;
          continue;
        }
        if (typeof cell.Unit === "string" && cell.Unit.trim() !== "") {
          if (!MM_UNIT.test(cell.Unit)) {
            return { ok: false, message: `CIMIS reported ETo unit ${JSON.stringify(cell.Unit)}, expected millimetres "(mm)". Not converting silently; stopped.` };
          }
          unit ??= cell.Unit;
        }
        const flag = flagOf(cell.Qc);
        const key = flag ?? "(none)";
        let value = parseValue(cell.Value);
        if (flag !== null && MISSING_FLAGS.has(flag.toUpperCase())) value = null;
        if (value !== null && value < 0) value = null; // negative ETo is not physical
        counts.totalRecords++;
        counts.byFlag[key] = (counts.byFlag[key] ?? 0) + 1;
        if (value === null) counts.nulledByFlag[key] = (counts.nulledByFlag[key] ?? 0) + 1;
        else counts.usable++;
        if (byDate.has(r.Date)) counts.duplicateDates++;
        byDate.set(r.Date, { date: r.Date, etoMm: value, qc: flag });
      }
    }
  }
  if (counts.totalRecords === 0) return { ok: false, message: "No daily ASCE ETo records found in the CIMIS response." };
  if (unit === null) return { ok: false, message: "CIMIS gave no unit string for ETo, so millimetres cannot be verified. Stopped." };
  const days = [...byDate.values()].sort((a, b) => (a.date < b.date ? -1 : 1));
  return { ok: true, days, unit, flags: counts };
}

export function coverageOf(days: CimisDay[]): { start: string; end: string } | null {
  const have = days.filter((d) => d.etoMm !== null);
  return have.length ? { start: have[0].date, end: have[have.length - 1].date } : null;
}
