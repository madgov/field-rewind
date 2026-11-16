import { DEMO_PINS } from "@/lib/demoPins";
import { loadSavedPowerExtra } from "@/lib/powerExtra";
import { POWER_EXTRA_PARAMETER_CATALOGUE_URL } from "@/lib/powerExtra/constants";
import { loadSavedNdvi, loadSavedNdviModis, NDVI_SOURCES, MODIS_SOURCE, ndviOriginLine } from "@/lib/ndvi";
import { loadSavedLandform, TERRAIN_SOURCE_LABEL, SOIL_SOURCE_LABEL, landformOriginLine } from "@/lib/landform";
import { loadSavedGroundTruth, DAYMET_SOURCE, COCORAHS_SOURCE, CDL_SOURCE, NLCD_SOURCE, NWIS_SOURCE, groundOriginLine } from "@/lib/groundTruth";
import type { GroundTruthOk, Layer } from "@/lib/groundTruth/types";
import { powerOriginLine } from "@/lib/power/label";
import { loadExtra, loadGround, loadLandform, loadModis, loadNdvi } from "../conditions/load";
import { SENSOR_STEP_NOTE } from "../conditions/models";

type Entry = {
  id: string;
  name: string;
  url: string;
  resolution: string;
  coverage: string;
  fetched: string;
  citation: string;
  limits: string;
};

const demoFor = (lat: number, lon: number) => DEMO_PINS.find((p) => Math.abs(p.lat - lat) < 0.0005 && Math.abs(p.lon - lon) < 0.0005) ?? null;
const NOT_LOADED = "Not fetched on this page. The Field conditions page fetches it for this place; the saved example places show their saved date here.";

function groundLine(g: GroundTruthOk | null, pick: (g: GroundTruthOk) => Layer<unknown>, short: string): string {
  if (!g) return NOT_LOADED;
  const l = pick(g);
  if (l.status === "ok") return groundOriginLine({ origin: g.origin, fetchedAt: l.fetchedAt }, short);
  return `No data for this place (${l.status}): ${l.message}`;
}

/** What the new data layers are, where they come from, how fresh the saved copy is, and their limits. Server component; reads saved files only unless `useLoaded` (then it shares the page's own loads). */
export default async function LayerSources({ lat, lon, heading = "New data layers: sources and limits", useLoaded = true }: { lat: number; lon: number; heading?: string; useLoaded?: boolean }) {
  const demo = demoFor(lat, lon);
  let extraLine = NOT_LOADED;
  let extraCov = "1985-01-01 to 2025-12-31 when fetched";
  let ndviLine = NOT_LOADED;
  let ndviCov = "Landsat 5 (1984 on), 7, 8 and 9; this app asks for 1985 to 2025 for saved places";
  let modisLine: string | null = null;
  let landLine = NOT_LOADED;
  let ground: GroundTruthOk | null = null;

  if (useLoaded) {
    const [ex, nd, md, lf, gt] = await Promise.all([loadExtra(lat, lon), loadNdvi(lat, lon), loadModis(lat, lon), loadLandform(lat, lon), loadGround(lat, lon)]);
    if (ex.ok && ex.value.status !== "error") { extraLine = powerOriginLine(ex.value); if (ex.value.coverage) extraCov = `${ex.value.coverage.start} to ${ex.value.coverage.end}`; }
    else extraLine = `Not available: ${ex.ok ? ex.value.message : ex.message}`;
    if (nd.ok && nd.value.status !== "error") { ndviLine = ndviOriginLine(nd.value); if (nd.value.period) ndviCov = `${nd.value.period.start} to ${nd.value.period.end}`; }
    else ndviLine = `Not available: ${nd.ok ? nd.value.message : nd.message}`;
    if (md) modisLine = ndviOriginLine({ origin: "saved", fetchedAt: md.fetchedAt });
    if (lf.ok && lf.value.fetchedAt && lf.value.origin) landLine = landformOriginLine({ origin: lf.value.origin, fetchedAt: lf.value.fetchedAt });
    else landLine = `Not available: ${lf.ok ? (lf.value.message ?? "no message") : lf.message}`;
    if (gt.ok && gt.value.status === "ok") ground = gt.value;
    else ground = null;
    if (!gt.ok || gt.value.status === "error") {
      // keep the exact reason visible
    }
  } else if (demo) {
    const [ex, nd, md, lf, gt] = await Promise.all([loadSavedPowerExtra(demo.id), loadSavedNdvi(demo.id), loadSavedNdviModis(demo.id), loadSavedLandform(demo.id), loadSavedGroundTruth(demo.id)]);
    if (ex.status !== "error") { extraLine = powerOriginLine(ex); if (ex.coverage) extraCov = `${ex.coverage.start} to ${ex.coverage.end}`; }
    if (nd.status !== "error") { ndviLine = ndviOriginLine(nd); if (nd.period) ndviCov = `${nd.period.start} to ${nd.period.end}`; }
    if (md) modisLine = ndviOriginLine({ origin: "saved", fetchedAt: md.fetchedAt });
    if (lf.fetchedAt && lf.origin) landLine = landformOriginLine({ origin: lf.origin, fetchedAt: lf.fetchedAt });
    if (gt.status === "ok") ground = gt;
  }

  const entries: Entry[] = [
    {
      id: "power-extra",
      name: "NASA POWER soil wetness and frost days (modelled)",
      url: POWER_EXTRA_PARAMETER_CATALOGUE_URL,
      resolution: "about 50 km grid (a reanalysis, MERRA-2)",
      coverage: extraCov,
      fetched: extraLine,
      citation: "NASA POWER parameter catalogue: GWETROOT (root zone soil wetness) and FROST_DAYS, community AG.",
      limits: "A model reconstruction of weather, not a sensor in a field. Soil wetness does not know about irrigation, drainage or soil type. Frost is a daily flag for the grid square.",
    },
    ...NDVI_SOURCES.map((s, i) => ({
      id: `ndvi-${i}`,
      name: i === 0 ? "Landsat NDVI, 30 m (satellite observation)" : s.name,
      url: s.url,
      resolution: "30 m pixel at the pin",
      coverage: ndviCov,
      fetched: ndviLine,
      citation: `${s.name}. ${s.citation}`,
      limits: i === 0 ? "One pixel, not a field boundary; only clear days are seen; sensors differ slightly between Landsat missions." : "Hosting and search service for the same Landsat archive.",
    })),
    ...(modisLine
      ? [{
          id: "modis",
          name: "MODIS NDVI, 250 m (Brentwood only)",
          url: MODIS_SOURCE.url,
          resolution: "250 m pixel (about 6 hectares)",
          coverage: "2000 on",
          fetched: modisLine,
          citation: MODIS_SOURCE.citation,
          limits: "A 250 m pixel mixes everything inside it. 16-day composites, only the best-quality ones kept.",
        }]
      : []),
    {
      id: "nasadem",
      name: "NASADEM terrain (SRTM-derived)",
      url: "https://planetarycomputer.microsoft.com/dataset/nasadem",
      resolution: "1 arc-second, about 31 m cells",
      coverage: "elevation measured in February 2000 and reprocessed by NASA",
      fetched: landLine,
      citation: `${TERRAIN_SOURCE_LABEL}, read through Microsoft Planetary Computer.`,
      limits: "A surface model: buildings and trees raise it. Small ditches and field edges are not resolved.",
    },
    {
      id: "ssurgo",
      name: "USDA NRCS SSURGO soil survey",
      url: "https://sdmdataaccess.nrcs.usda.gov/",
      resolution: "map-unit polygons (areas of mixed soil, not a grid)",
      coverage: "United States only",
      fetched: landLine,
      citation: `${SOIL_SOURCE_LABEL}.`,
      limits: "United States only; each map area stands for a mix of soils. Shown as separate facts, with no combined erosion score.",
    },
    {
      id: "daymet",
      name: DAYMET_SOURCE.name,
      url: DAYMET_SOURCE.url,
      resolution: "1 km grid, interpolated from ground weather stations",
      coverage: "1985 to 2024 compared with NASA POWER; North America only",
      fetched: groundLine(ground, (g) => g.daymet, "Daymet"),
      citation: DAYMET_SOURCE.citation,
      limits: "North America only. This compares two gridded products with each other; it does not say either one is right.",
    },
    {
      id: "cocorahs",
      name: COCORAHS_SOURCE.name,
      url: COCORAHS_SOURCE.url,
      resolution: "one gauge, a few kilometres from the pin",
      coverage: "reports in the window named in the check",
      fetched: groundLine(ground, (g) => g.gauge, "CoCoRaHS"),
      citation: COCORAHS_SOURCE.citation,
      limits: "A single gauge is indicative only. Run for Brentwood and Fresno only.",
    },
    {
      id: "cdl",
      name: CDL_SOURCE.name,
      url: CDL_SOURCE.url,
      resolution: "30 m pixels; majority of a 3 by 3 block",
      coverage: "2008 to 2024, United States only",
      fetched: groundLine(ground, (g) => g.cdl, "USDA NASS"),
      citation: CDL_SOURCE.citation,
      limits: "A satellite classification, not a farmer's record. Single-pixel results are noisy.",
    },
    {
      id: "nlcd",
      name: NLCD_SOURCE.name,
      url: NLCD_SOURCE.url,
      resolution: "30 m",
      coverage: "2021, United States only",
      fetched: groundLine(ground, (g) => g.nlcd, "MRLC"),
      citation: NLCD_SOURCE.citation,
      limits: "United States only. The exact dataset citation was not confirmed from a page opened in this build.",
    },
    {
      id: "nwis",
      name: NWIS_SOURCE.name,
      url: NWIS_SOURCE.url,
      resolution: "one well",
      coverage: "readings of any age; old or sparse ones keep their age wording",
      fetched: groundLine(ground, (g) => g.wells, "USGS"),
      citation: NWIS_SOURCE.citation,
      limits: "A well's depth to water is a fact about that well, not about your field's water table. United States only.",
    },
  ];

  return (
    <section className="hk-block cx-layersources" aria-labelledby="hk-layers-h">
      <h3 id="hk-layers-h" className="hk-h3">{heading}</h3>
      <p className="hk-plain">These are the layers on the Field conditions page. Each carries its own date, and a saved copy always says so.</p>
      <ul className="hk-sources">
        {entries.map((e) => (
          <li key={e.id} data-layer={e.id}>
            <h4 className="hk-h4"><a href={e.url} rel="noreferrer">{e.name}</a></h4>
            <p><strong>{e.fetched}</strong></p>
            <p>Resolution: {e.resolution}. Coverage: {e.coverage}.</p>
            <p className="hk-note">Citation: {e.citation}</p>
            <p>Limits: {e.limits}</p>
          </li>
        ))}
      </ul>
      <h4 className="hk-h4">New limits to keep in mind</h4>
      <ul className="hk-list">
        <li><strong>Reanalysis is not observation.</strong> NASA POWER frost, soil wetness, rain and hot days are a computer reconstruction on a grid about 50 km across. Landsat, MODIS, the rain gauge and the well are observations; Daymet is interpolated from observations.</li>
        <li><strong>Mixed pixels.</strong> A 30 m or 250 m satellite pixel can hold a road, a farmyard, trees or several crops at once. At some places the pixel is not cropland at all, and the page says so from the land-cover check when it can.</li>
        <li><strong>Landsat sensor steps.</strong> {SENSOR_STEP_NOTE}</li>
        <li><strong>United States only.</strong> Soil survey (SSURGO), Daymet, the crop history, land cover, the rain gauge check and the well check cover the United States or North America only. Elsewhere the page shows that plainly and estimates nothing.</li>
        <li><strong>Different sizes.</strong> The yearly view lines layers up by year even though their native sizes range from a 30 m pixel to a 50 km grid square. It computes no combined score.</li>
      </ul>
    </section>
  );
}
