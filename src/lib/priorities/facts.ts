import { getCrop, isCropUsable } from "../crops/catalog";
import { traitFor } from "../rotationTraits/traits";
import type { CropTraits, TraitField, TraitSource } from "../rotationTraits/types";
import type { RotationResult } from "../replay/types";
import type { FactRow, RotationSpec } from "./types";
import { joinList, num, NO_VALUE_TEXT, ofTotal, plural } from "./text";

function known<T>(f: TraitField<T> | undefined): T | null {
  return f && f.status === "sourced" && f.value !== null && f.value !== undefined ? f.value : null;
}

function uniqSources(list: (TraitSource | null | undefined)[]): TraitSource[] {
  const seen = new Set<string>();
  const out: TraitSource[] = [];
  for (const s of list) {
    if (!s) continue;
    const k = `${s.url}|${s.page_or_table}`;
    if (!seen.has(k)) {
      seen.add(k);
      out.push(s);
    }
  }
  return out;
}

function nameOf(id: string): string {
  return traitFor(id)?.name ?? getCrop(id)?.name ?? id;
}

/** Crop ids in a sequence that the catalog cannot replay (not in the catalog, or an unsourced value), with no duplicates. */
export function cropsNotReplayed(seq: string[]): string[] {
  const out: string[] = [];
  for (const id of seq) {
    const c = getCrop(id);
    if ((!c || !isCropUsable(c).usable) && !out.includes(id)) out.push(id);
  }
  return out;
}

function missingNote(missing: string[]): string {
  return `${plural(missing.length, "crop")} with ${NO_VALUE_TEXT} (${joinList(missing.map(nameOf))})`;
}

/** Yearly slots of the cycle: each crop in the sequence is one year, repeating (as in the replay). */
type Slot = { id: string; t: CropTraits | undefined };
const slots = (seq: string[]): Slot[] => seq.map((id) => ({ id, t: traitFor(id) }));

export function waterFact(rot: RotationResult | null, reason: string | null): FactRow {
  const base = { id: "water-short" as const, criterion: "water" as const, label: "Years short of water, last decade against first decade", better: "lower" as const, fromReplay: true, sources: [] as TraitSource[], missingCropIds: [] as string[] };
  if (!rot) return { ...base, display: `No water result: ${reason ?? "no replay result for this rotation"}.`, value: null };
  const first = rot.decades[0];
  const last = rot.decades[rot.decades.length - 1];
  const cmp =
    first.evaluable === last.evaluable
      ? last.short > first.short
        ? "more than"
        : last.short < first.short
          ? "fewer than"
          : "the same as"
      : "compared with";
  const extra = last.insufficient > 0 || first.insufficient > 0 ? ` Seasons with too little data to judge: ${first.insufficient} in ${first.label}, ${last.insufficient} in ${last.label}.` : "";
  const display = `Short in ${ofTotal(last.short, last.evaluable)} judged seasons in ${last.label}, ${cmp === "compared with" ? "against" : cmp} ${ofTotal(first.short, first.evaluable)} in ${first.label}.${extra}`;
  return { ...base, display, value: last.evaluable > 0 ? last.short / last.evaluable : null };
}

function booleanShareFact(
  id: "n-fixing-share" | "forage-share",
  criterion: "soil" | "forage",
  label: string,
  seq: string[],
  pick: (t: CropTraits) => TraitField<boolean>,
  yesText: (k: number, n: number) => string,
): FactRow {
  const s = slots(seq);
  const missing: string[] = [];
  let yes = 0;
  const srcs: (TraitSource | null)[] = [];
  for (const x of s) {
    const f = x.t ? pick(x.t) : undefined;
    const v = known(f);
    if (v === null) {
      if (!missing.includes(x.id)) missing.push(x.id);
    } else {
      srcs.push(f!.source);
      if (v) yes += 1;
    }
  }
  // Count missing years, not just distinct crops, for the "at least" wording.
  const missingYears = s.filter((x) => missing.includes(x.id)).length;
  const n = s.length;
  const complete = missingYears === 0;
  const display = complete
    ? yesText(yes, n)
    : `At least ${yesText(yes, n)}; ${plural(missingYears, "year")} in the cycle ${missingYears === 1 ? "is" : "are"} ${joinList(missing.map(nameOf))}, which ${missing.length === 1 ? "has" : "have"} ${NO_VALUE_TEXT} for this, so the share is not ranked.`;
  return {
    id, criterion, label, display, value: complete ? yes / n : null, missingCropIds: missing, better: "higher", fromReplay: false, sources: uniqSources(srcs),
  };
}

export const nFixingFact = (seq: string[]): FactRow =>
  booleanShareFact("n-fixing-share", "soil", "Nitrogen-fixing years in the cycle", seq, (t) => t.traits.nitrogenFixing, (k, n) => `${ofTotal(k, n)} years in the cycle ${k === 1 ? "is a nitrogen-fixing crop" : "are nitrogen-fixing crops"}`);

export const forageFact = (seq: string[]): FactRow =>
  booleanShareFact("forage-share", "forage", "Years with a crop documented as forage", seq, (t) => t.traits.forage, (k, n) => `${ofTotal(k, n)} years in the cycle ${k === 1 ? "has a crop" : "have crops"} with a documented forage use`);

export function rootDepthFact(seq: string[]): FactRow {
  const s = slots(seq);
  const missing: string[] = [];
  const depths: { id: string; m: number }[] = [];
  const srcs: (TraitSource | null)[] = [];
  for (const x of s) {
    const f = x.t?.traits.rootDepthM;
    const v = known(f);
    if (v === null) {
      if (!missing.includes(x.id)) missing.push(x.id);
    } else {
      depths.push({ id: x.id, m: v.maxM });
      srcs.push(f!.source);
    }
  }
  const complete = missing.length === 0 && depths.length > 0;
  let display: string;
  let value: number | null = null;
  if (depths.length === 0) display = `Maximum effective root depth: ${NO_VALUE_TEXT} for any crop in the cycle.`;
  else {
    const deepest = depths.reduce((a, b) => (b.m > a.m ? b : a));
    const mean = depths.reduce((a, b) => a + b.m, 0) / depths.length;
    if (complete) value = mean;
    display = `Deepest-rooted crop: ${nameOf(deepest.id)} at ${num(deepest.m)} m. Mean maximum root depth ${complete ? "across the cycle" : `of the ${depths.length} of ${s.length} years with a sourced value`}: ${num(mean)} m (upper end of the printed range).${complete ? "" : ` ${missingNote(missing)}; not ranked.`}`;
  }
  return { id: "root-depth", criterion: "soil", label: "Rooting depth mix", display, value, missingCropIds: missing, better: "higher", fromReplay: false, sources: uniqSources(srcs) };
}

export function familyFact(seq: string[]): FactRow {
  const s = slots(seq);
  const missing: string[] = [];
  const fam = new Map<string, string>();
  const srcs: (TraitSource | null)[] = [];
  for (const x of s) {
    const f = x.t?.traits.family;
    const v = known(f);
    if (v === null) {
      if (!missing.includes(x.id)) missing.push(x.id);
    } else {
      fam.set(x.id, v);
      srcs.push(f!.source);
    }
  }
  // Adjacent pairs around the repeating cycle (the last crop is followed by the first). A one-crop cycle follows itself.
  const pairs: [string, string][] = [];
  if (seq.length === 1) pairs.push([seq[0], seq[0]]);
  else {
    const m = seq.length === 2 ? 1 : seq.length;
    for (let i = 0; i < m; i++) pairs.push([seq[i], seq[(i + 1) % seq.length]]);
  }
  const shared = pairs.filter(([a, b]) => fam.has(a) && fam.has(b) && (a === b || fam.get(a) === fam.get(b)));
  const unclear = pairs.filter(([a, b]) => !fam.has(a) || !fam.has(b));
  const distinct = new Set(fam.values());
  const complete = missing.length === 0;
  const famList = joinList([...distinct]);
  let display = complete
    ? `${plural(distinct.size, "botanical family", "botanical families")} in the cycle (${famList}).`
    : `${plural(distinct.size, "botanical family", "botanical families")} among the crops with a sourced value (${famList || NO_VALUE_TEXT}); ${missingNote(missing)}; not ranked.`;
  display += shared.length
    ? ` Back-to-back crops in the same family: ${joinList(shared.map(([a, b]) => `${nameOf(a)} then ${nameOf(b)} (${fam.get(a)})`))}.`
    : unclear.length
      ? ` Back-to-back same-family check is incomplete for ${plural(unclear.length, "pair")}.`
      : " No back-to-back crops share a family.";
  return { id: "family-diversity", criterion: "soil", label: "Family diversity (pest-cycle break)", display, value: complete ? distinct.size : null, missingCropIds: missing, better: "higher", fromReplay: false, sources: uniqSources(srcs) };
}

export function droughtProxyFact(seq: string[]): FactRow {
  const s = slots(seq);
  const used: number[] = [];
  const missing: string[] = [];
  const notComparable: string[] = [];
  const srcs: (TraitSource | null)[] = [];
  for (const x of s) {
    const f = x.t?.traits.depletionFractionP;
    const v = known(f);
    if (v === null) {
      if (!missing.includes(x.id)) missing.push(x.id);
    } else if (f!.comparable === false) {
      if (!notComparable.includes(x.id)) notComparable.push(x.id);
    } else {
      used.push(v);
      srcs.push(f!.source);
    }
  }
  const parts: string[] = [];
  if (used.length) parts.push(`Mean depletion fraction p (drought-tolerance proxy, higher means more stored water can be used before stress) ${num(used.reduce((a, b) => a + b, 0) / used.length)} over ${ofTotal(used.length, s.length)} years`);
  else parts.push(`Depletion fraction p: ${NO_VALUE_TEXT} that can be compared`);
  if (notComparable.length) parts.push(`${joinList(notComparable.map(nameOf))} ${notComparable.length === 1 ? "has" : "have"} p defined against saturation, not comparable`);
  if (missing.length) parts.push(missingNote(missing));
  return { id: "drought-proxy", criterion: "context", label: "Drought-tolerance proxy (FAO-56 p)", display: `${parts.join("; ")}. Shown for context, not ranked.`, value: used.length ? used.reduce((a, b) => a + b, 0) / used.length : null, missingCropIds: missing, better: null, fromReplay: false, sources: uniqSources(srcs) };
}

export function groundCoverFact(seq: string[]): FactRow {
  const ids = [...new Set(seq)];
  const lines: string[] = [];
  const srcs: (TraitSource | null)[] = [];
  const missing: string[] = [];
  for (const id of ids) {
    const t = traitFor(id);
    const bits: string[] = [];
    for (const [key, label] of [["residueRole", "residue"], ["erosionCover", "erosion cover"], ["soilStructureRole", "soil structure"]] as const) {
      const f = t?.traits[key];
      const v = known(f);
      if (v !== null) {
        bits.push(`${label}: ${v}`);
        srcs.push(f!.source);
      }
    }
    if (bits.length) lines.push(`${nameOf(id)} (${bits.join("; ")})`);
    else missing.push(id);
  }
  const display = lines.length
    ? `Sourced notes: ${lines.join("; ")}.${missing.length ? ` No sourced value for ${joinList(missing.map(nameOf))}.` : ""} Qualitative only; not ranked.`
    : `Residue, erosion-cover and soil-structure notes: ${NO_VALUE_TEXT} for ${joinList(ids.map(nameOf))}. Not ranked.`;
  return { id: "ground-cover-notes", criterion: "context", label: "Ground cover and residue", display, value: null, missingCropIds: missing, better: null, fromReplay: false, sources: uniqSources(srcs) };
}
