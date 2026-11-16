import { SectionShell } from "./parts";

export const EARTHDATA_REGISTER = "https://urs.earthdata.nasa.gov/users/new";
export const EARTHDATA_TOKEN = "https://urs.earthdata.nasa.gov/profile";

export const BLOCKED_DATASETS: { name: string; what: string }[] = [
  { name: "ECOSTRESS land-surface temperature and evapotranspiration", what: "Land-surface temperature and water use from thermal images taken on the International Space Station." },
  { name: "GLDAS / NLDAS land models", what: "NASA land-surface model output for soil moisture and runoff." },
];

/** Data this app has not connected, and exactly why. Reads no environment variable and shows nothing in place of the missing data. */
export default function BlockedCard() {
  return (
    <SectionShell id="blocked" title="Data layers not connected">
      <div className="cx-card cx-card--blocked">
        <p>
          These additional NASA data sets have not been implemented. <strong>No data are shown for them; nothing is estimated in their place.</strong> SMAP and IMERG have a separate saved-snapshot section above; that section states the dates, quality and any unavailable data for this location.
        </p>
        <ul className="cx-lines">
          {BLOCKED_DATASETS.map((d) => (
            <li key={d.name}><strong>{d.name}.</strong> {d.what}</li>
          ))}
        </ul>
        <p>
          Future connections need product-specific access checks and a free <a href={EARTHDATA_REGISTER} rel="noreferrer">NASA Earthdata account</a>. Tokens from your <a href={EARTHDATA_TOKEN} rel="noreferrer">Earthdata profile page</a> belong only on the fetch machine, never in a web page. An account and token alone do not connect a new data set.
        </p>
        <p>
          <strong>Other saved comparisons:</strong> the OpenET satellite water-use panel and the CIMIS weather-station check are in the &ldquo;How we know&rdquo; panel on the shift and replay pages. Those panels use real saved responses and display their saved-response dates; keys are needed only to fetch replacements.
        </p>
      </div>
    </SectionShell>
  );
}
