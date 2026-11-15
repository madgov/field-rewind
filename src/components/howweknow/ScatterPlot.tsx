import type { Comparison } from "@/lib/cimis/compare";
import { scatterGeometry } from "./geometry";

/** Density scatter of paired daily ET0 (x: Brentwood station, y: NASA POWER-derived). Plain SVG from the binned cells. */
export default function ScatterPlot({ c, id }: { c: Comparison; id: string }) {
  const g = scatterGeometry(c.binned, c.regression);
  const fmt = (v: number) => (Number.isInteger(v) ? String(v) : v.toFixed(1));
  const titleId = `${id}-t`;
  const descId = `${id}-d`;
  const biasText = c.biasMmPerDay === null ? "" : ` On average NASA POWER reads ${Math.abs(c.biasMmPerDay).toFixed(2)} mm per day ${c.biasMmPerDay >= 0 ? "above" : "below"} the station.`;
  return (
    <figure className="hk-fig">
      <svg className="hk-svg" viewBox={`0 0 ${g.size} ${g.size}`} role="img" aria-labelledby={`${titleId} ${descId}`}>
        <title id={titleId}>Daily reference water demand: Brentwood station against NASA POWER</title>
        <desc id={descId}>
          {`Each shaded square counts days on which the station and NASA POWER both have a value; darker means more days. ${c.n.toLocaleString("en-US")} days.${biasText} The dashed line is where the two agree exactly.`}
        </desc>
        <rect x={g.plot.x} y={g.plot.y} width={g.plot.w} height={g.plot.h} className="hk-plotbg" />
        {g.ticks.map((t) => (
          <g key={t.value}>
            <line x1={g.plot.x} x2={g.plot.x + g.plot.w} y1={t.py} y2={t.py} className="hk-grid" />
            <line x1={t.px} x2={t.px} y1={g.plot.y} y2={g.plot.y + g.plot.h} className="hk-grid" />
            <text x={g.plot.x - 6} y={t.py + 4} textAnchor="end" className="hk-tick">{fmt(t.value)}</text>
            <text x={t.px} y={g.plot.y + g.plot.h + 16} textAnchor="middle" className="hk-tick">{fmt(t.value)}</text>
          </g>
        ))}
        {g.cells.map((cell, i) => (
          <rect key={i} x={cell.x} y={cell.y} width={cell.w} height={cell.h} className="hk-dens" fillOpacity={cell.opacity} />
        ))}
        <line {...g.oneToOne} className="hk-one" />
        {g.regression && <line {...g.regression} className="hk-reg" />}
        <rect x={g.plot.x} y={g.plot.y} width={g.plot.w} height={g.plot.h} className="hk-frame" />
        <text x={g.plot.x + g.plot.w / 2} y={g.size - 8} textAnchor="middle" className="hk-axis">Brentwood station, ASCE reference ET (mm/day)</text>
        <text transform={`translate(14 ${g.plot.y + g.plot.h / 2}) rotate(-90)`} textAnchor="middle" className="hk-axis">NASA POWER, FAO-56 ET0 (mm/day)</text>
      </svg>
      <figcaption className="hk-legend">
        <span><i className="hk-key hk-key--dens" aria-hidden="true" /> Days (darker = more days; up to {g.maxCount.toLocaleString("en-US")} in one square)</span>
        <span><i className="hk-key hk-key--one" aria-hidden="true" /> 1:1 line (perfect agreement)</span>
        {g.regression && c.regression && (
          <span><i className="hk-key hk-key--reg" aria-hidden="true" /> Best-fit line: POWER = {c.regression.slope.toFixed(2)} &times; station {c.regression.intercept < 0 ? "−" : "+"} {Math.abs(c.regression.intercept).toFixed(2)}</span>
        )}
      </figcaption>
    </figure>
  );
}
