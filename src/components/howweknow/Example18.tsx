import { EXAMPLE18, EXAMPLE18_URL, runExample18 } from "@/lib/et0/example18";

const f2 = (v: number) => v.toFixed(2);
const signed = (v: number) => (Math.abs(v) < 0.005 ? "0.00" : `${v >= 0 ? "+" : "−"}${Math.abs(v).toFixed(2)}`);

/** Recomputes FAO-56 Example 18 with the app's real ET0 code each time this renders. */
export default function Example18() {
  const r = runExample18();
  return (
    <section className="hk-block" aria-labelledby="hk-ex18-h">
      <h3 id="hk-ex18-h" className="hk-h3">The water-demand formula passes the FAO worked example</h3>
      <p className="hk-plain">
        Everything in this app starts from a daily &ldquo;reference water demand&rdquo; (ET0) worked out with the FAO-56 Penman-Monteith formula. To check our code, we feed it the weather from the worked example in the
        FAO manual ({EXAMPLE18.placeName}, 6 July: highest {EXAMPLE18.tMaxC} &deg;C, lowest {EXAMPLE18.tMinC} &deg;C, humidity {EXAMPLE18.rhMinPct} to {EXAMPLE18.rhMaxPct}%, wind {EXAMPLE18.windKmhAt10m} km/h, {EXAMPLE18.sunshineH} hours of sunshine)
        and see whether we get the manual&rsquo;s answer. This is worked out again every time this page is built, not copied in.
      </p>
      <table className="hk-table hk-table--kv">
        <caption className="sr-only">FAO-56 Example 18 against this app&rsquo;s result</caption>
        <tbody>
          <tr><th scope="row">Our result</th><td><strong>{f2(r.ourMmPerDay)} mm/day</strong></td></tr>
          <tr><th scope="row">Published result</th><td>{r.publishedMmPerDay.toFixed(1)} mm/day (FAO&rsquo;s worked figure {r.faoWorkedMmPerDay.toFixed(2)})</td></tr>
          <tr><th scope="row">Difference from published</th><td>{signed(r.differenceMmPerDay)} mm/day ({signed(r.differenceFromWorkedMmPerDay)} from the {r.faoWorkedMmPerDay.toFixed(2)} figure)</td></tr>
          <tr><th scope="row">Test: within &plusmn;{r.toleranceMmPerDay.toFixed(1)} mm/day</th><td><span className={`hk-pill ${r.pass ? "hk-pill--ok" : "hk-pill--bad"}`}>{r.pass ? "Pass" : "FAIL"}</span></td></tr>
        </tbody>
      </table>
      <p className="hk-note">
        Source: <a href={EXAMPLE18_URL} rel="noreferrer">FAO Irrigation and Drainage Paper 56, Chapter 4, Example 18</a>. The same inputs are used by the automated test in the code, from one shared file.
      </p>
    </section>
  );
}
