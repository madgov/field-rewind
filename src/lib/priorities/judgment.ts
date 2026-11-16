import { isApproxInCalifornia } from "../crops/region";
import { traitFor } from "../rotationTraits/traits";
import type { TraitKey } from "../rotationTraits/types";
import type { ReplayOk, ReplayResult } from "../replay/types";
import { joinList, num, plural } from "./text";
import type { Comparison, JudgmentPoint, PriorityId, SupplyCheck, SupplySensitivity } from "./types";

export const SUPPLY_BAND = 0.1;

/**
 * Re-run the replay at 90 percent and 110 percent of the chosen supply (using the caller's rerun function, so this module stays
 * pure) and count the seasons whose red/green result changes. Seasons that are grey at any of the three supplies are not compared.
 */
export function supplySensitivity(replay: ReplayResult, rerun: (supplyMm: number) => ReplayResult): SupplySensitivity {
  if (replay.status !== "ok") return { available: false, reason: replay.reason };
  const base = replay as ReplayOk;
  if (!(base.supplyMm > 0)) return { available: false, reason: "the chosen supply is 0 mm, so 90 and 110 percent of it are the same supply" };
  const lowMm = base.supplyMm * (1 - SUPPLY_BAND);
  const highMm = base.supplyMm * (1 + SUPPLY_BAND);
  const low = rerun(lowMm);
  const high = rerun(highMm);
  if (low.status !== "ok") return { available: false, reason: `the replay at ${num(lowMm, 0)} mm could not run: ${low.reason}` };
  if (high.status !== "ok") return { available: false, reason: `the replay at ${num(highMm, 0)} mm could not run: ${high.reason}` };
  const checks: SupplyCheck[] = base.rotations.map((r) => {
    const rl = low.rotations.find((x) => x.name === r.name);
    const rh = high.rotations.find((x) => x.name === r.name);
    let compared = 0;
    let red = 0;
    let green = 0;
    r.seasons.forEach((s, i) => {
      const a = rl?.seasons[i]?.outcome ?? null;
      const b = rh?.seasons[i]?.outcome ?? null;
      if (s.outcome === null || a === null || b === null) return;
      compared += 1;
      if (s.outcome === "ok" && a === "short") red += 1;
      if (s.outcome === "short" && b === "ok") green += 1;
    });
    const lastShort = (x: typeof r | undefined) => (x ? x.decades[x.decades.length - 1].short : 0);
    return {
      rotation: r.name,
      baseSupplyMm: base.supplyMm,
      lowSupplyMm: lowMm,
      highSupplyMm: highMm,
      seasonsCompared: compared,
      turnRedAtLow: red,
      turnGreenAtHigh: green,
      lastDecadeShort: { low: lastShort(rl), base: lastShort(r), high: lastShort(rh) },
      anyChange: red + green > 0,
    };
  });
  return { available: true, checks };
}

const TRAIT_LABEL: Record<TraitKey, string> = {
  family: "botanical family",
  nitrogenFixing: "nitrogen fixing",
  nCredit: "nitrogen credit",
  rootDepthM: "maximum root depth",
  depletionFractionP: "depletion fraction p",
  residueRole: "residue and organic matter",
  soilStructureRole: "soil structure",
  forage: "forage use",
  erosionCover: "erosion cover",
  droughtToleranceQualitative: "qualitative drought tolerance",
};

const CRITERION_TRAITS: Record<Exclude<PriorityId, "income">, TraitKey[]> = {
  water: ["depletionFractionP"],
  soil: ["nitrogenFixing", "family", "rootDepthM", "residueRole", "erosionCover"],
  forage: ["forage"],
};

export type JudgmentInput = {
  comparison: Comparison;
  replay: ReplayResult;
  /** Runs the replay at another supply (same pin, same rotations). Without it the supply check is reported as not done. */
  rerun?: (supplyMm: number) => ReplayResult;
  /** The pin. Without it the outside-California check is reported as not done. */
  location?: { lat: number; lon: number };
};

/** Specific items where a person's judgment matters most for THIS comparison, generated from its facts. */
export function judgmentPoints(input: JudgmentInput): JudgmentPoint[] {
  const { comparison } = input;
  const out: JudgmentPoint[] = [];
  const selectedRankable = comparison.selected.filter((p): p is Exclude<PriorityId, "income"> => p !== "income");

  for (const r of comparison.rotations) {
    const wanted = new Set<TraitKey>(selectedRankable.flatMap((p) => CRITERION_TRAITS[p]));
    const gaps: string[] = [];
    for (const id of [...new Set(r.sequence)]) {
      const t = traitFor(id);
      if (!t) {
        gaps.push(`${id}: no traits record at all`);
        continue;
      }
      const missing = [...wanted].filter((k) => t.traits[k].status !== "sourced").map((k) => TRAIT_LABEL[k]);
      if (missing.length) gaps.push(`${t.name}: ${joinList(missing)}`);
    }
    if (gaps.length) out.push({ kind: "unknown-traits", rotation: r.name, text: `${r.name} has no sourced value for ${gaps.join("; ")}. These are counted as missing and never filled in.` });

    if (r.cropsNotReplayed.length || r.waterUnavailableReason) {
      out.push({ kind: "not-in-replay", rotation: r.name, text: `${r.name} has no water result: ${r.waterUnavailableReason ?? "the replay did not cover it"}.` });
    }
    if (r.excludedBecause.length) {
      out.push({ kind: "excluded", rotation: r.name, text: `${r.name} is left out because you cannot grow ${joinList(r.excludedBecause.map((id) => traitFor(id)?.name ?? id))}.` });
    }
    const pNotComparable = r.sequence.filter((id) => traitFor(id)?.traits.depletionFractionP.comparable === false);
    if (pNotComparable.length) {
      out.push({ kind: "rice-p", rotation: r.name, text: `${joinList([...new Set(pNotComparable)].map((id) => traitFor(id)?.name ?? id))} has a depletion fraction defined against saturation in the source, so it is not compared with the other crops' values.` });
    }
    if (input.location) {
      if (!isApproxInCalifornia(input.location.lat, input.location.lon)) {
        out.push({
          kind: "outside-california",
          rotation: r.name,
          text: `This pin is outside California. The planting dates and stage lengths for ${joinList(r.cropNames)} in ${r.name} are California values and may not match local practice${r.sequence.includes("cotton") ? "; cotton in particular is planted and managed very differently by region" : ""}.`,
        });
      }
    }
  }

  if (!input.location) out.push({ kind: "outside-california", rotation: null, text: "No pin location was supplied, so whether the crop values fit the region was not checked." });

  if (input.rerun) {
    const s = supplySensitivity(input.replay, input.rerun);
    if (!s.available) out.push({ kind: "supply-sensitivity", rotation: null, text: `The 10 percent supply check was not done: ${s.reason}.` });
    else {
      for (const c of s.checks) {
        out.push({
          kind: "supply-sensitivity",
          rotation: c.rotation,
          text: c.anyChange
            ? `${c.rotation}: at ${num(c.lowSupplyMm, 0)} mm (10 percent less), ${plural(c.turnRedAtLow, "season")} that are green at ${num(c.baseSupplyMm, 0)} mm turn red; at ${num(c.highSupplyMm, 0)} mm (10 percent more), ${plural(c.turnGreenAtHigh, "season")} that are red turn green. Years short in the last decade: ${c.lastDecadeShort.low}, ${c.lastDecadeShort.base}, ${c.lastDecadeShort.high} at the low, chosen and high supply. A small error in your real supply can change this result.`
            : `${c.rotation}: no red or green result changes at ${num(c.lowSupplyMm, 0)} mm or ${num(c.highSupplyMm, 0)} mm (10 percent either side of ${num(c.baseSupplyMm, 0)} mm), across ${c.seasonsCompared} seasons judged at all three supplies.`,
        });
      }
    }
  } else {
    out.push({ kind: "supply-sensitivity", rotation: null, text: "The 10 percent supply check was not done because no replay function was supplied." });
  }

  const tied = [
    ...comparison.criterionRankings.flatMap((c) => c.entries.filter((e) => e.position !== null && e.tiedWith.length).map((e) => ({ at: PRIORITY_LABEL_OF(c.priority), name: e.rotation, with: e.tiedWith }))),
  ];
  for (const t of tied) out.push({ kind: "ties", rotation: t.name, text: `${t.name} ties with ${joinList(t.with)} on ${t.at}; the tool has no basis to separate them.` });

  if (comparison.notRanked.length) out.push({ kind: "income-not-connected", rotation: null, text: comparison.marketData.reason });
  for (const w of comparison.warnings) if (/replay was run at/.test(w)) out.push({ kind: "supply-mismatch", rotation: null, text: w });
  return out;
}

function PRIORITY_LABEL_OF(p: PriorityId): string {
  return { water: "conserving water", soil: "soil structure and health", income: "supplemental income", forage: "forage" }[p];
}
