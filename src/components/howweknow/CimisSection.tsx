import { loadCimisComparison } from "@/lib/cimis";
import { CIMIS_STATION, MIN_PAIRED_DAYS_PER_YEAR } from "@/lib/cimis/constants";
import { formatUtc } from "../shift/format";
import ScatterPlot from "./ScatterPlot";

const f2 = (v: number) => v.toFixed(2);

/** Brentwood station check. Server component: reads the saved CIMIS response, or shows the exact blocker. */
export default async function CimisSection({ isBrentwood, place }: { isBrentwood: boolean; place: string }) {
  const r = await loadCimisComparison();
  return (
    <section className="hk-block" aria-labelledby="hk-cimis-h">
      <h3 id="hk-cimis-h" className="hk-h3">Checked against a weather station: CIMIS Brentwood</h3>
      <p className="hk-plain">
        Does NASA POWER give sensible water demand? We compare the app&rsquo;s own reference water demand (ET0) for the Brentwood example place with the California state weather
        station there, CIMIS station {CIMIS_STATION} (Brentwood), for the same days. The station sits over irrigated grass and measures the weather itself.
        This check is for the <strong>Brentwood area only</strong>.
        {!isBrentwood && <> You are looking at {place}, so this is a Brentwood check shown for context. It is not a check of this place.</>}
      </p>
      {r.status !== "ok" ? (
        <div className="hk-card hk-card--wait" role="status">
          <p className="hk-card__title">Not run yet</p>
          <p>No chart is shown, because the app never draws a comparison without real station data.</p>
          <p><strong>Exact message:</strong> <code>{r.message}</code></p>
          {r.nextStep && <p><strong>Next step:</strong> {r.nextStep}</p>}
        </div>
      ) : (
        <CimisResultView r={r} />
      )}
    </section>
  );
}

export function CimisResultView({ r }: { r: Extract<Awaited<ReturnType<typeof loadCimisComparison>>, { status: "ok" }> }) {
  const c = r.comparison;
  const dropped = c.dropped;
  return (
    <div className="hk-result">
      <p className="hk-provline"><strong>Station data: {r.savedLabel.charAt(0).toUpperCase() + r.savedLabel.slice(1)}</strong>. Not newly retrieved. Retrieved {formatUtc(r.fetchedAt)}. Unit reported by CIMIS: {r.unit}. NASA POWER side: saved response from {r.powerFetchedAt.slice(0, 10)}.</p>
      <p className="hk-summary">{c.summary}</p>
      {c.n > 0 && <ScatterPlot c={c} id="hk-scatter" />}
      <dl className="hk-stats">
        <div><dt>Agreement (R&sup2;)</dt><dd>{c.r2 === null ? "not defined" : f2(c.r2)}</dd></div>
        <div><dt>Bias (POWER minus station)</dt><dd>{c.biasMmPerDay === null ? "n/a" : `${c.biasMmPerDay >= 0 ? "+" : "−"}${f2(Math.abs(c.biasMmPerDay))} mm/day`}</dd></div>
        <div><dt>Typical gap (RMSE)</dt><dd>{c.rmseMmPerDay === null ? "n/a" : `${f2(c.rmseMmPerDay)} mm/day`}</dd></div>
        <div><dt>Ratio of yearly totals (POWER / station)</dt><dd>{c.overallRatio === null ? "n/a" : f2(c.overallRatio)}</dd></div>
        <div><dt>Days compared</dt><dd>{c.n.toLocaleString("en-US")}</dd></div>
        <div><dt>Date range</dt><dd>{c.dateRange ? `${c.dateRange.start} to ${c.dateRange.end}` : "n/a"}</dd></div>
        <div><dt>Mean per day: station / POWER</dt><dd>{c.meanStationMm === null || c.meanPowerMm === null ? "n/a" : `${f2(c.meanStationMm)} / ${f2(c.meanPowerMm)} mm`}</dd></div>
        <div><dt>Days left out</dt><dd>{dropped.total.toLocaleString("en-US")} ({dropped.stationMissing.toLocaleString("en-US")} station missing, {dropped.powerMissing.toLocaleString("en-US")} POWER missing, {dropped.bothMissing.toLocaleString("en-US")} both)</dd></div>
      </dl>
      <p className="hk-note">Ratio of yearly totals uses only years with at least {MIN_PAIRED_DAYS_PER_YEAR} paired days. A day with a missing value on either side is left out, never filled in.</p>
      <details className="hk-details">
        <summary>Year by year</summary>
        <div className="hk-tablewrap">
          <table className="hk-table">
            <caption className="sr-only">Yearly totals of reference water demand, station and NASA POWER, in millimetres</caption>
            <thead><tr><th scope="col">Year</th><th scope="col">Days</th><th scope="col">Station (mm)</th><th scope="col">POWER (mm)</th><th scope="col">Ratio</th></tr></thead>
            <tbody>
              {c.annual.map((a) =>
                a.comparable ? (
                  <tr key={a.year}><th scope="row">{a.year}</th><td>{a.pairedDays}</td><td>{Math.round(a.stationTotalMm).toLocaleString("en-US")}</td><td>{Math.round(a.powerTotalMm).toLocaleString("en-US")}</td><td>{a.ratio === null ? "n/a" : f2(a.ratio)}</td></tr>
                ) : (
                  <tr key={a.year} className="hk-table__skip"><th scope="row">{a.year}</th><td>{a.pairedDays}</td><td colSpan={3}>Not compared: {a.reason}</td></tr>
                ),
              )}
            </tbody>
          </table>
        </div>
      </details>
      <p className="hk-note">QC flags: {Object.entries(r.flags.byFlag).map(([k, v]) => `${k} ${v.toLocaleString("en-US")}`).join(", ")}. Station values flagged as missing are treated as missing.</p>
    </div>
  );
}
