import Link from "next/link";
import { usableCrops } from "@/lib/crops/catalog";
import { getPowerData } from "@/lib/power";
import { validateCoordinates } from "@/lib/power/grid";
import { buildSeasonTable } from "@/lib/replay";
import HowWeKnow from "../howweknow/HowWeKnow";
import { LoadingState, Problem } from "../shift/States";
import { demoNameFor, latText, lonText } from "../shift/format";
import ReplayApp from "./ReplayApp";
import { parseState } from "./urlState";

type Params = Record<string, string | string[] | undefined>;

export function ReplayLoading() {
  return <LoadingState />;
}

function parse(v: string | string[] | undefined): number {
  if (typeof v !== "string" || v.trim() === "") return NaN;
  return Number(v);
}

export default async function ReplayContent({ searchParams }: { searchParams: Promise<Params> }) {
  const sp = await searchParams;
  const lat = parse(sp.lat);
  const lon = parse(sp.lon);
  const bad = validateCoordinates(lat, lon);
  if (bad) {
    const missing = sp.lat === undefined || sp.lon === undefined;
    return (
      <Problem
        basePath="/replay"
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
  const retryHref = `/replay?lat=${lat.toFixed(4)}&lon=${lon.toFixed(4)}`;

  if (power.status === "error") {
    return (
      <Problem
        basePath="/replay"
        title="NASA POWER could not give us the weather history"
        lines={["No replay is shown, because the app never fills the gap with made-up numbers."]}
        exact={power.message ?? "NASA POWER returned an error with no message."}
        nextStep="Try again in a moment, or try one of the example places, which use a saved response."
        retryHref={retryHref}
      />
    );
  }
  if (power.status === "no-coverage") {
    return (
      <Problem
        basePath="/replay"
        title="NASA POWER has no data for this spot"
        lines={["NASA POWER returned no daily values for this location."]}
        exact={power.message ?? undefined}
        nextStep="Pick a spot on land, or try one of the example places."
      />
    );
  }

  const crops = usableCrops();
  const built = buildSeasonTable(power, crops);
  if (built.status === "unavailable") {
    return <Problem basePath="/replay" title="We cannot replay the seasons for this spot" lines={[built.reason]} nextStep={built.nextStep} retryHref={retryHref} />;
  }
  // The table only holds crops the engine could use; the picker only offers those.
  const usable = crops.filter((c) => built.table.needs[c.id]);
  let maxNeed = 0;
  for (const list of Object.values(built.table.needs)) for (const s of list) if (s.needMm !== null && s.needMm > maxNeed) maxNeed = s.needMm;
  // Slider range: 0 up to the next round 100 mm above the largest season need of any usable crop on this record.
  let supplyMaxMm = Math.ceil(maxNeed / 100) * 100;
  if (supplyMaxMm <= maxNeed) supplyMaxMm += 100;

  const { state, notes } = parseState(sp, { validCropIds: new Set(usable.map((c) => c.id)), supplyMaxMm });

  const { days, ...header } = power;
  void days;
  const demo = demoNameFor(lat, lon);
  const place = demo ?? `${latText(lat)}, ${lonText(lon)}`;
  const gridText = `Grid square centred on ${latText(power.gridCell.latCenter, 2)}, ${lonText(power.gridCell.lonCenter, 2)}`;

  return (
    <>
      <header className="sh-hero sh-hero--calm rp-hero">
        <div className="sh-hero__furrows" aria-hidden="true" />
        <div className="sh-hero__inner">
          <Link href={`/shift?lat=${lat.toFixed(4)}&lon=${lon.toFixed(4)}`} className="sh-back">
            <svg viewBox="0 0 20 20" width="18" height="18" aria-hidden="true"><path d="M12.5 4 6.5 10l6 6" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" /></svg>
            Back to how this field has shifted
          </Link>
          <p className="sh-hero__place">{place}</p>
          <h1 className="sh-hero__title">Would your rotation have survived the last 40 seasons?</h1>
          <p className="sh-hero__sub">Choose 2 or 3 crop rotations and a water supply. Every season from 1986 to 2025 is replayed against the weather record for this spot.</p>
          <ul className="sh-hero__chips">
            <li className="chip chip--strong">Regional climate, about 50 km grid</li>
            <li className="chip">{built.table.dataLabel}</li>
            <li className="chip">{gridText}</li>
          </ul>
        </div>
      </header>
      <ReplayApp
        key={`${lat}|${lon}`}
        table={built.table}
        crops={usable}
        howWeKnow={<HowWeKnow page="replay" power={power} place={place} />}
        place={place}
        gridText={gridText}
        header={header}
        lat={lat}
        lon={lon}
        supplyMaxMm={supplyMaxMm}
        initial={state}
        notes={notes}
      />
      <footer className="footer sh-footer">
        <p>Data: NASA POWER. Regional climate, about 50 km grid.</p>
        <Link href="/">Back to the map</Link>
      </footer>
    </>
  );
}
