import Link from "next/link";
import { SITE_LINKS } from "@/components/site/links";
import { connection } from "next/server";
import { usableCrops } from "@/lib/crops/catalog";
import { cropRegionNotice } from "@/lib/crops/region";
import { getPowerData, loadSavedDemoPin } from "@/lib/power";
import { validateCoordinates } from "@/lib/power/grid";
import { matchDemoPin } from "@/lib/groundTruth/service";
import { buildSeasonTable } from "@/lib/replay";
import HowWeKnow from "../howweknow/HowWeKnow";
import { LoadingState, PartialNotice, Problem, powerProblemScreen } from "../shift/States";
import { demoNameFor, latText, lonText, powerOriginLine } from "../shift/format";
import { EXAMPLE_FARM_PARAM, exampleFarmHref, exampleFarmPin } from "./exampleFarm";
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
  // Reading the clock must happen at request time, not while prerendering.
  await connection();
  // Example farm: the committed saved Brentwood response only. It never goes through the live path, so it cannot contact NASA.
  const exampleFarm = sp[EXAMPLE_FARM_PARAM] === "1";
  const lat = exampleFarm ? exampleFarmPin().lat : parse(sp.lat);
  const lon = exampleFarm ? exampleFarmPin().lon : parse(sp.lon);
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

  const power = exampleFarm ? await loadSavedDemoPin(exampleFarmPin().id) : await getPowerData(lat, lon);
  const retryHref = exampleFarm ? exampleFarmHref() : `/replay?lat=${lat.toFixed(4)}&lon=${lon.toFixed(4)}`;

  const problem = powerProblemScreen(power, { basePath: "/replay", retryHref, what: "replay" });
  if (problem) return problem;

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
          <h1 className="sh-hero__title">Would your water supply have met your rotation&rsquo;s modelled needs?</h1>
          <p className="sh-hero__sub">Choose 2 or 3 crop rotations and a water supply. Every season from 1986 to 2025 is replayed against the weather record for this spot.</p>
          <ul className="sh-hero__chips">
            <li className="chip chip--strong">Regional climate, about 50 km grid</li>
            <li className={`chip ${power.origin === "saved" ? "chip--saved" : ""}`} data-testid="origin-chip">{powerOriginLine(power)}</li>
            <li className="chip">{gridText}</li>
          </ul>
          <p className="cx-herolinks">
            <Link className="btn btn--ghost" href={`/conditions?lat=${lat.toFixed(4)}&lon=${lon.toFixed(4)}`}>Field conditions for this spot</Link>
          </p>
        </div>
      </header>
      {power.status === "partial" && <div className="rp-partial"><PartialNotice power={power} mode="replay" /></div>}
      <ReplayApp
        exampleFarm={exampleFarm}
        originLine={powerOriginLine(power)}
        region={cropRegionNotice(lat, lon)}
        pinId={matchDemoPin(lat, lon)}
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
        {SITE_LINKS.map((l) => (
          <Link key={l.href} href={l.href}>{l.label}</Link>
        ))}
        <Link href="/">Back to the map</Link>
      </footer>
    </>
  );
}
