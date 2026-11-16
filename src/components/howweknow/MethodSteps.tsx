/** How the replay is worked out, and what it leaves out. Static text; no numbers are typed in that code could compute. */
export default function MethodSteps() {
  return (
    <section className="hk-block" aria-labelledby="hk-how-h">
      <h3 id="hk-how-h" className="hk-h3">How the replay is worked out</h3>
      <ol className="method__steps">
        <li><strong>Reference water demand.</strong> For every day, the FAO-56 Penman-Monteith method turns temperature, humidity, wind and sunshine into the water a well-watered reference grass would use (ET0).</li>
        <li><strong>Crop water need.</strong> The crop&rsquo;s water use each day is its crop factor times that reference demand. The crop factor changes through the season (initial, development, mid-season, late) following FAO Irrigation and Drainage Paper 56, Chapter 6 (<a href="https://www.fao.org/4/x0490e/x0490e0b.htm" rel="noreferrer">fao.org/4/x0490e/x0490e0b.htm</a>), using the table values as printed.</li>
        <li><strong>Minus rain that counts.</strong> Not all rain helps a crop. Monthly effective rainfall uses the USDA Soil Conservation Service formula as used in FAO CROPWAT: Pe = P &times; (125 &minus; 0.2 P) / 125 up to 250 mm a month, and 125 + 0.1 P above that. The formula was verified from a secondary source, not an FAO page: M. Todorovic (CIHEAM-IAMB), ClimaSouth training slides, 2016 (<a href="https://www.climamed.eu/wp-content/uploads/files/Soil-water-balance-and-irrigation-scheduling_ClimaSouth.pdf" rel="noreferrer">PDF</a>). FAO Irrigation and Drainage Paper 25 describes the original USDA method only as a table lookup. Each month&rsquo;s effective rain is shared across the season days in proportion to the rain that fell on them.</li>
        <li><strong>Need versus supply.</strong> The need is max(0, modelled crop water demand &minus; effective rain). A season is short when that need is more than your selected supply, otherwise it is covered. Covered describes this water comparison, not crop survival or yield. Seasons with too much missing weather data are grey and never filled in.</li>
        <li><strong>Seasons and rotations.</strong> A season is labelled by its harvest year. Planting dates and stage lengths are fixed from the catalog, so a winter crop&rsquo;s 1986 season starts in autumn 1985. A rotation repeats its crops in order, one per season, from 1986.</li>
      </ol>
      <h4 className="hk-h4">What this does not account for</h4>
      <ul className="method__limits">
        <li>No soil water carried over between seasons and no stored winter rain. This overstates the need of winter crops that draw on stored soil water.</li>
        <li>No delivery losses or irrigation efficiency: your supply is compared with the net crop need. A real system must deliver more than the net need.</li>
        <li>Planting dates and stage lengths are the same every year, and crop factors are table values without the FAO-56 climate adjustment.</li>
        <li>The weather is regional climate, about 50 km grid. This kind of reanalysis may read high compared with an irrigated field station.</li>
        <li>The monthly effective-rain formula, shared across the season, is an approximation.</li>
        <li>Hot days are shown for information only. Ten seasons per decade is a small sample, so the counts describe what the record shows, not a trend or a forecast.</li>
      </ul>
    </section>
  );
}
