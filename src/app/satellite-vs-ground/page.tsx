import type { Metadata } from "next";
import "@/components/shift/shift.css";
import "@/components/site/site.css";
import FindingsView from "@/components/site/FindingsView";
import SatelliteView from "@/components/site/SatelliteView";
import SiteShell from "@/components/site/SiteShell";
import { loadFindingsCached } from "@/lib/site/findingsCached";
import { loadSatelliteVsGround } from "@/lib/site/satellite";

export const metadata: Metadata = {
  title: "Satellite vs ground | Field Rewind",
  description: "What each satellite, model and ground layer in Field Rewind can and cannot tell you, with sources and the app's own saved comparisons.",
};

export default async function SatelliteVsGroundPage() {
  const data = loadSatelliteVsGround();
  const findings = await loadFindingsCached();
  return (
    <SiteShell
      kicker="Satellite vs ground"
      title="What from space, what from the ground, and what neither can tell you"
      sub="Every layer in this app is either seen from space, built by a computer model, or measured on the ground. Here is what each one can and cannot say about your field."
      chips={["Regional climate, about 50 km grid", `${data.layers.length} layers`, `Sources read ${data.compiledOn}`]}
      currentHref="/satellite-vs-ground"
    >
      <p className="st-note">{data.note}</p>
      <SatelliteViewIntroAndFindings data={data} findings={findings} />
    </SiteShell>
  );
}

function SatelliteViewIntroAndFindings({ data, findings }: { data: ReturnType<typeof loadSatelliteVsGround>; findings: Awaited<ReturnType<typeof loadFindingsCached>> }) {
  return (
    <>
      <section className="st-sec" aria-labelledby="sv-find-h">
        <h2 id="sv-find-h">What this app found at its three demo places</h2>
        <p className="st-lede">These come from the saved responses committed with the app, and every block carries its own &ldquo;Saved response from [date]&rdquo; label. They are comparisons, not scores.</p>
        <FindingsView f={findings} />
      </section>
      <SatelliteView data={data} />
    </>
  );
}
