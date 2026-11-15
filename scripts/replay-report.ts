import { loadSavedDemoPin } from "../src/lib/power";
import { CROP_CATALOG } from "../src/lib/crops/catalog";
import { replay } from "../src/lib/replay/replay";
import { getClimate } from "../src/lib/replay/climate";
import { EXAMPLE_LABEL, EXAMPLE_ROTATIONS, EXAMPLE_SUPPLY_MM, EXAMPLE_SUPPLY_NOTE } from "../src/lib/replay/examples";
import { DECADES, type RotationResult } from "../src/lib/replay/types";

const mm = (n: number | null) => (n === null ? "n/a" : Math.round(n).toLocaleString("en-US"));

function strip(r: RotationResult): string {
  const chars = r.seasons.map((s) => (s.outcome === "short" ? "R" : s.outcome === "ok" ? "G" : "-"));
  const out: string[] = [];
  for (let i = 0; i < chars.length; i += 10) out.push(chars.slice(i, i + 10).join(""));
  return out.join(" ");
}

async function main() {
  const power = await loadSavedDemoPin("brentwood");
  console.log(`Brentwood (saved response, status ${power.status}, origin ${power.origin}, fetched ${power.fetchedAt.slice(0, 10)}, elevation ${power.elevationM} m)`);
  console.log(`Example label: ${EXAMPLE_LABEL}`);
  console.log(EXAMPLE_SUPPLY_NOTE);

  const t0 = performance.now();
  getClimate(power);
  console.log(`Climate prepared once (daily ET0 for ${power.days.length} days): ${(performance.now() - t0).toFixed(0)} ms`);

  const levels: [string, number][] = [
    ["example supply", EXAMPLE_SUPPLY_MM],
    ["80% of example supply", EXAMPLE_SUPPLY_MM * 0.8],
    ["120% of example supply", EXAMPLE_SUPPLY_MM * 1.2],
  ];
  for (const [label, supply] of levels) {
    const t = performance.now();
    const res = replay(power, CROP_CATALOG.crops, { supplyMm: supply, rotations: EXAMPLE_ROTATIONS.map(({ name, sequence }) => ({ name, sequence })) });
    const ms = performance.now() - t;
    console.log(`\n=== ${label}: ${mm(supply)} mm per season (replay of 3 rotations x 40 seasons: ${ms.toFixed(2)} ms) ===`);
    if (res.status !== "ok") {
      console.log("UNAVAILABLE:", res.reason, "|", res.nextStep);
      continue;
    }
    console.log(`data: ${res.dataLabel}`);
    for (const r of res.rotations) {
      console.log(`\n-- ${r.name} (${r.cropNames.join(" > ")})`);
      console.log(`   ${DECADES.map((d) => d.label).join("  ")}  (R short, G ok, - could not be judged)`);
      console.log(`   ${strip(r)}`);
      console.log(
        `   need mm min/median/max: ${mm(r.totals.needMinMm)} / ${mm(r.totals.needMedianMm)} / ${mm(r.totals.needMaxMm)}; short ${r.totals.short}, ok ${r.totals.ok}, grey ${r.totals.insufficient}`,
      );
      console.log(`   years short per decade: ${r.decades.map((d) => `${d.label}: ${d.short} of ${d.evaluable}`).join(" | ")}`);
      console.log(`   headline: ${r.headline}`);
      console.log(`   sentence: ${r.sentence}`);
      for (const w of r.warnings) console.log(`   WARNING: ${w}`);
    }
    for (const n of res.notes) console.log(`   note: ${n}`);
  }

  // Missing-data summary across the examples
  const base = replay(power, CROP_CATALOG.crops, { supplyMm: EXAMPLE_SUPPLY_MM, rotations: EXAMPLE_ROTATIONS.map(({ name, sequence }) => ({ name, sequence })) });
  if (base.status === "ok") {
    const all = base.rotations.flatMap((r) => r.seasons);
    console.log(
      `\nMissing data across the 120 example crop-seasons: ET0 days missing ${all.reduce((s, x) => s + x.missingEt0Days, 0)}, precipitation days missing in months used ${all.reduce((s, x) => s + x.missingPrecipMonthDays, 0)}, grey seasons ${all.filter((x) => x.status !== "evaluated").length}`,
    );
  }
}

main();
