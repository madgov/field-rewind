import { readFile } from "node:fs/promises";
import path from "node:path";
import { DEMO_PINS } from "../demoPins";
import { fetchOpenEtMonthly, type OpenEtOptions } from "./client";
import { NO_KEY_MESSAGE, OPENET_KEY_ENV, MONTHLY_START } from "./constants";
import { describeCoverage, normalizeOpenEt, OpenEtShapeError } from "./normalize";
import type { OpenEtRequestBody, OpenEtResult } from "./types";

export { compareMonthly } from "./compare";
export type { Comparison, MonthPair, CalendarMonthMean, ModelledMonth, ObservedMonth } from "./compare";
export { COMPARISON_CAVEAT, NO_KEY_MESSAGE } from "./constants";
export { fetchOpenEtMonthly, buildOpenEtBody } from "./client";
export { normalizeOpenEt } from "./normalize";
export type * from "./types";

export type SavedOpenEtFile = { pinId: string; lon: number; lat: number; fetchedAt: string; request: OpenEtRequestBody; /** Windows actually requested (one request each); absent in files saved before the 10-year limit was found. */ chunks?: [string, string][]; response: unknown };

export type SavedOpenEt =
  | { status: "no-saved-data"; pinId: string; nextStep: string }
  | { status: "saved-error"; pinId: string; message: string }
  | { status: "saved"; pinId: string; savedAt: string; label: string; result: OpenEtResult };

export const OPENET_DATA_DIR = path.join(process.cwd(), "data", "openet");

/** Load data/openet/<pinId>.json and run the raw body through the same normalizer as live data. */
export async function loadSavedOpenEt(pinId: string, dir = OPENET_DATA_DIR): Promise<SavedOpenEt> {
  const nextStep = `No saved OpenET response for "${pinId}". ${NO_KEY_MESSAGE}`;
  if (!/^[a-z0-9_-]+$/i.test(pinId)) return { status: "no-saved-data", pinId, nextStep };
  let text: string;
  try {
    text = await readFile(path.join(dir, `${pinId}.json`), "utf8");
  } catch {
    return { status: "no-saved-data", pinId, nextStep };
  }
  try {
    const f = JSON.parse(text) as SavedOpenEtFile;
    const norm = normalizeOpenEt(f.response, "et");
    const [start, end] = f.request.date_range;
    const { series, coverage } = describeCoverage(norm.series, start, end, f.fetchedAt);
    const date = f.fetchedAt.slice(0, 10);
    const result: OpenEtResult = {
      status: coverage.missingMonths.length ? "partial" : "ok",
      message: coverage.missingMonths.length ? `${coverage.missingMonths.length} of ${coverage.requestedMonths} requested months have no value.` : null,
      reason: null, httpStatus: 200, series, unitsReported: norm.unitsReported, unitsRequested: "mm",
      model: "Ensemble", variable: "ET", interval: "monthly", coverage, fetchedAt: f.fetchedAt,
      sourceUrl: "https://openet-api.org/raster/timeseries/point",
    };
    return { status: "saved", pinId, savedAt: f.fetchedAt, label: `saved response from ${date}`, result };
  } catch (e) {
    const message = e instanceof OpenEtShapeError || e instanceof Error ? e.message : "unreadable file";
    return { status: "saved-error", pinId, message: `Saved OpenET file for "${pinId}" could not be used: ${message}` };
  }
}

export type OpenEtMonthlyOutcome = { source: "saved"; saved: Extract<SavedOpenEt, { status: "saved" }> } | { source: "live"; result: OpenEtResult } | { source: "none"; result: OpenEtResult } | { source: "saved-missing"; saved: Exclude<SavedOpenEt, { status: "saved" }>; result: OpenEtResult };

/**
 * Server-side only. Demo pins use their saved response; otherwise a live request is made when
 * OPENET_API_KEY is set. Points outside OpenET coverage return no-coverage even without a key.
 */
export async function getOpenEtMonthly(lat: number, lon: number, opts: OpenEtOptions & { dir?: string } = {}): Promise<OpenEtMonthlyOutcome> {
  const apiKey = opts.apiKey === undefined ? process.env[OPENET_KEY_ENV] : opts.apiKey;
  const pin = DEMO_PINS.find((p) => Math.abs(p.lat - lat) < 1e-6 && Math.abs(p.lon - lon) < 1e-6);
  if (pin) {
    const saved = await loadSavedOpenEt(pin.id, opts.dir);
    if (saved.status === "saved") return { source: "saved", saved };
    const live = await fetchOpenEtMonthly(lat, lon, { ...opts, apiKey, start: MONTHLY_START });
    if (live.result.status === "no-key" || live.result.status === "no-coverage") return { source: "saved-missing", saved, result: live.result };
    return { source: "live", result: live.result };
  }
  const live = await fetchOpenEtMonthly(lat, lon, { ...opts, apiKey });
  return { source: live.result.status === "no-key" || live.result.status === "no-coverage" ? "none" : "live", result: live.result };
}
