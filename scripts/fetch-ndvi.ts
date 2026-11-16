/**
 * Fetch REAL Landsat NDVI for each demo pin and save it to data/ndvi/.
 *   npx tsx scripts/fetch-ndvi.ts                 all three pins (point series + 21 x 21 windows for 2024-2025)
 *   npx tsx scripts/fetch-ndvi.ts brentwood       one pin
 *   npx tsx scripts/fetch-ndvi.ts --modis         ORNL MODIS 250 m NDVI series for Brentwood only (slow, optional)
 * Point series: every clear Landsat 5/7/8/9 observation 1985-2025 -> data/ndvi/<pin>.json
 * Windows (about 630 m square) for chosen clear dates -> data/ndvi/<pin>-grids.json
 * Resumable: 5-year chunks are checkpointed in data/ndvi/.partial/ (deleted when a pin finishes).
 * Exits non-zero and writes nothing for a pin that could not be fetched. Never writes placeholder data.
 */
import fs from "node:fs";
import path from "node:path";
import { DEMO_PINS } from "../src/lib/demoPins";
import { GRID_RADIUS_PX, NDVI_UNITS } from "../src/lib/ndvi/constants";
import { retrieveGrids, retrieveSeries, thinEvenly } from "../src/lib/ndvi/retrieve";
import { NDVI_LABEL, NDVI_SOURCES } from "../src/lib/ndvi/sources";
import { searchScenes } from "../src/lib/ndvi/stac";
import { TokenManager } from "../src/lib/ndvi/token";
import type { NdviCounts, NdviGrid, NdviGridsFile, NdviSavedFile } from "../src/lib/ndvi/types";
import { fetchModis } from "../src/lib/ndvi/modis";

const OUT = path.join(process.cwd(), "data", "ndvi");
const PART = path.join(OUT, ".partial");
const START_YEAR = 1985;
const END_YEAR = 2025;
const GRID_YEARS = [2024, 2025];
const GRIDS_PER_YEAR = 12;
const MIN_VALID_FRACTION = 0.6;

const log = (m: string) => console.log(`[${new Date().toISOString().slice(11, 19)}] ${m}`);

async function fetchPin(pin: { id: string; lat: number; lon: number }) {
  fs.mkdirSync(PART, { recursive: true });
  const tokens = new TokenManager();
  const counts: NdviCounts = { scenesFound: 0, scenesRead: 0, clear: 0, masked: 0, failed: 0, skippedByCap: 0 };
  const notes: string[] = [];
  const obs: NdviSavedFile["observations"] = [];
  for (let y0 = START_YEAR; y0 <= END_YEAR; y0 += 5) {
    const y1 = Math.min(END_YEAR, y0 + 4);
    const cp = path.join(PART, `${pin.id}-${y0}-${y1}.json`);
    let r: { observations: typeof obs; counts: NdviCounts; notes: string[] };
    if (fs.existsSync(cp)) {
      r = JSON.parse(fs.readFileSync(cp, "utf8"));
    } else {
      const t = Date.now();
      const res = await retrieveSeries({ lat: pin.lat, lon: pin.lon, start: `${y0}-01-01`, end: `${y1}-12-31` }, { tokens });
      if (res.status === "error") throw new Error(`${pin.id} ${y0}-${y1}: ${res.message}`);
      r = { observations: res.observations, counts: res.counts, notes: res.notes };
      fs.writeFileSync(cp, JSON.stringify(r));
      log(`${pin.id} ${y0}-${y1}: ${res.counts.clear} clear of ${res.counts.scenesFound} scenes (failed ${res.counts.failed}) in ${Math.round((Date.now() - t) / 1000)} s`);
    }
    obs.push(...r.observations);
    for (const k of Object.keys(counts) as (keyof NdviCounts)[]) counts[k] += r.counts[k];
    notes.push(...r.notes);
  }
  obs.sort((a, b) => a.date.localeCompare(b.date) || a.satellite.localeCompare(b.satellite));
  const fetchedAt = new Date().toISOString();
  const saved: NdviSavedFile = {
    pinId: pin.id, lat: pin.lat, lon: pin.lon, fetchedAt,
    period: { start: `${START_YEAR}-01-01`, end: `${END_YEAR}-12-31` },
    units: NDVI_UNITS, label: NDVI_LABEL, sources: NDVI_SOURCES, counts, notes, observations: obs,
  };

  // windows for chosen dates in the most recent full years
  const chosen: NdviGrid[] = [];
  for (const y of GRID_YEARS) {
    const items = await searchScenes({ lat: pin.lat, lon: pin.lon, start: `${y}-01-01`, end: `${y}-12-31` });
    const clearDates = new Set(obs.filter((o) => o.date.startsWith(String(y))).map((o) => `${o.date}|${o.sceneId}`));
    // only scenes whose pin pixel was clear in the point series; one scene per date
    const cand = items.filter((i) => clearDates.has(`${String(i.properties.datetime).slice(0, 10)}|${i.id}`));
    const { grids, failed } = await retrieveGrids(cand, pin.lat, pin.lon, { tokens });
    const good = grids.filter((g) => g.validFraction >= MIN_VALID_FRACTION).sort((a, b) => a.date.localeCompare(b.date));
    const pick = thinEvenly(good, GRIDS_PER_YEAR);
    log(`${pin.id} ${y}: ${grids.length} windows read (${failed} failed), ${good.length} with >= ${MIN_VALID_FRACTION * 100}% clear pixels, keeping ${pick.length}`);
    chosen.push(...pick);
  }
  const gridsFile: NdviGridsFile = { pinId: pin.id, lat: pin.lat, lon: pin.lon, fetchedAt, units: NDVI_UNITS, label: NDVI_LABEL, sources: NDVI_SOURCES, windowPixels: 2 * GRID_RADIUS_PX + 1, grids: chosen };

  fs.writeFileSync(path.join(OUT, `${pin.id}.json`), JSON.stringify(saved));
  fs.writeFileSync(path.join(OUT, `${pin.id}-grids.json`), JSON.stringify(gridsFile));
  fs.rmSync(PART, { recursive: true, force: true });
  log(`${pin.id}: saved ${obs.length} observations, ${chosen.length} windows`);
}

async function main() {
  const args = process.argv.slice(2);
  fs.mkdirSync(OUT, { recursive: true });
  if (args.includes("--modis")) {
    const pin = DEMO_PINS.find((p) => p.id === "brentwood")!;
    await fetchModis(pin, { outFile: path.join(OUT, "brentwood-modis.json"), log });
    return;
  }
  const ids = args.filter((a) => !a.startsWith("--"));
  const pins = DEMO_PINS.filter((p) => ids.length === 0 || ids.includes(p.id));
  let failed = 0;
  for (const pin of pins) {
    try {
      await fetchPin(pin);
    } catch (e) {
      failed++;
      console.error(`${pin.id}: FAILED: ${e instanceof Error ? e.message : String(e)}`);
    }
  }
  if (failed) process.exit(1);
}

void main();
