import { loadSavedDemoPin } from "@/lib/power";
import { FRESNO_JULY_TMAX_NORMAL as N, julyMeanTmax } from "@/lib/summary/julyTmax";

/** The Fresno July comparison, computed here from the saved Fresno record; no number is typed in. Null if the saved record is unusable. */
async function fresnoLine() {
  const fresno = await loadSavedDemoPin("fresno");
  if (fresno.status !== "ok" && fresno.status !== "partial") return null;
  const j = julyMeanTmax(fresno.days);
  return j.available ? j : null;
}

/** The 50 km caveat in plain English. Wording is limited to what docs/shift-method.md and docs/et0-mapping.md support. */
export default async function Caveat50km() {
  const j = await fresnoLine();
  return (
    <section className="hk-block" aria-labelledby="hk-50-h">
      <h3 id="hk-50-h" className="hk-h3">Regional climate, about 50 km grid: what that means</h3>
      <p className="hk-plain">
        The weather in this app is NASA POWER <strong>reanalysis</strong>. That is a computer reconstruction of past weather, built from satellites and weather models, laid out on a grid whose squares are about 50 km across.
        It is <strong>not a sensor in your field</strong>. Every number describes the whole grid square around your pin, which may include hills, towns, dry land and irrigated land that your field is not part of.
      </p>
      <ul className="hk-list">
        <li>
          In an early check, NASA POWER read hotter than weather stations at the example places.
          {j ? (
            <>
              {" "}For Fresno, the saved NASA POWER record gives a July average daily high of {j.meanC.toFixed(1)} &deg;C ({j.yearsUsed} Julys, {j.firstYear} to {j.lastYear}), against {N.valueC.toFixed(1)} &deg;C for the official NOAA July normal ({N.period}) at the station {N.station}.{" "}
              <a href={N.url} target="_blank" rel="noopener noreferrer">NOAA source data</a> (read on 15 Nov 2026). The two periods and places differ, so treat the gap as rough.
            </>
          ) : (
            <> We could not compute a Fresno July figure from the saved record on this page, so no number is shown.</>
          )}{" "}
          Counts of hot days are therefore regional-grid counts, likely higher than a station would record. The change between periods is the point, not the absolute count.
        </li>
        <li>In dry areas, expect higher water demand (ET0) than an irrigated-station reading would give, because a grid square mixes dry surrounding land while a reference station sits over wet grass. We have not measured that gap everywhere. The Brentwood check below measures it for one place.</li>
        <li>Pressure and sunlight calculations use the average height of the whole grid square, not your field&rsquo;s height.</li>
      </ul>
    </section>
  );
}
