import { et0FromDailyRecord } from "../et0/fao56";
import type { PowerResult } from "../types";
import { CLEAR_PHRASE } from "./direction";
import type { MetricId, MetricShift, PeriodStats, ShiftResult, ShiftVerdict, YearValue } from "./types";

export const EARLY_PERIOD: [number, number] = [1985, 2004];
export const LATE_PERIOD: [number, number] = [2006, 2025];
export const HOT_DAY_THRESHOLD_C = 35;
export const MAX_MISSING_DAYS_PER_YEAR = 10;
export const MIN_YEARS_PER_PERIOD = 15;
/** A gap must exceed this many standard errors to count as clear. */
export const CLEAR_CHANGE_SE_MULTIPLE = 2;

export const CLEAR_CHANGE_RULE =
  "A change counts as clear only if the gap between the two 20-year averages is more than twice the year-to-year noise " +
  "(the combined year-to-year spread of each period, scaled by how many years it has), and is big enough to still show as a non-zero number after rounding.";

const NO_ELEVATION_REASON =
  "NASA POWER gave no elevation for this grid cell, and the app never assumes one, so crop water demand (ET0) cannot be computed.";

function isLeapYear(y: number): boolean {
  return (y % 4 === 0 && y % 100 !== 0) || y % 400 === 0;
}

function periodOf(year: number): YearValue["period"] {
  if (year >= EARLY_PERIOD[0] && year <= EARLY_PERIOD[1]) return "early";
  if (year >= LATE_PERIOD[0] && year <= LATE_PERIOD[1]) return "late";
  return "none";
}

type DayAgg = { present: number; missing: number; sum: number };

/** Per-year totals for one metric. `perDay` returns the day's contribution, or null if its inputs are missing. */
function yearValues(
  power: Pick<PowerResult, "days">,
  perDay: ((rec: PowerResult["days"][number]) => number | null) | null,
): YearValue[] {
  const agg = new Map<number, DayAgg>();
  for (const rec of power.days) {
    const year = Number(rec.date.slice(0, 4));
    let a = agg.get(year);
    if (!a) {
      a = { present: 0, missing: 0, sum: 0 };
      agg.set(year, a);
    }
    a.present += 1;
    const v = perDay ? perDay(rec) : null;
    if (v === null) a.missing += 1;
    else a.sum += v;
  }
  return [...agg.entries()]
    .sort((x, y) => x[0] - y[0])
    .map(([year, a]) => {
      const daysInYear = isLeapYear(year) ? 366 : 365;
      const absent = Math.max(0, daysInYear - a.present);
      const missingDays = a.missing + absent;
      const flagged = a.present < daysInYear || a.missing > MAX_MISSING_DAYS_PER_YEAR || perDay === null;
      return { year, value: flagged ? null : a.sum, missingDays, flagged, period: periodOf(year) };
    });
}

function periodStats(years: YearValue[], range: [number, number], p: "early" | "late"): PeriodStats & { values: number[] } {
  const inPeriod = years.filter((y) => y.period === p);
  const values = inPeriod.filter((y) => !y.flagged && y.value !== null).map((y) => y.value as number);
  const mean = values.length >= MIN_YEARS_PER_PERIOD ? values.reduce((s, v) => s + v, 0) / values.length : null;
  return {
    startYear: range[0],
    endYear: range[1],
    mean,
    yearsUsed: values.length,
    flaggedYears: inPeriod.filter((y) => y.flagged).map((y) => y.year),
    values,
  };
}

function sampleVariance(v: number[]): number {
  const m = v.reduce((s, x) => s + x, 0) / v.length;
  return v.reduce((s, x) => s + (x - m) ** 2, 0) / (v.length - 1);
}

// ---------- wording ----------

/** Round to whole number without ever producing -0. */
export function roundInt(x: number): number {
  const r = Math.round(Math.abs(x)) * Math.sign(x);
  return r === 0 ? 0 : r;
}

/** The difference the card prints: round(late mean) - round(early mean), so the sentence adds up on screen. 0 when either mean is missing. */
export function shownDiff(m: { early: { mean: number | null }; late: { mean: number | null } }): number {
  if (m.early.mean === null || m.late.mean === null) return 0;
  return roundInt(m.late.mean) - roundInt(m.early.mean);
}

function plural(n: number, one: string, many: string): string {
  return n === 1 ? `${n} ${one}` : `${n.toLocaleString("en-US")} ${many}`;
}

const META: Record<MetricId, { label: string; unit: MetricShift["unit"]; noun: string }> = {
  hotDays: { label: `Days over ${HOT_DAY_THRESHOLD_C} °C`, unit: "days per year", noun: `days over ${HOT_DAY_THRESHOLD_C} °C` },
  et0: { label: "Crop water demand (ET0)", unit: "mm per year", noun: "crop water demand (ET0)" },
  precip: { label: "Rainfall", unit: "mm per year", noun: "rainfall" },
};

function amount(id: MetricId, n: number): string {
  const r = Math.abs(roundInt(n));
  return id === "hotDays" ? plural(r, "day", "days") : `${r.toLocaleString("en-US")} mm`;
}

function meanText(id: MetricId, n: number): string {
  const r = roundInt(n);
  return id === "hotDays" ? `${plural(r, "day", "days")} a year` : `${r.toLocaleString("en-US")} mm a year`;
}

function headlineFor(id: MetricId, verdict: ShiftVerdict, diff: number | null, reason?: string): string {
  if (verdict === "insufficient-data") return reason ? "Not available" : "Not enough data";
  if (verdict === "no-clear-change" || diff === null) return "No clear change";
  const up = verdict === "increase";
  const a = amount(id, diff);
  if (id === "hotDays") {
    const n = Math.abs(roundInt(diff));
    const unit = n === 1 ? "day" : "days";
    return up ? `${n.toLocaleString("en-US")} more ${unit} a year` : `${n.toLocaleString("en-US")} fewer ${unit} a year`;
  }
  if (id === "et0") return `Water demand ${up ? "up" : "down"} ${a} a year`;
  return `Rain ${up ? "up" : "down"} ${a} a year`;
}

function detailFor(
  id: MetricId,
  verdict: ShiftVerdict,
  early: PeriodStats,
  late: PeriodStats,
  diff: number | null,
  pct: number | null,
  reason?: string,
): string {
  const e = `${early.startYear}–${early.endYear}`;
  const l = `${late.startYear}–${late.endYear}`;
  const noun = META[id].noun;
  if (verdict === "insufficient-data" || early.mean === null || late.mean === null || diff === null) {
    if (reason) return `${cap(noun)} cannot be compared: ${reason}`;
    return (
      `There is not enough complete data to compare ${noun} between ${e} and ${l}: ` +
      `${early.yearsUsed} usable years in the first period and ${late.yearsUsed} in the second (at least ${MIN_YEARS_PER_PERIOD} needed in each).`
    );
  }
  const used =
    early.yearsUsed < 20 || late.yearsUsed < 20
      ? ` (using ${early.yearsUsed} usable years in the first period and ${late.yearsUsed} in the second)`
      : "";
  const base = `${e} averaged ${meanText(id, early.mean)} and ${l} averaged ${meanText(id, late.mean)}${used}`;
  if (verdict === "no-clear-change") {
    const r = roundInt(diff);
    const gap =
      r === 0
        ? "essentially the same"
        : `${diffText(id, diff)}, which is within normal year-to-year swings`;
    return `For ${noun}, ${base}: ${gap}. That is no clear change.`;
  }
  const pctText = pct === null || roundInt(pct) === 0 ? "" : `, about ${Math.abs(roundInt(pct))}% ${pctWord(id, diff > 0)}`;
  return `For ${noun}, ${base}: ${diffText(id, diff)}${pctText}.`;
}

function pctWord(id: MetricId, up: boolean): string {
  if (id === "hotDays") return up ? "more" : "fewer";
  if (id === "et0") return up ? "higher" : "lower";
  return up ? "more" : "less";
}

/** "6 fewer days", "38 mm lower", "98 mm more rain" */
function diffText(id: MetricId, diff: number): string {
  const up = diff > 0;
  if (id === "hotDays") {
    const n = Math.abs(roundInt(diff));
    return `${n.toLocaleString("en-US")} ${up ? "more" : "fewer"} ${n === 1 ? "day" : "days"} a year`;
  }
  if (id === "et0") return `${amount(id, diff)} ${up ? "higher" : "lower"}`;
  return `${amount(id, diff)} ${up ? "more" : "less"} rain`;
}

function cap(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

// ---------- metric ----------

function buildMetric(id: MetricId, years: YearValue[], unavailableReason?: string): MetricShift {
  const early = periodStats(years, EARLY_PERIOD, "early");
  const late = periodStats(years, LATE_PERIOD, "late");
  let diff: number | null = null;
  let pct: number | null = null;
  let se: number | null = null;
  let shown: number | null = null;
  let verdict: ShiftVerdict = "insufficient-data";

  if (early.mean !== null && late.mean !== null) {
    diff = late.mean - early.mean;
    pct = early.mean !== 0 ? (diff / early.mean) * 100 : null;
    se = Math.sqrt(sampleVariance(early.values) / early.values.length + sampleVariance(late.values) / late.values.length);
    // se === 0 means every year within each period is identical: any non-zero gap is clear, zero gap is not.
    const clear = se === 0 ? diff !== 0 : Math.abs(diff) > CLEAR_CHANGE_SE_MULTIPLE * se;
    // The displayed number must agree with the verdict: a gap that rounds to zero is never "clear".
    // Text shows round(late mean) - round(early mean) so the sentence adds up on screen; the guard uses that same number.
    shown = shownDiff({ early, late });
    verdict = clear && shown !== 0 ? (diff > 0 ? "increase" : "decrease") : "no-clear-change";
  }

  const { values: _e, ...earlyStats } = early;
  const { values: _l, ...lateStats } = late;
  void _e;
  void _l;
  return {
    id,
    label: META[id].label,
    unit: META[id].unit,
    years,
    early: earlyStats,
    late: lateStats,
    diff,
    pctChange: pct,
    standardError: se,
    verdict,
    headline: headlineFor(id, verdict, shown, unavailableReason),
    detail: detailFor(id, verdict, earlyStats, lateStats, shown, pct, unavailableReason),
  };
}

// ---------- overall ----------

function joinList(items: string[], conj: "and" | "or" = "and"): string {
  if (items.length <= 1) return items.join("");
  if (items.length === 2) return `${items[0]} ${conj} ${items[1]}`;
  return items.slice(0, -1).join(", ") + `, ${conj} ` + items[items.length - 1];
}

function overall(metrics: Record<MetricId, MetricShift>): { headline: string; detail: string } {
  const order: MetricId[] = ["hotDays", "et0", "precip"];
  const e = `${EARLY_PERIOD[0]}–${EARLY_PERIOD[1]}`;
  const l = `${LATE_PERIOD[0]}–${LATE_PERIOD[1]}`;
  const clear = order.filter((id) => metrics[id].verdict === "increase" || metrics[id].verdict === "decrease");
  const steady = order.filter((id) => metrics[id].verdict === "no-clear-change");
  const lacking = order.filter((id) => metrics[id].verdict === "insufficient-data");

  const tail: string[] = [];
  if (steady.length) tail.push(`No clear change in ${joinList(steady.map((id) => META[id].noun), "or")}.`);
  if (lacking.length) tail.push(`Not enough complete data to compare ${joinList(lacking.map((id) => META[id].noun), "or")}.`);
  const tailText = tail.length ? " " + tail.join(" ") : "";

  if (clear.length) {
    const phrases = clear.map((id) => CLEAR_PHRASE[id][metrics[id].verdict as "increase" | "decrease"]);
    return {
      headline: `Your field's regional climate has shifted: ${joinList(phrases)}`,
      detail: `Comparing ${e} with ${l}, the record shows ${joinList(phrases)}.${tailText}`,
    };
  }
  if (steady.length === 0) {
    return {
      headline: "Not enough complete data to compare the two periods",
      detail: `There is not enough complete data to compare ${e} with ${l}.${tailText}`,
    };
  }
  if (lacking.length) {
    // Never say "no clear shift" when a measure could not be compared: say what could not be compared, from the computed result.
    const lackingText = joinList(lacking.map((id) => META[id].noun), "or");
    return {
      headline: `Not enough complete data to compare ${lackingText} between ${e} and ${l}`,
      detail:
        `Not enough complete data to compare ${lackingText}. For the ${steady.length === 1 ? "measure" : "measures"} we could compare (${joinList(steady.map((id) => META[id].noun))}), ` +
        `${steady.length === 1 ? "it" : "none"} did not change by more than normal year-to-year swings, but that does not cover the whole picture.`,
    };
  }
  return {
    headline: `No clear shift in this field's regional climate between ${e} and ${l}`,
    detail: `Comparing ${e} with ${l}, none of the measures changed by more than normal year-to-year swings.`,
  };
}

// ---------- entry ----------

export function computeShift(power: PowerResult): ShiftResult {
  if (power.status === "error" || power.status === "no-coverage") {
    return {
      status: "unavailable",
      reason: power.message ?? `NASA POWER returned status "${power.status}" for this location.`,
      nextStep:
        power.status === "no-coverage"
          ? "Pick a location NASA POWER covers, or try one of the demo pins."
          : "Check the connection and try again, or open one of the demo pins that works from a saved response.",
    };
  }
  if (!power.days.length) {
    return {
      status: "unavailable",
      reason: "The NASA POWER record for this location contains no days.",
      nextStep: "Try again, or open one of the demo pins.",
    };
  }

  const hot = yearValues(power, (r) => (r.tMaxC === null ? null : r.tMaxC > HOT_DAY_THRESHOLD_C ? 1 : 0));
  const precip = yearValues(power, (r) => r.precipMm);
  const elev = power.elevationM;
  const et0 = yearValues(power, elev === null ? null : (r) => et0FromDailyRecord(r, power.lat, elev));

  const metrics: Record<MetricId, MetricShift> = {
    hotDays: buildMetric("hotDays", hot),
    et0: buildMetric("et0", et0, elev === null ? NO_ELEVATION_REASON : undefined),
    precip: buildMetric("precip", precip),
  };
  const o = overall(metrics);
  return {
    status: "ok",
    metrics,
    overallHeadline: o.headline,
    overallDetail: o.detail,
    periods: { early: EARLY_PERIOD, late: LATE_PERIOD },
    rules: {
      hotDayThresholdC: HOT_DAY_THRESHOLD_C,
      maxMissingDaysPerYear: MAX_MISSING_DAYS_PER_YEAR,
      minYearsPerPeriod: MIN_YEARS_PER_PERIOD,
      clearChangeRule: CLEAR_CHANGE_RULE,
    },
  };
}
