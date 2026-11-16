/**
 * The ONE data package the AI field advisor is allowed to read (built in Stage 7 Batch 1, model call added in Batch 2).
 * Everything in it was computed by code from the app's own real data or entered by the farmer. Where a layer is missing it
 * carries { status: "not-available", reason } and nothing stands in for it. The model may restate figures from here; it may
 * not add any.
 */
import { getCrop } from "../crops/catalog";
import { cropRegionNotice } from "../crops/region";
import { expertiseFor } from "../expertise";
import type { ExpertiseGap, ExpertiseNote } from "../expertise";
import { viewPriorities } from "../farmer/priorities";
import type { PriorityId, PriorityView } from "../farmer/priorities";
import type { BudgetResult } from "../farmer/budget";
import { NUTRIENT_CAVEAT } from "../nutrients";
import { topHorizon } from "../landform/soil";
import { TERRAIN_CAVEAT } from "../landform/label";
import { NON_CROP, cropHistoryWording } from "../groundTruth/wording";
import type { GroundTruthResult } from "../groundTruth/types";
import type { ErosionIndicator, SoilResult } from "../landform/types";
import { DECADES } from "../replay/types";
import { WATER_RESULT_MEANING, WATER_RESULT_LIMIT } from "../replay/wording";
import type { ReplayResult } from "../replay/types";
import { compareRotations } from "../soilhealth";
import type { RotationComparison, RotationNutrientInput, YieldInputs } from "../soilhealth";
import type { ShiftResult } from "../shift/types";
import type { AnnualSummary } from "../summary/annual";
import type { JulyTmax } from "../summary/julyTmax";
import type { ScenarioView } from "./scenarioView";

export const ADVISOR_PAYLOAD_VERSION = 1;
export const CLIMATE_LABEL = "regional climate, about 50 km grid";

export type NotAvailable = { status: "not-available"; reason: string };

export type AdvisorInputs = {
  pin: { id: string | null; name: string; lat: number; lon: number };
  /** Provenance line for the climate data (saved response from [date] or fetched just now), from powerDataLabel. */
  climateOriginLine: string;
  shift: ShiftResult;
  annual: AnnualSummary | null;
  julyTmax: JulyTmax | null;
  replay: ReplayResult;
  soil: SoilResult | null;
  erosion: ErosionIndicator | null;
  /** Provenance line for soil and terrain (landformOriginLine), or null when no soil was fetched. */
  soilOriginLine: string | null;
  /** Saved or live satellite land-cover and crop-history record for the point; null when none was fetched. */
  groundTruth?: GroundTruthResult | null;
  /** The what-if run, or null / absent when the sliders were not used. Built on the same (renamed) rotations as `replay`. */
  scenario?: ScenarioView | null;
  rotations: RotationNutrientInput[];
  /** Farmer's expected yield per acre in each crop's own unit. Missing crops stay unknown. */
  yields: YieldInputs;
  budget: BudgetResult | null;
  priorityOrder: PriorityId[];
  /** Used for the water-cost priority only. */
  price?: { units: "us" | "metric"; waterPrice: number };
};

export type SoilSection =
  | NotAvailable
  | {
      status: "ok";
      originLine: string;
      source: string;
      mapUnit: string;
      dominantComponent: string;
      dominantPct: number;
      textureClass: string | null;
      sandPct: number | null;
      siltPct: number | null;
      clayPct: number | null;
      organicMatterTopPct: number | null;
      phTop: number | null;
      kfTop: number | null;
      hydrologicGroup: string | null;
      drainageClass: string | null;
      mappedSlopePct: number | null;
      profileAvailableWaterMm: number | null;
      profileAvailableWaterCoveragePct: number | null;
      profileAvailableWaterIncomplete: boolean | null;
      /** SSURGO has no plant-available nitrogen, phosphorus or potassium. Always stated. */
      notIncluded: string;
    };

export type ClimateSection = {
  label: string;
  originLine: string;
  /** Mean annual totals over complete calendar years. */
  annualRainMm: { value: number | null; years: number; firstYear: number | null; lastYear: number | null; note: string } | NotAvailable;
  annualEt0Mm: { value: number | null; years: number; firstYear: number | null; lastYear: number | null; note: string } | NotAvailable;
  julyMeanTmaxC: { value: number; years: number; firstYear: number; lastYear: number } | NotAvailable;
  shift: NotAvailable | {
    status: "ok";
    overallHeadline: string;
    overallDetail: string;
    /** A day counts as hot when the daily maximum is above this, degrees C. */
    hotDayThresholdC: number;
    metrics: { id: string; label: string; unit: string; earlyMean: number | null; lateMean: number | null; diff: number | null; verdict: string; detail: string }[];
    periods: { early: [number, number]; late: [number, number] };
  };
};

export type WaterSection =
  | NotAvailable
  | {
      status: "ok";
      supplyMm: number;
      /** How the supply was worked out from the farmer's budget, or null when the farmer typed mm directly. */
      supplyFromBudget: string[] | null;
      dataLabel: string;
      notes: string[];
      rotations: {
        name: string;
        crops: string[];
        headline: string;
        seasonsShort: number;
        seasonsJudged: number;
        seasonsNotJudged: number;
        byDecade: { label: string; short: number; judged: number }[];
        needMedianMm: number | null;
        needMinMm: number | null;
        needMaxMm: number | null;
      }[];
    };

/** The what-if section. "not-applied" means there is nothing to describe: the model must not mention a what-if. */
export type ScenarioSection =
  | { status: "not-applied"; reason: string }
  | NotAvailable
  | {
      status: "ok";
      label: string;
      rainFactor: number;
      tempDeltaC: number;
      humidity: string;
      rainDaysScaled: number;
      rhClampedDays: number;
      rhNotAdjustedDays: number;
      supplyMm: number;
      headline: string;
      rotations: {
        name: string;
        crops: string[];
        baselineSeasonsShort: number;
        baselineSeasonsJudged: number;
        scenarioSeasonsShort: number;
        scenarioSeasonsJudged: number;
        byDecade: { label: string; baselineShort: number; baselineJudged: number; scenarioShort: number; scenarioJudged: number }[];
        sentence: string;
      }[];
      notes: string[];
      caveats: string[];
    };

export type AdvisorPayload = {
  version: number;
  location: AdvisorInputs["pin"];
  climate: ClimateSection;
  water: WaterSection;
  scenario: ScenarioSection;
  soil: SoilSection;
  erosion: NotAvailable | { status: "ok"; slopePct: number | null; slopeBand: string | null; kf: number | null; kfClassRank: number | null; label: string; caveat: string };
  /** What satellite land-cover and crop-history records say the point is. Sentences come from the app's own wording code. */
  landCover: NotAvailable | { status: "ok"; notCropland: boolean; classesSeen: string[]; cropHistory: string[]; nlcd: string };
  nutrients: RotationComparison & { caveat: string; yieldsEntered: Record<string, number | null> };
  priorities: PriorityView[];
  expertise: { notes: ExpertiseNote[]; gaps: ExpertiseGap[] };
  /** Plain statements the written answer must keep. */
  limits: string[];
};

const na = (reason: string): NotAvailable => ({ status: "not-available", reason });

function round(v: number | null, dp = 2): number | null {
  if (v === null) return null;
  const f = 10 ** dp;
  return Math.round(v * f) / f;
}

function scenarioSection(v: ScenarioView | null | undefined): ScenarioSection {
  if (!v) return { status: "not-applied", reason: "No what-if was set, so there is no scenario to describe." };
  if (v.status !== "ok") return na(v.reason);
  if (v.isIdentity) return { status: "not-applied", reason: "The what-if sliders are at their neutral setting, so the replay is the record as recorded and there is no scenario to describe." };
  return {
    status: "ok",
    label: v.label,
    rainFactor: v.settings.rainFactor,
    tempDeltaC: v.settings.tempDeltaC,
    humidity: v.settings.humidity,
    rainDaysScaled: v.rainDaysScaled,
    rhClampedDays: v.rhClampedDays,
    rhNotAdjustedDays: v.rhNotAdjustedDays,
    supplyMm: round(v.supplyMm, 1) as number,
    headline: v.headline,
    rotations: v.rotations.map((r) => ({
      name: r.name,
      crops: r.cropNames,
      baselineSeasonsShort: r.baseline.short,
      baselineSeasonsJudged: r.baseline.judged,
      scenarioSeasonsShort: r.scenario.short,
      scenarioSeasonsJudged: r.scenario.judged,
      byDecade: r.baseline.byDecade.map((d, k) => ({
        label: d.label,
        baselineShort: d.short,
        baselineJudged: d.judged,
        scenarioShort: r.scenario.byDecade[k].short,
        scenarioJudged: r.scenario.byDecade[k].judged,
      })),
      sentence: r.sentence,
    })),
    notes: v.notes,
    caveats: v.caveats,
  };
}

function soilSection(soil: SoilResult | null, originLine: string | null): SoilSection {
  if (!soil) return na("No soil data was fetched for this location.");
  if (soil.status === "no-coverage") return na(`${soil.message} The advisor says soil is not available and does not fill the gap.`);
  if (soil.status === "error") return na(`Soil data could not be read: ${soil.message}`);
  const d = soil.derived;
  const dominant = soil.components.find((c) => c.name === d.dominantName);
  const top = dominant ? topHorizon(dominant) : null;
  return {
    status: "ok",
    originLine: originLine ?? "",
    source: "USDA NRCS SSURGO soil survey via Soil Data Access (United States only)",
    mapUnit: soil.muName,
    dominantComponent: d.dominantName,
    dominantPct: d.dominantPct,
    textureClass: d.textureClass,
    sandPct: round(d.sandPct, 1),
    siltPct: round(d.siltPct, 1),
    clayPct: round(d.clayPct, 1),
    organicMatterTopPct: round(d.omTopPct, 2),
    phTop: top ? round(top.ph, 1) : null,
    kfTop: d.kfTop,
    hydrologicGroup: d.hydgrp,
    drainageClass: d.drainageClass,
    mappedSlopePct: round(d.mappedSlopePct, 1),
    profileAvailableWaterMm: d.profileAwc ? round(d.profileAwc.mm, 0) : null,
    profileAvailableWaterCoveragePct: d.profileAwc ? round(d.profileAwc.coveragePct, 0) : null,
    profileAvailableWaterIncomplete: d.profileAwc ? d.profileAwc.shallowOrIncomplete : null,
    notIncluded: "The soil survey gives texture, organic matter, pH and water capacity. It has no plant-available nitrogen, phosphorus or potassium, so none is shown.",
  };
}

function climateSection(i: AdvisorInputs): ClimateSection {
  const mean = (q: AnnualSummary["precip"] | undefined, what: string): ClimateSection["annualRainMm"] => {
    if (!q) return na(`${what} summary was not provided.`);
    if (!q.available) return na(q.reason);
    return { value: round(q.meanAnnualMm, 0), years: q.yearsUsedCount, firstYear: q.firstYearUsed, lastYear: q.lastYearUsed, note: `Mean of complete calendar years ${q.firstYearUsed ?? "?"} to ${q.lastYearUsed ?? "?"}.` };
  };
  const s = i.shift;
  return {
    label: CLIMATE_LABEL,
    originLine: i.climateOriginLine,
    annualRainMm: mean(i.annual?.precip, "Rain"),
    annualEt0Mm: mean(i.annual?.et0, "Reference evapotranspiration"),
    julyMeanTmaxC: !i.julyTmax
      ? na("July temperature summary was not provided.")
      : i.julyTmax.available
        ? { value: round(i.julyTmax.meanC, 1) as number, years: i.julyTmax.yearsUsed, firstYear: i.julyTmax.firstYear, lastYear: i.julyTmax.lastYear }
        : na(i.julyTmax.reason),
    shift:
      s.status !== "ok"
        ? na(s.reason)
        : {
            status: "ok",
            overallHeadline: s.overallHeadline,
            overallDetail: s.overallDetail,
            hotDayThresholdC: s.rules.hotDayThresholdC,
            periods: s.periods,
            metrics: Object.values(s.metrics).map((m) => ({
              id: m.id,
              label: m.label,
              unit: m.unit,
              earlyMean: round(m.early.mean, 1),
              lateMean: round(m.late.mean, 1),
              diff: round(m.diff, 1),
              verdict: m.verdict,
              detail: m.detail,
            })),
          },
  };
}

function waterSection(i: AdvisorInputs): WaterSection {
  const r = i.replay;
  if (r.status !== "ok") return na(`${r.reason} ${r.nextStep}`.trim());
  return {
    status: "ok",
    supplyMm: r.supplyMm,
    supplyFromBudget: i.budget && i.budget.status === "ok" ? i.budget.steps : null,
    dataLabel: r.dataLabel,
    notes: r.notes,
    rotations: r.rotations.map((rot) => ({
      name: rot.name,
      crops: rot.cropNames,
      headline: rot.headline,
      seasonsShort: rot.totals.short,
      seasonsJudged: rot.totals.evaluable,
      seasonsNotJudged: rot.totals.insufficient,
      byDecade: rot.decades.map((d, k) => ({ label: DECADES[k]?.label ?? `${d.startYear}–${d.endYear}`, short: d.short, judged: d.evaluable })),
      needMedianMm: round(rot.totals.needMedianMm, 0),
      needMinMm: round(rot.totals.needMinMm, 0),
      needMaxMm: round(rot.totals.needMaxMm, 0),
    })),
  };
}

function landCoverSection(g: GroundTruthResult | null | undefined): AdvisorPayload["landCover"] {
  if (!g) return na("No satellite land-cover record was fetched for this location.");
  if (g.status !== "ok") return na("The satellite land-cover record could not be read for this location.");
  const w = cropHistoryWording(g);
  const years = g.cdl.status === "ok" && g.cdl.data ? g.cdl.data.years.filter((y) => y.majority) : [];
  const classes = Array.from(new Set(years.map((y) => y.majority!.category)));
  return {
    status: "ok",
    notCropland: classes.length > 0 && classes.every((c) => NON_CROP.test(c)),
    classesSeen: classes,
    cropHistory: w.cdl,
    nlcd: w.nlcd,
  };
}

export function buildAdvisorPayload(i: AdvisorInputs): AdvisorPayload {
  const water: Record<string, { short: number; evaluable: number; supplyMm: number }> = {};
  if (i.replay.status === "ok")
    for (const rot of i.replay.rotations) water[rot.name] = { short: rot.totals.short, evaluable: rot.totals.evaluable, supplyMm: (i.replay as { supplyMm: number }).supplyMm };

  const nutrients = compareRotations(i.rotations, i.yields, water);
  const cropIds = Array.from(new Set(i.rotations.flatMap((r) => r.sequence)));
  const yieldsEntered: Record<string, number | null> = {};
  for (const id of cropIds) yieldsEntered[id] = typeof i.yields[id] === "number" ? (i.yields[id] as number) : null;

  const priorities =
    i.replay.status === "ok"
      ? viewPriorities({ order: i.priorityOrder, rotations: i.replay.rotations, nutrients: nutrients.rotations, price: i.price })
      : [];

  const limits = [
    `Climate is ${CLIMATE_LABEL}. It is reanalysis, not a farm sensor.`,
    "The replay is the real 1986 to 2025 weather record applied to your rotation. It is not a forecast.",
    WATER_RESULT_MEANING,
    WATER_RESULT_LIMIT,
    "Yields are farmer-entered assumptions used to estimate nutrient removal, not predictions. Water shortages do not reduce those yields in this app. Nutrient removal does not measure nutrients remaining in the soil or soil-health improvement.",
    NUTRIENT_CAVEAT,
    "Replenishment (nitrogen fixation, residues, fertilizer) is shown only where a source prints a figure; unknown means no figure was found, not zero.",
    "No market prices are connected, so nothing here says what a rotation earns.",
    "Water need comes from FAO-56 crop coefficients; irrigation losses, salinity, and the water already in the soil are not modelled.",
  ];
  limits.push(TERRAIN_CAVEAT);
  const scenario = scenarioSection(i.scenario);
  if (scenario.status === "ok") limits.push(`${scenario.label} Describe it only as a what-if, never as a prediction.`);
  const landCover = landCoverSection(i.groundTruth);
  if (landCover.status === "ok" && landCover.notCropland)
    limits.push(
      `The satellite record puts this point in a class that is not cropland in every year it covers (${landCover.classesSeen.join(", ")}). The replay still applies crop values to it, so read the results as how these crops would have fared in this weather, not as the history of farmland at this point, and do not describe the point as a field.`,
    );
  const region = cropRegionNotice(i.pin.lat, i.pin.lon);
  if (region.warning) limits.push(region.warning);
  const unknownCrops = cropIds.filter((id) => !getCrop(id));
  if (unknownCrops.length) limits.push(`Crops not in the catalog were left out: ${unknownCrops.join(", ")}.`);

  return {
    version: ADVISOR_PAYLOAD_VERSION,
    location: i.pin,
    climate: climateSection(i),
    water: waterSection(i),
    scenario,
    soil: soilSection(i.soil, i.soilOriginLine),
    erosion: i.erosion
      ? { status: "ok" as const, slopePct: round(i.erosion.slopePct, 1), slopeBand: i.erosion.slopeBand?.label ?? null, kf: i.erosion.kf, kfClassRank: i.erosion.kfClassRank, label: i.erosion.label, caveat: TERRAIN_CAVEAT }
      : na("No erosion indicator: it needs both slope and soil erodibility."),
    landCover,
    nutrients: { ...nutrients, caveat: NUTRIENT_CAVEAT, yieldsEntered },
    priorities,
    expertise: expertiseFor(i.pin.id, cropIds),
    limits,
  };
}

/**
 * Every number the payload contains (including digits inside its sentences), as normalised strings. This is the allow-list the
 * Batch 2 guard checks the model's reply against: a numeral in the reply that is not in this set means the reply is rejected.
 */
export function payloadNumerals(payload: AdvisorPayload): Set<string> {
  const out = new Set<string>();
  const addNumber = (n: number) => {
    if (!Number.isFinite(n)) return;
    out.add(String(n));
    // also the rounded forms a reader might print
    for (const dp of [0, 1, 2]) out.add(String(Math.round(n * 10 ** dp) / 10 ** dp));
  };
  const addText = (t: string) => {
    for (const m of t.matchAll(/\d[\d,]*(?:\.\d+)?/g)) {
      const raw = m[0].replace(/,/g, "");
      out.add(raw);
      if (raw.includes(".")) out.add(String(Number(raw)));
    }
  };
  const walk = (v: unknown): void => {
    if (typeof v === "number") addNumber(v);
    else if (typeof v === "string") addText(v);
    else if (Array.isArray(v)) v.forEach(walk);
    else if (v && typeof v === "object") Object.values(v).forEach(walk);
  };
  walk(payload);
  return out;
}
