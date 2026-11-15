import type { MetricShift } from "@/lib/shift/types";
import { RAMPS, fmtValue, rampColor } from "./colors";

export type StripeItem = {
  year: number;
  color: string | null; // null = hatched (flagged or no value)
  flagged: boolean;
  period: "early" | "late" | "none";
  /** Short readout, e.g. "2012: 14 days" */
  text: string;
  /** Extra line for missing days, or empty */
  note: string;
};

export type StripeProps = {
  metricId: MetricShift["id"];
  title: string;
  unit: string;
  items: StripeItem[];
  legend: { gradient: string; low: string; high: string; lowYear: number; highYear: number } | null;
  ticks: { index: number; year: number; minor?: boolean }[];
  brackets: { kind: "early" | "late"; from: number; to: number; label: string }[];
  /** Years that sit in neither period */
  neitherYears: number[];
  hasFlagged: boolean;
  hasNoValue: boolean;
};

export function buildStripeProps(m: MetricShift): StripeProps {
  const vals = m.years.filter((y) => y.value !== null) as (typeof m.years[number] & { value: number })[];
  let lo: (typeof vals)[number] | null = null;
  let hi: (typeof vals)[number] | null = null;
  for (const y of vals) {
    if (!lo || y.value < lo.value) lo = y;
    if (!hi || y.value > hi.value) hi = y;
  }
  const ramp = RAMPS[m.id];
  const span = lo && hi ? hi.value - lo.value : 0;

  const items: StripeItem[] = m.years.map((y) => {
    const miss = y.missingDays > 0 ? `${y.missingDays} ${y.missingDays === 1 ? "day" : "days"} missing` : "";
    if (y.value === null) {
      return {
        year: y.year,
        color: null,
        flagged: y.flagged,
        period: y.period,
        text: `${y.year}: ${y.flagged ? "too many missing days" : "no value"}`,
        note: y.flagged ? `${miss}. Left out of the averages.` : miss,
      };
    }
    const t = span > 0 ? (y.value - (lo as { value: number }).value) / span : 0.5;
    return { year: y.year, color: rampColor(ramp, t), flagged: false, period: y.period, text: `${y.year}: ${fmtValue(m, y.value)}`, note: miss };
  });

  const n = items.length;
  const idxOf = (year: number) => m.years.findIndex((y) => y.year === year);
  const brackets: StripeProps["brackets"] = [];
  for (const [kind, p, label] of [
    ["early", m.early, "Earlier period"],
    ["late", m.late, "Recent period"],
  ] as const) {
    const a = idxOf(p.startYear);
    const b = idxOf(p.endYear);
    if (a >= 0 && b >= a) brackets.push({ kind, from: a, to: b, label: `${label}, ${p.startYear}–${p.endYear}` });
  }

  const ticks: StripeProps["ticks"] = [];
  if (n > 0) {
    ticks.push({ index: 0, year: m.years[0].year });
    m.years.forEach((y, i) => {
      if (y.year % 10 === 0 && i >= 4 && i <= n - 5) ticks.push({ index: i, year: y.year, minor: i < 7 || i > n - 8 });
    });
    if (n > 1) ticks.push({ index: n - 1, year: m.years[n - 1].year });
  }

  return {
    metricId: m.id,
    title: m.label,
    unit: m.unit,
    items,
    legend: lo && hi ? { gradient: `linear-gradient(90deg, ${ramp.join(", ")})`, low: fmtValue(m, lo.value), high: fmtValue(m, hi.value), lowYear: lo.year, highYear: hi.year } : null,
    ticks,
    brackets,
    neitherYears: m.years.filter((y) => y.period === "none").map((y) => y.year),
    hasFlagged: m.years.some((y) => y.flagged),
    hasNoValue: m.years.some((y) => y.value === null && !y.flagged),
  };
}
