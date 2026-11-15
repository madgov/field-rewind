/**
 * Rotation replay: 40 seasons (1986-2025) for 2-3 rotations at one seasonal water supply.
 * Pure: takes a PowerResult, the catalog crops and plain inputs. The slow part (daily ET0) is done once per
 * PowerResult (cached on the object) and each crop-season is cached, so changing the supply only re-applies a
 * comparison and the wording. The rotation/decade/wording rules live in assemble.ts, shared with the browser path
 * (replayFromSeasonTable) so the two cannot disagree.
 */
import type { Crop } from "../crops/types";
import type { PowerResult } from "../types";
import { MAX_ROTATIONS, MAX_SEQUENCE, MIN_ROTATIONS, assembleReplay, cropIndexForYear, powerDataLabel, summarize } from "./assemble";
import { getClimate } from "./climate";
import { resolveCropCached, seasonNeed } from "./evaluate";
import { validateSeasonYears } from "./season";
import { FIRST_SEASON, LAST_SEASON, type ReplayInput, type ReplayResult } from "./types";
import type { SeasonTable } from "./assemble";

export { MAX_ROTATIONS, MAX_SEQUENCE, MIN_ROTATIONS, cropIndexForYear, summarize };

export function replay(power: PowerResult, crops: Crop[], input: ReplayInput): ReplayResult {
  const prep = getClimate(power);
  if (!prep.ok) {
    return { status: "unavailable", cause: "power-data", reason: prep.reason, problems: [prep.reason], nextStep: prep.nextStep };
  }
  const climate = prep.climate;
  return assembleReplay(crops, input, (crop, year) => seasonNeed(climate, crop, year), powerDataLabel(power));
}

export type SeasonTableResult =
  | { status: "ok"; table: SeasonTable; /** Crop ids left out of the table (unusable), with the reason. */ skipped: { id: string; reason: string }[] }
  | { status: "unavailable"; reason: string; nextStep: string };

/**
 * The supply-independent table for every usable crop and every season year: computed once per pin on the server and sent to the
 * browser, which then applies the supply with replayFromSeasonTable. Unusable crops are skipped with the reason (never guessed).
 */
export function buildSeasonTable(power: PowerResult, crops: Crop[]): SeasonTableResult {
  const prep = getClimate(power);
  if (!prep.ok) return { status: "unavailable", reason: prep.reason, nextStep: prep.nextStep };
  const needs: SeasonTable["needs"] = {};
  const skipped: { id: string; reason: string }[] = [];
  for (const crop of crops) {
    const r = resolveCropCached(crop);
    if (!r.ok) {
      skipped.push({ id: crop.id, reason: r.reason });
      continue;
    }
    const dateProblem = validateSeasonYears(r.crop);
    if (dateProblem) {
      skipped.push({ id: crop.id, reason: dateProblem });
      continue;
    }
    const list = [];
    for (let y = FIRST_SEASON; y <= LAST_SEASON; y++) list.push(seasonNeed(prep.climate, r.crop, y));
    needs[crop.id] = list;
  }
  return { status: "ok", table: { dataLabel: powerDataLabel(power), needs }, skipped };
}
