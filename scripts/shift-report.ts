import { loadSavedDemoPin } from "../src/lib/power";
import { computeShift } from "../src/lib/shift/compute";

const f = (n: number | null, d = 1) => (n === null ? "null" : n.toFixed(d));

async function main() {
  for (const pin of ["brentwood", "fresno", "ludhiana"]) {
    const power = await loadSavedDemoPin(pin);
    const r = computeShift(power);
    console.log(`\n===== ${pin} (status ${power.status}, elevation ${power.elevationM}) =====`);
    if (r.status !== "ok") {
      console.log("UNAVAILABLE:", r.reason, "|", r.nextStep);
      continue;
    }
    for (const m of Object.values(r.metrics)) {
      console.log(`-- ${m.id} (${m.unit})`);
      console.log(
        `   early mean ${f(m.early.mean)} (n=${m.early.yearsUsed}) | late mean ${f(m.late.mean)} (n=${m.late.yearsUsed}) | diff ${f(m.diff)} | pct ${f(m.pctChange)} | se ${f(m.standardError, 2)} | verdict ${m.verdict}`,
      );
      console.log(`   headline: ${m.headline}`);
      console.log(`   detail:   ${m.detail}`);
      const flagged = m.years.filter((y) => y.flagged).map((y) => y.year);
      const maxMiss = Math.max(...m.years.map((y) => y.missingDays));
      console.log(`   flagged years: ${flagged.join(",") || "none"}; max missing days in a year: ${maxMiss}`);
    }
    console.log(`OVERALL: ${r.overallHeadline}`);
    console.log(`         ${r.overallDetail}`);
  }
}
main();
