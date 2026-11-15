"use client";

import { useMemo, useState } from "react";
import { compareMonthly, type ObservedMonth } from "@/lib/openet/compare";
import { monthlyWhyText, rotationMonthlyUse, type MonthlyTable } from "@/lib/replay/monthly";
import { FIRST_SEASON, LAST_SEASON } from "@/lib/replay/types";
import { CalendarMonthChart, PairedMonthsChart } from "./MonthlyCharts";
import { useReplayRotations } from "./ReplayInputsContext";

const MONTH_FULL = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];

/** OpenET observed monthly ET next to the model, for the rotations currently on the replay screen. All numbers come from compareMonthly(). */
export default function OpenEtReplayCompare({ observed, table, savedLabel }: { observed: ObservedMonth[]; table: MonthlyTable; savedLabel: string }) {
  const rotations = useReplayRotations();
  const [pick, setPick] = useState(0);
  const idx = rotations && pick < rotations.length ? pick : 0;
  const rot = rotations?.[idx];
  const modelled = useMemo(() => (rot ? rotationMonthlyUse(table, rot.sequence, FIRST_SEASON, LAST_SEASON).map((m) => ({ month: m.month, mm: m.mm })) : []), [rot, table]);
  const cmp = useMemo(() => compareMonthly(observed, modelled), [observed, modelled]);
  const unavailable = useMemo(() => {
    if (!rot) return [] as string[];
    const obsMonths = new Set(observed.filter((o) => o.etMm !== null).map((o) => o.month));
    const why = new Map<string, number>();
    for (const m of rotationMonthlyUse(table, rot.sequence, FIRST_SEASON, LAST_SEASON)) {
      if (m.mm === null && m.why && obsMonths.has(m.month)) why.set(m.why, (why.get(m.why) ?? 0) + 1);
    }
    return [...why.entries()].map(([k, n]) => `${n} ${n === 1 ? "month" : "months"}: ${monthlyWhyText(k as Parameters<typeof monthlyWhyText>[0])}`);
  }, [rot, table, observed]);

  if (!rotations || !rot) return <p className="hk-note">Rotations are not loaded yet.</p>;

  const monthsWithBoth = cmp.byCalendarMonth.filter((m) => m.n > 0);
  return (
    <div className="hk-result">
      <div className="hk-pick">
        <label htmlFor="hk-oe-rot">Rotation to compare</label>
        <select id="hk-oe-rot" value={idx} onChange={(e) => setPick(Number(e.target.value))}>
          {rotations.map((r, i) => <option key={i} value={i}>{r.name}: {r.cropNames.join(", then ")}</option>)}
        </select>
      </div>
      <p className="hk-provline"><strong>OpenET data: {savedLabel}</strong>. Not newly retrieved.</p>
      <p className="hk-compared"><strong>What is compared:</strong> OpenET&rsquo;s monthly evapotranspiration (ET, in mm) at your pin, against this app&rsquo;s modelled crop water use for <em>{rot.name}</em>: the crop factor times reference water demand (ET0), summed over every day of a month the crop is growing. Only months in which the crop grows on every day, and OpenET has a value, are compared.</p>
      <p className="hk-summary">{cmp.sentence}</p>
      {cmp.n > 0 && (
        <>
          <h4 className="hk-h4">Month by month</h4>
          <PairedMonthsChart pairs={cmp.pairs} id="hk-oe-pairs" />
          <h4 className="hk-h4">Average for each calendar month</h4>
          <CalendarMonthChart months={cmp.byCalendarMonth} id="hk-oe-cal" />
          <p className="hk-note">
            Calendar months with a pair: {monthsWithBoth.map((m) => MONTH_FULL[m.calendarMonth - 1].slice(0, 3)).join(", ")}. Months this rotation has no crop in have no modelled value and are not compared (they are not treated as zero).
          </p>
        </>
      )}
      {unavailable.length > 0 && <p className="hk-note">Months with an OpenET value but no modelled value: {unavailable.join("; ")}.</p>}
      <dl className="hk-stats">
        <div><dt>Months compared</dt><dd>{cmp.n}</dd></div>
        <div><dt>Range</dt><dd>{cmp.firstMonth ? `${cmp.firstMonth} to ${cmp.lastMonth}` : "n/a"}</dd></div>
        <div><dt>OpenET mean / month</dt><dd>{cmp.meanObservedMm === null ? "n/a" : `${cmp.meanObservedMm.toFixed(1)} mm`}</dd></div>
        <div><dt>Modelled mean / month</dt><dd>{cmp.meanModelledMm === null ? "n/a" : `${cmp.meanModelledMm.toFixed(1)} mm`}</dd></div>
        <div><dt>Ratio of totals (OpenET / model)</dt><dd>{cmp.ratioOfSums === null ? "n/a" : cmp.ratioOfSums.toFixed(2)}</dd></div>
      </dl>
      <p className="hk-caveat" role="note"><strong>Read this first.</strong> {cmp.caveat}</p>
    </div>
  );
}
