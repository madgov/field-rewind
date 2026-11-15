export type MetricId = "hotDays" | "et0" | "precip";

export type YearValue = {
  year: number;
  /** Annual value in the metric's unit. null when the year is flagged or cannot be computed. */
  value: number | null;
  /** Days in this year missing the inputs this metric needs. */
  missingDays: number;
  /** true = too many missing days (or incomplete calendar year); excluded from period means. */
  flagged: boolean;
  /** Which comparison period the year belongs to. 2005 belongs to neither. */
  period: "early" | "late" | "none";
};

export type PeriodStats = {
  startYear: number;
  endYear: number;
  /** Mean of annual values over usable years. null if not enough usable years. */
  mean: number | null;
  yearsUsed: number;
  flaggedYears: number[];
};

export type ShiftVerdict = "increase" | "decrease" | "no-clear-change" | "insufficient-data";

export type MetricShift = {
  id: MetricId;
  /** Plain-English name, e.g. "Days over 35 °C" */
  label: string;
  unit: "days per year" | "mm per year";
  years: YearValue[];
  early: PeriodStats;
  late: PeriodStats;
  /** late.mean - early.mean, in the metric's unit. null when either mean is null. */
  diff: number | null;
  /** diff as a percentage of early.mean. null when undefined (e.g. early mean is 0). */
  pctChange: number | null;
  /** Year-to-year noise yardstick used for the verdict, same unit as diff. */
  standardError: number | null;
  verdict: ShiftVerdict;
  /** Short generated phrase for the big number, e.g. "+12 more days a year" or "No clear change". */
  headline: string;
  /** One generated plain-English sentence with both period means and the years compared. */
  detail: string;
};

export type ShiftResult =
  | {
      status: "ok";
      metrics: Record<MetricId, MetricShift>;
      /** Generated from the three verdicts. Says plainly if nothing has clearly shifted. */
      overallHeadline: string;
      overallDetail: string;
      periods: { early: [number, number]; late: [number, number] };
      rules: { hotDayThresholdC: number; maxMissingDaysPerYear: number; minYearsPerPeriod: number; clearChangeRule: string };
    }
  | { status: "unavailable"; reason: string; nextStep: string };
