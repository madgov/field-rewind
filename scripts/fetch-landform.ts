/**
 * Fetch REAL terrain (NASADEM) and soil (SSURGO via Soil Data Access) for the three demo pins and the Orange Cove sample
 * point, and save the raw responses to data/landform/<id>.json plus data/landform/<id>-grid.json.
 * Run: npx tsx scripts/fetch-landform.ts [id ...]
 * Fails loudly (non-zero exit) when a point cannot be fetched; never writes placeholder data. Slope, soil classes and
 * wording are NOT saved: they are recomputed from the raw responses by the same code that runs on live data.
 * Ludhiana is expected to have no SSURGO coverage (US only); the raw empty response is saved as it came back.
 */
import fs from "node:fs";
import path from "node:path";
import { fetchCdlValue } from "../src/lib/landform/landuse";
import { fetchNasademRaw } from "../src/lib/landform/nasadem";
import { LANDFORM_POINTS } from "../src/lib/landform/pins";
import { fetchSdaRaw } from "../src/lib/landform/sda";
import { buildSoil, buildTerrain } from "../src/lib/landform/assemble";
import type { LandUseCheck, LandformGridFile, LandformSavedFile } from "../src/lib/landform/types";

async function main() {
  const only = process.argv.slice(2);
  const outDir = path.join(process.cwd(), "data", "landform");
  fs.mkdirSync(outDir, { recursive: true });
  let failed = 0;
  for (const pt of LANDFORM_POINTS) {
    if (only.length && !only.includes(pt.id)) continue;
    const t0 = Date.now();
    try {
      const terrainRaw = await fetchNasademRaw(pt.lat, pt.lon);
      const t1 = Date.now();
      const sda = await fetchSdaRaw(pt.lat, pt.lon);
      const t2 = Date.now();
      const terrain = buildTerrain(terrainRaw, "live", false);
      if (terrain.status !== "ok") throw new Error(`terrain: ${terrain.message}`);
      const soil = buildSoil(sda, "live");
      if (soil.status === "error") throw new Error(`soil: ${soil.message}`);
      let landUse: LandUseCheck | undefined;
      if (pt.kind === "sample-point") {
        const { rawBody, ...rest } = await fetchCdlValue(pt.lat, pt.lon, 2023);
        void rawBody;
        landUse = rest;
      }
      const { elevationM, ...terrainMeta } = terrainRaw;
      void elevationM;
      const gridName = `${pt.id}-grid.json`;
      const saved: LandformSavedFile = {
        id: pt.id, kind: pt.kind, name: pt.name, lat: pt.lat, lon: pt.lon,
        fetchedAt: [terrainRaw.fetchedAt, sda.fetchedAt].sort()[0],
        sda, terrain: { ...terrainMeta, gridFile: gridName }, ...(landUse ? { landUse } : {}),
      };
      const grid: LandformGridFile = { id: pt.id, terrain: terrainRaw };
      fs.writeFileSync(path.join(outDir, `${pt.id}.json`), JSON.stringify(saved, null, 1));
      fs.writeFileSync(path.join(outDir, gridName), JSON.stringify(grid));
      const sizeKb = (f: string) => (fs.statSync(path.join(outDir, f)).size / 1024).toFixed(0);
      console.log(
        `${pt.id}: terrain ${terrain.summary.centerElevationM} m, slope ${terrain.summary.centerSlopePct}% (${t1 - t0} ms); soil ${soil.status}${soil.status === "ok" ? ` ${soil.mukey} ${soil.muName}` : ""} (${t2 - t1} ms); ` +
          `${pt.id}.json ${sizeKb(`${pt.id}.json`)} KB, ${gridName} ${sizeKb(gridName)} KB${landUse ? `; CDL ${landUse.year}: ${landUse.value} (${landUse.category})` : ""}`,
      );
    } catch (e) {
      failed++;
      console.error(`${pt.id}: FAILED: ${e instanceof Error ? e.message : String(e)}`);
    }
  }
  if (failed) process.exit(1);
}

void main();
