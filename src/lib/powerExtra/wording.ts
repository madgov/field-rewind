/**
 * Plain-English sentences generated purely from computed numbers. No causal claims.
 * Every sentence describes regional climate (use POWER_EXTRA_LABEL next to it). If there is no clear change, it says so.
 */
import { MIN_YEARS_PER_PERIOD, EARLY_PERIOD, LATE_PERIOD, type MetricCompare } from "./stats";
import { POWER_EXTRA_LABEL, SOIL_MODELLED_NOTE } from "./constants";
import type { FrostResult } from "./frost";
import { refDayText } from "./frost";
import type { SkinTemperatureResult } from "./heat";
import type { SoilWetnessResult } from "./soil";

export { POWER_EXTRA_LABEL, SOIL_MODELLED_NOTE };

/** The label as a function, for UI code that prefers calling something. */
export function powerExtraLabel(): string {
  return POWER_EXTRA_LABEL;
}

export type Wording = {
  /** The main sentence. */
  headline: string;
  /** Further sentences, in display order. */
  lines: string[];
  /** Always "regional climate, about 50 km grid". */
  label: string;
};

const E = `${EARLY_PERIOD[0]}–${EARLY_PERIOD[1]}`;
const L = `${LATE_PERIOD[0]}–${LATE_PERIOD[1]}`;

function num(v: number, digits: number): string {
  if (!Number.isFinite(v)) return "n/a";
  const r = Number(v.toFixed(digits));
  return (r === 0 ? 0 : r).toLocaleString("en-US", { minimumFractionDigits: digits, maximumFractionDigits: digits });
}

function enough(m: MetricCompare): boolean {
  return m.verdict !== "insufficient-data" && m.shownEarly !== null && m.shownLate !== null;
}

function notEnough(what: string, m: MetricCompare): string {
  return `Not enough complete data to compare ${what} between ${E} and ${L} (${m.early.yearsUsed} usable years in the first period and ${m.late.yearsUsed} in the second; at least ${MIN_YEARS_PER_PERIOD} needed in each).`;
}

type Spec = {
  /** "frost days" */
  noun: string;
  /** Sentence starter used when there is a clear change, e.g. "Frost days at this spot" */
  subject: string;
  verbUp: string;
  verbDown: string;
  /** Format one shown mean, e.g. (v) => `${v} a year` */
  fmt: (v: number) => string;
};

function comparisonSentence(m: MetricCompare, s: Spec): string {
  if (!enough(m)) return notEnough(s.noun, m);
  const early = s.fmt(m.shownEarly as number);
  const late = s.fmt(m.shownLate as number);
  if (m.verdict === "increase" || m.verdict === "decrease") {
    return `${s.subject} ${m.verdict === "increase" ? s.verbUp : s.verbDown} from ${early} to ${late} between ${E} and ${L}.`;
  }
  return `No clear change in ${s.noun}: ${early} in ${E} and ${late} in ${L}, within normal year-to-year swings.`;
}

const perYear = (d: number) => (v: number) => `${num(v, d)} a year`;

/** Frost: day count, frost-free season, last spring frost, first autumn frost. */
export function frostWording(r: FrostResult): Wording {
  if (r.status !== "ok") {
    return { headline: `Frost history is not available: ${r.reason}`, lines: [], label: POWER_EXTRA_LABEL };
  }
  const headline = comparisonSentence(r.frostDays, { noun: "frost days", subject: "Frost days at this spot", verbUp: "rose", verbDown: "fell", fmt: perYear(0) });
  const lines: string[] = [];
  if (r.hemisphere === "south") {
    lines.push("Spring and autumn frost dates and the frost-free season are not worked out for the Southern Hemisphere in this version.");
    return { headline, lines, label: POWER_EXTRA_LABEL };
  }
  lines.push(
    comparisonSentence(r.frostFreeDays, {
      noun: "the frost-free season",
      subject: "The frost-free season",
      verbUp: "lengthened",
      verbDown: "shortened",
      fmt: (v) => `${num(v, 0)} ${Math.abs(v) === 1 ? "day" : "days"}`,
    }),
  );
  lines.push(dateSentence(r.lastSpringFrost, "last spring frost", "The last spring frost", E, L));
  lines.push(dateSentence(r.firstAutumnFrost, "first autumn frost", "The first autumn frost", E, L));
  return { headline, lines, label: POWER_EXTRA_LABEL };
}

function dateSentence(m: MetricCompare, noun: string, subject: string, e: string, l: string): string {
  if (!enough(m)) {
    return `Not enough years with a ${noun} to compare its date between ${e} and ${l} (${m.early.yearsUsed} usable years in the first period and ${m.late.yearsUsed} in the second; at least ${MIN_YEARS_PER_PERIOD} needed in each).`;
  }
  const early = refDayText(m.shownEarly as number);
  const late = refDayText(m.shownLate as number);
  if (m.verdict === "increase" || m.verdict === "decrease") {
    return `${subject} came about ${num(Math.abs(m.shownDiff), 0)} ${Math.abs(m.shownDiff) === 1 ? "day" : "days"} ${m.verdict === "increase" ? "later" : "earlier"} on average: about ${early} in ${e}, about ${late} in ${l}.`;
  }
  return `No clear change in the date of the ${noun}: about ${early} in ${e} and about ${late} in ${l}, within normal year-to-year swings.`;
}

/** Soil wetness (modelled): growing-season mean, driest month, dry days, driest years. */
export function soilWetnessWording(r: SoilWetnessResult): Wording {
  if (r.status !== "ok") {
    return { headline: `Soil wetness history is not available: ${r.reason}`, lines: [], label: POWER_EXTRA_LABEL };
  }
  const headline = comparisonSentence(r.growingSeasonMean, {
    noun: "growing-season soil wetness (modelled)",
    subject: "Modelled growing-season (April to September) root-zone soil wetness",
    verbUp: "rose",
    verbDown: "fell",
    fmt: (v) => num(v, 2),
  });
  const lines: string[] = ["Wetness runs from 0 (completely dry) to 1 (saturated)."];
  lines.push(
    comparisonSentence(r.driestMonth, {
      noun: "the driest growing-season month's wetness (modelled)",
      subject: "The driest growing-season month's modelled wetness",
      verbUp: "rose",
      verbDown: "fell",
      fmt: (v) => num(v, 2),
    }),
  );
  const t = r.dryThreshold ? ` (wetness at or below ${num(r.dryThreshold.value, 2)}, this spot's own 10th-percentile level)` : "";
  lines.push(
    comparisonSentence(r.dryDays, {
      noun: `dry growing-season days${t}`,
      subject: `Dry growing-season days${t}`,
      verbUp: "rose",
      verbDown: "fell",
      fmt: perYear(0),
    }),
  );
  if (r.driestYears.length) {
    lines.push(`Driest growing seasons on record: ${r.driestYears.map((y) => `${y.year} (${num(y.value, 2)})`).join(", ")}.`);
  }
  lines.push("The dry-day threshold is relative to this spot's own record, not a crop wilting point.");
  lines.push(SOIL_MODELLED_NOTE);
  return { headline, lines, label: POWER_EXTRA_LABEL };
}

/** Ground-surface (skin) temperature annual mean. */
export function skinTemperatureWording(r: SkinTemperatureResult): Wording {
  if (r.status !== "ok") {
    return { headline: `Ground-surface temperature history is not available: ${r.reason}`, lines: [], label: POWER_EXTRA_LABEL };
  }
  const headline = comparisonSentence(r.annualMean, {
    noun: "the yearly average ground-surface temperature",
    subject: "The yearly average ground-surface temperature",
    verbUp: "rose",
    verbDown: "fell",
    fmt: (v) => `${num(v, 1)} °C`,
  });
  return { headline, lines: ["This is NASA's modelled surface (skin) temperature, which is not the same as air temperature."], label: POWER_EXTRA_LABEL };
}
