import type { PowerResult } from "@/lib/types";
import { FIELD_BY_PARAMETER, POWER_COMMUNITY } from "@/lib/power/constants";
import { CIMIS_STATION } from "@/lib/cimis/constants";
import { formatUtc, powerOriginLine } from "../shift/format";
import type { OpenEtPanel } from "./openetData";
import type { CimisComparisonResult } from "@/lib/cimis";

type Header = Omit<PowerResult, "days">;

const PARAM_LABEL: Record<string, string> = {
  T2M_MAX: "daily highest air temperature at 2 m",
  T2M_MIN: "daily lowest air temperature at 2 m",
  RH2M: "relative humidity at 2 m",
  WS2M: "wind speed at 2 m",
  ALLSKY_SFC_SW_DWN: "sunlight reaching the ground (all-sky shortwave)",
  PRECTOTCORR: "rainfall (bias-corrected precipitation)",
};

export default function DataSources({ power, cimis, openet }: { power: Header; cimis: CimisComparisonResult; openet: OpenEtPanel }) {
  return (
    <section className="hk-block" aria-labelledby="hk-src-h">
      <h3 id="hk-src-h" className="hk-h3">Every data source</h3>
      <p className="hk-plain">Where each number comes from, how recently it was retrieved, and whether it is a saved copy. A saved copy is always labelled as one.</p>
      <ul className="hk-sources">
        <li>
          <h4 className="hk-h4"><a href="https://power.larc.nasa.gov/" rel="noreferrer">NASA POWER</a> (weather for this place)</h4>
          <p>Daily weather reconstructed from satellites and computer models (reanalysis), on a grid about 50 km across. Community: {POWER_COMMUNITY} (agriculture).</p>
          <p><strong>{powerOriginLine(power)}</strong></p>
          <p>Covers {power.coverage ? `${power.coverage.start} to ${power.coverage.end}` : "no dates"} (requested {power.requested.start} to {power.requested.end}). Grid square centred on {power.gridCell.latCenter.toFixed(2)}, {power.gridCell.lonCenter.toFixed(2)}.{power.elevationM !== null && <> Elevation reported for the grid cell: {power.elevationM.toLocaleString("en-US")} m.</>}</p>
          <div className="hk-tablewrap">
          <table className="hk-table">
            <caption className="sr-only">NASA POWER parameters and units as reported</caption>
            <thead><tr><th scope="col">Parameter</th><th scope="col">What it is</th><th scope="col">Unit as reported</th></tr></thead>
            <tbody>
              {Object.entries(FIELD_BY_PARAMETER).map(([param, field]) => (
                <tr key={param}><th scope="row"><code>{param}</code></th><td>{PARAM_LABEL[param] ?? param}</td><td>{power.units[field]}</td></tr>
              ))}
            </tbody>
          </table>
          </div>
          <p className="hk-note">Request{power.sourceUrls.length === 1 ? "" : "s"} sent:</p>
          <ul className="srclist">{power.sourceUrls.map((u) => <li key={u}><a href={u} rel="noreferrer">{u}</a></li>)}</ul>
          {power.message && <p className="hk-note">{power.message}</p>}
        </li>
        <li>
          <h4 className="hk-h4"><a href="https://www.fao.org/4/x0490e/x0490e00.htm" rel="noreferrer">FAO Irrigation and Drainage Paper 56</a> (the water-demand method)</h4>
          <p>The published method for reference water demand (ET0) and crop factors. Used as a formula, no data download.</p>
        </li>
        <li>
          <h4 className="hk-h4"><a href="https://et.water.ca.gov" rel="noreferrer">CIMIS</a> (California weather station {CIMIS_STATION}, Brentwood)</h4>
          <p>A state network of weather stations over irrigated grass. Used only for the Brentwood check below.</p>
          <p>{cimis.status === "ok"
            ? <><strong>Saved response from {cimis.fetchedAt.slice(0, 10)}</strong> (retrieved {formatUtc(cimis.fetchedAt)}), covering {cimis.comparison.dateRange ? `${cimis.comparison.dateRange.start} to ${cimis.comparison.dateRange.end}` : "no paired days"}. Unit as reported: {cimis.unit}.</>
            : <>No saved response yet. {cimis.message}</>}</p>
        </li>
        <li>
          <h4 className="hk-h4"><a href="https://openet.gitbook.io/docs" rel="noreferrer">OpenET</a> (satellite water use)</h4>
          <p>Satellite-based monthly evapotranspiration for the conterminous United States.</p>
          <p>{openet.kind === "data"
            ? <><strong>{openet.originLine}</strong> (retrieved {formatUtc(openet.fetchedAt)}), {openet.range.first ? `${openet.range.first} to ${openet.range.last}` : "no months with data"}.</>
            : <>No OpenET data for this place right now. {openet.message}</>}</p>
        </li>
        <li>
          <h4 className="hk-h4">USDA Soil Conservation Service formula, as used in FAO CROPWAT (rain that counts)</h4>
          <p>Monthly effective rainfall. Verified from a secondary source: M. Todorovic (CIHEAM-IAMB), ClimaSouth training slides, 2016 (<a href="https://www.climamed.eu/wp-content/uploads/files/Soil-water-balance-and-irrigation-scheduling_ClimaSouth.pdf" rel="noreferrer">PDF</a>), not an FAO page.</p>
        </li>
      </ul>
    </section>
  );
}
