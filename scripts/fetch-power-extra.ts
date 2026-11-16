/**
 * Fetch each demo pin live from NASA POWER (soil wetness, frost flag, surface heat parameters) and save the RAW
 * responses to data/power-extra/<pinId>.json.
 * Run: npx tsx scripts/fetch-power-extra.ts
 * Fails loudly (non-zero exit) if any pin cannot be fetched; never writes placeholder data.
 */
import fs from "node:fs";
import path from "node:path";
import { DEMO_PINS } from "../src/lib/demoPins";
import { DEFAULT_END, DEFAULT_START } from "../src/lib/power/constants";
import type { PowerSavedFile } from "../src/lib/power/rawTypes";
import { fetchPowerExtraRaw } from "../src/lib/powerExtra/client";
import { normalizePowerExtra } from "../src/lib/powerExtra/normalize";

async function main() {
  const outDir = path.join(process.cwd(), "data", "power-extra");
  fs.mkdirSync(outDir, { recursive: true });
  let failed = 0;
  for (const pin of DEMO_PINS) {
    try {
      const raw = await fetchPowerExtraRaw(pin.lat, pin.lon, DEFAULT_START, DEFAULT_END);
      const saved: PowerSavedFile = { pinId: pin.id, lat: pin.lat, lon: pin.lon, fetchedAt: raw.fetchedAt, sourceUrls: raw.sourceUrls, responses: raw.responses };
      const check = normalizePowerExtra({ ...saved, origin: "saved" });
      if (check.status === "error" || check.status === "no-coverage") throw new Error(`normalization says ${check.status}: ${check.message}`);
      const file = path.join(outDir, `${pin.id}.json`);
      fs.writeFileSync(file, JSON.stringify(saved));
      console.log(`${pin.id}: ${check.status}, ${check.days.length} days, ${(fs.statSync(file).size / 1024).toFixed(0)} KB, fetchedAt ${raw.fetchedAt}`);
    } catch (e) {
      failed++;
      console.error(`${pin.id}: FAILED: ${e instanceof Error ? e.message : String(e)}`);
    }
  }
  if (failed) process.exit(1);
}

void main();
