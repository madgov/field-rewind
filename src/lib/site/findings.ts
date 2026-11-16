/**
 * What this app's own saved data says at the three demo places, for the satellite-vs-ground page.
 * Server-only (reads the committed saved files, no network). Every sentence comes from the app's existing wording functions,
 * which build text only from computed numbers; every block carries the layer's own "Saved response from [date]" label.
 */
import { DEMO_PINS } from "../demoPins";
import { GROUND_TRUTH_LABEL, cropHistoryWording, groundCheckWording, loadSavedGroundTruth } from "../groundTruth";
import { NDVI_CAVEAT, computeNdviIndicators, loadSavedNdvi, ndviOriginLine, ndviWording } from "../ndvi";

export type PinRain = {
  pinId: string;
  name: string;
  status: "ok" | "none";
  /** Why there is nothing to compare (outside coverage, no file, ...). */
  message: string | null;
  /** The saved-response labels for Daymet and the gauge. */
  labels: string[];
  annual: { powerMm: number; daymetMm: number; diffMm: number; ratio: number | null; r2: number | null; years: number } | null;
  daymetLines: string[];
  gaugeLines: string[];
  caveats: string[];
};

export type PinGreenness = { pinId: string; name: string; status: "ok" | "none"; message: string | null; originLine: string | null; headline: string | null; peakLine: string | null; typicalPeak: number | null };

export type PinLand = { pinId: string; name: string; status: "ok" | "none"; message: string | null; cdlLabel: string | null; nlcdLabel: string | null; nlcdLine: string | null; cdlLine: string | null };

export type Findings = { groundLabel: string; ndviCaveat: string; rain: PinRain[]; greenness: PinGreenness[]; land: PinLand[] };

export async function loadFindings(): Promise<Findings> {
  const rain: PinRain[] = [];
  const greenness: PinGreenness[] = [];
  const land: PinLand[] = [];

  for (const pin of DEMO_PINS) {
    const g = await loadSavedGroundTruth(pin.id);
    if (g.status !== "ok") {
      const msg = `The saved ground check could not be read: ${g.message}`;
      rain.push({ pinId: pin.id, name: pin.name, status: "none", message: msg, labels: [], annual: null, daymetLines: [], gaugeLines: [], caveats: [] });
      land.push({ pinId: pin.id, name: pin.name, status: "none", message: msg, cdlLabel: null, nlcdLabel: null, nlcdLine: null, cdlLine: null });
    } else {
      const w = groundCheckWording(g);
      const a = g.daymet.status === "ok" && g.daymet.data ? g.daymet.data.precipAnnual : null;
      rain.push({
        pinId: pin.id,
        name: pin.name,
        status: a ? "ok" : "none",
        message: a ? null : g.daymet.message,
        labels: w.labels,
        annual: a ? { powerMm: a.meanPowerMm, daymetMm: a.meanDaymetMm, diffMm: a.biasMmPerYear, ratio: a.ratioOfTotals, r2: a.r2, years: a.rows.length } : null,
        daymetLines: w.daymet,
        gaugeLines: w.gauge,
        caveats: w.caveats,
      });
      const h = cropHistoryWording(g);
      const cdlOk = g.cdl.status === "ok" && g.cdl.data;
      land.push({
        pinId: pin.id,
        name: pin.name,
        status: g.nlcd.status === "ok" || cdlOk ? "ok" : "none",
        message: g.nlcd.status === "ok" || cdlOk ? null : `${g.nlcd.message} ${g.cdl.message}`,
        // cropHistoryWording labels come in the order CDL, NLCD, wells.
        cdlLabel: h.labels[0] ?? null,
        nlcdLabel: h.labels[1] ?? null,
        nlcdLine: g.nlcd.status === "ok" ? h.nlcd : null,
        cdlLine: cdlOk ? (h.cdl[0] ?? null) : null,
      });
    }

    const n = await loadSavedNdvi(pin.id);
    if (n.status !== "ok") {
      greenness.push({ pinId: pin.id, name: pin.name, status: "none", message: n.status === "error" ? (n.message ?? "No saved greenness series.") : "No saved greenness series.", originLine: null, headline: null, peakLine: null, typicalPeak: null });
    } else {
      const ind = computeNdviIndicators(n);
      const w = ndviWording(ind);
      greenness.push({ pinId: pin.id, name: pin.name, status: "ok", message: null, originLine: ndviOriginLine(n), headline: w.headline, peakLine: w.peakLine, typicalPeak: ind.typicalPeak ? ind.typicalPeak.median : null });
    }
  }
  return { groundLabel: GROUND_TRUTH_LABEL, ndviCaveat: NDVI_CAVEAT, rain, greenness, land };
}
