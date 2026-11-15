import { shownDiff } from "@/lib/shift/compute";
import { directionText } from "@/lib/shift/direction";
import type { MetricShift } from "@/lib/shift/types";
import { formatInches } from "@/lib/shift/units";
import { fmtValue, metricTone } from "./colors";
import CountUp from "./CountUp";

const VERDICT_WORD: Record<MetricShift["verdict"], string> = {
  increase: "Higher",
  decrease: "Lower",
  "no-clear-change": "No clear change",
  "insufficient-data": "Not enough data",
};

function VerdictIcon({ verdict }: { verdict: MetricShift["verdict"] }) {
  const p = { fill: "none", stroke: "currentColor", strokeWidth: 2.6, strokeLinecap: "round", strokeLinejoin: "round" } as const;
  return (
    <svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true">
      {verdict === "increase" && <path {...p} d="M12 20V5M5.5 11.5 12 5l6.5 6.5" />}
      {verdict === "decrease" && <path {...p} d="M12 4v15M5.5 12.5 12 19l6.5-6.5" />}
      {verdict === "no-clear-change" && <path {...p} d="M5 9h14M5 15h14" />}
      {verdict === "insufficient-data" && <path {...p} strokeDasharray="1 5" d="M4 12h16" />}
    </svg>
  );
}

function Mean({ stats, metric, which }: { stats: MetricShift["early"]; metric: MetricShift; which: "early" | "late" }) {
  return (
    <div className={`mean mean--${which}`}>
      <dt>{stats.startYear}–{stats.endYear}</dt>
      <dd>
        {stats.mean === null ? (
          <span className="mean__none">No average</span>
        ) : (
          <>
            <span className="mean__num">{fmtValue(metric, stats.mean)}</span>
            <span className="mean__unit"> per year</span>
          </>
        )}
        <span className="mean__yrs">{stats.yearsUsed} {stats.yearsUsed === 1 ? "year" : "years"} used{stats.flaggedYears.length > 0 ? `, left out: ${stats.flaggedYears.join(", ")}` : ""}</span>
      </dd>
    </div>
  );
}

export default function MetricCard({ metric, index, thresholdNote }: { metric: MetricShift; index: number; thresholdNote?: string }) {
  const tone = metricTone(metric);
  return (
    <article className={`mcard mcard--${tone} mcard--${metric.verdict}`} style={{ "--k": index } as React.CSSProperties} aria-labelledby={`m-${metric.id}`}>
      <header className="mcard__head">
        <h3 id={`m-${metric.id}`} className="mcard__label">{metric.label}</h3>
        <span className="vtag">
          <VerdictIcon verdict={metric.verdict} />
          {VERDICT_WORD[metric.verdict]}
        </span>
      </header>
      {(tone === "pressure" || tone === "relief") && (
        <p className="mcard__tone" data-testid="direction-text">{directionText(metric.id, metric.verdict)}</p>
      )}
      {thresholdNote && <p className="mcard__thresh">{thresholdNote}</p>}
      <p className="mcard__big">
        <CountUp key={metric.headline} text={metric.headline} delayMs={250 + index * 120} />
      </p>
      {metric.unit === "mm per year" && metric.diff !== null && metric.verdict !== "no-clear-change" && (
        <p className="mcard__alt">about {formatInches(Math.abs(shownDiff(metric))).replace(/ in$/, " inches")} a year</p>
      )}
      <dl className="means">
        <Mean stats={metric.early} metric={metric} which="early" />
        <svg className="means__arrow" viewBox="0 0 24 24" width="22" height="22" aria-hidden="true"><path d="M4 12h15M13 6l6 6-6 6" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" /></svg>
        <Mean stats={metric.late} metric={metric} which="late" />
      </dl>
      <p className="mcard__detail">{metric.detail}</p>
    </article>
  );
}
