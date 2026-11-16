import Link from "next/link";
import { SITE_LINKS } from "@/components/site/links";
import { Suspense } from "react";
import { connection } from "next/server";
import { DEMO_PINS } from "@/lib/demoPins";
import { validateCoordinates } from "@/lib/power/grid";
import { EXAMPLE_FARM_PARAM, exampleFarmPin } from "../replay/exampleFarm";
import { PlaceLinks, Problem } from "../shift/States";
import { latText, lonText } from "../shift/format";
import LayerSources from "../howweknow/LayerSources";
import BlockedCard from "./BlockedCard";
import EarthdataSection from "./EarthdataSection";
import MapSection from "./MapSection";
import { SectionLoading } from "./parts";
import { GroundSection, HeatFrostSection, LandformSection, SoilWetnessSection, VegetationSection } from "./sections";
import { YearSection } from "./YearSection";

type Params = Record<string, string | string[] | undefined>;

function parse(v: string | string[] | undefined): number {
  if (typeof v !== "string" || v.trim() === "") return NaN;
  return Number(v);
}

const SLOW = "A new place can take 15 to 60 seconds, because the satellite record is read live. Saved example places load at once.";

export function ConditionsLoading() {
  return (
    <div className="sh-loading" role="status" aria-live="polite">
      <header className="sh-hero sh-hero--calm">
        <div className="sh-hero__furrows" aria-hidden="true" />
        <div className="sh-hero__inner">
          <p className="sh-hero__place">Field conditions</p>
          <h1 className="sh-hero__title">Getting the conditions for your spot</h1>
          <p className="sh-hero__sub">Each section below loads on its own. Nothing is made up while you wait.</p>
        </div>
      </header>
    </div>
  );
}

const NAV = [
  ["frost", "Heat and frost"],
  ["soil", "Soil wetness"],
  ["earthdata", "NASA snapshots"],
  ["veg", "Vegetation"],
  ["land", "Soil and terrain"],
  ["map", "Map"],
  ["ground", "Ground checks"],
  ["year", "Yearly view"],
  ["blocked", "Not connected"],
] as const;

export default async function ConditionsContent({ searchParams }: { searchParams: Promise<Params> }) {
  const sp = await searchParams;
  // Pages that read the clock or fetch live data are rendered per request, never at build time.
  await connection();
  const example = sp[EXAMPLE_FARM_PARAM] === "1";
  let lat = example ? exampleFarmPin().lat : parse(sp.lat);
  let lon = example ? exampleFarmPin().lon : parse(sp.lon);
  const bad = validateCoordinates(lat, lon);
  if (bad) {
    const missing = sp.lat === undefined || sp.lon === undefined;
    return (
      <Problem
        basePath="/conditions"
        title="We need a spot on the map first"
        lines={[missing ? "This page needs a latitude and longitude, and none was given." : "That latitude and longitude do not describe a place on Earth.", ...(missing ? [] : [bad])]}
        nextStep="Go back to the map and drop a pin on your field, or try one of the example places."
      />
    );
  }
  // A point within about 50 m of an example place is that place, so every layer reads the same saved files.
  const demo = DEMO_PINS.find((p) => Math.abs(p.lat - lat) < 0.0005 && Math.abs(p.lon - lon) < 0.0005) ?? null;
  if (demo) {
    lat = demo.lat;
    lon = demo.lon;
  }
  const place = demo ? demo.name : `${latText(lat)}, ${lonText(lon)}`;
  const q = `lat=${lat.toFixed(4)}&lon=${lon.toFixed(4)}`;
  const slow = demo ? undefined : SLOW;

  return (
    <>
      <header className="sh-hero sh-hero--calm cx-hero">
        <div className="sh-hero__furrows" aria-hidden="true" />
        <div className="sh-hero__inner">
          <Link href="/" className="sh-back">
            <svg viewBox="0 0 20 20" width="18" height="18" aria-hidden="true"><path d="M12.5 4 6.5 10l6 6" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" /></svg>
            Back to the map
          </Link>
          <p className="sh-hero__place">{place}</p>
          <h1 className="sh-hero__title">Field conditions</h1>
          <p className="sh-hero__sub">What the satellites, the weather record and the soil survey say about this spot, each with its source and its limits. Every number comes from a real data set; where one is missing, the page says so.</p>
          <ul className="sh-hero__chips">
            <li className="chip chip--strong">Weather parts: regional climate, about 50 km grid</li>
            <li className="chip">{demo ? "Saved example place" : "Your own spot"}</li>
          </ul>
          <p className="cx-herolinks">
            <Link className="btn btn--ghost" href={`/shift?${q}`}>How this field has shifted</Link>
            <Link className="btn btn--ghost" href={`/replay?${q}`}>Replay 40 seasons</Link>
            <Link className="btn btn--ghost" href={`/ask?${q}`}>Ask the field advisor about this place</Link>
          </p>
        </div>
      </header>
      <nav className="cx-nav" aria-label="Sections on this page">
        <ul>
          {NAV.map(([id, label]) => (
            <li key={id}><a href={`#cx-${id}`}>{label}</a></li>
          ))}
        </ul>
      </nav>
      <main className="sh-main cx-main">
        <Suspense fallback={<SectionLoading id="frost" title="Heat and frost" />}><HeatFrostSection lat={lat} lon={lon} /></Suspense>
        <Suspense fallback={<SectionLoading id="soil" title="Soil wetness (modelled)" />}><SoilWetnessSection lat={lat} lon={lon} /></Suspense>
        <Suspense fallback={<SectionLoading id="earthdata" title="NASA soil moisture and rainfall snapshots" />}><EarthdataSection lat={lat} lon={lon} /></Suspense>
        <Suspense fallback={<SectionLoading id="veg" title="Vegetation seen from space" slow={slow} />}><VegetationSection lat={lat} lon={lon} /></Suspense>
        <Suspense fallback={<SectionLoading id="land" title="Soil and terrain" slow={slow} />}><LandformSection lat={lat} lon={lon} /></Suspense>
        <Suspense fallback={<SectionLoading id="map" title="Look at the ground" slow={slow} />}><MapSection lat={lat} lon={lon} place={place} /></Suspense>
        <Suspense fallback={<SectionLoading id="ground" title="Ground checks" slow={slow} />}><GroundSection lat={lat} lon={lon} /></Suspense>
        <Suspense fallback={<SectionLoading id="year" title="Harmonized yearly view" slow={slow} />}><YearSection lat={lat} lon={lon} /></Suspense>
        <BlockedCard />
        <Suspense fallback={null}><LayerSources lat={lat} lon={lon} heading="Where these layers come from, and their limits" /></Suspense>
        <PlaceLinks label="See another place" basePath="/conditions" />
      </main>
      <footer className="footer sh-footer">
        <p>Weather data: NASA POWER, regional climate, about 50 km grid. Satellites: Landsat (USGS) and MODIS (NASA). Maps: OpenStreetMap contributors.</p>
        {SITE_LINKS.map((l) => (
          <Link key={l.href} href={l.href}>{l.label}</Link>
        ))}
        <Link href="/">Back to the map</Link>
      </footer>
    </>
  );
}
