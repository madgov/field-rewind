import type { PowerResult } from "@/lib/types";

type Header = Omit<PowerResult, "days">;

export default function Method({ header, dataLabel, notes }: { header: Header; dataLabel: string; notes: string[] }) {
  return (
    <div className="method">
      <section className="prov" aria-labelledby="rp-prov-h">
        <h3 id="rp-prov-h" className="prov__h3 method__h">Where the weather came from</h3>
        <p className="prov__origin"><strong>{dataLabel}</strong></p>
        <p className="prov__origin2">Regional climate, about 50 km grid. NASA POWER is reanalysis (a computer reconstruction of past weather), not a sensor in your field.</p>
        <ProvLinks header={header} />
        {notes.length > 0 && (
          <ul className="method__notes">
            {notes.map((n) => <li key={n}>{n}</li>)}
          </ul>
        )}
      </section>

      <section className="prov" aria-labelledby="rp-how-h">
        <h3 id="rp-how-h" className="prov__h3 method__h">How this is worked out</h3>
        <ol className="method__steps">
          <li><strong>Reference water demand.</strong> For every day, the FAO-56 Penman-Monteith method turns temperature, humidity, wind and sunshine into the water a well-watered reference grass would use (ET0).</li>
          <li><strong>Crop water need.</strong> The crop&rsquo;s water use each day is its crop factor times that reference demand. The crop factor changes through the season (initial, development, mid-season, late) following FAO Irrigation and Drainage Paper 56, Chapter 6 (<a href="https://www.fao.org/4/x0490e/x0490e0b.htm" rel="noreferrer">fao.org/4/x0490e/x0490e0b.htm</a>), using the table values as printed.</li>
          <li><strong>Minus rain that counts.</strong> Not all rain helps a crop. Monthly effective rainfall uses the USDA Soil Conservation Service formula as used in FAO CROPWAT: Pe = P &times; (125 &minus; 0.2 P) / 125 up to 250 mm a month, and 125 + 0.1 P above that. The formula was verified from a secondary source, not an FAO page: M. Todorovic (CIHEAM-IAMB), ClimaSouth training slides, 2016 (<a href="https://www.climamed.eu/wp-content/uploads/files/Soil-water-balance-and-irrigation-scheduling_ClimaSouth.pdf" rel="noreferrer">PDF</a>). FAO Irrigation and Drainage Paper 25 describes the original USDA method only as a table lookup. Each month&rsquo;s effective rain is shared across the season days in proportion to the rain that fell on them.</li>
          <li><strong>Need versus supply.</strong> The need is max(0, crop water demand &minus; effective rain). A season is short when the need is more than your supply, otherwise it is covered. Seasons with too much missing weather data are grey and never filled in.</li>
          <li><strong>Seasons and rotations.</strong> A season is labelled by its harvest year. Planting dates and stage lengths are fixed from the catalog, so a winter crop&rsquo;s 1986 season starts in autumn 1985. A rotation repeats its crops in order, one per season, from 1986.</li>
        </ol>
      </section>

      <details className="disc">
        <summary>What this does not account for</summary>
        <ul className="method__limits">
          <li>No soil water carried over between seasons and no stored winter rain. This overstates the need of winter crops that draw on stored soil water.</li>
          <li>No delivery losses or irrigation efficiency: your supply is compared with the net crop need. A real system must deliver more than the net need.</li>
          <li>Planting dates and stage lengths are the same every year, and crop factors are table values without the FAO-56 climate adjustment.</li>
          <li>The weather is regional climate, about 50 km grid. This kind of reanalysis may read high compared with an irrigated field station.</li>
          <li>The monthly effective-rain formula, shared across the season, is an approximation and tends to give lower effective rain than some other methods.</li>
          <li>Hot days are shown for information only. Ten seasons per decade is a small sample, so the counts describe what the record shows, not a trend or a forecast.</li>
        </ul>
      </details>
    </div>
  );
}

function ProvLinks({ header }: { header: Header }) {
  // Source requests come from the saved or fetched response itself; shown as links, never rewritten.
  return (
    <>
      <p className="method__sub">Source requests</p>
      <ul className="srclist">
        {header.sourceUrls.map((u) => (
          <li key={u}><a href={u} rel="noreferrer">{u}</a></li>
        ))}
      </ul>
      {header.message && <p className="prov__msg">{header.message}</p>}
      {header.status === "partial" && !header.message && (
        <p className="prov__msg">Some data is missing: {header.missing.anyField.toLocaleString("en-US")} of {header.missing.totalDays.toLocaleString("en-US")} days have at least one missing value. Missing days are never filled in.</p>
      )}
    </>
  );
}

