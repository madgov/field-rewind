"use client";

import { useId, useState } from "react";
import { DataBadge } from "./badges";
import { ChartTable, YearBars } from "./charts";
import { fmtValue, type Harmonized } from "./models";

/**
 * One row per layer, one column per year, all on the same year axis. The year scrubber highlights the same year in every row.
 * A year with no value is hatched and stays empty: nothing is filled in, and no combined score is worked out.
 */
export default function HarmonizedYearly({ data }: { data: Harmonized }) {
  const uid = useId().replace(/:/g, "");
  const [year, setYear] = useState(data.lastYear);
  const idx = year - data.firstYear;
  const years = Array.from({ length: data.lastYear - data.firstYear + 1 }, (_, i) => data.firstYear + i);
  const step = (d: number) => setYear((y) => Math.min(data.lastYear, Math.max(data.firstYear, y + d)));
  return (
    <div className="cx-harm">
      <p className="cx-note">{data.sentence}</p>
      <div className="cx-scrub" role="group" aria-label="Choose a year">
        <button type="button" className="step-btn" onClick={() => step(-1)} disabled={year <= data.firstYear} aria-label="Previous year">
          <svg viewBox="0 0 20 20" width="18" height="18" aria-hidden="true"><path d="M12.5 4 6.5 10l6 6" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" /></svg>
        </button>
        <label className="cx-scrub__label" htmlFor={`${uid}-year`}>
          Year <output id={`${uid}-out`} className="cx-scrub__year" htmlFor={`${uid}-year`}>{year}</output>
        </label>
        <input
          id={`${uid}-year`}
          className="cx-range"
          type="range"
          min={data.firstYear}
          max={data.lastYear}
          step={1}
          value={year}
          onChange={(e) => setYear(Number(e.target.value))}
          aria-valuetext={`Year ${year}`}
        />
        <button type="button" className="step-btn" onClick={() => step(1)} disabled={year >= data.lastYear} aria-label="Next year">
          <svg viewBox="0 0 20 20" width="18" height="18" aria-hidden="true"><path d="M7.5 4 13.5 10l-6 6" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" /></svg>
        </button>
      </div>

      <section className="cx-yearcard" aria-live="polite" aria-label={`Values for ${year}`}>
        <h3 className="cx-h3">{year}, all layers</h3>
        <dl className="cx-yeargrid">
          {data.layers.map((l) => {
            const v = l.values[idx];
            return (
              <div key={l.id} className={v === null ? "is-gap" : ""}>
                <dt>{l.label}</dt>
                <dd>
                  {l.unavailable ? "layer not available" : v === null ? "no value for this year (hatched)" : `${fmtValue(v, l.digits)} ${l.unit}`}
                  {!l.unavailable && v !== null && l.weak[idx] ? " (few clear observations)" : ""}
                </dd>
              </div>
            );
          })}
        </dl>
      </section>

      <div className="cx-rows">
        {data.layers.map((l) => (
          <figure key={l.id} className="cx-row">
            <figcaption className="cx-row__cap">
              <span className="cx-row__name">{l.label}</span>
              <DataBadge kind={l.badge} />
              <span className="cx-row__res">{l.resolution}</span>
            </figcaption>
            {l.unavailable ? (
              <p className="cx-row__none" role="status">Not available for this place. Exact message: <code>{l.unavailable}</code></p>
            ) : (
              <YearBars
                id={`${uid}-${l.id}`}
                title={`${l.label}, ${l.unit}, by year`}
                desc={`One bar per year from ${data.firstYear} to ${data.lastYear}. Hatched years have no value. The chosen year, ${year}, is outlined.`}
                points={years.map((y, i) => ({ year: y, value: l.values[i], flagged: l.values[i] === null }))}
                unit={l.unit}
                digits={l.digits}
                kind={l.kind}
                height={118}
                width={380}
                minWidth={0}
                tickEvery={10}
                highlightYear={year}
                weak={l.weak}
                tone={l.id}
                gapReason="no value for this year"
              />
            )}
            {l.note && <p className="cx-row__note">{l.note}</p>}
          </figure>
        ))}
      </div>

      <h3 className="cx-h3">Native resolution of each layer</h3>
      <ul className="cx-res">
        {data.resolutions.map((r) => (
          <li key={r.name}><strong>{r.name}:</strong> {r.text}</li>
        ))}
      </ul>

      <ChartTable
        caption="All layers by year"
        head={["Year", ...data.layers.map((l) => `${l.label} (${l.unit})`)]}
        rows={years.map((y, i) => [y, ...data.layers.map((l) => (l.unavailable ? "not available" : l.values[i] === null ? "no value" : fmtValue(l.values[i], l.digits)))])}
      />
    </div>
  );
}
