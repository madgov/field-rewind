import { loadSavedEarthdata } from "@/lib/earthdata/saved";
import { EARTHDATA_LIMIT, IMERG_SOURCE, SMAP_SOURCE } from "@/lib/earthdata/sources";
import { SectionShell, Origin, More, Notice } from "./parts";

const shown = (n: number | null, digits = 3) => n === null ? "not available" : n.toLocaleString("en-US", { maximumFractionDigits: digits });

export default async function EarthdataSection({ lat, lon }: { lat: number; lon: number }) {
  const result = await loadSavedEarthdata(lat, lon);
  return (
    <SectionShell id="earthdata" title="NASA soil moisture and rainfall snapshots">
      <p>{EARTHDATA_LIMIT}</p>
      {result.status === "unavailable" ? <Notice><strong>No saved observation is available.</strong> {result.message}</Notice> : (
        <>
          <Origin>{result.originLine}</Origin>
          <article className="cx-card">
            <h3>SMAP surface soil moisture</h3>
            <p>Requested dates: {result.data.smap.requestedStart} to {result.data.smap.requestedEnd}. Morning-overpass daily composites only.</p>
            <p>{SMAP_SOURCE.resolution} This describes moisture near the soil surface, not the full root zone or how much irrigation a crop needs.</p>
            {result.data.smap.status === "error" ? <Notice>{result.data.smap.message}</Notice> : <>
              <p><strong>{result.data.smap.observations.filter(o => o.valueM3M3 !== null).length} of {result.data.smap.observations.length} returned daily files</strong> contain a recommended-quality soil-moisture value at the sampled cell. Missing or rejected retrievals stay missing.</p>
              <div className="fa__scroll" tabIndex={0} role="region" aria-label="SMAP daily values, scrolls sideways on small screens">
                <table className="fa__table">
                  <caption>SMAP volume of water per volume of soil (m³/m³)</caption>
                  <thead><tr><th scope="col">Date</th><th scope="col">Soil moisture</th><th scope="col">Quality</th><th scope="col">Raw retrieval flag</th></tr></thead>
                  <tbody>{result.data.smap.observations.map(o => <tr key={o.date}>
                    <th scope="row">{o.date}</th><td>{shown(o.valueM3M3)}</td><td>{o.quality === "recommended" ? "Recommended" : o.quality === "not-recommended" ? "Not recommended; value excluded" : "Missing retrieval or quality flag"}</td><td>{shown(o.retrievalQualityFlag, 0)}</td>
                  </tr>)}</tbody>
                </table>
              </div>
            </>}
            <More title="SMAP source, sampling and quality rules">
              <p>NASA Harmony supplies the selected dates and variables on the native EASE-Grid 2.0; the script samples the cell containing this pin without interpolating quality flags or searching for a nearby valid value. Fill values are excluded. In the Version 6 guide, retrieval flags 0 and 8 indicate recommended-quality soil moisture; other flags are excluded from the displayed values.</p>
              <p>{SMAP_SOURCE.citation} <a href={SMAP_SOURCE.url} rel="noreferrer">Product and citation</a>; <a href={SMAP_SOURCE.guide} rel="noreferrer">Version 6 user guide, Tables 4 and 6</a>.</p>
              <ul>{result.data.smap.observations.map(o => <li key={o.date}>{o.date}: cell centre {shown(o.pixelLat, 5)}, {shown(o.pixelLon, 5)}. Source granule: <code>{o.sourceGranule}</code>.</li>)}</ul>
            </More>
          </article>
          <article className="cx-card">
            <h3>GPM IMERG monthly rainfall</h3>
            <p>Observation period: {result.data.imerg.requestedStart} to {result.data.imerg.requestedEnd}. {IMERG_SOURCE.resolution}</p>
            {result.data.imerg.status === "error" ? <Notice>{result.data.imerg.message}</Notice> : <>
              {result.data.imerg.observations.map(o => <div key={o.month}>
                <p><strong>{o.month}: {shown(o.totalMm, 2)}{o.totalMm !== null && " mm of estimated precipitation for the month"}.</strong></p>
                <p>Reported monthly mean rate: {shown(o.rateMmPerHour, 6)} mm/hour. Reported random error: {shown(o.randomErrorMmPerHour, 6)} mm/hour. Precipitation quality index: {shown(o.qualityIndex, 2)} equivalent gauges per 2.5 degree box.</p>
                <More title="IMERG source, units and comparison limits">
                  <p>The monthly amount is the reported mean rate in mm/hour multiplied by the actual number of hours in this calendar month. The quality index and random error are shown as reported, with no invented good/bad threshold. A zero estimate remains zero; a missing value remains unavailable.</p>
                  <p>Cell centre: {shown(o.pixelLat, 5)}, {shown(o.pixelLon, 5)}. Source granule: <code>{o.sourceGranule}</code>.</p>
                  <p>{IMERG_SOURCE.citation} <a href={IMERG_SOURCE.url} rel="noreferrer">Product and citation</a>; <a href={IMERG_SOURCE.guide} rel="noreferrer">IMERG technical documentation</a>.</p>
                  <p>This monthly satellite/gauge estimate and POWER regional climate use different methods and periods. This snapshot does not establish a trend or validate the full weather history.</p>
                </More>
              </div>)}
            </>}
          </article>
        </>
      )}
    </SectionShell>
  );
}
