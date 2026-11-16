import { SectionShell } from "./parts";

export const EARTHDATA_REGISTER = "https://urs.earthdata.nasa.gov/users/new";
export const EARTHDATA_TOKEN = "https://urs.earthdata.nasa.gov/profile";

export const BLOCKED_DATASETS: { name: string; what: string }[] = [
  { name: "SMAP soil moisture", what: "Soil moisture measured from a NASA satellite." },
  { name: "GPM IMERG rainfall", what: "Rainfall estimated from NASA satellites." },
  { name: "ECOSTRESS land-surface temperature and evapotranspiration", what: "Land-surface temperature and water use from thermal images taken on the International Space Station." },
  { name: "GLDAS / NLDAS land models", what: "NASA land-surface model output for soil moisture and runoff." },
];

/** Data this app has not connected, and exactly why. Reads no environment variable and shows nothing in place of the missing data. */
export default function BlockedCard() {
  return (
    <SectionShell id="blocked" title="Data layers not connected">
      <div className="cx-card cx-card--blocked">
        <p>
          These NASA data sets are not shown on this page. Each needs a free NASA Earthdata account and an access token, and this app has not been connected to one. <strong>No data are shown for them; nothing is estimated in their place.</strong>
        </p>
        <ul className="cx-lines">
          {BLOCKED_DATASETS.map((d) => (
            <li key={d.name}><strong>{d.name}.</strong> {d.what}</li>
          ))}
        </ul>
        <p>
          To connect them: <a href={EARTHDATA_REGISTER} rel="noreferrer">register for a free NASA Earthdata account</a>, then create a token on your <a href={EARTHDATA_TOKEN} rel="noreferrer">Earthdata profile page</a>. The token goes into the server settings, never into a web page.
        </p>
        <p>
          <strong>Also not run:</strong> the OpenET satellite water-use panel and the CIMIS weather-station check are in the &ldquo;How we know&rdquo; panel on the shift and replay pages. They are built, but they have not run because their keys are not set, and they show that exact reason there.
        </p>
      </div>
    </SectionShell>
  );
}
