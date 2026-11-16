/**
 * Season evaluation. Rule evaluation only: takes a prepared daily climate (see climate.ts) and plain inputs.
 *
 *   ETc            = sum over season days of Kc(day) x ET0(day)                  (mm)
 *   effective rain = USDA-SCS monthly formula, pro-rated to season days          (mm)
 *   irrigation need = max(0, ETc - effective rain)                               (mm)
 *   outcome vs supply: "short" (red) when need > supply, otherwise "ok" (green)
 *
 * Missing data is never filled. Days with no ET0 add nothing to ETc (a slight under-count of the need) and are counted.
 * A season with more than 10 days missing ET0, or more than 10 days missing rainfall, is grey (not judged).
 */
import type { Crop } from "../crops/types";
import { type PreparedClimate, monthDaysMissingPrecip } from "./climate";
import { resolveCrop } from "./crop";
import { seasonEffectiveRain } from "./effectiveRain";
import { monthKeyOfDayNum } from "./dates";
import { kcCurve } from "./kc";
import { seasonDates } from "./season";
import { MAX_MISSING_SEASON_DAYS, type ResolvedCrop, type SeasonNeed, type SeasonResult } from "./types";

const resolveCache = new WeakMap<Crop, ReturnType<typeof resolveCrop>>();
export function resolveCropCached(crop: Crop): ReturnType<typeof resolveCrop> {
  let r = resolveCache.get(crop);
  if (!r) {
    r = resolveCrop(crop);
    resolveCache.set(crop, r);
  }
  return r;
}

const kcCache = new WeakMap<ResolvedCrop, number[]>();
function curveFor(c: ResolvedCrop): number[] {
  let k = kcCache.get(c);
  if (!k) {
    k = kcCurve(c);
    kcCache.set(c, k);
  }
  return k;
}

function computeNeed(climate: PreparedClimate, crop: ResolvedCrop, year: number): SeasonNeed {
  const dates = seasonDates(crop, year);
  const kc = curveFor(crop);
  const lastOff = climate.lastDay - climate.firstDay;

  let etc = 0;
  let missingEt0 = 0;
  let missingPrecip = 0;
  let missingTMax = 0;
  let heat = 0;
  const seasonRainByMonth = new Map<number, number>();

  for (let d = dates.startDayNum; d <= dates.endDayNum; d++) {
    const off = d - climate.firstDay;
    const key = monthKeyOfDayNum(d);
    if (!seasonRainByMonth.has(key)) seasonRainByMonth.set(key, 0);
    if (off < 0 || off > lastOff) {
      missingEt0++;
      missingPrecip++;
      missingTMax++;
      continue;
    }
    const e = climate.et0[off];
    if (Number.isNaN(e)) missingEt0++;
    else etc += kc[d - dates.startDayNum] * e;
    const p = climate.precip[off];
    if (Number.isNaN(p)) missingPrecip++;
    else seasonRainByMonth.set(key, (seasonRainByMonth.get(key) ?? 0) + p);
    const t = climate.tMax[off];
    if (Number.isNaN(t)) missingTMax++;
    else if (crop.heatThresholdC !== null && t > crop.heatThresholdC) heat++;
  }

  let missingPrecipMonthDays = 0;
  for (const key of seasonRainByMonth.keys()) missingPrecipMonthDays += monthDaysMissingPrecip(climate, key);

  const base = {
    year,
    cropId: crop.id,
    cropName: crop.name,
    plantingDate: dates.plantingDate,
    endDate: dates.endDate,
    lengthDays: dates.lengthDays,
    heatThresholdC: crop.heatThresholdC,
    missingEt0Days: missingEt0,
    missingPrecipSeasonDays: missingPrecip,
    missingPrecipMonthDays,
    missingTMaxDays: missingTMax,
  };
  const grey = (reason: string): SeasonNeed => ({
    ...base,
    status: "insufficient-data",
    reason,
    etcMm: null,
    effectiveRainMm: null,
    needMm: null,
    heatDays: null,
  });

  if (dates.startDayNum < climate.firstDay || dates.endDayNum > climate.lastDay) {
    return grey(
      `The season runs ${dates.plantingDate} to ${dates.endDate}, but the climate record only covers ${climate.firstDate} to ${climate.lastDate}.`,
    );
  }
  if (missingEt0 > MAX_MISSING_SEASON_DAYS) {
    return grey(
      `${missingEt0} of the season's ${dates.lengthDays} days have no crop water demand (ET0) value; more than ${MAX_MISSING_SEASON_DAYS} missing days is too many to judge the season.`,
    );
  }
  if (missingPrecip > MAX_MISSING_SEASON_DAYS) {
    return grey(
      `${missingPrecip} of the season's ${dates.lengthDays} days have no rainfall value; more than ${MAX_MISSING_SEASON_DAYS} missing days is too many to judge the season, because the rain that offsets the crop's need would be undercounted.`,
    );
  }

  const months = [...seasonRainByMonth.entries()].map(([key, seasonRain]) => ({
    monthTotalMm: climate.months.get(key)?.totalMm ?? 0,
    seasonRainMm: seasonRain,
  }));
  const eff = seasonEffectiveRain(months);
  return {
    ...base,
    status: "evaluated",
    etcMm: etc,
    effectiveRainMm: eff,
    needMm: Math.max(0, etc - eff),
    // Unknown threshold: hot days are unknown (null), never 0.
    heatDays: crop.heatThresholdC === null ? null : heat,
  };
}

/** Supply-independent season evaluation, cached per (climate, crop, year). */
export function seasonNeed(climate: PreparedClimate, crop: ResolvedCrop, year: number): SeasonNeed {
  let perCrop = climate.needCache.get(crop.source);
  if (!perCrop) {
    perCrop = new Map();
    climate.needCache.set(crop.source, perCrop);
  }
  let n = perCrop.get(year);
  if (!n) {
    n = computeNeed(climate, crop, year);
    perCrop.set(year, n);
  }
  return n;
}

export function validateSupply(supplyMm: number): string | null {
  if (typeof supplyMm !== "number" || !Number.isFinite(supplyMm)) return "The water supply must be a finite number of mm.";
  if (supplyMm < 0) return "The water supply cannot be negative.";
  return null;
}

/** Applies a supply to a season's need. */
export function judgeSeason(need: SeasonNeed, supplyMm: number): SeasonResult {
  const bad = validateSupply(supplyMm);
  if (bad) throw new RangeError(bad);
  if (need.status !== "evaluated" || need.needMm === null) {
    return { ...need, supplyMm, outcome: null, marginMm: null, needFractionOfSupply: null };
  }
  return {
    ...need,
    supplyMm,
    outcome: need.needMm > supplyMm ? "short" : "ok",
    marginMm: supplyMm - need.needMm,
    needFractionOfSupply: supplyMm > 0 ? need.needMm / supplyMm : null,
  };
}

/** Evaluate one crop's season (harvest year `year`) against a supply. */
export function evaluateSeason(climate: PreparedClimate, crop: Crop | ResolvedCrop, year: number, supplyMm: number): SeasonResult {
  let rc: ResolvedCrop;
  if ("kcIni" in crop) rc = crop;
  else {
    const r = resolveCropCached(crop);
    if (!r.ok) throw new Error(r.reason);
    rc = r.crop;
  }
  return judgeSeason(seasonNeed(climate, rc, year), supplyMm);
}
