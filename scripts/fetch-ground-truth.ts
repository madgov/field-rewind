/**
 * Fetch ground-truth layers LIVE for the three demo pins and save them to data/ground-truth/<pinId>.json
 * (plus the raw Daymet CSV in data/ground-truth/raw/). Run: npx tsx scripts/fetch-ground-truth.ts [pinId ...]
 * POWER data comes from the committed saved responses (data/power), the same ones the app uses.
 * Writes nothing for a pin whose Daymet or CDL layer is an "error" (a blocked source is reported, never papered over).
 * "no-coverage" layers (e.g. Ludhiana outside the US) are real answers and are saved as such.
 */
import fs from "node:fs";
import path from "node:path";
import { DEMO_PINS } from "../src/lib/demoPins";
import { loadSavedDemoPin } from "../src/lib/power";
import { createGroundTruthService } from "../src/lib/groundTruth/service";
import type { SavedGroundTruth } from "../src/lib/groundTruth/types";

async function main() {
  const wanted = process.argv.slice(2);
  const pins = DEMO_PINS.filter((p) => !wanted.length || wanted.includes(p.id));
  const outDir = path.join(process.cwd(), "data", "ground-truth");
  fs.mkdirSync(path.join(outDir, "raw"), { recursive: true });
  let failed = 0;
  for (const pin of pins) {
    const t0 = Date.now();
    const svc = createGroundTruthService({ offline: false, getPower: () => loadSavedDemoPin(pin.id) });
    const { _daymetCsv, ...live } = await svc.fetchLive(pin.lat, pin.lon, pin.id);
    const secs = ((Date.now() - t0) / 1000).toFixed(1);
    const layers = { daymet: live.daymet, gauge: live.gauge, cdl: live.cdl, nlcd: live.nlcd, wells: live.wells };
    console.log(`${pin.id} (${secs} s):`, Object.entries(layers).map(([k, l]) => `${k}=${l.status}`).join(" "));
    for (const [k, l] of Object.entries(layers)) if (l.status !== "ok") console.log(`   ${k}: ${l.message}`);
    if (live.daymet.status === "error" || live.cdl.status === "error" || live.nlcd.status === "error" || live.wells.status === "error" || live.gauge.status === "error") {
      console.error(`   NOT saved: at least one layer failed with an error (see messages above).`);
      failed++;
      continue;
    }
    const saved: SavedGroundTruth = { schema: 1, ...live, origin: "saved" };
    const file = path.join(outDir, `${pin.id}.json`);
    fs.writeFileSync(file, JSON.stringify(saved));
    if (_daymetCsv) fs.writeFileSync(path.join(outDir, "raw", `daymet-${pin.id}.csv`), _daymetCsv);
    console.log(`   saved ${file} (${(fs.statSync(file).size / 1024).toFixed(0)} KB)`);
  }
  if (failed) process.exit(1);
}
main().catch((e) => {
  console.error(e);
  process.exit(1);
});
