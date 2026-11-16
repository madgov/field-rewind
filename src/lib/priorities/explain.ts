import type { Comparison, CriterionEntry } from "./types";
import { PRIORITY_LABEL } from "./types";
import { joinList, num, plural } from "./text";

function tieText(tiedWith: string[]): string {
  return tiedWith.length ? `, tied with ${joinList(tiedWith)}` : "";
}

function criterionSentence(c: Comparison, priority: string, e: CriterionEntry, rankedCount: number): string {
  const label = PRIORITY_LABEL[priority as keyof typeof PRIORITY_LABEL];
  if (e.position === null) return `${label}: not ranked, because no fact for this criterion has a sourced value or a result for this rotation.`;
  const ranks = e.subRanks.filter((s) => s.rank !== null);
  const detail =
    e.of > 1
      ? ` Mean of ${plural(e.basedOn, "fact rank")} (${ranks.map((s) => `${s.factId} rank ${s.rank}`).join(", ")}) is ${num(e.meanRank)}, from ${e.basedOn} of ${e.of} facts.`
      : "";
  return `${label}: place ${e.position} of ${rankedCount} ranked rotations${tieText(e.tiedWith)}.${detail}`;
}

/** Sentences about one rotation, all built from the computed facts and ranks. */
export function explainRotation(comparison: Comparison, rotationName: string): string[] {
  const rot = comparison.rotations.find((r) => r.name === rotationName);
  if (!rot) return [`No rotation named "${rotationName}" is in this comparison.`];
  const out: string[] = [];
  out.push(`${rot.name}: ${joinList(rot.cropNames)}, repeating.`);
  for (const f of rot.facts) out.push(`${f.label}: ${f.display}`);
  if (rot.excludedBecause.length) {
    out.push(`Left out of every ranking because it includes ${joinList(rot.excludedBecause)}, which you said you cannot grow.`);
    return out;
  }
  for (const c of comparison.criterionRankings) {
    const e = c.entries.find((x) => x.rotation === rot.name);
    const rankedCount = c.entries.filter((x) => x.position !== null).length;
    if (e) out.push(criterionSentence(comparison, c.priority, e, rankedCount));
  }
  if (comparison.balanced) {
    const b = comparison.balanced.entries.find((x) => x.rotation === rot.name);
    const placed = comparison.balanced.entries.filter((x) => x.position !== null).length;
    if (b) {
      out.push(
        b.position === null
          ? `Balanced view: not placed, because this rotation has no position on ${joinList(b.notRankedOn.map((p) => PRIORITY_LABEL[p]))}.`
          : `Balanced view${comparison.balanced.droppedCriteria.length ? ` (without ${joinList(comparison.balanced.droppedCriteria.map((p) => PRIORITY_LABEL[p]))}, which has nothing to rank)` : ""}: place ${b.position} of ${placed}${tieText(b.tiedWith)}, from the average ${num(b.meanPosition)} of its positions on ${joinList(b.positions.map((p) => `${PRIORITY_LABEL[p.priority]} (${p.position})`))}.`,
      );
    }
  }
  for (const n of comparison.notRanked) out.push(`${PRIORITY_LABEL[n.priority]}: not ranked. ${n.reason}`);
  return out;
}
