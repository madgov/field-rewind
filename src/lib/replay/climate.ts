/**
 * Daily series prepared ONCE per PowerResult (ET0 is the expensive part) and reused by every rotation,
 * every crop and every supply value. Pure data in, plain arrays out; no I/O.
 */
import { et0FromDailyRecord } from "../et0/fao56";
import type { PowerResult } from "../types";
import { daysInMonth, isoToDayNum, monthKeyOfDayNum } from "./dates";
import type { SeasonNeed } from "./types";

export type MonthPrecip = {
  /** Sum of precipitation over the calendar month's days that have a value, mm. */
  totalMm: number;
  /** Days of the calendar month with a precipitation value. */
  availableDays: number;
};

export type PreparedClimate = {
  latDeg: number;
  elevationM: number;
  /** Day numbers of the first and last day present in the record. */
  firstDay: number;
  lastDay: number;
  /** Indexed by (dayNum - firstDay). NaN = missing or absent from the record. */
  et0: Float64Array;
  precip: Float64Array;
  tMax: Float64Array;
  /** monthKey (year*12 + month0) -> precipitation totals for the month. */
  months: Map<number, MonthPrecip>;
  firstDate: string;
  lastDate: string;
  /** Per-crop, per-year cache of supply-independent season results. Keyed by the catalog crop object. */
  needCache: WeakMap<object, Map<number, SeasonNeed>>;
  source: Pick<PowerResult, "origin" | "fetchedAt" | "lat" | "lon" | "elevationM">;
};

export type PrepareResult =
  | { ok: true; climate: PreparedClimate }
  | { ok: false; reason: string; nextStep: string };

export function prepareClimate(power: PowerResult): PrepareResult {
  if (power.status === "error" || power.status === "no-coverage") {
    return {
      ok: false,
      reason: power.message ?? `NASA POWER returned status "${power.status}" for this location.`,
      nextStep:
        power.status === "no-coverage"
          ? "Pick a location NASA POWER covers, or try one of the demo pins."
          : "Check the connection and try again, or open one of the demo pins that works from a saved response.",
    };
  }
  if (!power.days.length) {
    return {
      ok: false,
      reason: "The NASA POWER record for this location contains no days.",
      nextStep: "Try again, or open one of the demo pins.",
    };
  }
  if (power.elevationM === null) {
    return {
      ok: false,
      reason:
        "NASA POWER gave no elevation for this grid cell, and the app never assumes one, so crop water demand (ET0) cannot be computed.",
      nextStep: "Try a nearby location, or open one of the demo pins.",
    };
  }
  const elevation = power.elevationM;

  let first = Infinity;
  let last = -Infinity;
  const nums = new Array<number>(power.days.length);
  for (let i = 0; i < power.days.length; i++) {
    const n = isoToDayNum(power.days[i].date);
    nums[i] = n;
    if (n < first) first = n;
    if (n > last) last = n;
  }
  const len = last - first + 1;
  const et0 = new Float64Array(len).fill(NaN);
  const precip = new Float64Array(len).fill(NaN);
  const tMax = new Float64Array(len).fill(NaN);
  const months = new Map<number, MonthPrecip>();
  for (let i = 0; i < power.days.length; i++) {
    const rec = power.days[i];
    const off = nums[i] - first;
    const e = et0FromDailyRecord(rec, power.lat, elevation);
    if (e !== null && Number.isFinite(e)) et0[off] = e;
    // A negative or non-finite precipitation value is not physical: treated as missing, never repaired.
    if (rec.precipMm !== null && Number.isFinite(rec.precipMm) && rec.precipMm >= 0) {
      precip[off] = rec.precipMm;
      const key = monthKeyOfDayNum(nums[i]);
      let m = months.get(key);
      if (!m) {
        m = { totalMm: 0, availableDays: 0 };
        months.set(key, m);
      }
      m.totalMm += rec.precipMm;
      m.availableDays += 1;
    }
    if (rec.tMaxC !== null && Number.isFinite(rec.tMaxC)) tMax[off] = rec.tMaxC;
  }
  return {
    ok: true,
    climate: {
      latDeg: power.lat,
      elevationM: elevation,
      firstDay: first,
      lastDay: last,
      et0,
      precip,
      tMax,
      months,
      firstDate: power.days.find((d) => isoToDayNum(d.date) === first)!.date,
      lastDate: power.days.find((d) => isoToDayNum(d.date) === last)!.date,
      needCache: new WeakMap(),
      source: { origin: power.origin, fetchedAt: power.fetchedAt, lat: power.lat, lon: power.lon, elevationM: power.elevationM },
    },
  };
}

const cache = new WeakMap<PowerResult, PrepareResult>();

/** prepareClimate with a per-object cache: the same PowerResult object is only processed once. */
export function getClimate(power: PowerResult): PrepareResult {
  let r = cache.get(power);
  if (!r) {
    r = prepareClimate(power);
    cache.set(power, r);
  }
  return r;
}

export function monthDaysMissingPrecip(climate: PreparedClimate, monthKey: number): number {
  const year = Math.floor(monthKey / 12);
  const month1 = (monthKey % 12) + 1;
  const have = climate.months.get(monthKey)?.availableDays ?? 0;
  return daysInMonth(year, month1) - have;
}
