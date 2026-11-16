import { marketData } from "../rotationTraits/market";
import { traitFor } from "../rotationTraits/traits";
import type { ReplayOk, RotationResult } from "../replay/types";
import { cropsNotReplayed, droughtProxyFact, familyFact, forageFact, groundCoverFact, nFixingFact, rootDepthFact, waterFact } from "./facts";
import { joinList, num, plural } from "./text";
import {
  PRIORITY_LABEL,
  type BalancedView,
  type CompareInput,
  type Comparison,
  type CriterionRanking,
  type FactId,
  type FactRanking,
  type PriorityId,
  type RankEntry,
  type RotationFacts,
} from "./types";

const EPS = 1e-9;

/** Competition ranking (1, 1, 3). null values are not ranked. "lower"/"higher" says which end is first. Equal values (within 1e-9) tie. */
export function competitionRanks(values: (number | null)[], better: "lower" | "higher"): (number | null)[] {
  return values.map((v, i) => {
    if (v === null || !Number.isFinite(v)) return null;
    let ahead = 0;
    values.forEach((w, j) => {
      if (j === i || w === null || !Number.isFinite(w)) return;
      if (better === "lower" ? w < v - EPS : w > v + EPS) ahead += 1;
    });
    return 1 + ahead;
  });
}

const CRITERION_FACTS: Record<Exclude<PriorityId, "income">, FactId[]> = {
  water: ["water-short"],
  soil: ["n-fixing-share", "family-diversity", "root-depth"],
  forage: ["forage-share"],
};

const FACT_RULE: Record<string, { better: "lower" | "higher"; rule: string }> = {
  "water-short": { better: "lower", rule: "Fewer judged seasons short of water in the last decade ranks first. Equal counts of equal-sized samples tie." },
  "n-fixing-share": { better: "higher", rule: "A larger share of the cycle's years in nitrogen-fixing crops ranks first. Rotations with a crop that has no sourced value are not ranked on this fact." },
  "family-diversity": { better: "higher", rule: "More distinct botanical families in the cycle ranks first. Rotations with a crop that has no sourced family are not ranked on this fact." },
  "root-depth": { better: "higher", rule: "A larger mean maximum root depth across the cycle ranks first. Rotations with a crop that has no sourced depth are not ranked on this fact." },
  "forage-share": { better: "higher", rule: "A larger share of the cycle's years with a crop documented as forage ranks first. Rotations with a crop that has no sourced forage statement are not ranked on this fact." },
};

function matchReplay(input: CompareInput, name: string, sequence: string[]): { rot: RotationResult | null; reason: string | null } {
  const r = input.replay;
  if (r.status !== "ok") return { rot: null, reason: r.reason };
  const found = (r as ReplayOk).rotations.find((x) => x.name === name);
  if (!found) return { rot: null, reason: "the replay was not run for this rotation" };
  if (found.sequence.length !== sequence.length || found.sequence.some((id, i) => id !== sequence[i])) {
    return { rot: null, reason: "the replay result under this name was run for a different crop sequence" };
  }
  return { rot: found, reason: null };
}

export function compareRotations(input: CompareInput): Comparison {
  const warnings: string[] = [];
  const excludedIds = new Set(input.constraints.excludedCropIds ?? []);
  const supplyMm = input.constraints.supplyMm;
  if (input.replay.status === "ok" && input.replay.supplyMm !== supplyMm) {
    warnings.push(`The replay was run at ${num(input.replay.supplyMm, 0)} mm but the chosen supply is ${num(supplyMm, 0)} mm; the water results are for ${num(input.replay.supplyMm, 0)} mm.`);
  }
  const names = input.rotations.map((r) => r.name);
  if (new Set(names).size !== names.length) warnings.push("Two rotations share a name; results are matched by name, so rename one.");

  const selectedAll = [...new Set(input.priorities.selected)];
  const notRanked = selectedAll.filter((p) => p === "income").map((p) => ({
    priority: p,
    reason: `${marketData.reason} Supplemental income is therefore left out of every ranking.`,
  }));
  const selected = selectedAll.filter((p): p is Exclude<PriorityId, "income"> => p !== "income");

  const rotations: RotationFacts[] = input.rotations.map((spec) => {
    const notReplayed = cropsNotReplayed(spec.sequence);
    const withoutTraits = [...new Set(spec.sequence.filter((id) => !traitFor(id)))];
    const matched = matchReplay(input, spec.name, spec.sequence);
    // A crop the catalog cannot replay means no water result, even if a result with this name was passed in.
    const rot = notReplayed.length ? null : matched.rot;
    const replayReason = matched.reason;
    const reason = notReplayed.length
      ? `${joinList(notReplayed.map((id) => traitFor(id)?.name ?? id))} ${notReplayed.length === 1 ? "is" : "are"} not in the crop catalog with every value sourced, so the replay cannot judge ${notReplayed.length === 1 ? "it" : "them"}`
      : replayReason;
    const excludedBecause = [...new Set(spec.sequence.filter((id) => excludedIds.has(id)))];
    return {
      name: spec.name,
      sequence: spec.sequence,
      cropNames: spec.sequence.map((id) => traitFor(id)?.name ?? id),
      excludedBecause,
      cropsWithoutTraits: withoutTraits,
      cropsNotReplayed: notReplayed,
      waterUnavailableReason: rot ? null : reason,
      facts: [
        waterFact(rot, reason),
        nFixingFact(spec.sequence),
        rootDepthFact(spec.sequence),
        familyFact(spec.sequence),
        forageFact(spec.sequence),
        droughtProxyFact(spec.sequence),
        groundCoverFact(spec.sequence),
      ],
    };
  });

  const ranked = rotations.map((r) => r.excludedBecause.length === 0);
  const factValue = (r: RotationFacts, id: FactId) => r.facts.find((f) => f.id === id)?.value ?? null;

  const factRankings: FactRanking[] = [];
  const rankByFact = new Map<FactId, Map<string, RankEntry>>();
  for (const p of selected) {
    for (const fid of CRITERION_FACTS[p]) {
      const rule = FACT_RULE[fid];
      const label = rotations[0]?.facts.find((f) => f.id === fid)?.label ?? fid;
      const values = rotations.map((r, i) => (ranked[i] ? factValue(r, fid) : null));
      const ranks = competitionRanks(values, rule.better);
      const entries: RankEntry[] = rotations.map((r, i) => ({
        rotation: r.name,
        value: values[i],
        rank: ranks[i],
        tiedWith: ranks[i] === null ? [] : rotations.filter((o, j) => j !== i && ranks[j] === ranks[i]).map((o) => o.name),
      }));
      factRankings.push({ factId: fid, label, better: rule.better, rule: rule.rule, entries });
      rankByFact.set(fid, new Map(entries.map((e) => [e.rotation, e])));
    }
  }

  const criterionRankings: CriterionRanking[] = selected.map((p) => {
    const fids = CRITERION_FACTS[p];
    const entries0 = rotations.map((r) => {
      const subRanks = fids.map((fid) => ({ factId: fid, rank: rankByFact.get(fid)?.get(r.name)?.rank ?? null }));
      const have = subRanks.filter((s) => s.rank !== null) as { factId: FactId; rank: number }[];
      const meanRank = have.length ? have.reduce((a, b) => a + b.rank, 0) / have.length : null;
      return { rotation: r.name, subRanks, meanRank, basedOn: have.length, of: fids.length };
    });
    const positions = competitionRanks(entries0.map((e) => e.meanRank), "lower");
    const entries = entries0.map((e, i) => ({
      ...e,
      position: positions[i],
      tiedWith: positions[i] === null ? [] : entries0.filter((o, j) => j !== i && positions[j] === positions[i]).map((o) => o.rotation),
    }));
    const rule =
      fids.length === 1
        ? FACT_RULE[fids[0]].rule
        : `Each of the ${fids.length} facts above is ranked on its own. The criterion position is the unweighted mean of the fact ranks the rotation has (every fact counts the same; facts with no sourced value for a rotation are left out of its mean and the count is shown), and rotations are then ordered by that mean, lowest first, with ties kept.`;
    return { priority: p, label: PRIORITY_LABEL[p], rule, entries };
  });

  let balanced: BalancedView | null = null;
  // A criterion on which no rotation has a position (for example, no sourced forage values at all) cannot separate anything, so it is
  // dropped from the balanced view and named there. The balanced view needs at least two criteria that can be ranked.
  const active = criterionRankings.filter((c) => c.entries.some((e) => e.position !== null));
  const dropped = criterionRankings.filter((c) => !active.includes(c)).map((c) => c.priority);
  if (selected.length >= 2 && active.length >= 2) {
    const rows = rotations.map((r, idx) => {
      const positions = active.map((c) => ({ priority: c.priority, position: c.entries.find((e) => e.rotation === r.name)?.position ?? null }));
      const complete = ranked[idx] && positions.every((p) => p.position !== null);
      const meanPosition = complete ? positions.reduce((a, b) => a + (b.position as number), 0) / positions.length : null;
      return { rotation: r.name, positions, meanPosition, notRankedOn: positions.filter((p) => p.position === null).map((p) => p.priority) };
    });
    const pos = competitionRanks(rows.map((r) => r.meanPosition), "lower");
    balanced = {
      label: "Balanced view (unweighted)",
      rule: `Average of each rotation's position on the ${active.length} criteria you selected that could be ranked, every criterion counting the same. Lowest average is first; equal averages tie. A rotation with no position on one of them is not placed. There are no hidden weights and no score; it is an average of places, not a measure of how much better one rotation is.`,
      droppedCriteria: dropped,
      entries: rows.map((r, i) => ({ ...r, position: pos[i], tiedWith: pos[i] === null ? [] : rows.filter((o, j) => j !== i && pos[j] === pos[i]).map((o) => o.rotation) })),
    };
  } else if (selected.length >= 2) {
    warnings.push(`No balanced view: fewer than two of the criteria you selected have anything to rank (${joinList(dropped.map((p) => PRIORITY_LABEL[p]))} have no sourced values or results for these rotations).`);
  }

  const excluded = rotations.filter((r) => r.excludedBecause.length);
  if (excluded.length) warnings.push(`${plural(excluded.length, "rotation")} left out of the ranking because of your exclusion list.`);

  return { supplyMm, selected: selectedAll, notRanked, rotations, factRankings, criterionRankings, balanced, warnings, marketData };
}
