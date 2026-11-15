import fs from "node:fs/promises";
import path from "node:path";
import { loadSavedDemoPin } from "../power";
import { compareSeries, type Comparison, type SeriesPoint } from "./compare";
import { BRENTWOOD_PIN_ID, CIMIS_STATION, DEFAULT_END, DEFAULT_START } from "./constants";
import { coverageOf, normalizeCimis } from "./normalize";
import { powerEt0Series } from "./powerSeries";
import { redactUrl } from "./redact";
import { NO_SAVED_NEXT_STEP, type CimisResult, type CimisSavedFile } from "./types";

export type { CimisDay, CimisResult, CimisStatus, CimisFlagCounts, CimisSavedFile } from "./types";
export type { Comparison, AnnualRow, BinCell, SeriesPoint } from "./compare";
export { compareSeries, summarize } from "./compare";
export { powerEt0Series } from "./powerSeries";
export { normalizeCimis, MISSING_FLAGS } from "./normalize";
export { fetchCimis, fetchCimisRaw, buildCimisUrl, CimisFetchError } from "./client";
export { redactUrl, redactText } from "./redact";
export { NO_KEY_MESSAGE, NO_SAVED_NEXT_STEP } from "./types";

function blank(): Omit<CimisResult, "status"> {
  return { station: CIMIS_STATION, requested: { start: DEFAULT_START, end: DEFAULT_END }, coverage: null, unit: null, fetchedAt: null, sourceUrls: [], origin: null, days: [], flags: null };
}

/** Server-side only. Reads data/cimis/station47.json through the same normalizer as live data. Never fabricates. */
export async function loadSavedCimis(file?: string): Promise<CimisResult> {
  let text: string;
  try {
    // An explicit `file` is only used by tests; the default path is statically scoped to data/cimis so tracing stays small.
    text = file ? await fs.readFile(/*turbopackIgnore: true*/ file, "utf8") : await fs.readFile(path.join(process.cwd(), "data", "cimis", "station47.json"), "utf8");
  } catch {
    return { ...blank(), status: "no-saved-data", message: "No saved CIMIS response exists (data/cimis/station47.json).", nextStep: NO_SAVED_NEXT_STEP };
  }
  let saved: CimisSavedFile;
  try {
    saved = JSON.parse(text) as CimisSavedFile;
  } catch {
    return { ...blank(), status: "error", message: "data/cimis/station47.json is not valid JSON." };
  }
  if (!Array.isArray(saved.responses) || typeof saved.fetchedAt !== "string") {
    return { ...blank(), status: "error", message: "data/cimis/station47.json does not have the expected shape (fetchedAt, responses)." };
  }
  const norm = normalizeCimis(saved.responses);
  if (!norm.ok) return { ...blank(), status: "error", fetchedAt: saved.fetchedAt, message: norm.message };
  const cov = coverageOf(norm.days);
  return {
    status: "ok",
    station: CIMIS_STATION,
    requested: { start: norm.days[0].date, end: norm.days[norm.days.length - 1].date },
    coverage: cov,
    unit: norm.unit,
    fetchedAt: saved.fetchedAt,
    sourceUrls: (saved.sourceUrls ?? []).map(redactUrl),
    origin: "saved",
    savedLabel: `saved response from ${saved.fetchedAt.slice(0, 10)}`,
    days: norm.days,
    flags: norm.flags,
  };
}

export type CimisComparisonResult =
  | { status: "ok"; comparison: Comparison; savedLabel: string; fetchedAt: string; unit: string; flags: NonNullable<CimisResult["flags"]>; powerFetchedAt: string }
  | { status: "no-saved-data" | "error" | "no-key" | "partial"; message: string; nextStep?: string };

/** Station 47 (saved response) vs POWER-derived FAO-56 ET0 for the Brentwood pin, same dates. Server-side only. */
export async function loadCimisComparison(file?: string): Promise<CimisComparisonResult> {
  const cimis = await loadSavedCimis(file);
  if (cimis.status !== "ok" || !cimis.coverage || !cimis.flags || !cimis.unit || !cimis.fetchedAt || !cimis.savedLabel) {
    return { status: cimis.status === "ok" ? "error" : cimis.status, message: cimis.message ?? "CIMIS data unavailable.", nextStep: cimis.nextStep };
  }
  const power = await loadSavedDemoPin(BRENTWOOD_PIN_ID);
  const ps = powerEt0Series(power, DEFAULT_START, DEFAULT_END);
  if (!ps.ok) return { status: "error", message: ps.message };
  const station: SeriesPoint[] = cimis.days.map((d) => ({ date: d.date, value: d.etoMm }));
  const comparison = compareSeries(station, ps.series);
  return { status: "ok", comparison, savedLabel: cimis.savedLabel, fetchedAt: cimis.fetchedAt, unit: cimis.unit, flags: cimis.flags, powerFetchedAt: ps.fetchedAt };
}
