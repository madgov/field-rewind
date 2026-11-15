import { COMPARISON_CAVEAT } from "./constants";

export type ObservedMonth = { month: string; etMm: number | null };
export type ModelledMonth = { month: string; mm: number | null };
export type MonthPair = { month: string; observedMm: number; modelledMm: number };
export type CalendarMonthMean = { calendarMonth: number; observedMeanMm: number | null; modelledMeanMm: number | null; n: number };

export type Comparison = {
  n: number;
  firstMonth: string | null;
  lastMonth: string | null;
  meanObservedMm: number | null;
  meanModelledMm: number | null;
  /** observed minus modelled, mm per month */
  meanDiffMm: number | null;
  /** sum(observed) / sum(modelled); null if modelled sum is 0 or n = 0 */
  ratioOfSums: number | null;
  pairs: MonthPair[];
  byCalendarMonth: CalendarMonthMean[];
  sentence: string;
  caveat: string;
};

const mean = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : null);
const f1 = (x: number) => x.toFixed(1);

export function compareMonthly(observed: ObservedMonth[], modelled: ModelledMonth[]): Comparison {
  const mod = new Map<string, number>();
  for (const m of modelled) if (m.mm !== null && Number.isFinite(m.mm)) mod.set(m.month, m.mm);
  const pairs: MonthPair[] = observed
    .filter((o): o is { month: string; etMm: number } => o.etMm !== null && Number.isFinite(o.etMm) && mod.has(o.month))
    .map((o) => ({ month: o.month, observedMm: o.etMm, modelledMm: mod.get(o.month) as number }))
    .sort((a, b) => a.month.localeCompare(b.month));

  const byCalendarMonth: CalendarMonthMean[] = Array.from({ length: 12 }, (_, i) => {
    const ps = pairs.filter((p) => Number(p.month.slice(5, 7)) === i + 1);
    return { calendarMonth: i + 1, observedMeanMm: mean(ps.map((p) => p.observedMm)), modelledMeanMm: mean(ps.map((p) => p.modelledMm)), n: ps.length };
  });

  const n = pairs.length;
  if (n === 0) {
    return {
      n: 0, firstMonth: null, lastMonth: null, meanObservedMm: null, meanModelledMm: null, meanDiffMm: null, ratioOfSums: null,
      pairs, byCalendarMonth, caveat: COMPARISON_CAVEAT,
      sentence: "There are no months where both OpenET and the modelled water use have a value, so nothing can be compared.",
    };
  }
  const sumO = pairs.reduce((a, p) => a + p.observedMm, 0);
  const sumM = pairs.reduce((a, p) => a + p.modelledMm, 0);
  const meanO = sumO / n;
  const meanM = sumM / n;
  const diff = meanO - meanM;
  const ratio = sumM === 0 ? null : sumO / sumM;
  const first = pairs[0].month;
  const last = pairs[n - 1].month;
  const rounded = Number(f1(Math.abs(diff)));
  const dir = rounded === 0 ? "about the same as" : diff > 0 ? `${f1(Math.abs(diff))} mm per month higher than` : `${f1(Math.abs(diff))} mm per month lower than`;
  const ratioText = ratio === null ? "" : ` (OpenET total was ${Math.round(ratio * 100)}% of the modelled total)`;
  const sentence =
    `Over ${n} month${n === 1 ? "" : "s"} (${first} to ${last}), satellite-observed ET from OpenET averaged ${f1(meanO)} mm per month and the app's modelled crop water use averaged ${f1(meanM)} mm per month, ` +
    `so OpenET was ${dir} the model${ratioText}.`;
  return { n, firstMonth: first, lastMonth: last, meanObservedMm: meanO, meanModelledMm: meanM, meanDiffMm: diff, ratioOfSums: ratio, pairs, byCalendarMonth, sentence, caveat: COMPARISON_CAVEAT };
}
