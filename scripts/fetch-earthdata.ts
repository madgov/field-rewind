/** Fetch once; the running site only reads saved JSON. Never prints or persists credentials. */
import { readFileSync, existsSync } from "node:fs";
import { mkdir, writeFile, rename } from "node:fs/promises";
import path from "node:path";
import { DEMO_PINS } from "../src/lib/demoPins";
import { fetchSmap, fetchImerg } from "./lib/earthdata";
import type { EarthdataFile } from "../src/lib/earthdata/types";

for (const file of [".env.local", ".env"]) {
  if (!existsSync(file)) continue;
  for (const line of readFileSync(file, "utf8").split(/\r?\n/)) {
    const m = /^\s*(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)\s*$/.exec(line);
    if (m && process.env[m[1]] === undefined) process.env[m[1]] = m[2].replace(/^(['"])(.*)\1$/, "$2");
  }
}
async function main() {
  const token = process.env.EARTHDATA_TOKEN?.trim();
  if (!token) throw new Error("EARTHDATA_TOKEN is not set on this fetch machine. No request was made and no saved file was changed.");
  const [pinId = "all", month = "2025-07"] = process.argv.slice(2);
  if (!/^20\d{2}-(0[1-9]|1[0-2])$/.test(month)) throw new Error("Month must be YYYY-MM.");
  const pins = pinId === "all" ? DEMO_PINS : DEMO_PINS.filter(p => p.id === pinId);
  if (!pins.length) throw new Error("Unknown demo pin; use all, brentwood, fresno or ludhiana.");
  await mkdir(path.join(process.cwd(), "data", "earthdata"), { recursive: true });
  for (const pin of pins) {
    console.log(`${pin.id}: requesting SMAP ${month}-01 to ${month}-07 and IMERG ${month}; observations only, not the 40-season replay.`);
    const smap = await fetchSmap(pin, `${month}-01`, `${month}-07`, 7, token);
    const imerg = await fetchImerg(pin, month, token);
    const data: EarthdataFile = { schemaVersion: 1, pinId: pin.id, lat: pin.lat, lon: pin.lon, fetchedAt: new Date().toISOString(),
      products: {
        smap: { shortName: "SPL3SMP_E", version: "006", collectionId: "C2938664763-NSIDC_CPRD", units: "m3/m3", grid: "EASE-Grid 2.0 Global EPSG:6933", sampling: "native cell containing pin; no resampling" },
        imerg: { shortName: "GPM_3IMERGM", version: "07", collectionId: "C2723754851-GES_DISC", rateUnits: "mm/hr", totalUnits: "mm", qualityIndexUnits: "Equivalent gauges per 2.5 deg box", grid: "0.1 degree longitude/latitude" },
      }, smap, imerg };
    const serialized = JSON.stringify(data, null, 2) + "\n";
    if (serialized.includes(token)) throw new Error("Refused to save a response containing the token.");
    const out = path.join(process.cwd(), "data", "earthdata", `${pin.id}.json`);
    await writeFile(out + ".partial", serialized); await rename(out + ".partial", out);
    console.log(`${pin.id}: saved ${smap.observations.length} SMAP dates (${smap.observations.filter(o => o.valueM3M3 !== null).length} recommended-quality) and ${imerg.observations.length} IMERG month. Saved response from ${data.fetchedAt}.`);
  }
}
main().catch(e => { const message = e instanceof Error ? e.message : "Earthdata fetch failed."; console.error(message.replaceAll(process.env.EARTHDATA_TOKEN || "\u0000", "[redacted]")); process.exitCode = 1; });
