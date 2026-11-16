import { beforeAll, describe, expect, it } from "vitest";
import { CROP_CATALOG } from "../crops/catalog";
import { loadSavedDemoPin } from "../power";
import { EXAMPLE_ROTATIONS, EXAMPLE_SUPPLY_MM } from "../replay/examples";
import { replay } from "../replay/replay";
import type { PowerResult } from "../types";
import { compareRotations } from "./compare";
import { explainRotation } from "./explain";
import { judgmentPoints } from "./judgment";

let power: PowerResult;
beforeAll(async () => {
  power = await loadSavedDemoPin("brentwood");
});

const specs = EXAMPLE_ROTATIONS.map(({ name, sequence }) => ({ name, sequence }));
const run = (mm: number) => replay(power, CROP_CATALOG.crops, { supplyMm: mm, rotations: specs });

describe("real saved Brentwood record, three example rotations at the example supply", () => {
  it("builds the facts table from the real replay and the real traits", () => {
    const r = run(EXAMPLE_SUPPLY_MM);
    const comparison = compareRotations({
      rotations: specs,
      replay: r,
      priorities: { selected: ["water", "soil", "forage", "income"] },
      constraints: { supplyMm: EXAMPLE_SUPPLY_MM },
    });
    // Decade counts must be the real ones (guarded in the replay's own regression test).
    const water = (n: string) => comparison.rotations.find((x) => x.name === n)!.facts.find((f) => f.id === "water-short")!;
    expect(water("Wheat, then maize").display).toContain("1 of 10 judged seasons in 2016–2025");
    expect(water("Wheat, then maize").display).toContain("2 of 10 in 1986–1995");
    expect(water("Maize, then cotton").display).toContain("8 of 10 judged seasons in 2016–2025");
    expect(water("Maize, then cotton").display).toContain("9 of 10 in 1986–1995");
    expect(water("Rice, wheat, maize").display).toContain("6 of 10 judged seasons in 2016–2025");

    const lines: string[] = [`Supply ${EXAMPLE_SUPPLY_MM} mm. ${(r as { dataLabel: string }).dataLabel}`];
    for (const rot of comparison.rotations) {
      lines.push("", `== ${rot.name} (${rot.cropNames.join(" > ")})`);
      for (const f of rot.facts) lines.push(`- ${f.label}: ${f.display}`);
    }
    lines.push("", "== Per-fact ranks");
    for (const fr of comparison.factRankings) lines.push(`${fr.factId}: ${fr.entries.map((e) => `${e.rotation} = ${e.rank ?? "not ranked"}`).join("; ")}`);
    lines.push("", "== Criterion positions");
    for (const c of comparison.criterionRankings) lines.push(`${c.label}: ${c.entries.map((e) => `${e.rotation} = ${e.position ?? "not ranked"}${e.tiedWith.length ? " (tie)" : ""} [${e.basedOn} of ${e.of} facts]`).join("; ")}`);
    if (comparison.balanced) lines.push(`${comparison.balanced.label}: ${comparison.balanced.entries.map((e) => `${e.rotation} = ${e.position ?? "not placed"}`).join("; ")}`);
    lines.push("", "== Judgment points");
    const pts = judgmentPoints({ comparison, replay: r, rerun: run, location: { lat: 37.93, lon: -121.66 } });
    for (const p of pts) lines.push(`- [${p.kind}] ${p.text}`);
    lines.push("", "== Explanation (Maize, then cotton)", ...explainRotation(comparison, "Maize, then cotton"));
    console.log(lines.join("\n"));

    const all = lines.join("\n");
    expect(all).not.toMatch(/NaN|undefined|\[object/);
    expect(pts.some((p) => p.kind === "supply-sensitivity" && p.rotation === "Wheat, then maize")).toBe(true);
  });

  it("supply check actually reruns the real replay (630 and 770 mm differ from 700 mm)", () => {
    const base = run(EXAMPLE_SUPPLY_MM);
    const comparison = compareRotations({ rotations: specs, replay: base, priorities: { selected: ["water"] }, constraints: { supplyMm: EXAMPLE_SUPPLY_MM } });
    const pts = judgmentPoints({ comparison, replay: base, rerun: run });
    const sens = pts.filter((p) => p.kind === "supply-sensitivity" && p.rotation);
    expect(sens).toHaveLength(3);
    expect(sens.map((p) => p.text).join(" ")).toMatch(/630 mm/);
    expect(sens.map((p) => p.text).join(" ")).toMatch(/770 mm/);
  });
});
