/**
 * Rotation assembly: turns a supply-independent season table (crop x season year) plus the user's rotations and
 * one supply into the full ReplayResult. This is the single place the rules (short/ok/grey, decade counts, wording)
 * are applied, so the server (replay()) and the browser (replayFromSeasonTable()) cannot disagree.
 *
 * Pure and browser-safe: no node: imports, no I/O, no climate arrays. It only needs the season table.
 */
import type { Crop } from "../crops/types";
import type { PowerResult } from "../types";
import { judgeSeason, resolveCropCached, validateSupply } from "./evaluate";
import { checkSpansNewYear, seasonDates, validateSeasonYears } from "./season";
import {
  DECADES,
  FIRST_SEASON,
  LAST_SEASON,
  type DecadeCount,
  type ReplayInput,
  type ReplayOk,
  type ReplayResult,
  type ReplayUnavailable,
  type ResolvedCrop,
  type RotationInput,
  type RotationOverlap,
  type RotationResult,
  type RotationTotals,
  type SeasonNeed,
  type SeasonResult,
} from "./types";
import { SMALL_SAMPLE_CAVEAT, rotationHeadline, rotationSentence } from "./wording";

export const MIN_ROTATIONS = 2;
export const MAX_ROTATIONS = 3;
export const MAX_SEQUENCE = 3;

/** Crop for a season year: sequence[(Y - 1986) mod length]. */
export function cropIndexForYear(sequenceLength: number, year: number): number {
  return (((year - FIRST_SEASON) % sequenceLength) + sequenceLength) % sequenceLength;
}

function median(sorted: number[]): number {
  const m = sorted.length >> 1;
  return sorted.length % 2 ? sorted[m] : (sorted[m - 1] + sorted[m]) / 2;
}

export function summarize(seasons: SeasonResult[]): { decades: DecadeCount[]; totals: RotationTotals } {
  const decades: DecadeCount[] = DECADES.map((d) => {
    const inD = seasons.filter((s) => s.year >= d.startYear && s.year <= d.endYear);
    const short = inD.filter((s) => s.outcome === "short").length;
    const ok = inD.filter((s) => s.outcome === "ok").length;
    return {
      label: d.label,
      startYear: d.startYear,
      endYear: d.endYear,
      seasons: inD.length,
      short,
      ok,
      insufficient: inD.length - short - ok,
      evaluable: short + ok,
    };
  });
  const needs = seasons.filter((s) => s.needMm !== null).map((s) => s.needMm as number).sort((a, b) => a - b);
  const short = seasons.filter((s) => s.outcome === "short").length;
  const ok = seasons.filter((s) => s.outcome === "ok").length;
  return {
    decades,
    totals: {
      short,
      ok,
      insufficient: seasons.length - short - ok,
      evaluable: short + ok,
      needMinMm: needs.length ? needs[0] : null,
      needMedianMm: needs.length ? median(needs) : null,
      needMaxMm: needs.length ? needs[needs.length - 1] : null,
    },
  };
}

function overlapsAndWarnings(seq: ResolvedCrop[]): { overlaps: RotationOverlap[]; warnings: string[] } {
  const overlaps: RotationOverlap[] = [];
  for (let y = FIRST_SEASON; y < LAST_SEASON; y++) {
    const a = seq[cropIndexForYear(seq.length, y)];
    const b = seq[cropIndexForYear(seq.length, y + 1)];
    const da = seasonDates(a, y);
    const db = seasonDates(b, y + 1);
    const days = da.endDayNum - db.startDayNum + 1;
    if (days > 0) overlaps.push({ fromYear: y, toYear: y + 1, fromCropId: a.id, toCropId: b.id, overlapDays: days });
  }
  const warnings: string[] = [];
  // Group by crop pair so a repeating rotation gives one line per pair, not 39.
  const groups = new Map<string, RotationOverlap[]>();
  for (const o of overlaps) {
    const k = `${o.fromCropId}>${o.toCropId}`;
    groups.set(k, [...(groups.get(k) ?? []), o]);
  }
  const byId = new Map(seq.map((c) => [c.id, c]));
  for (const list of groups.values()) {
    const min = Math.min(...list.map((o) => o.overlapDays));
    const max = Math.max(...list.map((o) => o.overlapDays));
    const days = min === max ? `${min} ${min === 1 ? "day" : "days"}` : `${min} to ${max} days`;
    const from = byId.get(list[0].fromCropId)?.name ?? list[0].fromCropId;
    const to = byId.get(list[0].toCropId)?.name ?? list[0].toCropId;
    const first = list[0];
    const when =
      list.length === 1
        ? `the ${first.fromYear} and ${first.toYear} seasons`
        : `${list.length} pairs of consecutive seasons (for example ${first.fromYear} and ${first.toYear})`;
    warnings.push(
      `${from} followed by ${to}: ${when} overlap in dates by ${days}. The replay does not move any dates, so the overlapping days count in both seasons.`,
    );
  }
  return { overlaps, warnings };
}

export function powerDataLabel(power: Pick<PowerResult, "fetchedAt" | "origin">): string {
  const date = power.fetchedAt.slice(0, 10);
  if (power.origin === "live") return `NASA POWER regional climate, about 50 km grid, fetched ${date}`;
  return `saved response from ${date} (NASA POWER regional climate, about 50 km grid)`;
}

/** Looks up the supply-independent evaluation of one crop-season. */
export type NeedLookup = (crop: ResolvedCrop, year: number) => SeasonNeed | undefined;

export function assembleReplay(crops: Crop[], input: ReplayInput, needFor: NeedLookup, dataLabel: string): ReplayOk | ReplayUnavailable {
  const problems: string[] = [];
  const supplyProblem = validateSupply(input.supplyMm);
  if (supplyProblem) problems.push(supplyProblem);
  if (!Array.isArray(input.rotations) || input.rotations.length < MIN_ROTATIONS || input.rotations.length > MAX_ROTATIONS) {
    problems.push(`Compare ${MIN_ROTATIONS} or ${MAX_ROTATIONS} rotations (got ${Array.isArray(input.rotations) ? input.rotations.length : 0}).`);
  }

  const byId = new Map<string, Crop>();
  for (const c of crops) {
    if (byId.has(c.id)) problems.push(`The crop list has the id "${c.id}" more than once.`);
    byId.set(c.id, c);
  }

  const resolvedRotations: { rot: RotationInput; seq: ResolvedCrop[] }[] = [];
  for (const rot of Array.isArray(input.rotations) ? input.rotations : []) {
    const label = rot.name || "A rotation";
    if (!Array.isArray(rot.sequence) || rot.sequence.length < 1 || rot.sequence.length > MAX_SEQUENCE) {
      problems.push(`${label}: a rotation needs 1 to ${MAX_SEQUENCE} crops.`);
      continue;
    }
    const seq: ResolvedCrop[] = [];
    let bad = false;
    for (const id of rot.sequence) {
      const crop = byId.get(id);
      if (!crop) {
        problems.push(`${label}: there is no crop with the id "${id}" in the catalog.`);
        bad = true;
        continue;
      }
      const r = resolveCropCached(crop);
      if (!r.ok) {
        problems.push(`${label}: ${r.reason} It cannot be used until the missing values are sourced.`);
        bad = true;
        continue;
      }
      const dateProblem = validateSeasonYears(r.crop);
      if (dateProblem) {
        problems.push(`${label}: ${dateProblem}`);
        bad = true;
        continue;
      }
      seq.push(r.crop);
    }
    if (!bad) resolvedRotations.push({ rot, seq });
  }

  if (problems.length) return invalid(problems);

  const rotations: RotationResult[] = resolvedRotations.map(({ rot, seq }) => {
    const seasons: SeasonResult[] = [];
    for (let y = FIRST_SEASON; y <= LAST_SEASON; y++) {
      const crop = seq[cropIndexForYear(seq.length, y)];
      const need = needFor(crop, y);
      if (!need) {
        problems.push(`${rot.name || "A rotation"}: the season table has no entry for ${crop.name} in ${y}.`);
        break;
      }
      seasons.push(judgeSeason(need, input.supplyMm));
    }
    const { decades, totals } = summarize(seasons);
    const first = decades[0];
    const last = decades[decades.length - 1];
    const { overlaps, warnings } = overlapsAndWarnings(seq);
    const seen = new Set<string>();
    for (const c of seq) {
      if (seen.has(c.id)) continue;
      seen.add(c.id);
      const f = checkSpansNewYear(c);
      if (f.message) warnings.push(f.message);
    }
    return {
      name: rot.name,
      sequence: [...rot.sequence],
      cropNames: seq.map((c) => c.name),
      seasons,
      decades,
      totals,
      headline: rotationHeadline(first, last),
      sentence: rotationSentence(first, last),
      caveat: SMALL_SAMPLE_CAVEAT,
      overlaps,
      warnings,
    };
  });

  const notes = [
    "Regional climate, about 50 km grid (NASA POWER reanalysis), not a farm sensor.",
    "Irrigation need is the crop's net water demand minus effective rainfall. It does not include irrigation losses, and it ignores water stored in the soil.",
    "Days over the crop's heat threshold are shown for information. They do not change whether a season is short.",
  ];
  const grey = rotations.reduce((s, r) => s + r.totals.insufficient, 0);
  if (grey > 0) notes.push(`${grey} ${grey === 1 ? "crop-season" : "crop-seasons"} across these rotations could not be judged because of missing weather data (grey).`);

  if (problems.length) return invalid(problems);

  return { status: "ok", supplyMm: input.supplyMm, rotations, notes, dataLabel };
}

function invalid(problems: string[]): ReplayUnavailable {
  return {
    status: "unavailable",
    cause: "invalid-input",
    reason: problems[0],
    problems,
    nextStep: "Fix the listed problems (choose usable crops, a supply of 0 mm or more, and 2 or 3 rotations of 1 to 3 crops) and run it again.",
  };
}

/** Supply-independent season table: for each crop id, 40 season needs in order 1986 to 2025. Plain data, safe to send to the browser. */
export type SeasonTable = {
  dataLabel: string;
  needs: Record<string, SeasonNeed[]>;
};

/** The replay from a season table alone: no climate arrays, no ET0 computation. Identical to replay() for the same inputs. */
export function replayFromSeasonTable(table: SeasonTable, crops: Crop[], input: ReplayInput): ReplayResult {
  return assembleReplay(
    crops,
    input,
    (crop, year) => table.needs[crop.id]?.[year - FIRST_SEASON],
    table.dataLabel,
  );
}
