/** The 50 km caveat in plain English. Wording is limited to what docs/shift-method.md and docs/et0-mapping.md support. */
export default function Caveat50km() {
  return (
    <section className="hk-block" aria-labelledby="hk-50-h">
      <h3 id="hk-50-h" className="hk-h3">Regional climate, about 50 km grid: what that means</h3>
      <p className="hk-plain">
        The weather in this app is NASA POWER <strong>reanalysis</strong>. That is a computer reconstruction of past weather, built from satellites and weather models, laid out on a grid whose squares are about 50 km across.
        It is <strong>not a sensor in your field</strong>. Every number describes the whole grid square around your pin, which may include hills, towns, dry land and irrigated land that your field is not part of.
      </p>
      <ul className="hk-list">
        <li>In an early check (Stage 1), NASA POWER read hotter than weather stations at the example places: its Fresno July average daily high was 40.0 &deg;C against a station normal near 36 &deg;C. Counts of hot days are therefore regional-grid counts, likely higher than a station would record. The change between periods is the point, not the absolute count.</li>
        <li>In dry areas, expect higher water demand (ET0) than an irrigated-station reading would give, because a grid square mixes dry surrounding land while a reference station sits over wet grass. We have not measured that gap everywhere. The Brentwood check below measures it for one place.</li>
        <li>Pressure and sunlight calculations use the average height of the whole grid square, not your field&rsquo;s height.</li>
      </ul>
    </section>
  );
}
