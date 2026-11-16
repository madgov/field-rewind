/**
 * Pure derived indicators from a list of clear-sky NDVI observations. No I/O.
 * Definitions (and their sources) are in docs/ndvi.md.
 */
import {
  BARE_NDVI_MAX,
  GREENUP_FRACTION,
  GREENUP_MIN_AMPLITUDE,
  MAX_INTERP_GAP_DAYS,
  MIN_OBS_PER_YEAR,
  SMOOTH_STEP_DAYS,
  SMOOTH_WINDOW_STEPS,
  STRESS_DOY_HALF_WINDOW,
  STRESS_MAD_FLOOR,
  STRESS_MIN_COMPARISON_YEARS,
  STRESS_MIN_DROP,
  STRESS_Z_CUTOFF,
} from "./constants";
import type { NdviObservation, NdviSeriesResult } from "./types";

const DAY = 86_400_000;
/** Days since 1970-01-01 for an ISO date. */
export const dayNumber = (iso: string): number => Math.floor(Date.parse(`${iso.slice(0, 10)}T00:00:00Z`) / DAY);
export const isoFromDay = (n: number): string => new Date(n * DAY).toISOString().slice(0, 10);
const yearOf = (iso: string) => Number(iso.slice(0, 4));
export const dayOfYear = (iso: string): number => dayNumber(iso) - dayNumber(`${iso.slice(0, 4)}-01-01`) + 1;

export function median(v: number[]): number {
  const s = [...v].sort((a, b) => a - b);
  const n = s.length;
  return n === 0 ? NaN : n % 2 ? s[(n - 1) / 2] : (s[n / 2 - 1] + s[n / 2]) / 2;
}
/** Median absolute deviation about the median (unscaled). */
export function mad(v: number[]): number {
  const m = median(v);
  return median(v.map((x) => Math.abs(x - m)));
}

const sorted = (obs: NdviObservation[]) => [...obs].filter((o) => Number.isFinite(o.ndvi)).sort((a, b) => a.date.localeCompare(b.date));

// ---------------------------------------------------------------- peaks

export type YearPeak = {
  year: number;
  /** Number of clear observations in the calendar year. */
  nObs: number;
  /** Highest clear NDVI of the year; null when the year has no clear observation. */
  peak: number | null;
  peakDate: string | null;
  /** nObs below MIN_OBS_PER_YEAR: the peak may have been missed between clouds. */
  sparse: boolean;
};

/** Per calendar year: highest clear-sky NDVI. Years inside [first, last] with no observation are listed with peak null. */
export function yearlyPeaks(observations: NdviObservation[], range?: { from: number; to: number }): YearPeak[] {
  const obs = sorted(observations);
  const years = obs.map((o) => yearOf(o.date));
  const from = range?.from ?? (years.length ? Math.min(...years) : 0);
  const to = range?.to ?? (years.length ? Math.max(...years) : -1);
  const out: YearPeak[] = [];
  for (let y = from; y <= to; y++) {
    const inYear = obs.filter((o) => yearOf(o.date) === y);
    let best: NdviObservation | null = null;
    for (const o of inYear) if (!best || o.ndvi > best.ndvi) best = o;
    out.push({ year: y, nObs: inYear.length, peak: best?.ndvi ?? null, peakDate: best?.date ?? null, sparse: inYear.length < MIN_OBS_PER_YEAR });
  }
  return out;
}

// ---------------------------------------------------------------- interpolation and display smoothing

/** Linear interpolation between neighbouring clear observations. null when the date is outside the record or the surrounding gap exceeds maxGapDays. */
export function interpolateAt(obs: NdviObservation[], day: number, maxGapDays = MAX_INTERP_GAP_DAYS): number | null {
  let lo: NdviObservation | null = null;
  let hi: NdviObservation | null = null;
  for (const o of obs) {
    const d = dayNumber(o.date);
    if (d <= day) lo = o;
    if (d >= day) {
      hi = o;
      break;
    }
  }
  if (!lo || !hi) return null;
  const d0 = dayNumber(lo.date);
  const d1 = dayNumber(hi.date);
  if (d1 === d0) return lo.ndvi;
  if (d1 - d0 > maxGapDays) return null;
  return lo.ndvi + ((hi.ndvi - lo.ndvi) * (day - d0)) / (d1 - d0);
}

export type CurvePoint = { date: string; ndvi: number | null };

/** Raw linear-interpolation curve for one calendar year at `stepDays` spacing (used for detection; not smoothed). */
export function interpolatedYearCurve(observations: NdviObservation[], year: number, stepDays = 1): CurvePoint[] {
  const obs = sorted(observations);
  const start = dayNumber(`${year}-01-01`);
  const end = dayNumber(`${year}-12-31`);
  const out: CurvePoint[] = [];
  for (let d = start; d <= end; d += stepDays) {
    const v = interpolateAt(obs, d);
    out.push({ date: isoFromDay(d), ndvi: v === null ? null : v });
  }
  return out;
}

/**
 * DISPLAY ONLY. Curve for one year: linear interpolation at 5-day steps, then a centred 3-step (15-day) moving average
 * over the available neighbours. Steps with no estimate (gap > 60 days or outside the record) stay null. Never used for
 * peaks, green-up, bare periods or stress flags.
 */
export function smoothedYearCurve(observations: NdviObservation[], year: number): CurvePoint[] {
  const raw = interpolatedYearCurve(observations, year, SMOOTH_STEP_DAYS);
  const half = Math.floor(SMOOTH_WINDOW_STEPS / 2);
  return raw.map((p, i) => {
    if (p.ndvi === null) return p;
    const vals: number[] = [];
    for (let k = i - half; k <= i + half; k++) {
      const v = raw[k]?.ndvi;
      if (typeof v === "number") vals.push(v);
    }
    return { date: p.date, ndvi: Math.round((vals.reduce((a, b) => a + b, 0) / vals.length) * 1000) / 1000 };
  });
}

// ---------------------------------------------------------------- green-up

export type GreenUp = {
  year: number;
  /** Estimated green-up date, or null with a reason. */
  date: string | null;
  /** The two clear observations that straddle the threshold crossing; the true crossing lies between them. */
  bracket: { before: string; after: string } | null;
  /** Width of the bracket in days: the sampling uncertainty (the true crossing could be anywhere in it). */
  uncertaintyDays: number | null;
  threshold: number | null;
  seasonalMin: number | null;
  seasonalPeak: number | null;
  amplitude: number | null;
  reason?: string;
};

/**
 * Green-up date for one calendar year (amplitude-threshold method; White et al. 1997, Jonsson and Eklundh 2002):
 *  1. Interpolate the clear observations linearly to daily values (gaps over 60 days give no estimate).
 *  2. Seasonal peak = highest interpolated value of the year, on peakDay.
 *  3. Seasonal minimum = lowest interpolated value from Jan 1 up to peakDay.
 *  4. amplitude = peak - min. If amplitude < 0.15 there is no clear green-up.
 *  5. threshold = min + 0.5 * amplitude. Green-up = the first day, searching forward from the minimum, where interpolated NDVI >= threshold.
 * The date is bracketed by the two observations around the crossing; the bracket width is the uncertainty.
 */
export function greenUpForYear(observations: NdviObservation[], year: number): GreenUp {
  const none = (reason: string, extra: Partial<GreenUp> = {}): GreenUp => ({ year, date: null, bracket: null, uncertaintyDays: null, threshold: null, seasonalMin: null, seasonalPeak: null, amplitude: null, reason, ...extra });
  const obs = sorted(observations);
  const nYear = obs.filter((o) => yearOf(o.date) === year).length;
  if (nYear < 3) return none(`Only ${nYear} clear observation${nYear === 1 ? "" : "s"} in ${year}.`);
  const curve = interpolatedYearCurve(obs, year, 1);
  let peakIdx = -1;
  curve.forEach((p, i) => {
    if (p.ndvi !== null && (peakIdx < 0 || p.ndvi > (curve[peakIdx].ndvi as number))) peakIdx = i;
  });
  if (peakIdx < 0) return none("No interpolated values (gaps between clear observations are too long).");
  const peak = curve[peakIdx].ndvi as number;
  let minIdx = -1;
  for (let i = 0; i <= peakIdx; i++) {
    const v = curve[i].ndvi;
    if (v !== null && (minIdx < 0 || v < (curve[minIdx].ndvi as number))) minIdx = i;
  }
  const min = curve[minIdx].ndvi as number;
  const amp = peak - min;
  const base = { seasonalMin: min, seasonalPeak: peak, amplitude: amp };
  if (amp < GREENUP_MIN_AMPLITUDE) return none(`The seasonal rise (${amp.toFixed(2)}) is below ${GREENUP_MIN_AMPLITUDE}, so there is no clear green-up.`, base);
  const thr = min + GREENUP_FRACTION * amp;
  let crossIdx = -1;
  for (let i = minIdx; i <= peakIdx; i++) {
    const v = curve[i].ndvi;
    if (v !== null && v >= thr) {
      crossIdx = i;
      break;
    }
  }
  if (crossIdx < 0) return none("The curve never reached the threshold.", { ...base, threshold: thr });
  const crossDay = dayNumber(curve[crossIdx].date);
  const before = [...obs].reverse().find((o) => dayNumber(o.date) <= crossDay && o.ndvi < thr) ?? [...obs].reverse().find((o) => dayNumber(o.date) <= crossDay);
  const after = obs.find((o) => dayNumber(o.date) >= crossDay && o.ndvi >= thr) ?? obs.find((o) => dayNumber(o.date) >= crossDay);
  const bracket = before && after ? { before: before.date, after: after.date } : null;
  if (bracket && dayNumber(bracket.after) - dayNumber(bracket.before) > MAX_INTERP_GAP_DAYS) {
    return none(`The crossing falls in a gap of more than ${MAX_INTERP_GAP_DAYS} days between clear observations (${bracket.before} to ${bracket.after}).`, { ...base, threshold: Math.round(thr * 1000) / 1000 });
  }
  return { year, date: curve[crossIdx].date, bracket, uncertaintyDays: bracket ? Math.max(1, dayNumber(bracket.after) - dayNumber(bracket.before)) : null, threshold: Math.round(thr * 1000) / 1000, seasonalMin: min, seasonalPeak: peak, amplitude: amp };
}

// ---------------------------------------------------------------- bare periods

export type BarePeriod = {
  /** First and last clear observation of the run that are at or below the threshold. */
  start: string;
  end: string;
  nObs: number;
  minNdvi: number;
  /** The bare spell could have begun as early as this day (the day after the last clear observation above the threshold), or null at the start of the record. */
  earliestStart: string | null;
  /** ... and ended as late as this day (the day before the next clear observation above the threshold), or null at the end of the record. */
  latestEnd: string | null;
};

/**
 * Runs of consecutive clear observations with NDVI below `threshold` (default 0.2, bare or nearly bare ground; NASA Earth
 * Observatory puts barren ground at 0.1 and below and sparse vegetation at 0.2 to 0.3). Observations are the only evidence:
 * the period is "start to end" of the observed run, and earliestStart / latestEnd give how far it could extend.
 * A run is split when two consecutive below-threshold observations are more than MAX_INTERP_GAP_DAYS apart.
 */
export function barePeriods(observations: NdviObservation[], threshold = BARE_NDVI_MAX): BarePeriod[] {
  const obs = sorted(observations);
  const out: BarePeriod[] = [];
  let run: NdviObservation[] = [];
  let prevAbove: NdviObservation | null = null;
  const close = (nextAbove: NdviObservation | null) => {
    if (!run.length) return;
    out.push({
      start: run[0].date,
      end: run[run.length - 1].date,
      nObs: run.length,
      minNdvi: Math.min(...run.map((o) => o.ndvi)),
      earliestStart: prevAbove ? isoFromDay(dayNumber(prevAbove.date) + 1) : null,
      latestEnd: nextAbove ? isoFromDay(dayNumber(nextAbove.date) - 1) : null,
    });
    run = [];
  };
  for (const o of obs) {
    if (o.ndvi < threshold) {
      if (run.length && dayNumber(o.date) - dayNumber(run[run.length - 1].date) > MAX_INTERP_GAP_DAYS) {
        close(null);
        prevAbove = null;
      }
      run.push(o);
    } else {
      close(o);
      prevAbove = o;
    }
  }
  close(null);
  return out;
}

// ---------------------------------------------------------------- stress flags

export type StressFlag = {
  date: string;
  ndvi: number;
  satellite: string;
  /** Median NDVI of the comparison years around this day of year. */
  typical: number;
  /** typical - ndvi, always positive. */
  drop: number;
  /** Modified z-score (Iglewicz and Hoaglin): 0.6745 * (x - median) / MAD, with MAD floored. */
  robustZ: number;
  comparisonYears: number;
};

/**
 * Flag a clear observation as unusually low for this pin. For observation x on day-of-year d in year Y:
 *  - Comparison set: one value per OTHER year = the mean NDVI of that year's clear observations within +-15 days of d (circular).
 *  - Need at least 5 comparison years, else no judgement is made.
 *  - typical = median of the comparison values; spread = MAD of them, floored at 0.03.
 *  - Modified z = 0.6745 * (x - typical) / spread. Flag when z <= -3.5 (Iglewicz and Hoaglin 1993 cutoff) AND the drop is at least 0.15 NDVI.
 * Only drops are flagged. This marks unusually low greenness; it cannot tell drought from a different crop, harvest timing or haze.
 */
export function stressFlags(observations: NdviObservation[]): StressFlag[] {
  const obs = sorted(observations);
  const byYear = new Map<number, { doy: number; ndvi: number }[]>();
  for (const o of obs) {
    const y = yearOf(o.date);
    (byYear.get(y) ?? byYear.set(y, []).get(y)!).push({ doy: dayOfYear(o.date), ndvi: o.ndvi });
  }
  const out: StressFlag[] = [];
  for (const o of obs) {
    const y = yearOf(o.date);
    const d = dayOfYear(o.date);
    const vals: number[] = [];
    for (const [yy, list] of byYear) {
      if (yy === y) continue;
      const near = list.filter((p) => {
        const diff = Math.abs(p.doy - d);
        return Math.min(diff, 365 - diff) <= STRESS_DOY_HALF_WINDOW;
      });
      if (near.length) vals.push(near.reduce((a, p) => a + p.ndvi, 0) / near.length);
    }
    if (vals.length < STRESS_MIN_COMPARISON_YEARS) continue;
    const typical = median(vals);
    const spread = Math.max(mad(vals), STRESS_MAD_FLOOR);
    const z = (0.6745 * (o.ndvi - typical)) / spread;
    const drop = typical - o.ndvi;
    if (z <= STRESS_Z_CUTOFF && drop >= STRESS_MIN_DROP) {
      out.push({ date: o.date, ndvi: o.ndvi, satellite: o.satellite, typical: Math.round(typical * 1000) / 1000, drop: Math.round(drop * 1000) / 1000, robustZ: Math.round(z * 10) / 10, comparisonYears: vals.length });
    }
  }
  return out;
}

// ---------------------------------------------------------------- everything together

export type NdviIndicators = {
  status: "ok" | "no-observations";
  nObservations: number;
  /** Per-year series for charts: calendar year to its clear observations. */
  perYear: { year: number; observations: { date: string; ndvi: number; satellite: string }[] }[];
  peaks: YearPeak[];
  /** Median of the yearly peaks over years that are not sparse; null when there are none. */
  typicalPeak: { median: number; years: number } | null;
  greenUps: GreenUp[];
  barePeriods: BarePeriod[];
  bareThreshold: number;
  stressFlags: StressFlag[];
  definitions: { greenUpFraction: number; minObsPerYear: number; maxGapDays: number; stressZ: number; stressMinDrop: number; stressMinYears: number };
};

/** Compute every indicator from a result's observations. Works on live, cached and saved results alike. */
export function computeNdviIndicators(result: Pick<NdviSeriesResult, "observations">, opts: { greenUpYears?: number[] } = {}): NdviIndicators {
  const obs = sorted(result.observations);
  const peaks = yearlyPeaks(obs);
  const reliable = peaks.filter((p) => p.peak !== null && !p.sparse).map((p) => p.peak as number);
  const years = peaks.map((p) => p.year);
  const guYears = opts.greenUpYears ?? years;
  return {
    status: obs.length ? "ok" : "no-observations",
    nObservations: obs.length,
    perYear: peaks.map((p) => ({ year: p.year, observations: obs.filter((o) => yearOf(o.date) === p.year).map((o) => ({ date: o.date, ndvi: o.ndvi, satellite: o.satellite })) })),
    peaks,
    typicalPeak: reliable.length ? { median: Math.round(median(reliable) * 1000) / 1000, years: reliable.length } : null,
    greenUps: guYears.map((y) => greenUpForYear(obs, y)),
    barePeriods: barePeriods(obs),
    bareThreshold: BARE_NDVI_MAX,
    stressFlags: stressFlags(obs),
    definitions: { greenUpFraction: GREENUP_FRACTION, minObsPerYear: MIN_OBS_PER_YEAR, maxGapDays: MAX_INTERP_GAP_DAYS, stressZ: STRESS_Z_CUTOFF, stressMinDrop: STRESS_MIN_DROP, stressMinYears: STRESS_MIN_COMPARISON_YEARS },
  };
}
