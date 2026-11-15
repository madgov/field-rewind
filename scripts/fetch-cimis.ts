/**
 * Fetch CIMIS station 47 daily ASCE ETo (2010-01-01..2025-12-31) live and save the RAW responses to
 * data/cimis/station47.json (key redacted). Run: npx tsx scripts/fetch-cimis.ts
 * Without CIMIS_APP_KEY (env, .env.local, or .env) it exits non-zero and writes nothing.
 */
import fs from "node:fs";
import path from "node:path";
import { fetchCimis } from "../src/lib/cimis/client";
import { DEFAULT_END, DEFAULT_START } from "../src/lib/cimis/constants";
import { NO_KEY_MESSAGE, type CimisSavedFile } from "../src/lib/cimis/types";

/** Minimal env loader: .env.local then .env, never overriding variables already set. */
function loadEnv(root: string) {
  for (const name of [".env.local", ".env"]) {
    let text: string;
    try {
      text = fs.readFileSync(path.join(root, name), "utf8");
    } catch {
      continue;
    }
    for (const line of text.split(/\r?\n/)) {
      const m = /^\s*(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*?)\s*$/.exec(line);
      if (!m || m[1] === undefined || line.trimStart().startsWith("#")) continue;
      let v = m[2];
      if (/^(".*"|'.*')$/.test(v)) v = v.slice(1, -1);
      if (process.env[m[1]] === undefined || process.env[m[1]] === "") process.env[m[1]] = v;
    }
  }
}

async function main() {
  const root = process.cwd();
  loadEnv(root);
  if (!process.env.CIMIS_APP_KEY?.trim()) {
    console.error(NO_KEY_MESSAGE);
    process.exit(1);
  }
  const { result, raw } = await fetchCimis({ start: DEFAULT_START, end: DEFAULT_END });
  if (result.status !== "ok" || !raw) {
    console.error(`CIMIS fetch ${result.status}: ${result.message ?? "unknown"}`);
    for (const f of result.failedRanges ?? []) console.error(`  failed ${f.start}..${f.end}: ${f.message}`);
    console.error("Nothing was written.");
    process.exit(1);
  }
  const saved: CimisSavedFile = { station: 47, fetchedAt: raw.fetchedAt, sourceUrls: raw.sourceUrls, responses: raw.responses };
  const out = path.join(root, "data", "cimis", "station47.json");
  fs.mkdirSync(path.dirname(out), { recursive: true });
  fs.writeFileSync(out, JSON.stringify(saved));
  console.log(`Saved ${out}`);
  console.log(`unit ${result.unit}, ${result.days.length} days, coverage ${result.coverage?.start}..${result.coverage?.end}, usable ${result.flags?.usable}`);
  console.log("records per QC flag:", JSON.stringify(result.flags?.byFlag));
  console.log("nulled per QC flag:", JSON.stringify(result.flags?.nulledByFlag));
}

main().catch((e) => {
  console.error(`fetch-cimis failed: ${e instanceof Error ? e.message : String(e)}`);
  process.exit(1);
});
