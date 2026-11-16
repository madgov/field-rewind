/* Usage: npx tsx scripts/fetch-openet.ts [pinId]   (default brentwood)
 * Needs OPENET_API_KEY in .env.local or .env. The key is never printed or written. */
import { existsSync, readFileSync } from "node:fs";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { DEMO_PINS } from "../src/lib/demoPins";
import { fetchOpenEtMonthly } from "../src/lib/openet/client";
import { NO_KEY_MESSAGE } from "../src/lib/openet/constants";

const root = process.cwd();
for (const f of [".env.local", ".env"]) {
  const p = path.join(root, f);
  if (!existsSync(p)) continue;
  for (const line of readFileSync(p, "utf8").split(/\r?\n/)) {
    const m = /^\s*(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)\s*$/.exec(line);
    if (m && process.env[m[1]] === undefined) process.env[m[1]] = m[2].replace(/^(['"])(.*)\1$/, "$2");
  }
}

async function main() {
  const pinId = process.argv[2] ?? "brentwood";
  const pin = DEMO_PINS.find((p) => p.id === pinId);
  if (!pin) throw new Error(`Unknown pin "${pinId}". Known: ${DEMO_PINS.map((p) => p.id).join(", ")}`);
  const apiKey = process.env.OPENET_API_KEY;
  if (!apiKey?.trim()) {
    console.error(NO_KEY_MESSAGE);
    process.exit(2);
  }
  const { result, raw, request, chunks } = await fetchOpenEtMonthly(pin.lat, pin.lon, { apiKey });
  if ((result.status !== "ok" && result.status !== "partial") || !request) {
    console.error(`OpenET fetch for ${pinId} failed: status=${result.status} ${result.message ?? ""}`);
    process.exit(1);
  }
  // `request` is the whole range; `chunks` lists the windows actually requested (OpenET limits one request to 10 years), and `response` is their records joined in order, unaltered.
  const out = { pinId, lon: pin.lon, lat: pin.lat, fetchedAt: result.fetchedAt, request, chunks, response: raw };
  await mkdir(path.join(root, "data", "openet"), { recursive: true });
  const file = path.join(root, "data", "openet", `${pinId}.json`);
  await writeFile(file, JSON.stringify(out) + "\n");
  const c = result.coverage;
  console.log(`Saved ${file}\nstatus=${result.status} months with data=${c?.withData}/${c?.requestedMonths} first=${c?.firstMonth} last=${c?.lastMonth}`);
}
main().catch((e) => {
  console.error(e instanceof Error ? e.message.replaceAll(process.env.OPENET_API_KEY || "\u0000", "[redacted]") : "failed");
  process.exit(1);
});
