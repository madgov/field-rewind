import Link from "next/link";
import { getPowerData } from "@/lib/power";
import { validateCoordinates } from "@/lib/power/grid";
import { computeShift } from "@/lib/shift/compute";
import { formatTempC, formatTempF } from "@/lib/shift/units";
import type { MetricId } from "@/lib/shift/types";
import Hero, { heroTone } from "./Hero";
import MetricCard from "./MetricCard";
import Provenance from "./Provenance";
import Stripes from "./Stripes";
import { buildStripeProps } from "./stripeData";
import { LoadingState, PlaceLinks, Problem } from "./States";
import { demoNameFor, latText, lonText } from "./format";

export { LoadingState };

const ORDER: MetricId[] = ["hotDays", "et0", "precip"];

type Params = { lat?: string | string[]; lon?: string | string[] };

function parse(v: string | string[] | undefined): number {
  if (typeof v !== "string" || v.trim() === "") return NaN;
  return Number(v);
}

export default async function ShiftContent({ searchParams }: { searchParams: Promise<Params> }) {
  const sp = await searchParams;
  const lat = parse(sp.lat);
  const lon = parse(sp.lon);
  const bad = validateCoordinates(lat, lon);
  if (bad) {
    const missing = sp.lat === undefined || sp.lon === undefined;
    return (
      <Problem
        title="We need a spot on the map first"
        lines={[
          missing ? "This page needs a latitude and longitude, and none was given." : "That latitude and longitude do not describe a place on Earth.",
          ...(missing ? [] : [bad]),
        ]}
        nextStep="Go back to the map and drop a pin on your field, or try one of the example places."
      />
    );
  }

  const power = await getPowerData(lat, lon);
  const retryHref = `/shift?lat=${lat.toFixed(4)}&lon=${lon.toFixed(4)}`;

  if (power.status === "error") {
    return (
      <Problem
        title="NASA POWER could not give us the weather history"
        lines={["No result is shown, because the app never fills the gap with made-up numbers."]}
        exact={power.message ?? "NASA POWER returned an error with no message."}
        nextStep="Try again in a moment, or try one of the example places, which use a saved response."
        retryHref={retryHref}
      />
    );
  }
  if (power.status === "no-coverage") {
    return (
      <Problem
        title="NASA POWER has no data for this spot"
        lines={["NASA POWER returned no daily values for this location."]}
        exact={power.message ?? undefined}
        nextStep="Pick a spot on land, or try one of the example places."
      />
    );
  }

  const shift = computeShift(power);
  if (shift.status === "unavailable") {
    return <Problem title="We cannot show a shift for this spot" lines={[shift.reason]} nextStep={shift.nextStep} retryHref={retryHref} />;
  }

  const { days, ...header } = power;
  void days;
  const metrics = ORDER.map((id) => shift.metrics[id]);
  const demo = demoNameFor(lat, lon);
  const place = demo ?? `${latText(lat)}, ${lonText(lon)}`;
  const gridText = `Grid square centred on ${latText(power.gridCell.latCenter, 2)}, ${lonText(power.gridCell.lonCenter, 2)}`;
  const thresholdNote = `Hot day: over ${formatTempC(shift.rules.hotDayThresholdC)} (${formatTempF(shift.rules.hotDayThresholdC)})`;

  return (
    <>
      <Hero tone={heroTone(metrics)} place={place} gridText={gridText} headline={shift.overallHeadline} detail={shift.overallDetail} />
      <main className="sh-main">
        <section aria-labelledby="nums-h">
          <h2 id="nums-h" className="sh-h2">Three numbers, compared across two periods</h2>
          <div className="mcards">
            {metrics.map((m, i) => (
              <MetricCard key={m.id} metric={m} index={i} thresholdNote={m.id === "hotDays" ? thresholdNote : undefined} />
            ))}
          </div>
        </section>

        <section aria-labelledby="strips-h" className="strips">
          <h2 id="strips-h" className="sh-h2">Year by year</h2>
          <p className="sh-lede">One stripe per year. Darker means a higher value for that measure, scaled to that measure&rsquo;s own range.</p>
          {metrics.map((m) => (
            <div key={m.id} className="stripcard">
              <h3 className="stripcard__title">{m.label} <span className="stripcard__unit">{m.unit}</span></h3>
              <Stripes data={buildStripeProps(m)} />
            </div>
          ))}
        </section>

        <Provenance power={header} rules={shift.rules} />
        <PlaceLinks label="See another place" />
      </main>
      <footer className="footer sh-footer">
        <p>Data: NASA POWER. Regional climate, about 50 km grid.</p>
        <Link href="/">Back to the map</Link>
      </footer>
    </>
  );
}
