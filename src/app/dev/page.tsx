import type { Metadata } from "next";
import Link from "next/link";
import { cacheLife } from "next/cache";
import { DEMO_PINS, type DemoPin } from "@/lib/demoPins";
import { loadSavedDemoPin } from "@/lib/power";
import { powerOriginLine } from "@/lib/power/label";
import { summarizeAnnual, type AnnualSummary, type QuantityMean } from "@/lib/summary/annual";
import type { PowerField, PowerResult } from "@/lib/types";
import "./dev.css";

export const metadata: Metadata = {
  title: "Data check | Field Rewind",
  description: "Saved NASA POWER climate data for the three example places, with annual evapotranspiration and rainfall.",
};

const FIELD_LABELS: Record<PowerField, string> = {
  tMaxC: "Daily highest temperature",
  tMinC: "Daily lowest temperature",
  rhPct: "Average humidity",
  wind2mMs: "Wind speed at 2 m",
  solarMJm2: "Sunlight energy at the surface",
  precipMm: "Rain and melted snow (precipitation)",
};
const FIELD_ORDER = Object.keys(FIELD_LABELS) as PowerField[];

const nf0 = new Intl.NumberFormat("en-US", { maximumFractionDigits: 0 });

function lat(v: number) {
  return `${Math.abs(v).toFixed(2)}° ${v >= 0 ? "N" : "S"}`;
}
function lon(v: number) {
  return `${Math.abs(v).toFixed(2)}° ${v >= 0 ? "E" : "W"}`;
}

function Mean({ label, q, unit }: { label: string; q: QuantityMean; unit: string }) {
  if (!q.available) {
    return (
      <div className="stat stat--off">
        <dt>{label}</dt>
        <dd className="stat__big">Not available</dd>
        <dd className="stat__sub">{q.reason}</dd>
      </div>
    );
  }
  if (q.meanAnnualMm === null) {
    return (
      <div className="stat stat--off">
        <dt>{label}</dt>
        <dd className="stat__big">Not available</dd>
        <dd className="stat__sub">No calendar year had every day present, so no average is shown.</dd>
      </div>
    );
  }
  return (
    <div className="stat">
      <dt>{label}</dt>
      <dd className="stat__big">
        {nf0.format(q.meanAnnualMm)} <span className="stat__unit">{unit}</span>
      </dd>
      <dd className="stat__sub">
        Average of {q.yearsUsedCount} full years, {q.firstYearUsed} to {q.lastYearUsed}
        {q.yearsExcluded.length > 0 && (
          <>
            {". Left out: "}
            {q.yearsExcluded.map((e) => `${e.year} (${e.reason === "partial-year" ? "incomplete year" : "missing days"})`).join(", ")}
          </>
        )}
      </dd>
    </div>
  );
}

function PinCard({ pin, result, summary }: { pin: DemoPin; result: PowerHeader; summary: AnnualSummary }) {
  return (
    <article className="devpin panel" aria-labelledby={`pin-${pin.id}`}>
      <header className="devpin__head">
        <h2 id={`pin-${pin.id}`} className="panel__title devpin__name">
          {pin.name}
        </h2>
        <span className={`badge badge--${result.status}`}>Status: {result.status}</span>
      </header>
      <p className="devpin__where">
        {lat(pin.lat)}, {lon(pin.lon)}. Climate grid square centred on {lat(result.gridCell.latCenter)}, {lon(result.gridCell.lonCenter)} (cell {result.gridCell.key}).
      </p>
      <p className="devpin__label">Regional climate, about 50 km grid</p>

      <dl className="stats">
        <Mean label="Average yearly ET0 (water the crop could use)" q={summary.et0} unit="mm per year" />
        <Mean label="Average yearly rainfall" q={summary.precip} unit="mm per year" />
        <div className="stat">
          <dt>Elevation</dt>
          <dd className="stat__big">
            {result.elevationM === null ? "Not reported" : <>{nf0.format(result.elevationM)} <span className="stat__unit">m</span></>}
          </dd>
          <dd className="stat__sub">This is NASA POWER&rsquo;s average elevation for the grid square, not your field.</dd>
        </div>
      </dl>

      <h3 className="devpin__h3">Days with missing data</h3>
      <div className="tablewrap">
        <table>
          <thead>
            <tr>
              <th scope="col">What is missing</th>
              <th scope="col" className="num">Days</th>
              <th scope="col" className="num">Out of</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <th scope="row">ET0 inputs (any of the five weather values)</th>
              <td className="num">{summary.missing.et0Days === null ? "n/a" : nf0.format(summary.missing.et0Days)}</td>
              <td className="num">{nf0.format(summary.missing.totalDays)}</td>
            </tr>
            <tr>
              <th scope="row">Precipitation</th>
              <td className="num">{nf0.format(summary.missing.precipDays)}</td>
              <td className="num">{nf0.format(summary.missing.totalDays)}</td>
            </tr>
            <tr>
              <th scope="row">Any field</th>
              <td className="num">{nf0.format(summary.missing.anyFieldDays)}</td>
              <td className="num">{nf0.format(summary.missing.totalDays)}</td>
            </tr>
          </tbody>
        </table>
      </div>

      <h3 className="devpin__h3">What NASA POWER reported</h3>
      <p>
        Coverage: {result.coverage ? `${result.coverage.start} to ${result.coverage.end}` : "none"} (asked for {result.requested.start} to {result.requested.end}).
      </p>
      {result.message && <p className="panel__note">{result.message}</p>}
      <div className="tablewrap">
        <table>
          <thead>
            <tr>
              <th scope="col">Measurement</th>
              <th scope="col">Unit reported by POWER</th>
            </tr>
          </thead>
          <tbody>
            {FIELD_ORDER.map((f) => (
              <tr key={f}>
                <th scope="row">{FIELD_LABELS[f]}</th>
                <td>{result.units[f]}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <h3 className="devpin__h3">Where this came from</h3>
      <p className="devpin__prov">
        <strong>
          {powerOriginLine(result)}
        </strong>{" "}
        These numbers are NASA POWER reanalysis (a computer model of the atmosphere fed by satellites), not a sensor in a field.
      </p>
      <ul className="srclist">
        {result.sourceUrls.map((u) => (
          <li key={u}>
            <a href={u} rel="noreferrer">
              {u}
            </a>
          </li>
        ))}
      </ul>
    </article>
  );
}

function PinProblem({ pin, message, status }: { pin: DemoPin; message: string; status: string }) {
  return (
    <article className="devpin panel devpin--error" aria-labelledby={`pin-${pin.id}`}>
      <header className="devpin__head">
        <h2 id={`pin-${pin.id}`} className="panel__title devpin__name">
          {pin.name}
        </h2>
        <span className="badge badge--error">Status: {status}</span>
      </header>
      <p role="alert">
        <strong>No data shown for this place.</strong> Exact message: <code>{message}</code>
      </p>
      <p>
        Next step: run <code>npx tsx scripts/fetch-demo-pins.ts</code> to download the saved response again, then rebuild. The app does not show a substitute number.
      </p>
    </article>
  );
}

type PowerHeader = Omit<PowerResult, "days">;
type Loaded =
  | { pin: DemoPin; result: PowerHeader; summary: AnnualSummary; error?: undefined }
  | { pin: DemoPin; result?: undefined; summary?: undefined; error: string };

/**
 * Reads only the committed saved files (no network) and summarizes them. "use cache" lets this be
 * computed once at build time, so /dev is prerendered as static HTML. The 15,000-day arrays stay
 * inside this function; only the small header and the summary are returned.
 */
async function loadAll(): Promise<Loaded[]> {
  "use cache";
  cacheLife("max"); // the saved files only change with a rebuild
  return Promise.all(
    DEMO_PINS.map(async (pin): Promise<Loaded> => {
      try {
        const { days, ...header } = await loadSavedDemoPin(pin.id);
        return { pin, result: header, summary: summarizeAnnual({ days, lat: header.lat, elevationM: header.elevationM }) };
      } catch (e) {
        return { pin, error: e instanceof Error ? e.message : String(e) };
      }
    }),
  );
}

export default async function DevPage() {
  const loaded = await loadAll();

  return (
    <>
      <header className="devhead">
        <Link href="/" className="devhead__back">
          &larr; Back to the map
        </Link>
        <h1 className="devhead__title">Data check</h1>
        <p className="devhead__sub">
          What the saved NASA POWER climate data says for the three example places, before anything is built on it. Every number below is computed from the saved files in this project.
        </p>
      </header>

      <main className="main dev">
        {loaded.map(({ pin, result, summary, error }) => {
          if (error !== undefined) return <PinProblem key={pin.id} pin={pin} message={error} status="error" />;
          if (result.status === "error" || result.status === "no-coverage") {
            return <PinProblem key={pin.id} pin={pin} message={result.message ?? `status ${result.status}, no message given`} status={result.status} />;
          }
          return <PinCard key={pin.id} pin={pin} result={result} summary={summary} />;
        })}

        <section className="panel devmethod" aria-labelledby="method-h">
          <h2 id="method-h" className="panel__title">Method</h2>
          <p>
            <strong>ET0</strong> is the water a well-watered reference grass would lose to the air each day. It is calculated for every day with the FAO-56 Penman-Monteith equation (the standard from the UN Food and Agriculture Organization), then added up per calendar year.
            The code is checked against the FAO&rsquo;s own worked example (Example 18, Uccle, Brussels): it reproduces the published 3.88 mm/day exactly (3.880), shown there as 3.9. See <code>docs/et0-mapping.md</code>.
          </p>
          <p>
            <strong>Humidity approximation.</strong> FAO-56 prefers morning and afternoon humidity. NASA POWER only gives one daily average, so the code uses the average-humidity form (FAO-56 equation 19), which FAO describes as less ideal. On the worked example it gives about 3.79 instead of 3.88 mm/day, roughly 2% lower. No correction is applied.
          </p>
          <p>
            <strong>Missing days are never filled in.</strong> A year with any missing day is left out of that average, and so is a year that is only partly in the record. Annual averages cover only full years.
          </p>
          <p>
            <strong>Grid, not farm.</strong> Regional climate, about 50 km grid. Rain and ET0 at a particular field can differ. Elevation is the grid square&rsquo;s average, so pressure terms are approximate for hilly ground.
          </p>
        </section>
      </main>

      <footer className="footer">
        <p>Data: NASA POWER, saved responses committed to this project.</p>
        <Link href="/">Back to the map</Link>
      </footer>
    </>
  );
}
