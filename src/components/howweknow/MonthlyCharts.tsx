import type { CalendarMonthMean, MonthPair } from "@/lib/openet/compare";
import { barGeometry } from "./geometry";

const MONTH_NAMES = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

function Legend({ observedOnly = false }: { observedOnly?: boolean }) {
  return (
    <p className="hk-legend">
      <span><i className="hk-key hk-key--obs" aria-hidden="true" /> OpenET (satellite-observed ET)</span>
      {!observedOnly && <span><i className="hk-key hk-key--mod" aria-hidden="true" /> Modelled crop water use (this app)</span>}
    </p>
  );
}

/** One pair of bars per month where both numbers exist. Wide, so it scrolls sideways inside its box rather than squeezing. */
export function PairedMonthsChart({ pairs, id }: { pairs: MonthPair[]; id: string }) {
  const groupWidth = 16;
  const g = barGeometry(pairs.map((p) => ({ label: p.month, a: p.observedMm, b: p.modelledMm })), { groupWidth, height: 260 });
  const titleId = `${id}-t`;
  const descId = `${id}-d`;
  // A year label under the first month of each year that has a pair.
  const yearMarks = g.groups.filter((gr, i) => i === 0 || gr.label.slice(0, 4) !== g.groups[i - 1].label.slice(0, 4));
  return (
    <figure className="hk-fig">
      <div className="hk-scroll" tabIndex={0} role="group" aria-label="Paired months chart, scrolls sideways">
        <svg className="hk-svg hk-svg--wide" width={g.width} height={g.height} viewBox={`0 0 ${g.width} ${g.height}`} role="img" aria-labelledby={`${titleId} ${descId}`}>
          <title id={titleId}>Monthly water use: OpenET and the app&rsquo;s model, month by month</title>
          <desc id={descId}>{`${pairs.length} months, from ${pairs[0]?.month} to ${pairs[pairs.length - 1]?.month}. Each month has two bars, in millimetres of water: OpenET and the modelled crop water use. The table below the chart lists every pair.`}</desc>
          {g.yTicks.map((t) => (
            <g key={t.value}>
              <line x1={g.plot.x} x2={g.plot.x + g.plot.w} y1={t.py} y2={t.py} className="hk-grid" />
              <text x={g.plot.x - 6} y={t.py + 4} textAnchor="end" className="hk-tick">{t.value}</text>
            </g>
          ))}
          {g.groups.map((gr) => (
            <g key={gr.label}>
              {gr.a && <rect {...gr.a} className="hk-bar hk-bar--obs" />}
              {gr.b && <rect {...gr.b} className="hk-bar hk-bar--mod" />}
            </g>
          ))}
          {yearMarks.map((gr) => (
            <text key={gr.label} x={gr.cx} y={g.plot.y + g.plot.h + 16} className="hk-tick" textAnchor="start">{gr.label.slice(0, 4)}</text>
          ))}
          <line x1={g.plot.x} x2={g.plot.x + g.plot.w} y1={g.plot.y + g.plot.h} y2={g.plot.y + g.plot.h} className="hk-axisline" />
          <text transform={`translate(12 ${g.plot.y + g.plot.h / 2}) rotate(-90)`} textAnchor="middle" className="hk-axis">mm per month</text>
        </svg>
      </div>
      <Legend />
      <details className="hk-details">
        <summary>All {pairs.length} paired months as a table</summary>
        <div className="hk-tablewrap">
          <table className="hk-table">
            <caption className="sr-only">Paired months: OpenET and modelled crop water use, in millimetres</caption>
            <thead><tr><th scope="col">Month</th><th scope="col">OpenET (mm)</th><th scope="col">Modelled (mm)</th></tr></thead>
            <tbody>
              {pairs.map((p) => (
                <tr key={p.month}><th scope="row">{p.month}</th><td>{p.observedMm.toFixed(1)}</td><td>{p.modelledMm.toFixed(1)}</td></tr>
              ))}
            </tbody>
          </table>
        </div>
      </details>
    </figure>
  );
}

/** Mean of the paired months by calendar month (Jan to Dec). A month with no pair draws no bar and says "no pairs". */
export function CalendarMonthChart({ months, id, observedOnly = false }: { months: CalendarMonthMean[]; id: string; observedOnly?: boolean }) {
  const g = barGeometry(months.map((m) => ({ label: MONTH_NAMES[m.calendarMonth - 1], a: m.observedMeanMm, b: m.modelledMeanMm })), { groupWidth: 38, height: 250, bottom: 58 });
  const titleId = `${id}-t`;
  const descId = `${id}-d`;
  const withData = months.filter((m) => m.n > 0);
  return (
    <figure className="hk-fig">
      <div className="hk-scroll" tabIndex={0} role="group" aria-label="Calendar month chart, scrolls sideways on narrow screens">
        <svg className="hk-svg hk-svg--wide" width={g.width} height={g.height} viewBox={`0 0 ${g.width} ${g.height}`} role="img" aria-labelledby={`${titleId} ${descId}`}>
          <title id={titleId}>Average monthly water use by calendar month</title>
          <desc id={descId}>{`${withData.length} of 12 calendar months have data. Each has ${observedOnly ? "one bar, the OpenET average in millimetres per month" : "two bars, in millimetres per month: the OpenET average and the modelled average"}. The numbers under each month say how many months went into the average.`}</desc>
          {g.yTicks.map((t) => (
            <g key={t.value}>
              <line x1={g.plot.x} x2={g.plot.x + g.plot.w} y1={t.py} y2={t.py} className="hk-grid" />
              <text x={g.plot.x - 6} y={t.py + 4} textAnchor="end" className="hk-tick">{t.value}</text>
            </g>
          ))}
          {g.groups.map((gr, i) => (
            <g key={gr.label}>
              {gr.a && <rect {...gr.a} className="hk-bar hk-bar--obs" />}
              {gr.b && <rect {...gr.b} className="hk-bar hk-bar--mod" />}
              <text x={gr.cx} y={g.plot.y + g.plot.h + 15} textAnchor="middle" className="hk-tick">{gr.label}</text>
              <text x={gr.cx} y={g.plot.y + g.plot.h + 29} textAnchor="middle" className="hk-tick hk-tick--small">{months[i].n > 0 ? `n=${months[i].n}` : "none"}</text>
            </g>
          ))}
          <line x1={g.plot.x} x2={g.plot.x + g.plot.w} y1={g.plot.y + g.plot.h} y2={g.plot.y + g.plot.h} className="hk-axisline" />
          <text transform={`translate(12 ${g.plot.y + g.plot.h / 2}) rotate(-90)`} textAnchor="middle" className="hk-axis">mean mm per month</text>
        </svg>
      </div>
      <Legend observedOnly={observedOnly} />
    </figure>
  );
}

/** Observed-only version for pages with no rotation (the /shift page): the OpenET mean by calendar month. */
export function ObservedOnlyChart({ means, id }: { means: { calendarMonth: number; meanMm: number | null; n: number }[]; id: string }) {
  return <CalendarMonthChart id={id} observedOnly months={means.map((m) => ({ calendarMonth: m.calendarMonth, observedMeanMm: m.meanMm, modelledMeanMm: null, n: m.n }))} />;
}
