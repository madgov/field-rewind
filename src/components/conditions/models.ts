/**
 * View-models for the "Field conditions" page. Pure functions: they take layer results (real saved or live responses) and
 * return plain data and generated sentences. No I/O, no clock, nothing typed in as a finding. Server and client safe.
 */
import type { PowerExtraResult } from "@/lib/powerExtra/types";
import { computeFrost, refDayText } from "@/lib/powerExtra/frost";
import { computeSoilWetness } from "@/lib/powerExtra/soil";
import { frostWording, soilWetnessWording } from "@/lib/powerExtra/wording";
import { SOIL_MODELLED_NOTE } from "@/lib/powerExtra/constants";
import { powerOriginLine } from "@/lib/power/label";
import { computeShift } from "@/lib/shift/compute";
import type { PowerResult } from "@/lib/types";
import { computeNdviIndicators, type NdviIndicators } from "@/lib/ndvi/indicators";
import { ndviWording } from "@/lib/ndvi/wording";
import { NDVI_LABEL, ndviOriginLine } from "@/lib/ndvi/sources";
import type { ModisSavedFile } from "@/lib/ndvi/modis";
import type { NdviSeriesResult } from "@/lib/ndvi/types";
import { landformWording } from "@/lib/landform/wording";
import { SOIL_US_ONLY_NOTE } from "@/lib/landform/label";
import { EROSION_LABEL, SLOPE_BANDS } from "@/lib/landform/erosion";
import { hydrologicGroupMeaning } from "@/lib/landform/soil";
import type { LandformResult } from "@/lib/landform/types";
import { cropHistoryWording, groundCheckWording } from "@/lib/groundTruth/wording";
import { groundOriginLine } from "@/lib/groundTruth/label";
import type { GroundTruthResult } from "@/lib/groundTruth/types";
import type { BadgeKind } from "./badges";

export const FIRST_YEAR = 1985;
export const LAST_YEAR = 2025;
export const OFFLINE_RE = /offline mode is on/i;

// ------------------------------------------------------------------ shared

export type YearPoint = { year: number; value: number | null; flagged: boolean };

/** A layer that cannot be shown, with the exact message the layer gave and a plain next step. */
export type LayerProblem = {
  state: "problem";
  kind: "error" | "no-coverage" | "unavailable" | "not-checked";
  title: string;
  /** Exact message from the layer. */
  message: string;
  nextStep: string;
};

export type Part<T> = { ok: true; value: T } | { ok: false; message: string };

export function nextStepFor(message: string, what: string): string {
  if (OFFLINE_RE.test(message)) return `This copy of the app is offline, so ${what} is only available for the saved example places (Brentwood, Fresno, Ludhiana). Pick one of them below.`;
  if (/timed out|timeout/i.test(message)) return `The request took too long and was stopped. Reload this page to try again, or pick a saved example place below.`;
  return `Reload this page to try again, or pick a saved example place below. Nothing is estimated in the meantime.`;
}

export function problem(kind: LayerProblem["kind"], title: string, message: string, what: string, nextStep?: string): LayerProblem {
  return { state: "problem", kind, title, message, nextStep: nextStep ?? nextStepFor(message, what) };
}

const n0 = (v: number) => Math.round(v).toLocaleString("en-US");
const n1 = (v: number) => v.toLocaleString("en-US", { minimumFractionDigits: 1, maximumFractionDigits: 1 });
const n2 = (v: number) => v.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const MONTH_LONG = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
/** "13 Feb 2010" from an ISO date, with no Date object. */
export function isoDayText(iso: string): string {
  const y = iso.slice(0, 4);
  const m = Number(iso.slice(5, 7));
  const d = Number(iso.slice(8, 10));
  return `${d} ${MONTHS[m - 1]} ${y}`;
}

// ------------------------------------------------------------------ (a) heat and frost

export type HeatFrostView =
  | {
      state: "ok";
      label: string;
      headline: string;
      lines: string[];
      frostDays: { points: YearPoint[]; earlyMean: number | null; lateMean: number | null };
      frostFree: { points: YearPoint[]; earlyMean: number | null; lateMean: number | null };
      dateRows: { year: number; last: string | null; first: string | null; frostDays: number | null }[];
      southern: boolean;
      crossCheck: string | null;
      definition: string;
      originLine: string;
      partialNote: string | null;
      hot: { headline: string; detail: string } | { unavailable: string };
    }
  | LayerProblem;

export function heatFrostView(extra: PowerExtraResult, power: PowerResult | null): HeatFrostView {
  if (extra.status === "error") return problem("error", "Frost history is not available", extra.message ?? "NASA POWER returned an error with no message.", "frost history");
  if (extra.status === "no-coverage") return problem("no-coverage", "NASA POWER has no frost data for this spot", extra.message ?? "NASA POWER returned no values for this location.", "frost history");
  const powerOk = power && (power.status === "ok" || power.status === "partial") ? power : null;
  const frost = computeFrost(extra, powerOk ?? undefined);
  if (frost.status !== "ok") return problem("unavailable", "Frost history cannot be worked out here", frost.reason, "frost history", "Pick a place in the Northern Hemisphere, or one of the saved example places below.");
  const w = frostWording(frost);
  let hot: { headline: string; detail: string } | { unavailable: string } = { unavailable: power ? (power.message ?? "The hot-day record could not be used for this spot.") : "The weather record for hot days was not loaded." };
  if (powerOk) {
    const s = computeShift(powerOk);
    hot = s.status === "ok" ? { headline: s.metrics.hotDays.headline, detail: s.metrics.hotDays.detail } : { unavailable: s.reason };
  }
  const mk = (m: (typeof frost)["frostDays"], key: "frostDays" | "frostFreeDays") => ({
    points: frost.years.map((y) => ({ year: y.year, value: y[key], flagged: y.flagged })),
    earlyMean: m.shownEarly,
    lateMean: m.shownLate,
  });
  const cc = frost.crossCheck;
  return {
    state: "ok",
    label: w.label,
    headline: w.headline,
    lines: w.lines,
    frostDays: mk(frost.frostDays, "frostDays"),
    frostFree: mk(frost.frostFreeDays, "frostFreeDays"),
    dateRows: frost.years.map((y) => ({ year: y.year, last: y.lastSpringFrost ? isoDayText(y.lastSpringFrost.date) : null, first: y.firstAutumnFrost ? isoDayText(y.firstAutumnFrost.date) : null, frostDays: y.frostDays })),
    southern: frost.hemisphere === "south",
    crossCheck: cc
      ? `Cross-check: NASA POWER's frost flag and its own daily lowest air temperature (at or below 0 °C) disagreed on ${n0(cc.disagreements)} of ${n0(cc.daysCompared)} days compared. The two are different measures, so some disagreement is expected.`
      : null,
    definition: frost.definition,
    originLine: powerOriginLine({ origin: frost.origin, fetchedAt: frost.fetchedAt }),
    partialNote: extra.status === "partial" ? `${n0(extra.missing.anyField)} of ${n0(extra.missing.totalDays)} days have a missing value. Missing days are never filled in; a year with more than 10 missing days is left out of the averages and drawn hatched.` : null,
    hot,
  };
}

// ------------------------------------------------------------------ (b) soil wetness

export type SoilWetnessView =
  | {
      state: "ok";
      label: string;
      headline: string;
      lines: string[];
      points: YearPoint[];
      means: { year: number; mean: number | null }[];
      baselineText: string;
      baselineMean: number | null;
      driestYears: { year: number; value: number }[];
      dryDayLine: string;
      dryDayCaveat: string;
      definition: string;
      modelledNote: string;
      originLine: string;
    }
  | LayerProblem;

export const DRY_DAY_CAVEAT =
  "Treat this count with care. Wetness is reported in steps of 0.01, so on many days the value sits exactly at the threshold, and the count can cover well over 10 percent of days. It is a weak measure, so the headline uses the growing-season average instead.";

export function soilWetnessView(extra: PowerExtraResult): SoilWetnessView {
  if (extra.status === "error") return problem("error", "Soil wetness history is not available", extra.message ?? "NASA POWER returned an error with no message.", "soil wetness");
  if (extra.status === "no-coverage") return problem("no-coverage", "NASA POWER has no soil wetness for this spot", extra.message ?? "NASA POWER returned no values for this location.", "soil wetness");
  const soil = computeSoilWetness(extra);
  if (soil.status !== "ok") return problem("unavailable", "Soil wetness cannot be worked out here", soil.reason, "soil wetness", "Pick a place in the Northern Hemisphere, or one of the saved example places below.");
  const w = soilWetnessWording(soil);
  const isDry = (l: string) => /^dry growing-season days/i.test(l);
  const dry = w.lines.find(isDry) ?? "";
  const keep = w.lines.filter((l) => !isDry(l) && !/^The dry-day threshold/.test(l) && l !== SOIL_MODELLED_NOTE);
  const b = soil.baseline;
  return {
    state: "ok",
    label: w.label,
    headline: w.headline,
    lines: keep,
    points: soil.years.map((y) => ({ year: y.year, value: y.anomaly, flagged: y.flagged })),
    means: soil.years.map((y) => ({ year: y.year, mean: y.growingSeasonMean })),
    baselineMean: b ? b.mean : null,
    baselineText: b ? `Bars show each growing season's wetness minus the ${b.startYear} to ${b.endYear} average of ${n2(b.mean)} (${b.yearsUsed} usable years). Above the line is wetter than that average, below is drier.` : "There were too few usable years to work out an average, so no bars are drawn.",
    driestYears: soil.driestYears,
    dryDayLine: dry,
    dryDayCaveat: DRY_DAY_CAVEAT,
    definition: soil.definition,
    modelledNote: SOIL_MODELLED_NOTE,
    originLine: powerOriginLine({ origin: soil.origin, fetchedAt: soil.fetchedAt }),
  };
}

// ------------------------------------------------------------------ (c) vegetation

export type VegetationView =
  | {
      state: "ok";
      label: string;
      headline: string;
      peakLine: string;
      greenUpLines: string[];
      bareLine: string;
      stressLine: string;
      stressItems: string[];
      pixelFacts: string[];
      caveat: string;
      indicators: NdviIndicators;
      observations: { date: string; ndvi: number; satellite: string }[];
      modis: { date: string; ndvi: number }[] | null;
      modisLabel: string | null;
      satellites: { name: string; count: number }[];
      originLine: string;
      modisOriginLine: string | null;
      notes: string[];
      partialNote: string | null;
      sensorNote: string | null;
    }
  | LayerProblem;

export const SENSOR_STEP_NOTE =
  "Landsat 5, 7, 8 and 9 carry slightly different sensors. In the saved record, Landsat 7 reads lower than Landsat 8 by about 0.03 at a crop-like pixel and by 0.07 to 0.08 at low-NDVI pixels (see docs/ndvi.md; the size of the known sensor difference is described by Roy et al. 2016). No adjustment was applied, so a small step around 2013 can come from the sensor change and not from the ground.";

/** Pixel caveats built only from computed facts: the indicators, and the land-cover / crop-history layer when it exists. */
export function pixelFacts(ind: NdviIndicators, ground: GroundTruthResult | null): string[] {
  const out: string[] = [];
  if (ground && ground.status === "ok") {
    if (ground.nlcd.status === "ok" && ground.nlcd.data) out.push(`Land cover at this point (NLCD ${ground.nlcd.data.year}): ${ground.nlcd.data.name}.`);
    if (ground.cdl.status === "ok" && ground.cdl.data) out.push(cropHistoryWording(ground).cdl[0] ?? "");
    else if (ground.cdl.status !== "ok") out.push(`No crop-history check is available here: ${ground.cdl.message}`);
  } else {
    out.push(`No land-cover or crop-history check was available for this place${ground && ground.status === "error" ? ` (${ground.message})` : ""}, so this app cannot say from outside data whether the pixel is cropland.`);
  }
  if (ind.typicalPeak) {
    out.push(
      `The typical yearly peak at this pixel is an NDVI of ${n2(ind.typicalPeak.median)}. For scale, NASA Earth Observatory puts bare ground at 0.1 or below, shrub and grassland at 0.2 to 0.3, and dense forest at 0.6 to 0.8.`,
    );
  }
  const sparse = ind.peaks.filter((p) => p.sparse).length;
  if (sparse > 0) out.push(`${sparse} of ${ind.peaks.length} years have fewer than ${ind.definitions.minObsPerYear} clear observations, so their peak may have been missed between clouds. Green-up dates carry an uncertainty of days for the same reason.`);
  if (ind.stressFlags.length > 0) {
    const months = new Map<number, number>();
    for (const f of ind.stressFlags) months.set(Number(f.date.slice(5, 7)), (months.get(Number(f.date.slice(5, 7))) ?? 0) + 1);
    if (months.size === 1) {
      const [m] = [...months.keys()];
      out.push(`All ${ind.stressFlags.length} stress flags fall in ${MONTH_LONG[m - 1]}. That timing can come from harvest or a fallow period as easily as from stress.`);
    } else {
      out.push(`The ${ind.stressFlags.length} stress flags fall in ${months.size} different months (${[...months.entries()].sort((a, b) => a[0] - b[0]).map(([m, c]) => `${MONTHS[m - 1]} ${c}`).join(", ")}).`);
    }
  }
  out.push(`The 50 percent rule for green-up (halfway between the year's lowest and highest NDVI) is this app's own declared choice, not a standard.`);
  return out.filter(Boolean);
}

export function vegetationView(series: NdviSeriesResult, modis: ModisSavedFile | null, ground: GroundTruthResult | null): VegetationView {
  if (series.status === "error") return problem("error", "Satellite vegetation record is not available", series.message ?? "No message was given.", "the satellite record");
  if (series.status === "no-coverage" || series.observations.length === 0) return problem("no-coverage", "No clear satellite observations for this spot", series.message ?? "No clear Landsat observation was found.", "the satellite record");
  const ind = computeNdviIndicators(series);
  const w = ndviWording(ind);
  const counts = new Map<string, number>();
  for (const o of series.observations) counts.set(o.satellite, (counts.get(o.satellite) ?? 0) + 1);
  const satellites = [...counts.entries()].sort().map(([name, count]) => ({ name, count }));
  const multi = satellites.length > 1;
  return {
    state: "ok",
    label: NDVI_LABEL,
    headline: w.headline,
    peakLine: w.peakLine,
    greenUpLines: w.greenUpLines,
    bareLine: w.bareLine,
    stressLine: w.stressLine,
    stressItems: w.stressItems,
    pixelFacts: pixelFacts(ind, ground),
    caveat: w.caveat,
    indicators: ind,
    observations: series.observations.map((o) => ({ date: o.date, ndvi: o.ndvi, satellite: o.satellite })),
    modis: modis ? modis.observations : null,
    modisLabel: modis ? modis.label : null,
    satellites,
    originLine: ndviOriginLine({ origin: series.origin, fetchedAt: series.fetchedAt }),
    modisOriginLine: modis ? ndviOriginLine({ origin: "saved", fetchedAt: modis.fetchedAt }) : null,
    notes: series.notes,
    partialNote: series.status === "partial" ? `${series.counts.failed} scenes could not be read and are left out. Nothing is filled in.` : null,
    sensorNote: multi ? SENSOR_STEP_NOTE : null,
  };
}

// ------------------------------------------------------------------ (d) soil and terrain

export type Fact = { label: string; value: string; source: string };
export type LandformView =
  | {
      state: "ok";
      originLine: string | null;
      terrainLines: string[];
      terrain: Fact[];
      soil: { available: boolean; message: string | null; facts: Fact[]; hydrologic: { group: string; meaning: string } | null; lines: string[] };
      erosion: { label: string; slopeFact: string; slopeBands: string[]; activeBand: string | null; kfFact: string; note: string };
      caveats: string[];
      usOnly: string | null;
    }
  | LayerProblem;

const SOIL_SRC = "USDA NRCS SSURGO soil survey (Soil Data Access)";
const DEM_SRC = "NASADEM (SRTM-derived), about 31 m";

export function landformView(l: LandformResult): LandformView {
  if (l.status === "error" && l.terrain.status === "error" && l.soil.status === "error") {
    return problem("error", "Soil and terrain are not available", l.message ?? (l.terrain.status === "error" ? l.terrain.message : "No message was given."), "soil and terrain");
  }
  const w = landformWording(l);
  const t = l.terrain;
  const terrain: Fact[] =
    t.status === "ok"
      ? [
          { label: "Height above sea level at the pin", value: `${n0(t.summary.centerElevationM)} m`, source: DEM_SRC },
          { label: "Slope at the pin", value: `${n1(t.summary.centerSlopePct)} percent (${n1(t.summary.centerSlopeDeg)} degrees)`, source: DEM_SRC },
          { label: "Height range in the window", value: `${n0(t.summary.minElevationM)} to ${n0(t.summary.maxElevationM)} m (${n0(t.summary.reliefM)} m)`, source: DEM_SRC },
          { label: "Typical slope in the window", value: `${n1(t.summary.medianSlopePct)} percent; 1 cell in 10 is steeper than ${n1(t.summary.p90SlopePct)} percent`, source: DEM_SRC },
        ]
      : [];
  const s = l.soil;
  let soilBlock: Extract<LandformView, { state: "ok" }>["soil"];
  let usOnly: string | null = null;
  if (s.status === "ok") {
    const d = s.derived;
    const facts: Fact[] = [];
    if (d.textureClass) facts.push({ label: "Surface layer texture", value: d.textureClass, source: SOIL_SRC });
    if (d.profileAwc) facts.push({ label: "Water the top 100 cm can hold for plants", value: `about ${n0(d.profileAwc.mm)} mm`, source: SOIL_SRC });
    if (d.omTopPct !== null) facts.push({ label: "Organic matter, surface layer", value: `${n1(d.omTopPct)} percent`, source: SOIL_SRC });
    if (d.hydgrp) facts.push({ label: "Hydrologic soil group", value: d.hydgrp, source: SOIL_SRC });
    if (d.drainageClass) facts.push({ label: "Natural drainage", value: d.drainageClass.toLowerCase(), source: SOIL_SRC });
    soilBlock = { available: true, message: null, facts, hydrologic: hydrologicGroupMeaning(d.hydgrp), lines: w.soil };
  } else {
    soilBlock = { available: false, message: s.message, facts: [], hydrologic: null, lines: [] };
    if (s.status === "no-coverage") usOnly = `${SOIL_US_ONLY_NOTE.replace("SSURGO covers", "SSURGO soil maps cover")} No soil facts are shown for this place, and nothing is estimated in their place.`;
  }
  const e = l.erosion;
  const kfFact = e && e.kf !== null && e.kfClassRank !== null ? `Soil erodibility (Kf): ${e.kf.toFixed(2)}, class ${e.kfClassRank} of 14 NRCS classes (0.02 to 0.64; higher means the soil detaches more easily).` : s.status === "ok" ? "Soil erodibility (Kf): not listed for this soil." : "Soil erodibility (Kf): not available, because there is no soil survey data for this point.";
  const slopeFact = e && e.slopePct !== null && e.slopeBand ? `Slope: ${n1(e.slopePct)} percent, in the NRCS "${e.slopeBand.label}" band.` : "Slope: not available.";
  return {
    state: "ok",
    originLine: w.originLine,
    terrainLines: w.terrain,
    terrain,
    soil: soilBlock,
    erosion: {
      label: EROSION_LABEL,
      slopeFact,
      slopeBands: SLOPE_BANDS.map((b) => b.label),
      activeBand: e?.slopeBand?.label ?? null,
      kfFact,
      note: "Slope and erodibility are shown as two separate sourced facts. No combined erosion class is given, because no published rule for combining them could be cited.",
    },
    caveats: w.caveats,
    usOnly,
  };
}

// ------------------------------------------------------------------ (e) ground checks

export type RainPoint = { year: number; powerMm: number; daymetMm: number; ratio: number | null };
export type GroundView =
  | {
      state: "ok";
      origin: "live" | "saved";
      daymet: { status: "ok"; lines: string[]; rain: RainPoint[]; ratioOfTotals: number | null; r2: number | null; tMaxBias: number; tMinBias: number; originLine: string; sourceName: string; sourceUrl: string; caveats: string[] } | { status: "none"; kind: LayerProblem["kind"]; message: string; sourceName: string };
      gauge: { status: "ok"; lines: string[]; originLine: string; sourceName: string; sourceUrl: string } | { status: "none"; kind: LayerProblem["kind"]; message: string; sourceName: string };
      crops: { status: "ok"; lines: string[]; years: { year: number; category: string; agree: number; sampled: number; tie: boolean }[]; originLine: string; sourceName: string; sourceUrl: string } | { status: "none"; kind: LayerProblem["kind"]; message: string; sourceName: string };
      nlcd: { status: "ok"; line: string; originLine: string; sourceName: string; sourceUrl: string } | { status: "none"; kind: LayerProblem["kind"]; message: string; sourceName: string };
      wells: { status: "ok"; lines: string[]; originLine: string; sourceName: string; sourceUrl: string } | { status: "none"; kind: LayerProblem["kind"]; message: string; sourceName: string };
      caveats: string[];
      headline: string;
    }
  | LayerProblem;

export function groundView(g: GroundTruthResult): GroundView {
  if (g.status === "error") return problem("error", "Ground checks are not available", g.message, "ground checks");
  const gc = groundCheckWording(g);
  const ch = cropHistoryWording(g);
  const kindOf = (s: string): LayerProblem["kind"] => (s === "no-coverage" ? "no-coverage" : s === "not-checked" ? "not-checked" : "error");
  const origin = (fetchedAt: string, short: string) => groundOriginLine({ origin: g.origin, fetchedAt }, short);
  const dm = g.daymet;
  const daymet: Extract<GroundView, { state: "ok" }>["daymet"] =
    dm.status === "ok" && dm.data
      ? {
          status: "ok",
          lines: gc.daymet,
          rain: dm.data.precipAnnual.rows.map((r) => ({ year: r.year, powerMm: r.powerMm, daymetMm: r.daymetMm, ratio: r.ratio })),
          ratioOfTotals: dm.data.precipAnnual.ratioOfTotals,
          r2: dm.data.precipAnnual.r2,
          tMaxBias: dm.data.tMax.bias,
          tMinBias: dm.data.tMin.bias,
          originLine: origin(dm.fetchedAt, "Daymet"),
          sourceName: dm.source.name,
          sourceUrl: dm.source.url,
          caveats: gc.caveats.filter((c) => /Daymet uses|Years with fewer/.test(c)),
        }
      : { status: "none", kind: kindOf(dm.status), message: dm.message, sourceName: dm.source.name };
  const ga = g.gauge;
  const gauge: Extract<GroundView, { state: "ok" }>["gauge"] =
    ga.status === "ok" && ga.data
      ? { status: "ok", lines: gc.gauge, originLine: origin(ga.fetchedAt, "CoCoRaHS"), sourceName: ga.source.name, sourceUrl: ga.source.url }
      : { status: "none", kind: kindOf(ga.status), message: ga.message, sourceName: ga.source.name };
  const cd = g.cdl;
  const crops: Extract<GroundView, { state: "ok" }>["crops"] =
    cd.status === "ok" && cd.data
      ? {
          status: "ok",
          lines: [...ch.cdl, ...ch.caveats.filter((c) => /satellite classification says/.test(c))],
          years: cd.data.years.map((y) => ({ year: y.year, category: y.majority?.category ?? "no answer", agree: y.agree, sampled: y.sampled, tie: y.tie })),
          originLine: origin(cd.fetchedAt, "USDA NASS"),
          sourceName: cd.source.name,
          sourceUrl: cd.source.url,
        }
      : { status: "none", kind: kindOf(cd.status), message: cd.message, sourceName: cd.source.name };
  const nl = g.nlcd;
  const nlcd: Extract<GroundView, { state: "ok" }>["nlcd"] =
    nl.status === "ok" && nl.data
      ? { status: "ok", line: ch.nlcd, originLine: origin(nl.fetchedAt, "MRLC"), sourceName: nl.source.name, sourceUrl: nl.source.url }
      : { status: "none", kind: kindOf(nl.status), message: nl.message, sourceName: nl.source.name };
  const we = g.wells;
  const wells: Extract<GroundView, { state: "ok" }>["wells"] =
    we.status === "ok" && we.data
      ? { status: "ok", lines: ch.wells, originLine: origin(we.fetchedAt, "USGS"), sourceName: we.source.name, sourceUrl: we.source.url }
      : { status: "none", kind: kindOf(we.status), message: we.message, sourceName: we.source.name };
  const anyOk = [daymet.status, gauge.status, crops.status, nlcd.status, wells.status].includes("ok");
  const okCount = [daymet.status, gauge.status, crops.status, nlcd.status, wells.status].filter((s) => s === "ok").length;
  return {
    state: "ok",
    origin: g.origin,
    daymet,
    gauge,
    crops,
    nlcd,
    wells,
    caveats: [...ch.caveats.filter((c) => !/satellite classification says/.test(c))],
    headline: anyOk
      ? daymet.status === "ok"
        ? `NASA POWER and Daymet were compared for ${daymet.rain.length} years of rain. ${okCount} of 5 ground checks have data for this place.`
        : `${okCount} of 5 ground checks have data for this place.`
      : "None of the 5 ground checks has data for this place, because they cover the United States only.",
  };
}

// ------------------------------------------------------------------ harmonized yearly view

export type HarmonizedLayer = {
  id: "frost" | "soilAnomaly" | "rainPower" | "rainDaymet" | "hotDays" | "peakNdvi";
  label: string;
  unit: string;
  badge: BadgeKind;
  resolution: string;
  /** Index 0 = FIRST_YEAR. null = no value for that year (drawn hatched, never filled). */
  values: (number | null)[];
  /** Years where a value exists but is weak (e.g. few clear satellite observations). */
  weak: boolean[];
  digits: number;
  /** "bars" start at zero; "anomaly" bars grow from the zero line both ways. */
  kind: "bars" | "anomaly";
  unavailable: string | null;
  note: string | null;
};

export type Harmonized = {
  firstYear: number;
  lastYear: number;
  layers: HarmonizedLayer[];
  sentence: string;
  resolutions: { name: string; text: string }[];
};

export const NATIVE_RESOLUTIONS: { name: string; text: string }[] = [
  { name: "NASA POWER (frost, soil wetness, rain, hot days)", text: "about 50 km grid" },
  { name: "Daymet", text: "1 km grid" },
  { name: "Landsat NDVI", text: "30 m pixel" },
  { name: "MODIS NDVI", text: "250 m pixel" },
  { name: "NASADEM terrain", text: "about 31 m cells" },
  { name: "SSURGO soil", text: "map-unit polygons (areas of mixed soil, not a grid)" },
];

export const HARMONIZED_SENTENCE =
  "These layers have different native resolutions, from a 30 m pixel to a 50 km grid square, so each was reduced to one value per year to line them up. Nothing was resampled onto a common map, no gap is filled in, and no combined score is worked out.";

const yearIndex = (y: number) => y - FIRST_YEAR;
const blank = () => Array.from({ length: LAST_YEAR - FIRST_YEAR + 1 }, () => null as number | null);
const noWeak = () => Array.from({ length: LAST_YEAR - FIRST_YEAR + 1 }, () => false);

function fill(points: { year: number; value: number | null }[]): (number | null)[] {
  const v = blank();
  for (const p of points) if (p.year >= FIRST_YEAR && p.year <= LAST_YEAR && p.value !== null && Number.isFinite(p.value)) v[yearIndex(p.year)] = p.value;
  return v;
}

export function buildHarmonized(input: { power: Part<PowerResult>; extra: Part<PowerExtraResult>; ndvi: Part<NdviSeriesResult>; ground: Part<GroundTruthResult> }): Harmonized {
  const layers: HarmonizedLayer[] = [];
  const base = { weak: noWeak(), unavailable: null as string | null, note: null as string | null };

  // frost days and soil wetness anomaly (POWER extra)
  const ex = input.extra;
  const exUsable = ex.ok && (ex.value.status === "ok" || ex.value.status === "partial") ? ex.value : null;
  const exMsg = !ex.ok ? ex.message : ex.value.message ?? `NASA POWER returned status "${ex.value.status}".`;
  const frost = exUsable ? computeFrost(exUsable) : null;
  const soil = exUsable ? computeSoilWetness(exUsable) : null;
  layers.push({
    ...base, id: "frost", label: "Frost days", unit: "days a year", badge: "reanalysis", resolution: "about 50 km grid", digits: 0, kind: "bars",
    values: frost && frost.status === "ok" ? fill(frost.years.map((y) => ({ year: y.year, value: y.frostDays }))) : blank(),
    unavailable: frost && frost.status === "ok" ? null : frost ? frost.reason : exMsg,
  });
  layers.push({
    ...base, id: "soilAnomaly", label: "Growing-season soil wetness versus average", unit: "wetness, 0 to 1 scale", badge: "reanalysis", resolution: "about 50 km grid", digits: 2, kind: "anomaly",
    values: soil && soil.status === "ok" ? fill(soil.years.map((y) => ({ year: y.year, value: y.anomaly }))) : blank(),
    unavailable: soil && soil.status === "ok" ? null : soil ? soil.reason : exMsg,
    note: "Modelled, not measured in a field.",
  });

  // rain and hot days (POWER main)
  const pw = input.power;
  const pwUsable = pw.ok && (pw.value.status === "ok" || pw.value.status === "partial") ? pw.value : null;
  const shift = pwUsable ? computeShift(pwUsable) : null;
  const pwMsg = !pw.ok ? pw.message : pw.value.message ?? `NASA POWER returned status "${pw.value.status}".`;
  const shiftMsg = shift && shift.status === "unavailable" ? shift.reason : pwMsg;
  layers.push({
    ...base, id: "rainPower", label: "Annual rain, NASA POWER", unit: "mm a year", badge: "reanalysis", resolution: "about 50 km grid", digits: 0, kind: "bars",
    values: shift && shift.status === "ok" ? fill(shift.metrics.precip.years.map((y) => ({ year: y.year, value: y.value }))) : blank(),
    unavailable: shift && shift.status === "ok" ? null : shiftMsg,
  });
  const gt = input.ground;
  const gtOk = gt.ok && gt.value.status === "ok" ? gt.value : null;
  const dm = gtOk?.daymet;
  layers.push({
    ...base, id: "rainDaymet", label: "Annual rain, Daymet", unit: "mm a year", badge: "interpolated", resolution: "1 km grid", digits: 0, kind: "bars",
    values: dm && dm.status === "ok" && dm.data ? fill(dm.data.precipAnnual.rows.map((r) => ({ year: r.year, value: r.daymetMm }))) : blank(),
    unavailable: dm && dm.status === "ok" && dm.data ? null : dm ? dm.message : !gt.ok ? gt.message : gt.value.status === "error" ? gt.value.message : "Ground checks were not loaded.",
    note: dm && dm.status === "ok" && dm.data ? "Years with fewer than 360 shared days are left out." : null,
  });
  layers.push({
    ...base, id: "hotDays", label: "Hot days over 35 °C", unit: "days a year", badge: "reanalysis", resolution: "about 50 km grid", digits: 0, kind: "bars",
    values: shift && shift.status === "ok" ? fill(shift.metrics.hotDays.years.map((y) => ({ year: y.year, value: y.value }))) : blank(),
    unavailable: shift && shift.status === "ok" ? null : shiftMsg,
  });

  // peak NDVI (Landsat)
  const nd = input.ndvi;
  const ndUsable = nd.ok && nd.value.status !== "error" && nd.value.observations.length > 0 ? nd.value : null;
  const ind = ndUsable ? computeNdviIndicators(ndUsable) : null;
  const weak = noWeak();
  if (ind) for (const p of ind.peaks) if (p.sparse && p.year >= FIRST_YEAR && p.year <= LAST_YEAR) weak[yearIndex(p.year)] = true;
  layers.push({
    ...base, id: "peakNdvi", label: "Peak vegetation index (NDVI)", unit: "NDVI, -1 to 1", badge: "satellite", resolution: "30 m pixel", digits: 2, kind: "bars",
    values: ind ? fill(ind.peaks.map((p) => ({ year: p.year, value: p.peak }))) : blank(),
    weak,
    unavailable: ind ? null : !nd.ok ? nd.message : nd.value.message ?? "No clear satellite observations for this place.",
    note: ind ? `Greenest clear Landsat observation of the calendar year. Years with fewer than ${ind.definitions.minObsPerYear} clear observations are outlined: the true peak may have been missed.` : null,
  });
  return { firstYear: FIRST_YEAR, lastYear: LAST_YEAR, layers, sentence: HARMONIZED_SENTENCE, resolutions: NATIVE_RESOLUTIONS };
}

export function fmtValue(v: number | null, digits: number): string {
  if (v === null || !Number.isFinite(v)) return "no value";
  return v.toLocaleString("en-US", { minimumFractionDigits: digits, maximumFractionDigits: digits });
}

export { refDayText, n0, n1, n2 };
